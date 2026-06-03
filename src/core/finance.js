import { localDate, monthKey, sum, uid } from "./date";

export const AMD = "AMD";
export const USD = "USD";
export const MONEY_CURRENCIES = [AMD, USD];
export const DEFAULT_USD_AMD_RATE = 390;
export const DEFAULT_EXCHANGE = {
  base: USD,
  quote: AMD,
  rate: DEFAULT_USD_AMD_RATE,
  fetchedAt: "",
  source: "fallback",
  status: "idle",
};

export const FINANCE_CATEGORIES = [
  {
    id: "rent",
    name: "Rent",
    type: "fixed",
    keywords: ["rent", "apartment", "flat", "տուն", "վարձ"],
  },
  {
    id: "utilities",
    name: "Utilities",
    type: "fixed",
    keywords: ["utility", "electric", "water", "gas", "internet", "ucom", "veon", "vivacell"],
  },
  {
    id: "groceries",
    name: "Groceries",
    type: "variable",
    keywords: ["grocery", "market", "supermarket", "sas", "yerevan city", "carrefour", "food"],
  },
  {
    id: "garbage_spending",
    name: "Garbage Spending",
    type: "variable",
    keywords: ["garbage", "waste", "impulse", "phone accessory", "accessory"],
  },
  {
    id: "transport",
    name: "Transport",
    type: "variable",
    keywords: ["bus", "metro", "transport", "taxi", "gg", "yandex"],
  },
  {
    id: "eating_out",
    name: "Eating out",
    type: "variable",
    keywords: ["lunch", "restaurant", "cafe", "coffee", "delivery", "glovo", "menu.am"],
  },
  {
    id: "cigarettes",
    name: "Cigarettes",
    type: "variable",
    keywords: ["cigarette", "smoke", "tobacco", "marlboro", "parliament"],
  },
  {
    id: "fiancee",
    name: "Fiancee relocation",
    type: "goal",
    keywords: ["fiance", "relocation", "document", "visa", "ticket"],
  },
  {
    id: "health",
    name: "Health",
    type: "variable",
    keywords: ["doctor", "pharmacy", "medicine", "clinic", "health"],
  },
  {
    id: "skills",
    name: "Skills",
    type: "variable",
    keywords: ["course", "book", "training", "subscription", "learning"],
  },
  {
    id: "fun",
    name: "Fun",
    type: "variable",
    keywords: ["movie", "game", "gift", "fun", "shopping"],
  },
  { id: "other", name: "Other", type: "variable", keywords: [] },
];

const withDefaultCategories = (categories) => {
  if (!categories?.length) return FINANCE_CATEGORIES;
  const ids = new Set(categories.map((category) => category.id));
  return [
    ...categories,
    ...FINANCE_CATEGORIES.filter((category) => !ids.has(category.id)),
  ];
};

export const DEFAULT_SAVINGS_FUNDS = [
  {
    id: "house-down-payment",
    name: "House down payment",
    target: 7500000,
    saved: 0,
    monthly: 600000,
    targetDate: "",
  },
  {
    id: "fiancee-relocation-fund",
    name: "Fiancee relocation fund",
    target: 1000000,
    saved: 0,
    monthly: 150000,
    targetDate: "",
  },
  {
    id: "fiancee-support-buffer",
    name: "Fiancee support buffer",
    target: 1000000,
    saved: 0,
    monthly: 100000,
    targetDate: "",
  },
  {
    id: "emergency-fund",
    name: "Emergency fund",
    target: 1500000,
    saved: 0,
    monthly: 100000,
    targetDate: "",
  },
  {
    id: "investment-seed-fund",
    name: "Investment seed fund",
    target: 3000000,
    saved: 0,
    monthly: 100000,
    targetDate: "",
  },
];

export const STARTER_EXPENSES = [
  {
    id: "starter-phone-accessory-garbage-spending",
    date: localDate(),
    note: "Phone accessory",
    amount: 13000,
    originalAmount: 13000,
    currency: AMD,
    amountAMD: 13000,
    fxRate: DEFAULT_USD_AMD_RATE,
    rateDate: "",
    categoryId: "garbage_spending",
    categoryName: "Garbage Spending",
    source: "Manual entry",
  },
  {
    id: "starter-food-groceries",
    date: localDate(),
    note: "Food",
    amount: 1900,
    originalAmount: 1900,
    currency: AMD,
    amountAMD: 1900,
    fxRate: DEFAULT_USD_AMD_RATE,
    rateDate: "",
    categoryId: "groceries",
    categoryName: "Groceries",
    source: "Manual entry",
  },
];

