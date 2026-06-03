// AI calls go through the Vercel serverless proxy at /api/groq, which holds the
// GROQ_API_KEY server-side. The key never reaches the client bundle.
const GROQ_PROXY = "/api/groq";
export const GROQ_MODEL = "openai/gpt-oss-120b";

// System prompt shared across all finance/tracker calls.
// Uses labelled sections (outperforms prose for Llama 3.x instruction-tuned models).
// Opener-phrase suppression avoids "Sure!/Certainly!" noise artifacts from RLHF training.
const SYSTEM = `ROLE: You are Kai, a sharp personal-finance assistant for someone living in Yerevan, Armenia. All money is Armenian Dram (AMD).

HARD CONSTRAINTS:
1. Use only the numbers provided — never invent figures, balances, or categories.
2. Never give tax, legal, or investment-product advice.
3. Output the answer directly: no preamble, no sign-off, no "Sure"/"Certainly", no markdown headers or **bold**.

STYLE:
- Concrete and numeric — cite the actual AMD amounts from the data.
- Plain English, short sentences, no jargon.
- If a number you need is missing or zero, say which number to add before drawing conclusions.`;

// Key now lives server-side behind /api/groq. Kept exported so existing callers
// don't break; the proxy reports a configuration error if the key is missing.
export const hasGroqKey = () => true;

async function chat(messages, { maxTokens = 512, temperature = 0.3 } = {}) {
  const isReasoning = GROQ_MODEL.startsWith("openai/gpt-oss");
  // gpt-oss is a reasoning model: max_tokens covers reasoning + answer. With a
  // tiny budget the reasoning step eats it all and `content` comes back empty,
  // so floor the budget for these models even when the answer itself is short.
  const payload = {
    model: GROQ_MODEL,
    messages: [{ role: "system", content: SYSTEM }, ...messages],
    max_tokens: isReasoning ? Math.max(maxTokens, 512) : maxTokens,
    temperature,
  };
  if (isReasoning) {
    payload.reasoning_effort = "low";
  }

  const res = await fetch(GROQ_PROXY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq error ${res.status}`);
  }
  const data = await res.json();
  // Strip any residual opener artifacts the model may still produce
  const raw = data.choices?.[0]?.message?.content || "";
  if (!raw.trim()) {
    throw new Error("AI returned no final answer. Try again.");
  }
  return raw.replace(/^(Sure[,!]?|Certainly[,!]?|Of course[,!]?|Great question[,!]?|I'd be happy to[^.]*\.\s*)/i, "").trim();
}

export async function getSpendingForecast({
  spentSoFar, spendingCap, dayOfMonth, daysInMonth, daysRemaining,
  safeToday, projectedTotal, onTrack, exchange,
}) {
  const pct = spendingCap > 0 ? Math.round((spentSoFar / spendingCap) * 100) : 0;
  return chat([{
    role: "user",
    content: `Write a 2-sentence spending check-in for this month.

DATA (AMD):
- Monthly cap: ${spendingCap.toLocaleString()}
- Spent so far: ${spentSoFar.toLocaleString()} (${pct}% of cap, day ${dayOfMonth}/${daysInMonth})
- Projected month-end: ${projectedTotal.toLocaleString()}
- Safe to spend: ${safeToday.toLocaleString()}/day for ${daysRemaining} days left
- Status: ${onTrack ? "ON TRACK" : "OVER PACE"}

FORMAT — exactly two sentences:
1) Their status + projected month-end vs the cap.
2) The safe daily amount + one concrete action.

EXAMPLE (different numbers, match this shape):
"You're on track — projected 285,000 against your 300,000 cap. Keep daily spend under 7,500 for the remaining 12 days and you'll finish with a cushion."

