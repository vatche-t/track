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
    id: uid(),
    name: "House down payment",
    target: 7500000,
    saved: 0,
    monthly: 600000,
    targetDate: "",
  },
  {
    id: uid(),
    name: "Fiancee relocation fund",
    target: 1000000,
    saved: 0,
    monthly: 150000,
    targetDate: "",
  },
  {
    id: uid(),
    name: "Emergency fund",
    target: 1500000,
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
  if (finance.seededStarterExpenses) return finance;
  const expenses = finance.expenses || [];
  const ids = new Set(expenses.map((expense) => expense.id));
  const missing = STARTER_EXPENSES.filter((expense) => !ids.has(expense.id));
  const categories = withDefaultCategories(finance.categories);

  return {
    ...finance,
    expenses: [...missing, ...expenses],
    categories,
    seededStarterExpenses: true,
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

export const normalizeFinance = (finance = {}) => {
  const exchange = normalizeExchange(finance.exchange);
  return {
    income: finance.income?.length
      ? finance.income.map((row) => moneyRow(row, ["budget", "actual"]))
      : [{ id: uid(), name: "Senior AI Engineer salary", budget: 1200000, actual: 1200000 }],
    fixed: finance.fixed?.length
      ? finance.fixed.map((row) => moneyRow(row, ["budget", "actual"]))
      : [
          { id: uid(), name: "Rent", budget: 90000, actual: 90000 },
          { id: uid(), name: "Utilities", budget: 30000, actual: 30000 },
        ],
    variable: finance.variable?.length
      ? finance.variable.map((row) => moneyRow(row, ["budget", "actual"]))
      : [
          { id: uid(), name: "Groceries", budget: 20000, actual: 0 },
          { id: uid(), name: "Transport", budget: 18000, actual: 0 },
          { id: uid(), name: "Eating out", budget: 43000, actual: 0 },
          { id: uid(), name: "Cigarettes", budget: 13500, actual: 0 },
        ],
    savings: finance.savings?.length
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

export const lumpSumAllocation = (amount, savings, exchange = DEFAULT_EXCHANGE, currency = AMD) => {
  const amdAmount = toAMD(+amount || 0, currency, exchange);
  const funds = (savings || []).map((fund) => ({
    ...fund,
    remaining: Math.max(0, (+fund.target || 0) - (+fund.saved || 0)),
  }));
  const totalRemaining = funds.reduce((s, f) => s + f.remaining, 0);
  return funds.map((fund) => ({
    id: fund.id,
    name: fund.name,
    remaining: fund.remaining,
    suggested:
      totalRemaining > 0
        ? Math.round(amdAmount * (fund.remaining / totalRemaining))
        : Math.round(amdAmount / Math.max(1, funds.length)),
  }));
};

export const allocationSuggestion = (income) => {
  const amount = +income || 0;
  const spending = 300000;
  const fun = 50000;
  const fiancee = 150000;
  const emergency = 100000;
  const house = Math.max(0, amount - spending - fun - fiancee - emergency);

  return [
    { name: "Spending card", amount: spending, note: "Daily life cap" },
    { name: "House down payment", amount: house, note: "Main 12-month push" },
    { name: "Fiancee relocation fund", amount: fiancee, note: "Support buffer" },
    { name: "Emergency fund", amount: emergency, note: "Safety first" },
    { name: "Skills / fun", amount: fun, note: "Controlled flexibility" },
  ];
};