export const ensureStarterExpenses = (finance = {}) => {
  const expenses = finance.expenses || [];
  const ids = new Set(expenses.map((expense) => expense.id));
  const missingExpenses = finance.seededStarterExpenses
    ? []
    : STARTER_EXPENSES.filter((expense) => !ids.has(expense.id));
  const categories = withDefaultCategories(finance.categories);
  const savings = finance.savings || [];
  const defaultByName = new Map(DEFAULT_SAVINGS_FUNDS.map((fund) => [fund.name.toLowerCase(), fund]));
  const repairedSavings = savings.map((fund) => {
    const match = defaultByName.get(String(fund.name || "").toLowerCase());
    if (!match) return fund;
    return {
      ...fund,
      target: +fund.target > 0 ? fund.target : match.target,
      monthly: +fund.monthly > 0 ? fund.monthly : match.monthly,
    };
  });
  const savingsNames = new Set(repairedSavings.map((fund) => String(fund.name || "").toLowerCase()));
  const missingSavings = finance.seededCoreSavingsFunds
    ? []
    : DEFAULT_SAVINGS_FUNDS.filter((fund) => !savingsNames.has(fund.name.toLowerCase()));

  return {
    ...finance,
    expenses: [...missingExpenses, ...expenses],
    categories,
    savings: [...repairedSavings, ...missingSavings],
    seededStarterExpenses: true,
    seededCoreSavingsFunds: true,
  };
};

export const formatMoney = (value, currency = AMD) => {
  const amount = Number(value) || 0;
  const sign = amount < 0 ? "-" : "";
  return `${sign}${currency === USD ? "$" : ""}${Math.abs(amount).toLocaleString(undefined, {
    maximumFractionDigits: currency === USD ? 2 : 0,
  })}${currency === AMD ? " AMD" : ""}`;
};

export const amd = (value) => formatMoney(value, AMD);

