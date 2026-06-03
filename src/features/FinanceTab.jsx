import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Landmark,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Target,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button, Card, Input, Pill, SectionTitle, Stat } from "../components/ui";
import { Modal } from "../components/Modal";
import { FinanceAnalyticsPanel } from "./AnalyticsTab";
import { GROQ_MODEL, getFinancialAdvice, getSpendingForecast, refineRecommendedSplit } from "../core/groq";
import { C } from "../core/constants";
import { localDate, submitOnEnter, sum, uid } from "../core/date";
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
  expenseAmountAMD,
  fetchUsdAmdRate,
  financeTotals,
  formatMoney,
  fromAMD,
  fundSuggestion,
  normalizeFinance,
  toAMD,
  usd,
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

// Persist an AI result + timestamp into finance.ai so it survives reloads.
const persistAi = (setFinance, field, text) =>
  setFinance((previous) => {
    const normalized = normalizeFinance(previous);
    return {
      ...normalized,
      ai: {
        ...normalized.ai,
        [field]: text,
        generatedAt: { ...normalized.ai.generatedAt, [field]: new Date().toISOString() },
      },
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
  const detected = detectExpenseCategory(draft.note);
  const categoryOptions = categories.map((category) => category.name);
  const salary = sum(model.income, "actual");
  const suggestion = allocationSuggestion(salary, model.savings);
  const spendingCap = suggestion[0]?.amount || 300000;
  const loggedThisMonth = totals.spent;
  const capPct = Math.min(100, Math.round((loggedThisMonth / spendingCap) * 100));

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

  const setItem = (section, id, patch) =>
    updateFinance((previous) => ({
      ...previous,
      [section]: previous[section].map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }));

  const setMoneyItem = (section, id, key, value) =>
    setItem(section, id, {
      [key]: toAMD(value, displayCurrency, exchange),
    });

  const addItem = (section) =>
    updateFinance((previous) => ({
      ...previous,
      [section]: [
        ...previous[section],
        {
          id: uid(),
          name: "",
          budget: 0,
          actual: 0,
          target: 0,
          saved: 0,
          monthly: 0,
          targetDate: "",
        },
      ],
    }));

  const delItem = (section, id) =>
    updateFinance((previous) => ({
      ...previous,
      [section]: previous[section].filter((row) => row.id !== id),
    }));

  const addExpense = () => {
    if (!draft.note.trim() || !(+draft.amount > 0)) return;
    const category =
      categories.find((item) => item.name === draft.categoryName) || detected;
    // "Money in" (reimbursement / refund) is stored as a negative amount so it
    // reduces Spent and the category's actual.
    const magnitude = +draft.amount || 0;
    const signedAmount = draft.kind === "in" ? -magnitude : magnitude;
    updateFinance((previous) => ({
      ...previous,
      expenses: [
        createExpense(
          {
            ...draft,
            amount: signedAmount,
            categoryId: category.id,
            categoryName: category.name,
          },
          previous.exchange,
        ),
        ...previous.expenses,
      ],
    }));
    setDraft({
      date: localDate(),
      note: "",
      amount: "",
      currency: draft.currency,
      categoryName: "Other",
      source: "Spending card",
      kind: "expense",
    });
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
            <Button
              variant="primary"
              onClick={() => setAdviceOpen(true)}
              title="Get AI financial advice"
            >
              <BrainCircuit size={15} /> AI Advice
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

      <AiAdviceModal
        open={adviceOpen}
        onClose={() => setAdviceOpen(false)}
        totals={totals}
        model={model}
        setFinance={setFinance}
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

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <Stat label="Income (this month)" value={displayMoney(totals.income, displayCurrency, exchange)} color={C.green} />
        <Stat label="Spent" value={displayMoney(totals.spent, displayCurrency, exchange)} color={C.red} />
        <Stat
          label="Net this month"
          value={displayMoney(totals.net, displayCurrency, exchange)}
          color={totals.net >= 0 ? C.green : C.red}
        />
        <Stat label="Savings plan / mo" value={displayMoney(totals.monthlyGoal, displayCurrency, exchange)} color={C.blue} />
      </div>

      <div className="finance-scope-tabs" aria-label="Finance plan sections">
        {[
          ["overview", "Overview", "Forecast, AI, recommended split"],
          ["spend", "Spend", "Log expenses and review history"],
          ["setup", "Setup", "Income, fixed costs, variable plan"],
          ["goals", "Goals", "Targets, saved amounts, monthly funding"],
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
          <div className="finance-overview-grid">
            <SpendingForecastCard
              spentSoFar={totals.spent}
              spendingCap={spendingCap}
              exchange={exchange}
              displayCurrency={displayCurrency}
              model={model}
              setFinance={setFinance}
            />
            <RecommendedSplitCard
              income={salary}
              totals={totals}
              model={model}
              suggestion={suggestion}
              applySuggestion={applySuggestion}
              displayCurrency={displayCurrency}
              exchange={exchange}
              setFinance={setFinance}
            />
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
          <div className="expense-form" onKeyDown={submitOnEnter(addExpense)}>
            <Input
              value={draft.date}
              onChange={(date) => setDraft({ ...draft, date })}
              type="date"
            />
            <Input
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
        </>
      )}
    </div>
  );
}

function RecommendedSplitCard({ income, totals, model, suggestion, applySuggestion, displayCurrency, exchange, setFinance }) {
  const aiText = model.ai?.split || "";
  const aiAt = model.ai?.generatedAt?.split || "";
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const goalRows = suggestion.filter((item) => item.kind === "goal");
  const reserveRows = suggestion.filter((item) => item.kind === "reserve");
  const unassignedRows = suggestion.filter((item) => item.kind === "unassigned");
  const goalTotal = goalRows.reduce((total, item) => total + (+item.amount || 0), 0);
  const reserveTotal = reserveRows.reduce((total, item) => total + (+item.amount || 0), 0);
  const unassignedTotal = unassignedRows.reduce((total, item) => total + (+item.amount || 0), 0);
  const incomePct = income > 0 ? Math.round((goalTotal / income) * 100) : 0;

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
      });
      persistAi(setFinance, "split", text);
    } catch (error) {
      setAiError(error.message);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <Card className="allocation-card recommended-split-card">
      <div className="card-head split-card-head">
        <div>
          <h3>
            <Target size={18} /> Recommended split
          </h3>
          <span>Auto-calculated from income, goal gaps, and the 300,000 AMD life cap.</span>
        </div>
        <div className="split-actions">
          <Button onClick={askAi} disabled={aiBusy}>
            {aiBusy ? "Thinking..." : <><BrainCircuit size={14} /> {aiText ? "Refresh" : "Ask AI"}</>}
          </Button>
          <Button variant="primary" onClick={applySuggestion}>
            <ArrowRight size={15} /> Apply
          </Button>
        </div>
      </div>

      <div className="split-summary">
        <div>
          <span>Income</span>
          <b>{displayMoney(income, displayCurrency, exchange)}</b>
          <small>Your monthly actual income.</small>
        </div>
        <div>
          <span>Reserved</span>
          <b>{displayMoney(reserveTotal, displayCurrency, exchange)}</b>
          <small>Spending card plus skills/fun.</small>
        </div>
        <div>
          <span>To goals</span>
          <b>{displayMoney(goalTotal, displayCurrency, exchange)}</b>
          <small>Amount Apply will write to goals.</small>
        </div>
        <div>
          <span>Unassigned</span>
          <b style={{ color: unassignedTotal > 0 ? C.amber : C.green }}>
            {displayMoney(unassignedTotal, displayCurrency, exchange)}
          </b>
          <small>Money still without a job.</small>
        </div>
      </div>
      <div className="split-rate-line">
        <span>Goal rate after reserves</span>
        <b>{incomePct}% of income</b>
      </div>

      <div className="recommended-goals">
        {goalRows.map((item) => {
          const pct = income > 0 ? Math.min(100, Math.round((item.amount / income) * 100)) : 0;
          return (
            <div className="recommended-goal" key={item.id || item.name}>
              <div className="recommended-goal-top">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.reason}</span>
                </div>
                <b>{displayMoney(item.amount, displayCurrency, exchange)}</b>
              </div>
              <div className="recommended-progress">
                <i style={{ width: `${pct}%` }} />
              </div>
              <div className="recommended-meta">
                <span>{pct}% of income</span>
                <span>{item.progress}% funded</span>
                <span>Gap {displayMoney(item.remaining, displayCurrency, exchange)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="reserve-strip">
        {[...reserveRows, ...unassignedRows].map((item) => (
          <div key={item.name}>
            <span>{item.name}</span>
            <b>{displayMoney(item.amount, displayCurrency, exchange)}</b>
            <small>{item.reason}</small>
          </div>
        ))}
      </div>

      {aiError && <div className="rate-error">{aiError}</div>}
      {aiText && (
        <div className="split-ai-result">
          {aiAt && <span className="ai-stamp">Generated {timeAgo(aiAt)}</span>}
          {aiText.split("\n").filter(Boolean).map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      )}
    </Card>
  );
}

function ExpenseList({ expenses, deleteExpense, displayCurrency, exchange }) {
  const [limit, setLimit] = useState(10);
  const visible = expenses.slice(0, limit);
  return (
    <div className="expense-list">
      <div className="fin-header expense-header">
        <span>Date</span>
        <span>Expense</span>
        <span>Category</span>
        <span>Amount</span>
        <span />
      </div>
      {visible.map((expense) => (
        <div className="expense-row" key={expense.id}>
          <span>{expense.date}</span>
          <strong>{expense.note}</strong>
          <Pill>{expense.categoryName}</Pill>
          <b>
            {displayMoney(expense.amountAMD, displayCurrency, exchange)}
            <small>
              {expense.currency === USD
                ? `${usd(expense.amount)} original`
                : `${amd(expense.amountAMD)} base`}
            </small>
          </b>
          <button className="icon-btn danger" onClick={() => deleteExpense(expense.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {!visible.length && (
        <div className="empty-inline">No expenses logged this month yet.</div>
      )}
      {expenses.length > limit && (
        <button className="show-more" onClick={() => setLimit((l) => l + 20)}>
          Show more ({expenses.length - limit} hidden)
        </button>
      )}
    </div>
  );
}

function SpendingForecastCard({ spentSoFar, spendingCap, exchange, displayCurrency, model, setFinance }) {
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const daysRemaining = Math.max(1, daysInMonth - dayOfMonth);
  const dailyBurn = dayOfMonth > 0 ? spentSoFar / dayOfMonth : 0;
  const targetDailyBurn = spendingCap > 0 ? spendingCap / daysInMonth : 0;
  const projectedTotal = Math.round(dailyBurn * daysInMonth);
  const remainingBudget = Math.max(0, spendingCap - spentSoFar);
  const paceDelta = Math.round(dailyBurn - targetDailyBurn);
  const safeToday = Math.max(0, Math.round((spendingCap - spentSoFar) / daysRemaining));
  const onTrack = projectedTotal <= spendingCap;
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
        <div className="forecast-ai">
          {forecastAt && <span className="ai-stamp">Generated {timeAgo(forecastAt)}</span>}
          <p>{forecast}</p>
        </div>
      )}
    </Card>
  );
}

function AiAdviceModal({ open, onClose, totals, model, setFinance }) {
  const advice = model.ai?.advice || "";
  const adviceAt = model.ai?.generatedAt?.advice || "";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ask = async () => {
    setBusy(true);
    setErr("");
    try {
      const text = await getFinancialAdvice({
        totals,
        savings: model.savings,
        goals: [],
        exchange: model.exchange,
        expenses: model.expenses,
      });
      persistAi(setFinance, "advice", text);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="AI Financial Advice">
      <div className="ai-advice-modal">
        <div className="ai-advice-modal-head">
          <span>
            {advice && adviceAt
              ? `Generated ${timeAgo(adviceAt)} - Groq ${GROQ_MODEL}`
              : "Sends your current finance snapshot to Groq."}
          </span>
          <Button variant="primary" onClick={ask} disabled={busy}>
            {busy ? "Thinking..." : <><RefreshCw size={14} /> {advice ? "Refresh" : "Get Advice"}</>}
          </Button>
        </div>
        {err && <div className="rate-error">{err}</div>}
        {advice ? (
          <div className="ai-advice">
            {advice.split("\n").filter(Boolean).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        ) : (
          !busy && (
            <div className="empty-inline">
              Click "Get Advice" for AI-powered suggestions based on your income, expenses, and goals.
            </div>
          )
        )}
      </div>
    </Modal>
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
}) {
  const accent = ACCENT[section];
  const template = ["minmax(0,1.2fr)", ...columns.map(() => "minmax(72px,1fr)"), "32px"].join(" ");

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
                if (column === "targetDate") {
                  return (
                    <Input
                      key={column}
                      value={row.targetDate || ""}
                      onChange={(targetDate) => setItem(section, row.id, { targetDate })}
                      type="date"
                    />
                  );
                }
                if (column === "suggestedMonthly") {
                  return (
                    <Button
                      key={column}
                      title="Use suggested monthly amount"
                      onClick={() =>
                        setItem(section, row.id, { monthly: fund.suggestedMonthly })
                      }
                    >
                      {displayMoney(fund.suggestedMonthly, displayCurrency, exchange)}
                    </Button>
                  );
                }
                if (column === "actual" && derivedActual) {
                  const derived = derivedActual[String(row.name || "").toLowerCase()] || 0;
                  return (
                    <div
                      key={column}
                      className="fin-actual-derived"
                      title="Auto-filled from logged expenses this month"
                    >
                      {displayMoney(derived, displayCurrency, exchange)}
                    </div>
                  );
                }
                return (
                  <MoneyInput
                    key={column}
                    value={inputValue(row[column] ?? 0, displayCurrency, exchange)}
                    onChange={(value) => setMoneyItem(section, row.id, column, value)}
                    currency={displayCurrency}
                    style={{ textAlign: "right" }}
                  />
                );
              })}
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