Now write the check-in for the DATA above.`,
  }], { maxTokens: 220, temperature: 0.2 });
}

export async function getFinancialAdvice({ totals, savings, goals, exchange, expenses }) {
  const income = totals.income;
  const totalExpenses = totals.expenses;
  const net = income - totalExpenses;
  const savingsRate = income > 0 ? Math.round((totals.monthlyGoal / income) * 100) : 0;

  const fundLines = savings
    .map((f) => `  - ${f.name}: saved ${Math.round(f.saved).toLocaleString()} AMD / target ${Math.round(f.target).toLocaleString()} AMD (${f.monthly?.toLocaleString?.()} AMD/month)`)
    .join("\n");

  const goalLines = goals
    .map((g) => `  - ${g.title} (${g.status}, ${g.progress}% done)`)
    .join("\n");

  const categorySpend = (expenses || []).reduce((map, expense) => {
    const name = expense.categoryName || "Other";
    map.set(name, (map.get(name) || 0) + (+expense.amountAMD || 0));
    return map;
  }, new Map());

  const topCategories = [...categorySpend.entries()]
    .map(([name, spent]) => ({ name, spent }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5)
    .map((c) => `  - ${c.name}: ${Math.round(c.spent).toLocaleString()} AMD`)
    .join("\n");

  const prompt = `You are a personal finance advisor for someone living in Yerevan, Armenia. All amounts are in AMD (Armenian Dram). Current rate: 1 USD = ${Math.round(exchange?.rate || 390)} AMD.

Current month snapshot:
- Income received this month: ${income.toLocaleString()} AMD
- Planned monthly income (full month): ${(+totals.incomePlan || income).toLocaleString()} AMD
- Spent this month: ${totalExpenses.toLocaleString()} AMD
- Net this month (received − spent): ${net.toLocaleString()} AMD  ← this is real cash; a negative net is NOT debt unless income data is missing
- Monthly savings plan: ${totals.monthlyGoal.toLocaleString()} AMD (${savingsRate}% of income)
- Monthly plan balance (planned income − planned costs − savings): ${totals.planBalance?.toLocaleString?.() ?? totals.leftAfterPlan.toLocaleString()} AMD  ← if negative, the savings plan is over-committed for a full month, not a debt
- Available to move to savings this month: ${(+totals.availableToSave || Math.max(0, net)).toLocaleString()} AMD

Savings funds:
${fundLines || "  None set"}

Life goals:
${goalLines || "  None set"}

Top spending categories this month:
${topCategories || "  No logged expenses yet"}

QUALITY RULES:
- Rank by AMD impact; ignore tiny expenses, lead with the biggest lever.
- If income is 0 AMD, treat it as missing data (not "no income") and ask for it first.
- This app already tracks expenses — never suggest spreadsheets, notebooks, or "track your spending".
- Don't shame basic food/groceries under 25,000 AMD/month.
- Reference the listed category names and their amounts.

TASK: Give exactly 3 recommendations, ranked by impact. One line each, format "N. Action — reason with the AMD number." Under 35 words each.

EXAMPLE (different data, match this shape):
1. Cut Eating out from 95,000 to 55,000 AMD — frees 40,000/month toward your emergency fund.
2. Redirect the 30,000 unassigned cash to the relocation goal — closes its gap two months sooner.
3. Raise the house-fund transfer to 50,000 AMD — current 20,000 won't hit target by your date.`;

  return chat([{ role: "user", content: prompt }], { maxTokens: 900, temperature: 0.15 });
}

