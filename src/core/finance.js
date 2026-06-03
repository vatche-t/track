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
    essential: true,
    keywords: ["rent", "apartment", "flat", "տուն", "վարձ"],
  },
  {
    id: "utilities",
    name: "Utilities",
    type: "fixed",
    essential: true,
    keywords: ["utility", "electric", "water", "gas", "internet", "ucom", "veon", "vivacell"],
  },
  {
    id: "groceries",
    name: "Groceries",
    type: "variable",
    essential: true,
    keywords: ["grocery", "market", "supermarket", "sas", "yerevan city", "carrefour", "food"],
  },
  {
    id: "garbage_spending",
    name: "Garbage Spending",
    type: "variable",
    essential: false,
    keywords: ["garbage", "waste", "impulse", "phone accessory", "accessory"],
  },
  {
    id: "transport",
    name: "Transport",
    type: "variable",
    essential: true,
    keywords: ["bus", "metro", "transport", "taxi", "gg", "yandex"],
  },
  {
    id: "eating_out",
    name: "Eating out",
    type: "variable",
    essential: false,
    keywords: ["lunch", "restaurant", "cafe", "coffee", "delivery", "glovo", "menu.am"],
  },
  {
    id: "cigarettes",
    name: "Cigarettes",
    type: "variable",
    essential: false,
    keywords: ["cigarette", "smoke", "tobacco", "marlboro", "parliament"],
  },
  {
    id: "fiancee",
    name: "Fiancee relocation",
    type: "goal",
    essential: true,
    keywords: ["fiance", "relocation", "document", "visa", "ticket"],
  },
  {
    id: "health",
    name: "Health",
    type: "variable",
    essential: true,
    keywords: ["doctor", "pharmacy", "medicine", "clinic", "health"],
  },
  {
    id: "skills",
    name: "Skills",
    type: "variable",
    essential: false,
    keywords: ["course", "book", "training", "subscription", "learning"],
  },
  {
    id: "fun",
    name: "Fun",
    type: "variable",
    essential: false,
    keywords: ["movie", "game", "gift", "fun", "shopping"],
  },
  { id: "other", name: "Other", type: "variable", essential: false, keywords: [] },
];

const withDefaultCategories = (categories) => {
  if (!categories?.length) return FINANCE_CATEGORIES;
  const byId = new Map(FINANCE_CATEGORIES.map((c) => [c.id, c]));
  const ids = new Set(categories.map((category) => category.id));
  return [
    // Backfill `essential` on stored categories that predate the needs/wants split.
    ...categories.map((category) =>
      category.essential === undefined
        ? { ...category, essential: byId.get(category.id)?.essential ?? false }
        : category,
    ),
    ...FINANCE_CATEGORIES.filter((category) => !ids.has(category.id)),
  ];
};

