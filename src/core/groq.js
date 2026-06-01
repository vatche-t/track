const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

// System prompt shared across all finance/tracker calls.
// Uses labelled sections (outperforms prose for Llama 3.x instruction-tuned models).
// Opener-phrase suppression avoids "Sure!/Certainly!" noise artifacts from RLHF training.
const SYSTEM = `ROLE: You are Kai, a personal finance and productivity assistant for someone in Yerevan, Armenia.

HARD CONSTRAINTS:
1. Never invent financial figures or balances
2. Never give tax, legal, or investment advice
3. Start every response with the first word of your answer — no opener phrases like "Sure", "Certainly", "Of course", "Great question"

RESPONSE RULES:
- Be direct and specific — reference actual numbers from the data
- Keep responses under 180 words unless asked for detail
- Use plain English, no jargon`;

function getKey() {
  return (
    localStorage.getItem("pt_groq_key") ||
    import.meta.env.VITE_GROQ_API_KEY ||
    ""
  );
}

export const hasGroqKey = () => !!getKey();

async function chat(messages, { maxTokens = 512, temperature = 0.3 } = {}) {
  const key = getKey();
  if (!key) throw new Error("No Groq API key. Set VITE_GROQ_API_KEY in .env");
  const res = await fetch(GROQ_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM }, ...messages],
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq error ${res.status}`);
  }
  const data = await res.json();
  // Strip any residual opener artifacts the model may still produce
  const raw = data.choices?.[0]?.message?.content || "";
  return raw.replace(/^(Sure[,!]?|Certainly[,!]?|Of course[,!]?|Great question[,!]?|I'd be happy to[^.]*\.\s*)/i, "").trim();
}

export async function getSpendingForecast({
  spentSoFar, spendingCap, dayOfMonth, daysInMonth, daysRemaining,
  safeToday, projectedTotal, onTrack, exchange,
}) {
  const pct = spendingCap > 0 ? Math.round((spentSoFar / spendingCap) * 100) : 0;
  return chat([{
    role: "user",
    content: `DATA:
- Spending cap: ${spendingCap.toLocaleString()} AMD/month
- Spent so far: ${spentSoFar.toLocaleString()} AMD (${pct}% of cap, day ${dayOfMonth}/${daysInMonth})
- Projected month-end: ${projectedTotal.toLocaleString()} AMD
- Safe to spend: ${safeToday.toLocaleString()} AMD/day for ${daysRemaining} days left
- Status: ${onTrack ? "ON TRACK" : "OVER PACE"}

TASK: Write exactly 2 sentences. Sentence 1: state their status and projected total vs cap. Sentence 2: give the safe daily amount and one specific action.`,
  }], { maxTokens: 100, temperature: 0.2 });
}

export async function getFinancialAdvice({ totals, savings, goals, exchange, categories }) {
  const income = totals.income;
  const expenses = totals.expenses;
  const net = income - expenses;
  const savingsRate = income > 0 ? Math.round((totals.monthlyGoal / income) * 100) : 0;

  const fundLines = savings
    .map((f) => `  - ${f.name}: saved ${Math.round(f.saved).toLocaleString()} AMD / target ${Math.round(f.target).toLocaleString()} AMD (${f.monthly?.toLocaleString?.()} AMD/month)`)
    .join("\n");

  const goalLines = goals
    .map((g) => `  - ${g.title} (${g.status}, ${g.progress}% done)`)
    .join("\n");

  const topCategories = [...(categories || [])]
    .sort((a, b) => (b.spent || 0) - (a.spent || 0))
    .slice(0, 5)
    .map((c) => `  - ${c.name}: ${Math.round(c.spent || 0).toLocaleString()} AMD`)
    .join("\n");

  const prompt = `You are a personal finance advisor for someone living in Yerevan, Armenia. All amounts are in AMD (Armenian Dram). Current rate: 1 USD = ${Math.round(exchange?.rate || 390)} AMD.

Current month snapshot:
- Income: ${income.toLocaleString()} AMD
- Total expenses: ${expenses.toLocaleString()} AMD
- Net after expenses: ${net.toLocaleString()} AMD
- Monthly savings goal: ${totals.monthlyGoal.toLocaleString()} AMD (${savingsRate}% savings rate)
- Remaining after plan: ${totals.leftAfterPlan.toLocaleString()} AMD

Savings funds:
${fundLines || "  None set"}

Life goals:
${goalLines || "  None set"}

Top spending categories this month:
${topCategories || "  No logged expenses yet"}

Give 3-5 specific, actionable suggestions to improve this person's financial situation. Be concise and direct. Focus on the biggest lever available. Format as a numbered list. Each point max 2 sentences.`;

  return chat([{ role: "user", content: prompt }], { maxTokens: 600 });
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

export async function getGoalAdvice({ goal, totals, exchange }) {
  const prompt = `Personal finance advisor for Yerevan, Armenia. 1 USD = ${Math.round(exchange?.rate || 390)} AMD.

Goal: "${goal.title}" — ${goal.progress}% complete, status: ${goal.status}, target date: ${goal.target || "not set"}, priority: ${goal.priority}.

Monthly income: ${totals.income.toLocaleString()} AMD. Monthly expenses: ${totals.expenses.toLocaleString()} AMD. After plan: ${totals.leftAfterPlan.toLocaleString()} AMD.

Give 2-3 specific suggestions to reach this goal faster. Be direct and practical. Max 3 sentences total.`;

  return chat([{ role: "user", content: prompt }], { maxTokens: 300 });
}