export async function refineRecommendedSplit({ income, totals, savings, suggestion, exchange }) {
  const rate = Math.round(exchange?.rate || 390);
  const savingsLines = (savings || []).map((fund) => {
    const target = +fund.target || 0;
    const saved = +fund.saved || 0;
    return `  - ${fund.name}: saved ${saved.toLocaleString()} AMD / target ${target.toLocaleString()} AMD, current monthly ${(+fund.monthly || 0).toLocaleString()} AMD`;
  }).join("\n") || "  None";

  const suggestionLines = (suggestion || []).map((item) =>
    `  - ${item.name}: ${Math.round(+item.amount || 0).toLocaleString()} AMD (${item.kind || "item"}) - ${item.reason || item.note || ""}`
  ).join("\n") || "  None";

  const prompt = `You are refining a monthly salary split for someone living in Yerevan, Armenia. 1 USD = ${rate} AMD.

Current finance data:
- Monthly income: ${(+income || 0).toLocaleString()} AMD
- Monthly expenses: ${(+totals.expenses || 0).toLocaleString()} AMD
- Logged expenses this month: ${(+totals.loggedExpenses || 0).toLocaleString()} AMD
- Current monthly goal transfers: ${(+totals.monthlyGoal || 0).toLocaleString()} AMD
- After-plan cash: ${(+totals.leftAfterPlan || 0).toLocaleString()} AMD

Savings funds:
${savingsLines}

Current recommended split:
${suggestionLines}

TASK:
Propose a better monthly split only if the current one should change; otherwise confirm it and say why. Give an exact AMD amount per goal with a one-line reason.

RULES:
- Use only the goals and income shown — invent nothing.
- Keep the Spending card near 300,000 AMD unless income is too low to allow it.
- Fund emergency cash and near-term relocation before house/investments.

FORMAT — 3 to 5 bullets, each "Goal: amount AMD — reason".
EXAMPLE (different data, match this shape):
- Emergency fund: 80,000 AMD — only 1 month of cushion saved; build to 3 first.
- Relocation: 120,000 AMD — needed by your March date, current 60,000 misses it.
- House down payment: 40,000 AMD — keep moving but after the two above.`;

  return chat([{ role: "user", content: prompt }], { maxTokens: 700, temperature: 0.2 });
}

export async function askDataQuestion(question, { tasks, habits, goals, finance, totals, exchange }) {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const td = {
    total: tasks.length,
    done: tasks.filter((t) => t.status === "Done").length,
    inProgress: tasks.filter((t) => t.status === "In Progress").length,
    overdue: tasks.filter((t) => t.date < today && t.status !== "Done" && t.status !== "Cancelled").length,
  };
  const habitLines = habits.map((h) => {
    const n = Object.entries(h.log || {}).filter(([d, v]) => d.startsWith(thisMonth) && v).length;
    return `${h.name}: ${n}d this month`;
  }).join(" | ") || "none";
  const funds = (finance.savings || []).map((f) =>
    `${f.name}: ${(+f.saved||0).toLocaleString()}/${(+f.target||0).toLocaleString()} AMD`
  ).join(" | ") || "none";

  return chat([{
    role: "user",
    content: `TRACKER DATA (1 USD = ${Math.round(exchange?.rate||390)} AMD):
Finance — Income: ${totals.income.toLocaleString()} AMD | Expenses: ${totals.expenses.toLocaleString()} AMD | After plan: ${totals.leftAfterPlan.toLocaleString()} AMD | Savings goal/mo: ${totals.monthlyGoal.toLocaleString()} AMD
Funds — ${funds}
Tasks — Total: ${td.total} | Done: ${td.done} | In progress: ${td.inProgress} | Overdue: ${td.overdue}
Habits — ${habitLines}
Goals — ${goals.map((g) => `${g.title}: ${g.progress}% (${g.status})`).join(" | ") || "none"}

QUESTION: ${question}

STEPS:
1. Identify which data is relevant to the question
2. Calculate or compare as needed
3. Give a direct answer with specific numbers

Answer in 3 sentences max.`,
  }], { maxTokens: 250, temperature: 0.3 });
}