export const usd = (value) =>
  `$${(Number(value) || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;

export const normalizeExchange = (exchange = {}) => ({
  ...DEFAULT_EXCHANGE,
  ...exchange,
  rate: +exchange.rate > 0 ? +exchange.rate : DEFAULT_USD_AMD_RATE,
});

export const toAMD = (value, currency = AMD, exchange = DEFAULT_EXCHANGE) => {
  const amount = +value || 0;
  const rate = normalizeExchange(exchange).rate;
  return currency === USD ? amount * rate : amount;
};

export const fromAMD = (value, currency = AMD, exchange = DEFAULT_EXCHANGE) => {
  const amount = +value || 0;
  const rate = normalizeExchange(exchange).rate;
  return currency === USD ? amount / rate : amount;
};

export const displayMoney = (
  amdValue,
  currency = AMD,
  exchange = DEFAULT_EXCHANGE,
) => formatMoney(fromAMD(amdValue, currency, exchange), currency);

export async function fetchUsdAmdRate() {
  const response = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!response.ok) throw new Error("Exchange rate request failed");
  const data = await response.json();
  const rate = Number(data?.rates?.AMD || data?.conversion_rates?.AMD);
  if (!rate) throw new Error("AMD rate missing from exchange rate response");
  return {
    base: USD,
    quote: AMD,
    rate,
    fetchedAt: new Date().toISOString(),
    providerDate: data?.time_last_update_utc || data?.time_last_update_unix || "",
    source: "open.er-api.com",
    status: "live",
  };
}

export const detectExpenseCategory = (text) => {
  const normalized = String(text || "").toLowerCase();
  return (
    FINANCE_CATEGORIES.find((category) =>
      category.keywords.some((keyword) => normalized.includes(keyword)),
    ) || FINANCE_CATEGORIES.find((category) => category.id === "other")
  );
};

const moneyRow = (row, fields) => ({
  ...row,
  ...fields.reduce((next, field) => ({ ...next, [field]: +row[field] || 0 }), {}),
});

const normalizeSavingsRow = (row) => ({
  ...moneyRow(row, ["target", "saved", "monthly"]),
  targetDate: row.targetDate || "",
});

const normalizeAi = (ai = {}) => ({
  forecast: ai.forecast ?? null,
  advice: ai.advice ?? null,
  split: ai.split ?? null,
  generatedAt: ai.generatedAt && typeof ai.generatedAt === "object" ? ai.generatedAt : {},
});

export const normalizeFinance = (finance = {}) => {
  const exchange = normalizeExchange(finance.exchange);
  return {
    ai: normalizeAi(finance.ai),
    income: Array.isArray(finance.income)
      ? finance.income.map((row) => moneyRow(row, ["budget", "actual"]))
      : [{ id: uid(), name: "Senior AI Engineer salary", budget: 1200000, actual: 1200000 }],
    fixed: Array.isArray(finance.fixed)
      ? finance.fixed.map((row) => moneyRow(row, ["budget", "actual"]))
      : [
          { id: uid(), name: "Rent", budget: 90000, actual: 90000 },
          { id: uid(), name: "Utilities", budget: 30000, actual: 30000 },
        ],
    variable: Array.isArray(finance.variable)
      ? finance.variable.map((row) => moneyRow(row, ["budget", "actual"]))
      : [
          { id: uid(), name: "Groceries", budget: 20000, actual: 0 },
          { id: uid(), name: "Transport", budget: 18000, actual: 0 },
          { id: uid(), name: "Eating out", budget: 43000, actual: 0 },
          { id: uid(), name: "Cigarettes", budget: 13500, actual: 0 },
        ],
    savings: Array.isArray(finance.savings)
      ? finance.savings.map(normalizeSavingsRow)
      : DEFAULT_SAVINGS_FUNDS,
    expenses: (finance.expenses || []).map((expense) =>
      normalizeExpense(expense, exchange),
    ),
    categories: withDefaultCategories(finance.categories),
    exchange,
  };
};

export const expenseAmountAMD = (expense, exchange = DEFAULT_EXCHANGE) => {
  if (+expense.amountAMD) return +expense.amountAMD;
  return toAMD(expense.amount, expense.currency || AMD, exchange);
};

export const normalizeExpense = (expense, exchange = DEFAULT_EXCHANGE) => {
  const currency = MONEY_CURRENCIES.includes(expense.currency)
    ? expense.currency
    : AMD;
  const amount = +expense.amount || +expense.originalAmount || 0;
  const amountAMD =
    +expense.amountAMD || toAMD(amount, currency, exchange);
  return {
    ...expense,
    currency,
    amount,
    originalAmount: +expense.originalAmount || amount,
    amountAMD,
    fxRate: +expense.fxRate || normalizeExchange(exchange).rate,
  };
};

export const currentMonthExpenses = (finance) =>
  normalizeFinance(finance).expenses.filter((expense) =>
    (expense.date || "").startsWith(monthKey()),
  );

export const financeTotals = (finance) => {
  const normalized = normalizeFinance(finance);
  const income = sum(normalized.income, "actual");
  const fixed = sum(normalized.fixed, "actual");
  const variableManual = sum(normalized.variable, "actual");
  const loggedExpenses = currentMonthExpenses(normalized).reduce(
    (total, expense) => total + expenseAmountAMD(expense, normalized.exchange),
    0,
  );
  const saved = sum(normalized.savings, "saved");
  const monthlyGoal = normalized.savings.reduce(
    (total, fund) => total + (+fund.monthly || 0),
    0,
  );
  const expenses = fixed + variableManual + loggedExpenses;
  const leftAfterPlan = income - expenses - monthlyGoal;

  return {
    income,
    fixed,
    variableManual,
    loggedExpenses,
    expenses,
    saved,
    monthlyGoal,
    net: income - expenses - saved,
    leftAfterPlan,
  };
};

export const createExpense = (draft, exchange = DEFAULT_EXCHANGE) => {
  const detected = detectExpenseCategory(draft.note);
  const currency = MONEY_CURRENCIES.includes(draft.currency)
    ? draft.currency
    : AMD;
  const amount = +draft.amount || 0;
  const normalizedExchange = normalizeExchange(exchange);
  return {
    id: uid(),
    date: draft.date || localDate(),
    note: draft.note.trim(),
    amount,
    originalAmount: amount,
    currency,
    amountAMD: toAMD(amount, currency, normalizedExchange),
    fxRate: normalizedExchange.rate,
    rateDate: normalizedExchange.fetchedAt,
    categoryId: draft.categoryId || detected.id,
    categoryName: draft.categoryName || detected.name,
    source: draft.source || "Spending card",
  };
};

const monthsUntil = (targetDate) => {
  if (!targetDate) return 0;
  const today = new Date(`${localDate()}T00:00:00`);
  const target = new Date(`${targetDate}T00:00:00`);
  const days = Math.ceil((target - today) / 86400000);
  return Math.max(1, Math.ceil(days / 30.4375));
};

export const fundSuggestion = (fund) => {
  const remaining = Math.max(0, (+fund.target || 0) - (+fund.saved || 0));
  const months = monthsUntil(fund.targetDate);
  return {
    remaining,
    months,
    suggestedMonthly: months ? Math.ceil(remaining / months) : +fund.monthly || 0,
    progress:
      +fund.target > 0
        ? Math.min(100, Math.round(((+fund.saved || 0) / +fund.target) * 100))
        : 0,
  };
};

export const savingsPlan = (finance) =>
  normalizeFinance(finance).savings.map((fund) => ({
    ...fund,
    ...fundSuggestion(fund),
  }));

const goalReason = (name, amount, remaining) => {
  const lower = name.toLowerCase();
  if (amount <= 0 && remaining <= 0) return "Set a target or increase the remaining gap before funding this goal.";
  if (amount <= 0) return "No income left after the life cap and higher-priority goals.";
  if (lower.includes("emergency")) {
    return "Keeps cash stable before aggressive investing or house saving.";
  }
  if (lower.includes("support")) {
    return "Covers the job-search buffer after relocation without touching house money.";
  }
  if (lower.includes("fiance") || lower.includes("relocation")) {
    return "Near-term relocation support gets protected before long-term goals.";
  }
  if (lower.includes("house") || lower.includes("down payment")) {
    return "Main wealth-building goal receives the remaining monthly surplus.";
  }
  if (lower.includes("investment")) {
    return "Starts long-term investing after stability and relocation are funded.";
  }
  if (remaining > 0) return "Allocated from surplus based on the remaining gap.";
  return "Maintenance allocation after the target is mostly covered.";
};

export const allocationSuggestion = (income, savings = []) => {
  const amount = +income || 0;
  const spending = Math.min(300000, amount);
  const flex = Math.min(50000, Math.max(0, amount - spending));
  const goalBudget = Math.max(0, amount - spending - flex);
  const plan = savingsPlan({ savings }).map((fund) => ({
    ...fund,
    key: fund.name.toLowerCase(),
  }));

  const buckets = plan.map((fund) => ({ fund, amount: 0 }));
  let remainingBudget = goalBudget;

  const assignTo = (match, cap) => {
    const bucket = buckets.find(({ fund }) => match(fund.key));
    if (!bucket || remainingBudget <= 0) return 0;
    const gap = Math.max(0, bucket.fund.remaining);
    if (gap <= 0) return 0;
    const allocation = Math.min(remainingBudget, cap, gap);
    bucket.amount += allocation;
    remainingBudget -= allocation;
    return allocation;
  };

  assignTo((name) => name.includes("emergency"), 100000);
  assignTo((name) => name.includes("fiance") || name.includes("relocation"), 150000);
  assignTo((name) => name.includes("support"), 100000);
  assignTo((name) => name.includes("house") || name.includes("down payment"), remainingBudget);
  assignTo((name) => name.includes("investment"), remainingBudget);

  const stillOpen = buckets.filter(({ fund }) => fund.remaining > 0 && !fund.key.includes("house") && !fund.key.includes("down payment"));
  if (remainingBudget > 0 && stillOpen.length) {
    const totalGap = stillOpen.reduce((total, { fund }) => total + fund.remaining, 0) || stillOpen.length;
    stillOpen.forEach((bucket, index) => {
      const share = index === stillOpen.length - 1
        ? remainingBudget
        : Math.round(remainingBudget * (bucket.fund.remaining / totalGap));
      bucket.amount += share;
      remainingBudget -= share;
    });
  }

  return [
    {
      name: "Spending card",
      amount: spending,
      kind: "reserve",
      note: "Daily life cap",
      reason: "Protects a hard monthly spending limit before assigning money to goals.",
    },
    ...buckets.map(({ fund, amount: allocation }) => ({
      id: fund.id,
      name: fund.name,
      amount: Math.max(0, Math.round(allocation)),
      kind: "goal",
      progress: fund.progress,
      remaining: fund.remaining,
      suggestedMonthly: fund.suggestedMonthly,
      note: `${fund.progress}% funded`,
      reason: goalReason(fund.name, allocation, fund.remaining),
    })),
    {
      name: "Skills / fun",
      amount: flex,
      kind: "reserve",
      note: "Controlled flexibility",
      reason: "Small guilt-free buffer so the savings plan is easier to keep.",
    },
    ...(remainingBudget > 0 ? [{
      name: "Unassigned surplus",
      amount: Math.round(remainingBudget),
      kind: "unassigned",
      note: "Needs a target",
      reason: "Add or increase a goal target so this surplus has a job.",
    }] : []),
  ];
};
