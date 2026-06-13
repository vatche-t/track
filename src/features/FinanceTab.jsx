import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  CreditCard,
  Landmark,
  PiggyBank,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Scale,
  Send,
  Sparkles,
  Target,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Label,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button, Card, Input, Pill, SectionTitle, Stat } from "../components/ui";
import { FinanceAnalyticsPanel } from "./AnalyticsTab";
import {
  askFinanceAnalyticsQuestion,
  explainWaterfall,
  getFinancialAdvice,
  getSpendNudge,
  getSpendingForecast,
  refineRecommendedSplit,
} from "../core/groq";
import { C } from "../core/constants";
import { buildInsights, chartTakeaway } from "../core/coach";
import { addDays, dayName, localDate, monthKey, parseDate, submitOnEnter, sum, uid } from "../core/date";
import {
  AMD,
  MONEY_CURRENCIES,
  USD,
  allocationSuggestion,
  amd,
  createExpense,
  currentMonthExpenses,
  detectExpenseCategory,
  displayMoney,
  ensureActiveMonth,
  expenseAmountAMD,
  fetchUsdAmdRate,
  financeTotals,
  forecastValues,
  getMonth,
  isAiStale,
  monthlySeries,
  netWorthSummary,
  spendNudge,
  splitSummarySentence,
  formatMoney,
  fromAMD,
  fundSuggestion,
  normalizeFinance,
  toAMD,
  usd,
  wantsForDisplay,
} from "../core/finance";

const COL_LABEL = {
  budget: "Plan",
  actual: "Actual",
  target: "Target",
  saved: "Saved",
  monthly: "Monthly",
  targetDate: "Goal date",
  suggestedMonthly: "Suggested",
};

const ACCENT = {
  income: C.green,
  fixed: C.red,
  variable: C.amber,
  savings: C.blue,
};

const inputValue = (amdValue, displayCurrency, exchange) => {
  const value = fromAMD(amdValue, displayCurrency, exchange);
  return displayCurrency === USD ? Number(value.toFixed(2)) : Math.round(value);
};

const cleanMoneyInput = (value, currency = AMD) => {
  const cleaned = String(value || "").replace(/[^\d.]/g, "");
  if (currency === USD) {
    const [whole = "", ...rest] = cleaned.split(".");
    const cents = rest.join("").slice(0, 2);
    return cents ? `${whole}.${cents}` : rest.length ? `${whole}.` : whole;
  }
  return cleaned.replace(/\./g, "");
};

const formatMoneyInput = (value, currency = AMD) => {
  const cleaned = cleanMoneyInput(value, currency);
  if (!cleaned) return "";
  const [whole, cents] = cleaned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return currency === USD && cleaned.includes(".") ? `${grouped}.${cents || ""}` : grouped;
};

function MoneyInput({ value, onChange, currency = AMD, ...props }) {
  return (
    <Input
      value={formatMoneyInput(value, currency)}
      onChange={(next) => onChange(cleanMoneyInput(next, currency))}
      type="text"
      inputMode={currency === USD ? "decimal" : "numeric"}
      autoComplete="off"
      {...props}
    />
  );
}

const rateAge = (fetchedAt) => {
  if (!fetchedAt) return "using fallback";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(fetchedAt)) / 60000));
  if (minutes < 1) return "just updated";
  if (minutes < 60) return `${minutes}m old`;
  return `${Math.round(minutes / 60)}h old`;
};

// Persist an AI result + timestamp into the ACTIVE MONTH's ai so it survives
// reloads. The finance model is month-keyed and normalizeFinance sources the
// top-level `ai` from months[activeMonth].ai — so we must write the month, not
// just the mirrored top level, or the value is wiped on the next normalize.
const persistAi = (setFinance, field, text) =>
  setFinance((previous) => {
    const normalized = normalizeFinance(previous);
    const month = normalized.activeMonth;
    const monthAi = normalized.months[month]?.ai || {};
    const nextAi = {
      ...monthAi,
      [field]: text,
      generatedAt: { ...(monthAi.generatedAt || {}), [field]: new Date().toISOString() },
    };
    return {
      ...normalized,
      months: { ...normalized.months, [month]: { ...normalized.months[month], ai: nextAi } },
      ai: nextAi, // keep the mirror in sync for the current render
    };
  });