// priority drives the goal-sequencing waterfall: lower = funded first.
// Coach order: stability (emergency) → time-sensitive relocation → support → house → investing.
export const DEFAULT_SAVINGS_FUNDS = [
  {
    id: "emergency-fund",
    name: "Emergency fund",
    target: 1500000,
    saved: 0,
    monthly: 100000,
    targetDate: "",
    priority: 1,
  },
  {
    id: "fiancee-relocation-fund",
    name: "Fiancee relocation fund",
    target: 1000000,
    saved: 0,
    monthly: 150000,
    targetDate: "",
    priority: 2,
  },
  {
    id: "fiancee-support-buffer",
    name: "Fiancee support buffer",
    target: 1000000,
    saved: 0,
    monthly: 100000,
    targetDate: "",
    priority: 3,
  },
  {
    id: "house-down-payment",
    name: "House down payment",
    target: 7500000,
    saved: 0,
    monthly: 600000,
    targetDate: "",
    priority: 4,
  },
  {
    id: "investment-seed-fund",
    name: "Investment seed fund",
    target: 3000000,
    saved: 0,
    monthly: 100000,
    targetDate: "",
    priority: 5,
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

// Default priority for funds saved before the sequencing feature existed.
const defaultPriority = (name) => {
  const lower = String(name || "").toLowerCase();
  if (lower.includes("emergency")) return 1;
  if (lower.includes("relocation") || lower.includes("fiance")) return 2;
  if (lower.includes("support")) return 3;
  if (lower.includes("house") || lower.includes("down payment")) return 4;
  if (lower.includes("investment")) return 5;
  return 6;
};

const normalizeSavingsRow = (row) => ({
  ...moneyRow(row, ["target", "saved", "monthly"]),
  targetDate: row.targetDate || "",
  priority: +row.priority > 0 ? +row.priority : defaultPriority(row.name),
});

const normalizeAi = (ai = {}) => ({
  forecast: ai.forecast ?? null,
  advice: ai.advice ?? null,
  split: ai.split ?? null,
  generatedAt: ai.generatedAt && typeof ai.generatedAt === "object" ? ai.generatedAt : {},
});

export const CURRENT_SCHEMA = 2;

const defaultIncome = () => [
  { id: uid(), name: "Senior AI Engineer salary", budget: 1200000, actual: 1200000 },
];
const defaultFixed = () => [
  { id: uid(), name: "Rent", budget: 90000, actual: 90000 },
  { id: uid(), name: "Utilities", budget: 30000, actual: 30000 },
];
const defaultVariable = () => [
  { id: uid(), name: "Groceries", budget: 20000, actual: 0 },
  { id: uid(), name: "Transport", budget: 18000, actual: 0 },
  { id: uid(), name: "Eating out", budget: 43000, actual: 0 },
  { id: uid(), name: "Cigarettes", budget: 13500, actual: 0 },
];

const normalizeMonthSetup = (setup = {}) => ({
  income: Array.isArray(setup.income)
    ? setup.income.map((row) => moneyRow(row, ["budget", "actual"]))
    : defaultIncome(),
  fixed: Array.isArray(setup.fixed)
    ? setup.fixed.map((row) => moneyRow(row, ["budget", "actual"]))
    : defaultFixed(),
  variable: Array.isArray(setup.variable)
    ? setup.variable.map((row) => moneyRow(row, ["budget", "actual"]))
    : defaultVariable(),
  contributions:
    setup.contributions && typeof setup.contributions === "object"
      ? setup.contributions
      : {},
  ai: normalizeAi(setup.ai),
});

const contributionsFromSavings = (savings = []) => {
  const map = {};
  savings.forEach((fund) => {
    if (fund.id && +fund.monthly > 0) map[fund.id] = +fund.monthly;
  });
  return map;
};

const normalizeDebtRow = (row) => ({
  id: row.id || uid(),
  name: row.name || "",
  ...moneyRow(row, ["balance", "rate", "minPayment"]),
});

const normalizeSinkingRow = (row) => ({
  id: row.id || uid(),
  name: row.name || "",
  ...moneyRow(row, ["annualAmount", "saved"]),
});

const normalizeHoldings = (holdings = {}) => ({
  amd: +holdings.amd || 0,
  usd: +holdings.usd || 0,
});

export const normalizeFinance = (finance = {}) => {
  const exchange = normalizeExchange(finance.exchange);

  // Migrate the old flat shape (no `months`) into months[currentMonth] once.
  const sourceMonths = finance.months || {
    [monthKey()]: {
      income: finance.income,
      fixed: finance.fixed,
      variable: finance.variable,
      contributions: contributionsFromSavings(finance.savings),
      ai: finance.ai,
    },
  };

  const months = {};
  Object.keys(sourceMonths).forEach((key) => {
    months[key] = normalizeMonthSetup(sourceMonths[key]);
  });
  if (!Object.keys(months).length) months[monthKey()] = normalizeMonthSetup({});

  const activeMonth =
    finance.activeMonth && months[finance.activeMonth]
      ? finance.activeMonth
      : months[monthKey()]
        ? monthKey()
        : Object.keys(months).sort().pop();

  const active = months[activeMonth];

  return {
    schemaVersion: CURRENT_SCHEMA,
    activeMonth,
    months,
    // Active-month setup mirrored to top level so existing read sites keep working.
    income: active.income,
    fixed: active.fixed,
    variable: active.variable,
    contributions: active.contributions,
    ai: active.ai,
    // Global data
    savings: Array.isArray(finance.savings)
      ? finance.savings.map(normalizeSavingsRow)
      : DEFAULT_SAVINGS_FUNDS,
    debts: Array.isArray(finance.debts) ? finance.debts.map(normalizeDebtRow) : [],
    sinkingFunds: Array.isArray(finance.sinkingFunds)
      ? finance.sinkingFunds.map(normalizeSinkingRow)
      : [],
    holdings: normalizeHoldings(finance.holdings),
    netWorthHistory:
      finance.netWorthHistory && typeof finance.netWorthHistory === "object"
        ? finance.netWorthHistory
        : {},
    expenses: (finance.expenses || []).map((expense) =>
      normalizeExpense(expense, exchange),
    ),
    categories: withDefaultCategories(finance.categories),
    exchange,
  };
};

// Net worth = liquid assets (saved across funds + sinking funds + held cash) minus debts.
export const netWorthSummary = (finance) => {
  const model = finance.months ? finance : normalizeFinance(finance);
  const fundsSaved = sum(model.savings, "saved");
  const sinkingSaved = sum(model.sinkingFunds, "saved");
  const heldCash = model.holdings.amd + model.holdings.usd * model.exchange.rate;
  const assets = fundsSaved + sinkingSaved + heldCash;
  const debt = sum(model.debts, "balance");
  return { assets, debt, net: assets - debt, fundsSaved, sinkingSaved, heldCash };
};

// Per-month series for trend charts: spent / net / income across recent months.
export const monthlySeries = (finance, count = 6) => {
  const model = finance.months ? finance : normalizeFinance(finance);
  const keys = Object.keys(model.months).sort();
  const recent = keys.slice(-count);
  return recent.map((key) => {
    const t = financeTotals(model, key);
    const [y, m] = key.split("-").map(Number);
    return {
      month: key,
      label: new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" }),
      income: t.income,
      spent: t.spent,
      net: t.net,
      essential: t.essentialSpent,
      discretionary: t.discretionarySpent,
    };
  });
};

// Deep-ish copy of a month setup with fresh row ids so editing a carried-forward
// month never mutates the source month's rows.
const copyMonthSetup = (setup) => ({
  income: setup.income.map((row) => ({ ...row, id: uid() })),
  fixed: setup.fixed.map((row) => ({ ...row, id: uid() })),
  variable: setup.variable.map((row) => ({ ...row, id: uid() })),
  contributions: { ...setup.contributions },
  ai: { forecast: null, advice: null, split: null, generatedAt: {} },
});

// Returns the setup for `key`, carrying forward from the most recent earlier month
// when that month does not exist yet. Pure — does not mutate `finance`.
export const getMonth = (finance, key) => {
  const model = finance.months ? finance : normalizeFinance(finance);
  if (model.months[key]) return model.months[key];
  const earlier = Object.keys(model.months).filter((k) => k < key).sort();
  const source = earlier.length ? model.months[earlier[earlier.length - 1]] : null;
  return source ? copyMonthSetup(source) : normalizeMonthSetup({});
};

// Ensures the current calendar month exists (carried forward) and is active.
// Returns a new finance object; safe to feed to setFinance.
export const ensureActiveMonth = (finance) => {
  const model = normalizeFinance(finance);
  const key = monthKey();
  if (model.months[key]) {
    return model.activeMonth === key ? model : { ...model, activeMonth: key };
  }
  return {
    ...model,
    activeMonth: key,
    months: { ...model.months, [key]: getMonth(model, key) },
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

// Single source of truth = logged expenses. Two lenses:
//   - This month (actual): income.actual − spent (logged this month; reimbursements
//     are negative). Yields the real net cash position — never fake debt.
//   - Monthly plan (budget): income.budget − planned fixed/variable/savings.
// fixed/variableManual are now the breakdown of `spent` by category type (not the
// old Setup "actual" columns), so they always sum back to `spent`.
export const financeTotals = (finance, monthKeyArg) => {
  const normalized = normalizeFinance(finance);
  const key = monthKeyArg || normalized.activeMonth;
  const setup = normalized.months[key] || normalized.months[normalized.activeMonth];

  const income = sum(setup.income, "actual");
  const incomePlan = sum(setup.income, "budget");
  const fixedPlan = sum(setup.fixed, "budget");
  const variablePlan = sum(setup.variable, "budget");

  const typeById = new Map(normalized.categories.map((c) => [c.id, c.type]));
  const typeByName = new Map(
    normalized.categories.map((c) => [String(c.name).toLowerCase(), c.type]),
  );
  const essentialById = new Map(normalized.categories.map((c) => [c.id, c.essential]));
  const essentialByName = new Map(
    normalized.categories.map((c) => [String(c.name).toLowerCase(), c.essential]),
  );
  let spent = 0;
  let fixedSpent = 0;
  let essentialSpent = 0;
  normalized.expenses
    .filter((expense) => (expense.date || "").startsWith(key))
    .forEach((expense) => {
      const amount = expenseAmountAMD(expense, normalized.exchange);
      spent += amount;
      const nameKey = String(expense.categoryName || "").toLowerCase();
      const type = typeById.get(expense.categoryId) || typeByName.get(nameKey);
      if (type === "fixed") fixedSpent += amount;
      const essential =
        essentialById.get(expense.categoryId) ?? essentialByName.get(nameKey) ?? false;
      if (essential) essentialSpent += amount;
    });
  const variableSpent = spent - fixedSpent;
  const discretionarySpent = spent - essentialSpent;

  const saved = sum(normalized.savings, "saved");
  const monthlyGoal = normalized.savings.reduce((total, fund) => {
    const override = setup.contributions[fund.id];
    return total + (override != null ? +override || 0 : +fund.monthly || 0);
  }, 0);

  const net = income - spent;
  const availableToSave = Math.max(0, net);
  const planBalance = incomePlan - fixedPlan - variablePlan - monthlyGoal;
  const savingsRate = income > 0 ? Math.round((availableToSave / income) * 100) : 0;

  return {
    monthKey: key,
    // this month (actual)
    income,
    spent,
    net,
    netThisMonth: net,
    availableToSave,
    savingsRate,
    fixed: fixedSpent,
    variableManual: variableSpent,
    essentialSpent,
    discretionarySpent,
    // monthly plan (budget)
    incomePlan,
    fixedPlan,
    variablePlan,
    planBalance,
    // savings
    monthlyGoal,
    savingsPlan: monthlyGoal,
    saved,
    // compatibility aliases (consumers expect these names)
    expenses: spent,
    loggedExpenses: spent,
    leftAfterPlan: planBalance,
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

  // Strict priority waterfall: fund the highest-priority unfilled goal to its
  // remaining gap before any money flows to the next. One goal finishes fast,
  // then the whole budget rolls down — instead of trickling into all at once.
  const plan = savingsPlan({ savings })
    .map((fund) => ({ ...fund, key: fund.name.toLowerCase() }))
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  const buckets = plan.map((fund) => ({ fund, amount: 0 }));
  let remainingBudget = goalBudget;

  buckets.forEach((bucket) => {
    if (remainingBudget <= 0) return;
    const gap = Math.max(0, bucket.fund.remaining);
    if (gap <= 0) return;
    const allocation = Math.min(remainingBudget, gap);
    bucket.amount += allocation;
    remainingBudget -= allocation;
  });

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
