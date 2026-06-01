const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getKey() {
  // Prefer user-saved key from settings, fall back to .env
  return (
    localStorage.getItem("pt_groq_key") ||
    import.meta.env.VITE_GROQ_API_KEY ||
    ""
  );
}

export const hasGroqKey = () => !!getKey();

async function chat(messages, { maxTokens = 1024 } = {}) {
  const key = getKey();
  if (!key) throw new Error("No Groq API key configured. Add it in Settings.");
  const res = await fetch(GROQ_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq error ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
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

export async function getGoalAdvice({ goal, totals, exchange }) {
  const prompt = `Personal finance advisor for Yerevan, Armenia. 1 USD = ${Math.round(exchange?.rate || 390)} AMD.

Goal: "${goal.title}" — ${goal.progress}% complete, status: ${goal.status}, target date: ${goal.target || "not set"}, priority: ${goal.priority}.

Monthly income: ${totals.income.toLocaleString()} AMD. Monthly expenses: ${totals.expenses.toLocaleString()} AMD. After plan: ${totals.leftAfterPlan.toLocaleString()} AMD.

Give 2-3 specific suggestions to reach this goal faster. Be direct and practical. Max 3 sentences total.`;

  return chat([{ role: "user", content: prompt }], { maxTokens: 300 });
}