const timeAgo = (iso) => {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export function FinanceTab({ finance, setFinance }) {
  const model = useMemo(() => normalizeFinance(finance), [finance]);
  const totals = useMemo(() => financeTotals(model), [model]);
  const categories = model.categories;
  const exchange = model.exchange;
  const [displayCurrency, setDisplayCurrency] = useState(AMD);
  const [financeView, setFinanceView] = useState("plan");
  const [planMode, setPlanMode] = useState("overview");
  const [adviceOpen, setAdviceOpen] = useState(false);
  const [rateBusy, setRateBusy] = useState(false);
  const [rateError, setRateError] = useState("");
  const [draft, setDraft] = useState({
    date: localDate(),
    note: "",
    amount: "",
    currency: AMD,
    categoryName: "Other",
    source: "Spending card",
    kind: "expense",
  });
  const [newCategory, setNewCategory] = useState("");
  const [nudge, setNudge] = useState(null);
  const detected = detectExpenseCategory(draft.note);
  const categoryOptions = categories.map((category) => category.name);
  const salary = sum(model.income, "actual");
  const suggestion = allocationSuggestion(salary, model.savings);
  const spendingCap = suggestion[0]?.amount || 300000;
  const loggedThisMonth = totals.spent;
  const capPct = Math.min(100, Math.round((loggedThisMonth / spendingCap) * 100));
  // One source of truth for the month-end projection, shared by the split-coach
  // hero, the forecast card, and the AI prompts so they never disagree.
  const fc = useMemo(
    () => forecastValues({ spentSoFar: totals.spent, spendingCap }),
    [totals.spent, spendingCap],
  );
  const [dismissed, setDismissed] = useState({});
  const insights = useMemo(() => {
    const map = {};
    currentMonthExpenses(model).forEach((e) => {
      const amt = expenseAmountAMD(e, exchange);
      if (amt <= 0) return; // skip reimbursements
      map[e.categoryName || "Other"] = (map[e.categoryName || "Other"] || 0) + amt;
    });
    const categories = Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    return buildInsights({ totals, fc, spendingCap, categories, dayOfMonth: fc.dayOfMonth });
  }, [model, totals, fc, spendingCap, exchange]);
  const topInsight = insights.find((i) => !dismissed[i.id]);
  const activeMonth = model.activeMonth;
  const PER_MONTH = new Set(["income", "fixed", "variable"]);
  const overcommit = totals.monthlyGoal + spendingCap - totals.incomePlan;

  // Per-category actual spend this month, derived from logged expenses. This is the
  // single source of truth that fills the Setup "Actual" columns (read-only).
  const spentByCategory = useMemo(() => {
    const map = {};
    currentMonthExpenses(model).forEach((expense) => {
      const key = String(expense.categoryName || "").toLowerCase();
      map[key] = (map[key] || 0) + expenseAmountAMD(expense, exchange);
    });
    return map;
  }, [model, exchange]);

  const updateFinance = (recipe) =>
    setFinance((previous) => recipe(normalizeFinance(previous)));

  const refreshRate = async () => {
    setRateBusy(true);
    setRateError("");
    try {
      const nextExchange = await fetchUsdAmdRate();
      updateFinance((previous) => ({
        ...previous,
        exchange: nextExchange,
      }));
    } catch {
      setRateError("Live rate unavailable. Fallback rate is still active.");
    } finally {
      setRateBusy(false);
    }
  };

  useEffect(() => {
    if (!exchange.fetchedAt) refreshRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Make sure the current calendar month exists (carried forward) and is active.
  useEffect(() => {
    setFinance((previous) => ensureActiveMonth(previous));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // income/fixed/variable live inside the active month; savings/expenses are global.
  const setItem = (section, id, patch) =>
    updateFinance((previous) => {
      if (PER_MONTH.has(section)) {
        const key = previous.activeMonth;
        const month = previous.months[key];
        return {
          ...previous,
          months: {
            ...previous.months,
            [key]: {
              ...month,
              [section]: month[section].map((row) =>
                row.id === id ? { ...row, ...patch } : row,
              ),
            },
          },
        };
      }
      return {
        ...previous,
        [section]: previous[section].map((row) =>
          row.id === id ? { ...row, ...patch } : row,
        ),
      };
    });

  const setMoneyItem = (section, id, key, value) =>
    setItem(section, id, {
      [key]: toAMD(value, displayCurrency, exchange),
    });

  const addItem = (section) =>
    updateFinance((previous) => {
      const newRow = {
        id: uid(),
        name: "",
        budget: 0,
        actual: 0,
        target: 0,
        saved: 0,
        monthly: 0,
        targetDate: "",
      };
      if (PER_MONTH.has(section)) {
        const key = previous.activeMonth;
        const month = previous.months[key];
        return {
          ...previous,
          months: {
            ...previous.months,
            [key]: { ...month, [section]: [...month[section], newRow] },
          },
        };
      }
      return { ...previous, [section]: [...previous[section], newRow] };
    });

  const delItem = (section, id) =>
    updateFinance((previous) => {
      if (PER_MONTH.has(section)) {
        const key = previous.activeMonth;
        const month = previous.months[key];
        return {
          ...previous,
          months: {
            ...previous.months,
            [key]: {
              ...month,
              [section]: month[section].filter((row) => row.id !== id),
            },
          },
        };
      }
      return {
        ...previous,
        [section]: previous[section].filter((row) => row.id !== id),
      };
    });

  const shiftMonth = (key, delta) => {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const monthLabel = (key) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  };
  const goMonth = (delta) =>
    updateFinance((previous) => {
      const key = shiftMonth(previous.activeMonth, delta);
      const months = previous.months[key]
        ? previous.months
        : { ...previous.months, [key]: getMonth(previous, key) };
      return { ...previous, activeMonth: key, months };
    });

  // One-click: log a setup row's planned amount as an expense in the active month.
  const logFromSetup = (row) => {
    const amount = +row.budget || 0;
    if (amount <= 0) return;
    const category =
      categories.find(
        (c) => c.name.toLowerCase() === String(row.name || "").toLowerCase(),
      ) || detectExpenseCategory(row.name);
    const date = activeMonth === monthKey() ? localDate() : `${activeMonth}-15`;
    updateFinance((previous) => ({
      ...previous,
      expenses: [
        createExpense(
          {
            date,
            note: row.name || category.name,
            amount,
            currency: AMD,
            categoryId: category.id,
            categoryName: category.name,
            source: "Quick log",
          },
          previous.exchange,
        ),
        ...previous.expenses,
      ],
    }));
  };

  const addExpense = () => {
    if (!draft.note.trim() || !(+draft.amount > 0)) return;
    const category =
      categories.find((item) => item.name === draft.categoryName) || detected;
    // "Money in" (reimbursement / refund) is stored as a negative amount so it
    // reduces Spent and the category's actual.
    const magnitude = +draft.amount || 0;
    const signedAmount = draft.kind === "in" ? -magnitude : magnitude;
    const isExpense = draft.kind !== "in" && (draft.date || localDate()) === localDate();
    const nextFinance = {
      ...model,
      expenses: [
        createExpense(
          {
            ...draft,
            amount: signedAmount,
            categoryId: category.id,
            categoryName: category.name,
          },
          model.exchange,
        ),
        ...model.expenses,
      ],
    };
    setFinance(nextFinance);
    // Keep the date, currency, category and kind the user just used so logging
    // several entries for the same day (or back-filling an older date) doesn't
    // snap back to today every time. Only clear what's unique per entry.
    setDraft((d) => ({
      ...d,
      note: "",
      amount: "",
    }));
    // Refocus the note field for rapid consecutive entry.
    requestAnimationFrame(() => document.getElementById("expense-note")?.focus());

    // Proactive nudge: instant deterministic check, then enrich with one AI line.
    if (isExpense) {
      const n = spendNudge(nextFinance, spendingCap);
      if (n.over) {
        setNudge({
          text: `That puts today at ${amd(n.spentToday)} — over your safe daily of ${amd(n.safeDaily)} by ${amd(n.overBy)}.`,
          ai: "",
        });
        getSpendNudge({
          spentToday: n.spentToday,
          safeDaily: n.safeDaily,
          overBy: n.overBy,
          note: draft.note,
          categoryName: category.name,
          exchange: model.exchange,
        })
          .then((ai) => setNudge((cur) => (cur ? { ...cur, ai } : cur)))
          .catch(() => {});
      }
    }
  };

  const deleteExpense = (id) =>
    updateFinance((previous) => ({
      ...previous,
      expenses: previous.expenses.filter((expense) => expense.id !== id),
    }));

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name || categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      return;
    }
    updateFinance((previous) => ({
      ...previous,
      categories: [
        ...previous.categories,
        {
          id: name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || uid(),
          name,
          type: "variable",
          keywords: [name.toLowerCase()],
        },
      ],
    }));
    setNewCategory("");
  };

  const applySuggestion = () =>
    updateFinance((previous) => ({
      ...previous,
      savings: previous.savings.map((fund) => {
        const match = suggestion.find((item) =>
          item.kind === "goal" && (item.id === fund.id || item.name === fund.name)
        );
        return match ? { ...fund, monthly: match.amount } : fund;
      }),
    }));

  return (
    <div>
      <SectionTitle
        title="Finance Command Center"
        icon={<Wallet />}
        action={
          <div className="currency-toolbar">
            <div className="segmented">
              <button
                className={financeView === "plan" ? "active" : ""}
                onClick={() => setFinanceView("plan")}
                type="button"
              >
                <Wallet size={14} /> Plan
              </button>
              <button
                className={financeView === "analytics" ? "active" : ""}
                onClick={() => setFinanceView("analytics")}
                type="button"
              >
                <BarChart3 size={14} /> Analytics
              </button>
            </div>
            <div className="segmented">
              {MONEY_CURRENCIES.map((currency) => (
                <button
                  key={currency}
                  className={displayCurrency === currency ? "active" : ""}
                  onClick={() => setDisplayCurrency(currency)}
                  type="button"
                >
                  {currency}
                </button>
              ))}
            </div>
            <div className="month-switcher">
              <button type="button" onClick={() => goMonth(-1)} title="Previous month">
                <ChevronLeft size={15} />
              </button>
              <strong>{monthLabel(activeMonth)}</strong>
              <button
                type="button"
                onClick={() => goMonth(1)}
                disabled={activeMonth >= monthKey()}
                title="Next month"
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <Button
              variant="primary"
              onClick={() => setAdviceOpen(true)}
              title="Ask Kai about your finances"
            >
              <Sparkles size={15} /> Ask Kai
            </Button>
            <Button onClick={refreshRate} disabled={rateBusy} title="Refresh USD to AMD rate">
              <RefreshCw size={15} /> {rateBusy ? "Updating" : "Rate"}
            </Button>
            <Button
              variant="outline"
              title="Clear all finance data and start fresh"
              onClick={() => {
                if (window.confirm("Clear ALL finance data? This cannot be undone.")) {
                  setFinance({ income: [], fixed: [], variable: [], savings: [], expenses: [], categories: [] });
                }
              }}
            >
              <RotateCcw size={15} /> Reset
            </Button>
          </div>
        }
      />

      <FinanceAiPanel
        open={adviceOpen}
        onClose={() => setAdviceOpen(false)}
        totals={totals}
        model={model}
        setFinance={setFinance}
        displayCurrency={displayCurrency}
        exchange={exchange}
        spendingCap={spendingCap}
        fc={fc}
      />

      {financeView === "analytics" ? (
        <>
          <FinanceAnalyticsPanel finance={model} />
        </>
      ) : (
        <>
      <Card className="money-brief">
        <div>
          <span className="eyebrow">12 month rule</span>
          <h3>Live on 300,000 AMD. Move the rest before spending starts.</h3>
          <p>
            This month you received {displayMoney(totals.income, displayCurrency, exchange)} of your{" "}
            {displayMoney(totals.incomePlan, displayCurrency, exchange)} planned income. After{" "}
            {displayMoney(totals.spent, displayCurrency, exchange)} spent, your net is{" "}
            <b style={{ color: totals.net >= 0 ? C.green : C.red }}>
              {displayMoney(totals.net, displayCurrency, exchange)}
            </b>
            . Savings plan is {displayMoney(totals.monthlyGoal, displayCurrency, exchange)}/mo — you can
            move about {displayMoney(totals.availableToSave, displayCurrency, exchange)} this month.
          </p>
        </div>
        <div className="cap-meter">
          <div>
            <strong>{displayMoney(loggedThisMonth, displayCurrency, exchange)}</strong>
            <span>of {displayMoney(spendingCap, displayCurrency, exchange)} monthly life cap</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${capPct}%`, background: capPct > 90 ? C.red : C.green }} />
          </div>
          <div className="rate-line">
            <b>1 USD = {amd(exchange.rate)}</b>
            <span>{exchange.source} - {rateAge(exchange.fetchedAt)}</span>
          </div>
          {rateError && <div className="rate-error">{rateError}</div>}
        </div>
      </Card>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <Stat
          label="Income received"
          value={displayMoney(totals.income, displayCurrency, exchange)}
          color={C.green}
          sub={`of ${displayMoney(totals.incomePlan, displayCurrency, exchange)} planned`}
        />
        <Stat
          label="Spent"
          value={displayMoney(totals.spent, displayCurrency, exchange)}
          color={fc.onTrack ? C.text : C.red}
          sub={`${capPct}% of ${displayMoney(spendingCap, displayCurrency, exchange)} cap`}
        />
        <Stat
          label="Net this month"
          value={displayMoney(totals.net, displayCurrency, exchange)}
          color={totals.net >= 0 ? C.green : C.red}
          sub="free to assign"
        />
        <Stat
          label="Saved so far"
          value={displayMoney(totals.saved, displayCurrency, exchange)}
          color={C.blue}
          sub={`across ${model.savings.length} goals`}
        />
      </div>

      {overcommit > 0 && (
        <div className="notice notice-warn">
          Your plan needs {displayMoney(totals.monthlyGoal + spendingCap, displayCurrency, exchange)}{" "}
          (savings + {displayMoney(spendingCap, displayCurrency, exchange)} life cap) but planned income is{" "}
          {displayMoney(totals.incomePlan, displayCurrency, exchange)} — over by{" "}
          <b>{displayMoney(overcommit, displayCurrency, exchange)}</b>. Lower a goal contribution or the cap.
        </div>
      )}

      <div className="finance-scope-tabs" aria-label="Finance plan sections">
        {[
          ["overview", "Overview", "Forecast, AI, recommended split"],
          ["spend", "Spend", "Log expenses and review history"],
          ["setup", "Setup", "Income, fixed costs, variable plan"],
          ["goals", "Goals", "Targets, saved amounts, monthly funding"],
          ["wealth", "Wealth", "Net worth, debts, sinking funds"],
        ].map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            className={planMode === id ? "active" : ""}
            onClick={() => setPlanMode(id)}
          >
            <strong>{label}</strong>
            <span>{hint}</span>
          </button>
        ))}
      </div>

      {planMode === "overview" && (
        <>
          {topInsight && (
            <div className={`insight-card sev-${topInsight.severity}`} role="status">
              <div className="insight-body">
                <strong>{topInsight.title}</strong>
                <p>{topInsight.body}</p>
              </div>
              <button
                className="insight-dismiss"
                onClick={() => setDismissed((d) => ({ ...d, [topInsight.id]: true }))}
                title="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <SplitCoachCard
            income={salary}
            totals={totals}
            model={model}
            suggestion={suggestion}
            applySuggestion={applySuggestion}
            displayCurrency={displayCurrency}
            exchange={exchange}
            setFinance={setFinance}
            fc={fc}
          />
          <div className="finance-lower-grid">
            <SpendingForecastCard
              spentSoFar={totals.spent}
              spendingCap={spendingCap}
              exchange={exchange}
              displayCurrency={displayCurrency}
              model={model}
              setFinance={setFinance}
              fc={fc}
            />
            <NeedsWantsCard totals={totals} model={model} displayCurrency={displayCurrency} exchange={exchange} />
          </div>
        </>
      )}

      {planMode === "spend" && (
        <Card className="expense-capture">
          <div className="card-head">
            <div>
              <h3>
                <ReceiptText size={18} /> {draft.kind === "in" ? "Log Money In" : "Log Expense"}
              </h3>
              <span>
                {draft.kind === "in"
                  ? "Reimbursement / refund — reduces Spent in the chosen category."
                  : "Choose AMD or USD per expense; the live rate is saved with the row."}
              </span>
            </div>
            <div className="expense-head-actions">
              <div className="segmented expense-kind">
                <button
                  type="button"
                  className={draft.kind !== "in" ? "active" : ""}
                  onClick={() => setDraft({ ...draft, kind: "expense" })}
                >
                  Expense
                </button>
                <button
                  type="button"
                  className={draft.kind === "in" ? "active" : ""}
                  onClick={() => setDraft({ ...draft, kind: "in" })}
                >
                  Money in
                </button>
              </div>
              <Pill color={detected.id === "other" ? C.muted : C.green}>
                Suggested: {detected.name}
              </Pill>
            </div>
          </div>
          {nudge && (
            <div className="notice notice-warn spend-nudge">
              <span>⚡ {nudge.text}{nudge.ai ? ` ${nudge.ai}` : ""}</span>
              <button className="nudge-dismiss" onClick={() => setNudge(null)} title="Dismiss">✕</button>
            </div>
          )}
          <div className="date-chips" role="group" aria-label="Quick date">
            {[
              ["Today", localDate()],
              ["Yesterday", localDate(addDays(new Date(), -1))],
            ].map(([label, value]) => (
              <button
                key={label}
                type="button"
                className={draft.date === value ? "active" : ""}
                onClick={() => setDraft((d) => ({ ...d, date: value }))}
              >
                {label}
              </button>
            ))}
            {draft.date !== localDate() &&
              draft.date !== localDate(addDays(new Date(), -1)) && (
                <span className="date-chips-note">
                  Logging {draft.date} — stays until you change it
                </span>
              )}
          </div>
          <div className="expense-form" onKeyDown={submitOnEnter(addExpense)}>
            <Input
              value={draft.date}
              onChange={(date) => setDraft({ ...draft, date })}
              type="date"
            />
            <Input
              id="expense-note"
              value={draft.note}
              onChange={(note) =>
                setDraft({
                  ...draft,
                  note,
                  categoryName: detectExpenseCategory(note).name,
                })
              }
              placeholder="Example: taxi to work, Yerevan City groceries"
            />
            <MoneyInput
              value={draft.amount}
              onChange={(amount) => setDraft({ ...draft, amount })}
              currency={draft.currency}
              placeholder={draft.currency}
            />
            <Input
              value={draft.currency}
              onChange={(currency) => setDraft({ ...draft, currency })}
              options={MONEY_CURRENCIES}
            />
            <Input
              value={draft.categoryName}
              onChange={(categoryName) => setDraft({ ...draft, categoryName })}
              options={categoryOptions}
            />
            <Button variant="primary" onClick={addExpense}>
              <Plus size={16} /> Add
            </Button>
          </div>
          <div className="draft-conversion">
            {+draft.amount > 0
              ? `${formatMoney(draft.amount, draft.currency)} = ${amd(toAMD(draft.amount, draft.currency, exchange))}`
              : `USD expenses use ${amd(exchange.rate)} per $1.`}
          </div>
          <div className="category-builder" onKeyDown={submitOnEnter(addCategory)}>
            <Input
              value={newCategory}
              onChange={setNewCategory}
              placeholder="Add custom category name"
            />
            <Button onClick={addCategory}>
              <Plus size={15} /> Category
            </Button>
          </div>
          <ExpenseList
            expenses={model.expenses}
            deleteExpense={deleteExpense}
            displayCurrency={displayCurrency}
            exchange={exchange}
          />
        </Card>
      )}

      {planMode === "setup" && (
        <div className="finance-grid">
          <MoneySection
            title="Income Sources"
            section="income"
            rows={model.income}
            columns={["budget", "actual"]}
            displayCurrency={displayCurrency}
            exchange={exchange}
            setItem={setItem}
            setMoneyItem={setMoneyItem}
            addItem={addItem}
            delItem={delItem}
          />
          <MoneySection
            title="Fixed Baseline"
            section="fixed"
            derivedActual={spentByCategory}
            rows={model.fixed}
            columns={["budget", "actual"]}
            displayCurrency={displayCurrency}
            exchange={exchange}
            setItem={setItem}
            setMoneyItem={setMoneyItem}
            addItem={addItem}
            delItem={delItem}
            onLog={logFromSetup}
          />
          <MoneySection
            title="Monthly Variable Plan"
            section="variable"
            derivedActual={spentByCategory}
            rows={model.variable}
            columns={["budget", "actual"]}
            displayCurrency={displayCurrency}
            exchange={exchange}
            setItem={setItem}
            setMoneyItem={setMoneyItem}
            addItem={addItem}
            delItem={delItem}
            onLog={logFromSetup}
          />
        </div>
      )}

      {planMode === "goals" && (
        <div className="finance-grid finance-goals-grid">
          <MoneySection
            title="Goal Funds"
            section="savings"
            rows={model.savings}
            columns={["target", "targetDate", "saved", "monthly", "suggestedMonthly"]}
            displayCurrency={displayCurrency}
            exchange={exchange}
            setItem={setItem}
            setMoneyItem={setMoneyItem}
            addItem={addItem}
            delItem={delItem}
          />
        </div>
      )}

      {planMode === "wealth" && (
        <WealthPanel
          model={model}
          displayCurrency={displayCurrency}
          exchange={exchange}
          updateFinance={updateFinance}
        />
      )}
        </>
      )}
    </div>
  );
}

// The Overview hero: "Hey Vatche, you received X — here's how to split it."
// Always shows a deterministic plain-English summary + proportion bar; AI is an
// optional refinement layered below, never the only content.
function SplitCoachCard({ income, totals, model, suggestion, applySuggestion, displayCurrency, exchange, setFinance, fc }) {
  const aiText = model.ai?.split || "";
  const aiAt = model.ai?.generatedAt?.split || "";
  const whyText = model.ai?.waterfall || "";
  const whyAt = model.ai?.generatedAt?.waterfall || "";
  const [aiBusy, setAiBusy] = useState(false);
  const [whyBusy, setWhyBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  const summary = splitSummarySentence(suggestion, income);
  const segs = suggestion
    .filter((item) => (+item.amount || 0) > 0)
    .map((item) => ({
      ...item,
      pct: income > 0 ? Math.round((item.amount / income) * 100) : 0,
      color:
        item.kind === "unassigned" ? C.amber
          : /spending/i.test(item.name) ? C.amber
          : /skill|fun/i.test(item.name) ? C.blue
          : C.green,
    }));
  const splitStale = isAiStale(aiAt, model.activeMonth);

  const askAi = async () => {
    setAiBusy(true);
    setAiError("");
    try {
      const text = await refineRecommendedSplit({
        income,
        totals,
        savings: model.savings,
        suggestion,
        exchange,
        spendingCap: suggestion[0]?.amount || 300000,
        projectedTotal: fc?.projectedTotal,
        onTrack: fc?.onTrack,
      });
      persistAi(setFinance, "split", text);
    } catch (error) {
      setAiError(error.message || "AI unavailable — showing the calculated split.");
    } finally {
      setAiBusy(false);
    }
  };

  const askWhy = async () => {
    setWhyBusy(true);
    setAiError("");
    try {
      const text = await explainWaterfall({ suggestion, savings: model.savings, exchange });
      persistAi(setFinance, "waterfall", text);
    } catch (error) {
      setAiError(error.message || "AI unavailable.");
    } finally {
      setWhyBusy(false);
    }
  };

  return (
    <Card className="split-coach">
      <div className="split-coach-top">
        <div>
          <span className="greet">✦ Hey Vatche</span>
          <h3>
            {income > 0
              ? `You received ${displayMoney(income, displayCurrency, exchange)} — here's how to split it`
              : "Log this month's income to see your split"}
          </h3>
        </div>
        {income > 0 && (
          <Pill color={fc?.onTrack ? C.green : C.red}>
            {fc?.onTrack
              ? "On track"
              : `Over pace — projected ${displayMoney(fc?.projectedTotal || 0, displayCurrency, exchange)}`}
          </Pill>
        )}
      </div>

      {income > 0 && (
        <>
          <div className="split-bar">
            {segs.map((seg) => (
              <span
                key={seg.id || seg.name}
                style={{ width: `${seg.pct}%`, background: seg.color }}
                title={`${seg.name} ${seg.pct}%`}
              />
            ))}
          </div>
          <div className="split-coach-body">
            <div className="split-legend">
              {segs.map((seg) => (
                <div className="li" key={seg.id || seg.name}>
                  <span className="dot" style={{ background: seg.color }} />
                  <span className="nm">
                    {seg.name}
                    <small>{seg.reason || seg.note || ""}</small>
                  </span>
                  <b style={{ color: seg.color }}>{displayMoney(seg.amount, displayCurrency, exchange)}</b>
                </div>
              ))}
            </div>
            <div className="split-coach-side">
              <p className="split-plain">{summary}</p>
              <div className="split-actions">
                <Button variant="primary" onClick={applySuggestion}>
                  <ArrowRight size={15} /> Apply this split
                </Button>
                <Button onClick={askWhy} disabled={whyBusy}>
                  {whyBusy ? "..." : "Why this order?"}
                </Button>
                <Button onClick={askAi} disabled={aiBusy}>
                  {aiBusy ? "Thinking..." : <><BrainCircuit size={14} /> {aiText ? "Refresh AI" : "Refine with AI"}</>}
                </Button>
              </div>
              {aiError && <div className="rate-error">{aiError}</div>}
            </div>
          </div>

          {whyText && (
            <div className="split-ai-result why-order">
              {whyAt && <span className="ai-stamp">Why this order · {timeAgo(whyAt)}</span>}
              {whyText.split("\n").filter(Boolean).map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          )}
          {aiText && (
            <div className={`split-ai-result${splitStale ? " stale" : ""}`}>
              <span className="ai-stamp">
                {splitStale ? "May be outdated · " : "Refined · "}{timeAgo(aiAt)}
                {splitStale && <button className="ai-refresh" onClick={askAi}>refresh</button>}
              </span>
              {aiText.split("\n").filter(Boolean).map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const PAGE = 25;

const monthLabel = (m) =>
  parseDate(`${m}-01`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

const dayLabel = (iso) => {
  if (iso === localDate()) return "Today";
  if (iso === localDate(addDays(new Date(), -1))) return "Yesterday";
  const d = parseDate(iso);
  return `${dayName(d)}, ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
};

function ExpenseList({ expenses, deleteExpense, displayCurrency, exchange }) {
  const [limit, setLimit] = useState(PAGE);
  const [month, setMonth] = useState("all");
  const [query, setQuery] = useState("");

  // Months present in the full history, newest first — drives the filter.
  const months = useMemo(() => {
    const set = new Set(
      (expenses || []).map((e) => String(e.date || "").slice(0, 7)).filter(Boolean),
    );
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [expenses]);

  // Apply month + text filters across the FULL history, then sort newest-first.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (expenses || [])
      .filter((e) => (month === "all" ? true : String(e.date || "").startsWith(month)))
      .filter(
        (e) =>
          !q ||
          String(e.note || "").toLowerCase().includes(q) ||
          String(e.categoryName || "").toLowerCase().includes(q),
      )
      .slice()
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [expenses, month, query]);

  // Reset paging whenever the filter changes so you don't land mid-list.
  useEffect(() => setLimit(PAGE), [month, query]);

  const visible = filtered.slice(0, limit);

  // Group the visible rows under date headers, preserving newest-first order.
  const groups = useMemo(() => {
    const map = new Map();
    visible.forEach((e) => {
      const key = e.date || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return [...map.entries()];
  }, [visible]);

  return (
    <div className="expense-list">
      <div className="expense-toolbar">
        <select
          className="field"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="Filter by month"
        >
          <option value="all">All months ({expenses.length})</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <input
          className="field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search note or category…"
          aria-label="Search expenses"
        />
      </div>

      {groups.length === 0 ? (
        <div className="empty-inline">
          {expenses.length === 0
            ? "No expenses logged yet — add your first above."
            : "No expenses match this filter."}
        </div>
      ) : (
        groups.map(([date, rows]) => {
          const subtotal = rows.reduce((t, e) => t + (e.amountAMD || 0), 0);
          return (
            <div className="expense-day" key={date}>
              <div className="expense-day-head">
                <span>{dayLabel(date)}</span>
                <b className={subtotal < 0 ? "pos" : ""}>
                  {displayMoney(subtotal, displayCurrency, exchange)}
                </b>
              </div>
              {rows.map((expense) => (
                <div className="expense-row" key={expense.id}>
                  <strong>{expense.note}</strong>
                  <Pill>{expense.categoryName}</Pill>
                  <b className="expense-amt">
                    {displayMoney(expense.amountAMD, displayCurrency, exchange)}
                    <small>
                      {expense.currency === USD
                        ? `${usd(expense.amount)} original`
                        : `${amd(expense.amountAMD)} base`}
                    </small>
                  </b>
                  <button
                    className="icon-btn danger"
                    onClick={() => deleteExpense(expense.id)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          );
        })
      )}

      {filtered.length > limit && (
        <button className="show-more" onClick={() => setLimit((l) => l + PAGE)}>
          Load more ({filtered.length - limit} older)
        </button>
      )}
    </div>
  );
}

function SpendingForecastCard({ spentSoFar, spendingCap, exchange, displayCurrency, model, setFinance, fc }) {
  // Prefer the shared forecast values so this card and the split-coach hero never
  // disagree; fall back to a local compute if not provided.
  const v = fc || forecastValues({ spentSoFar, spendingCap });
  const daysInMonth = v.daysInMonth;
  const dayOfMonth = v.dayOfMonth;
  const daysRemaining = v.daysRemaining;
  const dailyBurn = v.dailyBurn;
  const targetDailyBurn = spendingCap > 0 ? spendingCap / daysInMonth : 0;
  const projectedTotal = v.projectedTotal;
  const remainingBudget = Math.max(0, spendingCap - spentSoFar);
  const paceDelta = Math.round(dailyBurn - targetDailyBurn);
  const safeToday = v.safeToday;
  const onTrack = v.onTrack;
  const pct = spendingCap > 0 ? Math.min(100, Math.round((spentSoFar / spendingCap) * 100)) : 0;
  const projPct = spendingCap > 0 ? Math.min(100, Math.round((projectedTotal / spendingCap) * 100)) : 0;

  // Per-day logged spend for the current month, used for the cumulative actual line.
  const monthPrefix = localDate().slice(0, 7);
  const chartData = useMemo(() => {
    const perDay = new Array(daysInMonth + 1).fill(0);
    (model.expenses || []).forEach((expense) => {
      if (!(expense.date || "").startsWith(monthPrefix)) return;
      const day = +(expense.date || "").slice(8, 10);
      if (day >= 1 && day <= daysInMonth) perDay[day] += +expense.amountAMD || 0;
    });
    // Cumulative actual up to today; cap actual at logged + manual variable so it
    // ties to the "Spent so far" tile on the latest day.
    let running = 0;
    const rows = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      running += perDay[day];
      const idealCumulative = Math.round((spendingCap / daysInMonth) * day);
      const row = { day, ideal: idealCumulative };
      if (day < dayOfMonth) {
        row.actual = Math.round(running);
      } else if (day === dayOfMonth) {
        // Anchor today's actual to the headline "spent so far" figure.
        row.actual = Math.round(spentSoFar);
        row.projected = Math.round(spentSoFar);
      } else {
        row.projected = Math.round(dailyBurn * day);
      }
      rows.push(row);
    }
    return rows;
  }, [model.expenses, monthPrefix, daysInMonth, dayOfMonth, spendingCap, spentSoFar, dailyBurn]);

  const yMax = Math.max(spendingCap, projectedTotal, spentSoFar, 1);
  const projectedColor = onTrack ? C.blue : C.red;

  const forecast = model.ai?.forecast || "";
  const forecastAt = model.ai?.generatedAt?.forecast || "";
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    setBusy(true);
    try {
      const text = await getSpendingForecast({
        spentSoFar, spendingCap, dayOfMonth, daysInMonth, daysRemaining,
        safeToday, projectedTotal, onTrack, exchange,
      });
      persistAi(setFinance, "forecast", text.replace(/^<\|.*?\|>\s*/g, "").trim());
    } catch (e) {
      persistAi(setFinance, "forecast", "Could not load forecast - the AI service is unavailable right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="forecast-card">
      <div className="card-head">
        <div>
          <h3><CalendarDays size={18} /> Spending Forecast</h3>
          <span>Day {dayOfMonth} of {daysInMonth} - {daysRemaining} days remaining this month</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Pill color={onTrack ? C.green : C.red}>{onTrack ? "On track" : "Over pace"}</Pill>
          <Button onClick={ask} disabled={busy}>
            {busy ? "..." : <><BrainCircuit size={14} /> {forecast ? "Refresh" : "AI Summary"}</>}
          </Button>
        </div>
      </div>

      <p className="chart-takeaway">{chartTakeaway("forecast", { projectedTotal, spendingCap, onTrack })}</p>

      <div className="forecast-grid">
        <div className="forecast-stat">
          <span>Spent so far</span>
          <strong style={{ color: C.text }}>{displayMoney(spentSoFar, displayCurrency, exchange)}</strong>
          <small>{pct}% of cap</small>
        </div>
        <div className="forecast-stat">
          <span>Projected total</span>
          <strong style={{ color: onTrack ? C.green : C.red }}>{displayMoney(projectedTotal, displayCurrency, exchange)}</strong>
          <small>{projPct}% of cap</small>
        </div>
        <div className="forecast-stat">
          <span>Safe to spend / day</span>
          <strong style={{ color: C.blue }}>{displayMoney(safeToday, displayCurrency, exchange)}</strong>
          <small>for {daysRemaining} days</small>
        </div>
        <div className="forecast-stat">
          <span>Monthly cap</span>
          <strong style={{ color: C.muted }}>{displayMoney(spendingCap, displayCurrency, exchange)}</strong>
          <small>variable only</small>
        </div>
      </div>

      <div className="forecast-body">
        <div className="forecast-chart" aria-label="Monthly spending forecast chart">
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="forecastActualFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.green} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={C.green} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="forecastProjectedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={projectedColor} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={projectedColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.border} strokeDasharray="3 4" vertical={false} />
              <XAxis
                dataKey="day"
                type="number"
                domain={[1, daysInMonth]}
                ticks={[1, Math.ceil(daysInMonth / 2), daysInMonth]}
                tick={{ fill: C.muted, fontSize: 10, fontWeight: 700 }}
                axisLine={{ stroke: C.border }}
                tickLine={false}
              />
              <YAxis
                domain={[0, yMax]}
                width={44}
                tick={{ fill: C.muted, fontSize: 10, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${Math.round(value / 1000)}k`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="chart-tip">
                      <b>Day {label}</b>
                      {payload
                        .filter((item) => item.value != null)
                        .map((item) => (
                          <div key={item.name} style={{ color: item.color }}>
                            {item.name}: {amd(item.value)}
                          </div>
                        ))}
                    </div>
                  );
                }}
              />
              {/* Shade the over-cap zone red so "overspending" reads without doing math. */}
              {yMax > spendingCap && (
                <ReferenceArea y1={spendingCap} y2={yMax} fill={C.red} fillOpacity={0.07} />
              )}
              {/* Labeled spending cap line. */}
              <ReferenceLine y={spendingCap} stroke={C.amber} strokeDasharray="4 4" strokeOpacity={0.7}>
                <Label value="cap" position="insideTopRight" fill={C.amber} fontSize={10} fontWeight={700} />
              </ReferenceLine>
              <ReferenceLine x={dayOfMonth} stroke={C.textDim} strokeDasharray="2 3" />
              <Line
                name="Ideal pace"
                dataKey="ideal"
                stroke={C.muted}
                strokeWidth={1.6}
                strokeDasharray="5 5"
                dot={false}
                isAnimationActive
                animationDuration={650}
              />
              <Area
                name="Projected"
                dataKey="projected"
                stroke={projectedColor}
                strokeWidth={2.4}
                strokeDasharray="5 4"
                fill="url(#forecastProjectedFill)"
                connectNulls
                dot={false}
                isAnimationActive
                animationDuration={750}
              />
              <Area
                name="Actual"
                dataKey="actual"
                stroke={C.green}
                strokeWidth={3}
                fill="url(#forecastActualFill)"
                dot={false}
                isAnimationActive
                animationDuration={750}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="forecast-legend">
            <span><i className="actual" /> Actual</span>
            <span><i className={onTrack ? "projected" : "projected danger"} /> Projected</span>
            <span><i className="target" /> Ideal pace</span>
          </div>
        </div>
        <div className="forecast-insights">
          <div>
            <span>Remaining budget</span>
            <b>{displayMoney(remainingBudget, displayCurrency, exchange)}</b>
          </div>
          <div>
            <span>Pace delta / day</span>
            <b style={{ color: paceDelta <= 0 ? C.green : C.red }}>
              {paceDelta <= 0 ? "-" : "+"}{displayMoney(Math.abs(paceDelta), displayCurrency, exchange)}
            </b>
          </div>
        </div>
      </div>

      {forecast && (
        <div className={`forecast-ai${isAiStale(forecastAt, model.activeMonth) ? " stale" : ""}`}>
          <span className="ai-stamp">
            {isAiStale(forecastAt, model.activeMonth) ? "May be outdated · " : "Generated · "}
            {timeAgo(forecastAt)}
            {isAiStale(forecastAt, model.activeMonth) && (
              <button className="ai-refresh" onClick={ask}>refresh</button>
            )}
          </span>
          <p>{forecast}</p>
        </div>
      )}
    </Card>
  );
}

// Docked right-side finance assistant. Free-form questions are answered from the
// live finance snapshot via askFinanceAnalyticsQuestion; "Full review" runs the
// heavier getFinancialAdvice pass and persists it so it survives reloads.
function FinanceAiPanel({ open, onClose, totals, model, setFinance, displayCurrency, exchange, spendingCap, fc }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const series = useMemo(() => monthlySeries(model, 6), [model]);

  // Data-driven starter prompts so the empty state isn't a blank box.
  const topCategory = useMemo(() => {
    const map = {};
    currentMonthExpenses(model).forEach((e) => {
      if ((e.amountAMD || 0) <= 0) return; // skip reimbursements
      map[e.categoryName || "Other"] = (map[e.categoryName || "Other"] || 0) + (e.amountAMD || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [model]);

  const suggestions = [
    "Am I on track to stay under my cap this month?",
    "What did I overspend on?",
    topCategory && `Why is ${topCategory} so high this month?`,
    "How much can I realistically save this month?",
  ].filter(Boolean);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  const send = async (question) => {
    const q = (question ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const answer = await askFinanceAnalyticsQuestion(q, {
        finance: model, totals, exchange, series,
        spendingCap, projectedTotal: fc?.projectedTotal, onTrack: fc?.onTrack,
      });
      setMessages((m) => [...m, { role: "ai", text: answer }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "ai", text: `Couldn't answer that right now (${e.message}).`, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const fullReview = async () => {
    if (busy) return;
    setMessages((m) => [...m, { role: "user", text: "Give me a full financial review." }]);
    setBusy(true);
    try {
      const text = await getFinancialAdvice({
        totals,
        savings: model.savings,
        goals: [],
        exchange: model.exchange,
        expenses: model.expenses,
        series,
      });
      persistAi(setFinance, "advice", text);
      setMessages((m) => [...m, { role: "ai", text }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "ai", text: `Couldn't run the review (${e.message}).`, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="ai-panel-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.aside
            className="ai-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            role="dialog"
            aria-label="Kai finance assistant"
          >
            <header className="ai-panel-head">
              <div>
                <h3><Sparkles size={16} /> Kai</h3>
                <span>Answers from your live finance data</span>
              </div>
              <button className="icon-btn" onClick={onClose} title="Close"><X size={18} /></button>
            </header>

            <div className="ai-panel-body" ref={scrollRef}>
              {messages.length === 0 && (
                <div className="ai-panel-intro">
                  <p>Ask me anything about your money this month — spending, pace, savings, or budget vs. actual.</p>
                  <div className="ai-chips">
                    {suggestions.map((s) => (
                      <button key={s} onClick={() => send(s)}>{s}</button>
                    ))}
                  </div>
                  <Button variant="outline" onClick={fullReview} style={{ marginTop: 12 }}>
                    <BrainCircuit size={14} /> Full financial review
                  </Button>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`ai-msg ${m.role}${m.error ? " error" : ""}`}>
                  {m.text.split("\n").filter(Boolean).map((line, j) => (
                    <p key={j}>{line.replace(/^[-*]\s*/, "• ")}</p>
                  ))}
                </div>
              ))}
              {busy && (
                <div className="ai-msg ai typing"><span /><span /><span /></div>
              )}
            </div>

            {messages.length > 0 && (
              <div className="ai-panel-quick">
                {suggestions.slice(0, 2).map((s) => (
                  <button key={s} onClick={() => send(s)} disabled={busy}>{s}</button>
                ))}
              </div>
            )}

            <form
              className="ai-panel-input"
              onSubmit={(e) => { e.preventDefault(); send(); }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your spending…"
                aria-label="Ask Kai"
              />
              <button type="submit" disabled={busy || !input.trim()} title="Send">
                <Send size={16} />
              </button>
            </form>
            <p className="ai-panel-foot">Kai uses only your tracked data. Not professional financial advice.</p>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}


function GoalFundRow({ row, fund, displayCurrency, exchange, setItem, setMoneyItem, delItem }) {
  return (
    <div className="goal-fund-item">
      <div className="goal-fund-head">
        <div className="goal-fund-title">
          <Input
            value={row.name}
            onChange={(name) => setItem("savings", row.id, { name })}
            placeholder="Goal name"
            style={{ fontWeight: 600 }}
          />
          <span className="goal-fund-meta">
            {displayMoney(row.saved || 0, displayCurrency, exchange)} of {displayMoney(row.target || 0, displayCurrency, exchange)}
            {" - "}{fund.progress}%
            {fund.months > 0 ? ` - ${fund.months}mo to go` : ""}
          </span>
        </div>
        <button className="icon-btn danger" onClick={() => delItem("savings", row.id)}>
          <Trash2 size={14} />
        </button>
      </div>
      <div className="goal-fund-bar">
        <div className="goal-fund-fill" style={{ width: `${fund.progress}%` }} />
      </div>
      <div className="goal-fund-fields">
        <div className="goal-fund-field">
          <label>Target</label>
          <MoneyInput
            value={inputValue(row.target ?? 0, displayCurrency, exchange)}
            onChange={(v) => setMoneyItem("savings", row.id, "target", v)}
            currency={displayCurrency}
            style={{ textAlign: "right" }}
          />
        </div>
        <div className="goal-fund-field">
          <label>Saved</label>
          <MoneyInput
            value={inputValue(row.saved ?? 0, displayCurrency, exchange)}
            onChange={(v) => setMoneyItem("savings", row.id, "saved", v)}
            currency={displayCurrency}
            style={{ textAlign: "right" }}
          />
        </div>
        <div className="goal-fund-field">
          <label>Monthly</label>
          <MoneyInput
            value={inputValue(row.monthly ?? 0, displayCurrency, exchange)}
            onChange={(v) => setMoneyItem("savings", row.id, "monthly", v)}
            currency={displayCurrency}
            style={{ textAlign: "right" }}
          />
        </div>
        <div className="goal-fund-field">
          <label>Goal Date</label>
          <Input
            value={row.targetDate || ""}
            onChange={(targetDate) => setItem("savings", row.id, { targetDate })}
            type="date"
          />
        </div>
        <div className="goal-fund-field goal-fund-suggested">
          <label>Suggested</label>
          <Button
            title="Apply suggested monthly amount"
            onClick={() => setItem("savings", row.id, { monthly: fund.suggestedMonthly })}
          >
            {displayMoney(fund.suggestedMonthly, displayCurrency, exchange)} →
          </Button>
        </div>
      </div>
    </div>
  );
}

function MoneySection({
  title,
  section,
  rows,
  columns,
  displayCurrency,
  exchange,
  setItem,
  setMoneyItem,
  addItem,
  delItem,
  derivedActual,
  onLog,
}) {
  const accent = ACCENT[section];
  const template = [
    "minmax(0,1.2fr)",
    ...columns.map(() => "minmax(72px,1fr)"),
    ...(onLog ? ["34px"] : []),
    "32px",
  ].join(" ");

  if (section === "savings") {
    return (
      <Card className="money-section" style={{ borderTopColor: accent }}>
        <div className="card-head">
          <h3 style={{ color: accent }}><Landmark size={18} />{title}</h3>
          <Button variant="primary" onClick={() => addItem(section)}>
            <Plus size={14} /> Add
          </Button>
        </div>
        <div className="stack">
          {rows.map((row) => (
            <GoalFundRow
              key={row.id}
              row={row}
              fund={fundSuggestion(row)}
              displayCurrency={displayCurrency}
              exchange={exchange}
              setItem={setItem}
              setMoneyItem={setMoneyItem}
              delItem={delItem}
            />
          ))}
          {!rows.length && <div className="empty-inline">No goal funds yet - click Add.</div>}
        </div>
      </Card>
    );
  }

  return (
    <Card className="money-section" style={{ borderTopColor: accent }}>
      <div className="card-head">
        <h3 style={{ color: accent }}>{title}</h3>
        <Button variant="primary" onClick={() => addItem(section)}>
          <Plus size={14} /> Add
        </Button>
      </div>
      <div className="fin-header" style={{ gridTemplateColumns: template }}>
        <span>Name</span>
        {columns.map((column) => (
          <span key={column}>{COL_LABEL[column]}</span>
        ))}
        {onLog && <span />}
        <span />
      </div>
      <div className="stack">
        {rows.map((row) => {
          return (
            <div className="fin-row" style={{ gridTemplateColumns: template }} key={row.id}>
              <Input
                value={row.name}
                onChange={(name) => setItem(section, row.id, { name })}
                placeholder="Name"
              />
              {columns.map((column) => {
                let cell;
                if (column === "targetDate") {
                  cell = (
                    <Input
                      value={row.targetDate || ""}
                      onChange={(targetDate) => setItem(section, row.id, { targetDate })}
                      type="date"
                    />
                  );
                } else if (column === "suggestedMonthly") {
                  cell = (
                    <Button
                      title="Use suggested monthly amount"
                      onClick={() =>
                        setItem(section, row.id, { monthly: fund.suggestedMonthly })
                      }
                    >
                      {displayMoney(fund.suggestedMonthly, displayCurrency, exchange)}
                    </Button>
                  );
                } else if (column === "actual" && derivedActual) {
                  const derived = derivedActual[String(row.name || "").toLowerCase()] || 0;
                  cell = (
                    <div
                      className="fin-actual-derived"
                      title="Auto-filled from logged expenses this month"
                    >
                      {displayMoney(derived, displayCurrency, exchange)}
                    </div>
                  );
                } else {
                  cell = (
                    <MoneyInput
                      value={inputValue(row[column] ?? 0, displayCurrency, exchange)}
                      onChange={(value) => setMoneyItem(section, row.id, column, value)}
                      currency={displayCurrency}
                      style={{ textAlign: "right" }}
                    />
                  );
                }
                return (
                  <div className="fin-cell" key={column}>
                    <span className="fin-cell-label">{COL_LABEL[column]}</span>
                    {cell}
                  </div>
                );
              })}
              {onLog && (
                <button
                  className="icon-btn log-btn"
                  title={`Log ${displayMoney(row.budget || 0, displayCurrency, exchange)} as an expense this month`}
                  onClick={() => onLog(row)}
                >
                  <ReceiptText size={14} />
                </button>
              )}
              <button className="icon-btn danger" onClick={() => delItem(section, row.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        {!rows.length && <div className="empty-inline">No items yet - click Add.</div>}
      </div>
    </Card>
  );
}

// Overview: needs vs wants split, savings rate, and emergency-fund runway.
function NeedsWantsCard({ totals, model, displayCurrency, exchange }) {
  const essential = totals.essentialSpent;
  const discretionary = wantsForDisplay(totals.discretionarySpent);
  const refundNote = totals.discretionarySpent < 0;
  const total = essential + discretionary;
  const essentialPct = total > 0 ? Math.round((essential / total) * 100) : 0;
  const emergency =
    model.savings.find((f) => f.name.toLowerCase().includes("emergency")) || null;
  const monthlyNeed = Math.max(1, totals.essentialSpent || totals.fixed || 1);
  const runwayMonths = emergency ? (+emergency.saved || 0) / monthlyNeed : 0;

  return (
    <Card className="needs-wants-card">
      <div className="card-head">
        <h3><Scale size={18} /> Needs vs Wants</h3>
        <Pill color={totals.savingsRate >= 30 ? C.green : totals.savingsRate >= 10 ? C.amber : C.red}>
          {totals.savingsRate}% savings rate
        </Pill>
      </div>
      <div className="needs-wants-bar">
        <span className="needs" style={{ width: `${essentialPct}%` }} />
        <span className="wants" style={{ width: `${100 - essentialPct}%` }} />
      </div>
      <div className="needs-wants-legend">
        <div><i className="needs" /> Needs <b>{displayMoney(essential, displayCurrency, exchange)}</b></div>
        <div><i className="wants" /> Wants <b>{displayMoney(discretionary, displayCurrency, exchange)}</b>{refundNote && <small className="muted-note"> (net of refunds)</small>}</div>
      </div>
      <div className="needs-wants-foot">
        <div>
          <span>Available to save</span>
          <b style={{ color: totals.availableToSave > 0 ? C.green : C.red }}>
            {displayMoney(totals.availableToSave, displayCurrency, exchange)}
          </b>
        </div>
        <div>
          <span>Emergency runway</span>
          <b>{runwayMonths.toFixed(1)} mo</b>
        </div>
      </div>
    </Card>
  );
}

// Phase 4: net worth, debts, sinking funds, FX holdings.
function WealthPanel({ model, displayCurrency, exchange, updateFinance }) {
  const nw = netWorthSummary(model);
  const rate = exchange.rate;

  const addDebt = () =>
    updateFinance((p) => ({ ...p, debts: [...p.debts, { id: uid(), name: "", balance: 0, rate: 0, minPayment: 0 }] }));
  const setDebt = (id, patch) =>
    updateFinance((p) => ({ ...p, debts: p.debts.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  const delDebt = (id) =>
    updateFinance((p) => ({ ...p, debts: p.debts.filter((d) => d.id !== id) }));

  const addSink = () =>
    updateFinance((p) => ({ ...p, sinkingFunds: [...p.sinkingFunds, { id: uid(), name: "", annualAmount: 0, saved: 0 }] }));
  const setSink = (id, patch) =>
    updateFinance((p) => ({ ...p, sinkingFunds: p.sinkingFunds.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const delSink = (id) =>
    updateFinance((p) => ({ ...p, sinkingFunds: p.sinkingFunds.filter((s) => s.id !== id) }));

  const setHolding = (key, value) =>
    updateFinance((p) => ({ ...p, holdings: { ...p.holdings, [key]: Math.max(0, Math.round(+value || 0)) } }));

  const usdExposurePct = nw.heldCash > 0 ? Math.round(((model.holdings.usd * rate) / nw.heldCash) * 100) : 0;
  const sortedDebts = [...model.debts].sort((a, b) => (b.rate || 0) - (a.rate || 0));

  return (
    <div className="wealth-panel">
      <div className="stats-grid">
        <Stat label="Net worth" value={displayMoney(nw.net, displayCurrency, exchange)} color={nw.net >= 0 ? C.green : C.red} />
        <Stat label="Assets" value={displayMoney(nw.assets, displayCurrency, exchange)} color={C.blue} />
        <Stat label="Debt" value={displayMoney(nw.debt, displayCurrency, exchange)} color={nw.debt > 0 ? C.red : C.muted} />
        <Stat label="Saved in funds" value={displayMoney(nw.fundsSaved, displayCurrency, exchange)} color={C.purple} />
      </div>

      <div className="finance-grid">
        <Card className="money-section" style={{ borderTopColor: C.red }}>
          <div className="card-head">
            <h3 style={{ color: C.red }}><CreditCard size={18} /> Debts</h3>
            <Button variant="primary" onClick={addDebt}><Plus size={14} /> Add</Button>
          </div>
          <div className="stack">
            {sortedDebts.map((d) => (
              <div className="wealth-row" key={d.id}>
                <Input value={d.name} onChange={(name) => setDebt(d.id, { name })} placeholder="Loan / card" />
                <MoneyInput value={inputValue(d.balance, displayCurrency, exchange)} onChange={(v) => setDebt(d.id, { balance: toAMD(v, displayCurrency, exchange) })} currency={displayCurrency} style={{ textAlign: "right" }} />
                <div className="wealth-rate">
                  <Input value={String(d.rate || "")} onChange={(v) => setDebt(d.id, { rate: +String(v).replace(/[^\d.]/g, "") || 0 })} placeholder="%" />
                  {d.rate >= 15 && <Pill color={C.red}>high</Pill>}
                </div>
                <button className="icon-btn danger" onClick={() => delDebt(d.id)}><Trash2 size={14} /></button>
              </div>
            ))}
            {!model.debts.length && <div className="empty-inline">No debt — leave empty. High-interest debt would be paid before investing.</div>}
          </div>
        </Card>

        <Card className="money-section" style={{ borderTopColor: C.amber }}>
          <div className="card-head">
            <h3 style={{ color: C.amber }}><PiggyBank size={18} /> Sinking Funds</h3>
            <Button variant="primary" onClick={addSink}><Plus size={14} /> Add</Button>
          </div>
          <div className="stack">
            {model.sinkingFunds.map((s) => (
              <div className="wealth-row" key={s.id}>
                <Input value={s.name} onChange={(name) => setSink(s.id, { name })} placeholder="e.g. Visa & docs" />
                <MoneyInput value={inputValue(s.annualAmount, displayCurrency, exchange)} onChange={(v) => setSink(s.id, { annualAmount: toAMD(v, displayCurrency, exchange) })} currency={displayCurrency} style={{ textAlign: "right" }} />
                <span className="wealth-permonth" title="Set aside per month (annual ÷ 12)">
                  {displayMoney((+s.annualAmount || 0) / 12, displayCurrency, exchange)}/mo
                </span>
                <button className="icon-btn danger" onClick={() => delSink(s.id)}><Trash2 size={14} /></button>
              </div>
            ))}
            {!model.sinkingFunds.length && <div className="empty-inline">Add irregular yearly costs (visa, gifts, laptop) to smooth them across 12 months.</div>}
          </div>
        </Card>

        <Card className="money-section" style={{ borderTopColor: C.blue }}>
          <div className="card-head">
            <h3 style={{ color: C.blue }}><Coins size={18} /> Cash Holdings (FX)</h3>
          </div>
          <div className="holdings-grid">
            <div className="goal-fund-field">
              <label>AMD held</label>
              <MoneyInput value={model.holdings.amd} onChange={(v) => setHolding("amd", v)} currency={AMD} style={{ textAlign: "right" }} />
            </div>
            <div className="goal-fund-field">
              <label>USD held</label>
              <MoneyInput value={model.holdings.usd} onChange={(v) => setHolding("usd", v)} currency={USD} style={{ textAlign: "right" }} />
            </div>
          </div>
          <div className="finance-readout">
            <span>Total cash</span><b>{displayMoney(nw.heldCash, displayCurrency, exchange)}</b>
            <span>USD exposure</span><b>{usdExposurePct}%</b>
            <span>Rate</span><b>{amd(rate)}/$</b>
          </div>
        </Card>
      </div>
    </div>
  );
}