export async function askFinanceAnalyticsQuestion(question, { finance, totals, exchange }) {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const rate = Math.round(exchange?.rate || 390);
  const monthlyIncome = totals.income || 0;
  const savingsRate = monthlyIncome > 0 ? Math.round((totals.monthlyGoal / monthlyIncome) * 100) : 0;
  const currentMonthExpenses = (finance.expenses || []).filter((expense) =>
    (expense.date || "").startsWith(thisMonth),
  );

  const categoryLines = [...currentMonthExpenses.reduce((map, expense) => {
    const name = expense.categoryName || "Other";
    map.set(name, (map.get(name) || 0) + (+expense.amountAMD || 0));
    return map;
  }, new Map()).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, amount]) => `${name}: ${Math.round(amount).toLocaleString()} AMD`)
    .join(" | ") || "none";

  const fundLines = (finance.savings || []).map((fund) => {
    const target = +fund.target || 0;
    const saved = +fund.saved || 0;
    const remaining = Math.max(0, target - saved);
    const progress = target > 0 ? Math.round((saved / target) * 100) : 0;
    return `${fund.name}: saved ${saved.toLocaleString()} / target ${target.toLocaleString()} AMD (${progress}%, ${remaining.toLocaleString()} remaining, monthly ${(+fund.monthly || 0).toLocaleString()})`;
  }).join(" | ") || "none";

  const incomeLines = (finance.income || [])
    .map((row) => `${row.name}: actual ${(+row.actual || 0).toLocaleString()} AMD, plan ${(+row.budget || 0).toLocaleString()} AMD`)
    .join(" | ") || "none";
  const fixedLines = (finance.fixed || [])
    .map((row) => `${row.name}: actual ${(+row.actual || 0).toLocaleString()} AMD`)
    .join(" | ") || "none";
  const variableLines = (finance.variable || [])
    .map((row) => `${row.name}: actual ${(+row.actual || 0).toLocaleString()} AMD, plan ${(+row.budget || 0).toLocaleString()} AMD`)
    .join(" | ") || "none";
  const recentExpenses = currentMonthExpenses
    .slice(0, 10)
    .map((expense) => `${expense.date}: ${expense.note} - ${Math.round(+expense.amountAMD || 0).toLocaleString()} AMD (${expense.categoryName || "Other"})`)
    .join(" | ") || "none";

  return chat([{
    role: "user",
    content: `FINANCE ANALYTICS DATA (today ${today}, 1 USD = ${rate} AMD):
Summary - Income: ${totals.income.toLocaleString()} AMD | Fixed: ${totals.fixed.toLocaleString()} AMD | Variable plan actual: ${totals.variableManual.toLocaleString()} AMD | Logged expenses: ${totals.loggedExpenses.toLocaleString()} AMD | Total expenses: ${totals.expenses.toLocaleString()} AMD | Monthly goal transfers: ${totals.monthlyGoal.toLocaleString()} AMD | After plan: ${totals.leftAfterPlan.toLocaleString()} AMD | Savings rate from planned transfers: ${savingsRate}%
Income rows - ${incomeLines}
Fixed rows - ${fixedLines}
Variable rows - ${variableLines}
Savings funds - ${fundLines}
Spend by category this month - ${categoryLines}
Recent expenses - ${recentExpenses}

QUESTION: ${question}

RULES:
- Answer only from this finance data.
- If the question requires missing data, name the missing number first.
- Use AMD amounts and mention USD only when useful using the given rate.
- Be analytical: compare categories, budget vs actual, goal gap, burn rate, or after-plan cash where relevant.
- No generic tracking advice; the app already tracks data.

Answer in 4 concise bullets maximum.`,
  }], { maxTokens: 700, temperature: 0.25 });
}

export async function getGoalAdvice({ goal, totals, exchange }) {
  const prompt = `Personal finance advisor for Yerevan, Armenia. 1 USD = ${Math.round(exchange?.rate || 390)} AMD.

Goal: "${goal.title}" — ${goal.progress}% complete, status: ${goal.status}, target date: ${goal.target || "not set"}, priority: ${goal.priority}.

Monthly income: ${totals.income.toLocaleString()} AMD. Monthly expenses: ${totals.expenses.toLocaleString()} AMD. After plan: ${totals.leftAfterPlan.toLocaleString()} AMD.

Give 2-3 specific suggestions to reach this goal faster. Be direct and practical. Max 3 sentences total.`;

  return chat([{ role: "user", content: prompt }], { maxTokens: 300 });
}
