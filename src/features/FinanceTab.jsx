import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
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
import { Button, Card, Input, Pill, SectionTitle, Stat } from "../components/ui";
import { getFinancialAdvice, getSpendingForecast } from "../core/groq";
import { C } from "../core/constants";
import { localDate, submitOnEnter, sum, uid } from "../core/date";
import {
  AMD,
  MONEY_CURRENCIES,
  USD,
  allocationSuggestion,
  amd,
  createExpense,
  detectExpenseCategory,
  displayMoney,
  fetchUsdAmdRate,
  financeTotals,
  formatMoney,
  fromAMD,
  fundSuggestion,
  lumpSumAllocation,
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

const rateAge = (fetchedAt) => {
  if (!fetchedAt) return "using fallback";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(fetchedAt)) / 60000));
  if (minutes < 1) return "just updated";
  if (minutes < 60) return `${minutes}m old`;
  return `${Math.round(minutes / 60)}h old`;
};

export function FinanceTab({ finance, setFinance }) {
  const model = useMemo(() => normalizeFinance(finance), [finance]);
  const totals = useMemo(() => financeTotals(model), [model]);
  const categories = model.categories;
  const exchange = model.exchange;
  const [displayCurrency, setDisplayCurrency] = useState(AMD);
  const [rateBusy, setRateBusy] = useState(false);
  const [rateError, setRateError] = useState("");
  const [draft, setDraft] = useState({
    date: localDate(),
    note: "",
    amount: "",
    currency: AMD,
    categoryName: "Other",
    source: "Spending card",
  });
  const [newCategory, setNewCategory] = useState("");
  const detected = detectExpenseCategory(draft.note);
  const categoryOptions = categories.map((category) => category.name);
  const salary = sum(model.income, "actual");
  const suggestion = allocationSuggestion(salary);
  const spendingCap = suggestion[0]?.amount || 300000;
  const loggedThisMonth = totals.fixed + totals.variableManual + totals.loggedExpenses;
  const capPct = Math.min(100, Math.round((loggedThisMonth / spendingCap) * 100));

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
    updateFinance((previous) => ({
      ...previous,
      expenses: [
        createExpense(
          {
            ...draft,
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
        const match = suggestion.find((item) => item.name === fund.name);
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

      <Card className="money-brief">
        <div>
          <span className="eyebrow">12 month rule</span>
          <h3>Live on 300,000 AMD. Move the rest before spending starts.</h3>
          <p>
            Current model uses {displayMoney(salary, displayCurrency, exchange)}{" "}
            income. Expenses can be logged in AMD or USD, then normalized to AMD
            for planning and analytics.
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
        <Stat label="Income" value={displayMoney(totals.income, displayCurrency, exchange)} color={C.green} />
        <Stat label="Expenses" value={displayMoney(totals.expenses, displayCurrency, exchange)} color={C.red} />
        <Stat label="Monthly Goal" value={displayMoney(totals.monthlyGoal, displayCurrency, exchange)} color={C.blue} />
        <Stat
          label="After Plan"
          value={displayMoney(totals.leftAfterPlan, displayCurrency, exchange)}
          color={totals.leftAfterPlan >= 0 ? C.green : C.red}
        />
      </div>

      <SpendingForecastCard
        spentSoFar={totals.variableManual + totals.loggedExpenses}
        spendingCap={spendingCap}
        exchange={exchange}
        displayCurrency={displayCurrency}
      />

      <div className="money-layout">
        <Card className="expense-capture">
          <div className="card-head">
            <div>
              <h3>
                <ReceiptText size={18} /> Log Expense
              </h3>
              <span>Choose AMD or USD per expense; the live rate is saved with the row.</span>
            </div>
            <Pill color={detected.id === "other" ? C.muted : C.green}>
              Suggested: {detected.name}
            </Pill>
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
            <Input
              value={draft.amount}
              onChange={(amount) => setDraft({ ...draft, amount })}
              type="number"
              min="0"
              step="0.01"
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

        <Card className="allocation-card">
          <div className="card-head">
            <div>
              <h3>
                <Target size={18} /> Salary Allocation
              </h3>
              <span>Suggestion updates when income changes.</span>
            </div>
            <Button onClick={applySuggestion}>
              <ArrowRight size={15} /> Apply
            </Button>
          </div>
          <div className="allocation-list">
            {suggestion.map((item) => (
              <div className="allocation-row" key={item.name}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.note}</span>
                </div>
                <b>{displayMoney(item.amount, displayCurrency, exchange)}</b>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <WindfallCard
        savings={model.savings}
        exchange={exchange}
        displayCurrency={displayCurrency}
        onApply={(patches) =>
          updateFinance((prev) => ({
            ...prev,
            savings: prev.savings.map((fund) => {
              const patch = patches.find((p) => p.id === fund.id);
              return patch
                ? { ...fund, saved: (+fund.saved || 0) + patch.suggested }
                : fund;
            }),
          }))
        }
      />

      <AiAdviceCard totals={totals} model={model} />

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
          rows={model.variable}
          columns={["budget", "actual"]}
          displayCurrency={displayCurrency}
          exchange={exchange}
          setItem={setItem}
          setMoneyItem={setMoneyItem}
          addItem={addItem}
          delItem={delItem}
        />
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
    </div>
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

function SpendingForecastCard({ spentSoFar, spendingCap, exchange, displayCurrency }) {
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const daysRemaining = Math.max(1, daysInMonth - dayOfMonth);
  const dailyBurn = dayOfMonth > 0 ? spentSoFar / dayOfMonth : 0;
  const projectedTotal = Math.round(dailyBurn * daysInMonth);
  const safeToday = Math.max(0, Math.round((spendingCap - spentSoFar) / daysRemaining));
  const onTrack = projectedTotal <= spendingCap;
  const pct = spendingCap > 0 ? Math.min(100, Math.round((spentSoFar / spendingCap) * 100)) : 0;
  const projPct = spendingCap > 0 ? Math.min(100, Math.round((projectedTotal / spendingCap) * 100)) : 0;

  const [forecast, setForecast] = useState("");
  const [busy, setBusy]         = useState(false);

  const ask = async () => {
    setBusy(true);
    setForecast("");
    try {
      const text = await getSpendingForecast({
        spentSoFar, spendingCap, dayOfMonth, daysInMonth, daysRemaining,
        safeToday, projectedTotal, onTrack, exchange,
      });
      setForecast(text.replace(/^<\|.*?\|>\s*/g, "").trim());
    } catch (e) {
      setForecast("Could not load forecast — check your Groq key.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="card-head">
        <div>
          <h3><CalendarDays size={18} /> Spending Forecast</h3>
          <span>Day {dayOfMonth} of {daysInMonth} · {daysRemaining} days remaining this month</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Pill color={onTrack ? C.green : C.red}>{onTrack ? "On track" : "Over pace"}</Pill>
          <Button onClick={ask} disabled={busy}>
            {busy ? "…" : <><BrainCircuit size={14} /> AI Summary</>}
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

      <div className="forecast-bar">
        <div className="forecast-bar-spent"   style={{ width: `${pct}%`,          background: C.green }} />
        <div className="forecast-bar-proj"    style={{ width: `${Math.max(0, projPct - pct)}%`, background: onTrack ? C.blue + "88" : C.red + "88" }} />
      </div>
      <div className="forecast-bar-labels">
        <span>0</span>
        <span style={{ color: C.muted, fontSize: 10 }}>Spent {pct}% · Projected {projPct}%</span>
        <span>Cap</span>
      </div>

      {forecast && (
        <div className="forecast-ai">
          <p>{forecast}</p>
        </div>
      )}
    </Card>
  );
}

function AiAdviceCard({ totals, model }) {
  const [advice, setAdvice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ask = async () => {
    setBusy(true);
    setErr("");
    setAdvice("");
    try {
      const text = await getFinancialAdvice({
        totals,
        savings: model.savings,
        goals: [],
        exchange: model.exchange,
        categories: model.categories,
      });
      setAdvice(text);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <div className="card-head">
        <div>
          <h3><BrainCircuit size={18} /> AI Financial Advice</h3>
          <span>Powered by Groq · llama-3.3-70b · based on your current month data</span>
        </div>
        <Button variant="primary" onClick={ask} disabled={busy}>
          {busy ? "Thinking…" : "Get Advice"}
        </Button>
      </div>
      {err && <div className="rate-error">{err}</div>}
      {advice && (
        <div className="ai-advice">
          {advice.split("\n").filter(Boolean).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
      {!advice && !err && !busy && (
        <div className="empty-inline">Click "Get Advice" to get AI-powered suggestions based on your income, expenses, and goals.</div>
      )}
    </Card>
  );
}


function WindfallCard({ savings, exchange, displayCurrency, onApply }) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(AMD);
  const amdAmount = toAMD(+amount || 0, currency, exchange);
  const splits = lumpSumAllocation(amdAmount, savings, exchange, AMD);
  const hasAmount = amdAmount > 0;
  return (
    <Card>
      <div className="card-head">
        <div>
          <h3>Windfall Allocator</h3>
          <span>Got paid back, received a bonus? Split it across your goals by remaining gap.</span>
        </div>
      </div>
      <div className="windfall-form" onKeyDown={(e) => e.key === "Enter" && hasAmount && onApply(splits)}>
        <Input
          value={amount}
          onChange={setAmount}
          type="number"
          min="0"
          step="1"
          placeholder="Amount received"
        />
        <Input
          value={currency}
          onChange={setCurrency}
          options={MONEY_CURRENCIES}
        />
        {hasAmount && (
          <span className="windfall-amd">
            = {amd(amdAmount)}
          </span>
        )}
      </div>
      {hasAmount && splits.length > 0 && (
        <div className="windfall-splits">
          {splits.map((split) => (
            <div className="windfall-row" key={split.id}>
              <div>
                <strong>{split.name}</strong>
                <span>{amd(split.remaining)} still needed</span>
              </div>
              <b>{displayMoney(split.suggested, displayCurrency, exchange)}</b>
            </div>
          ))}
          <Button variant="primary" onClick={() => onApply(splits)} style={{ marginTop: 10 }}>
            Apply All to Savings
          </Button>
        </div>
      )}
      {!savings.length && (
        <div className="empty-inline">Add savings goals below to use the allocator.</div>
      )}
    </Card>
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
            {" · "}{fund.progress}%
            {fund.months > 0 ? ` · ${fund.months}mo to go` : ""}
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
          <Input
            value={inputValue(row.target ?? 0, displayCurrency, exchange)}
            onChange={(v) => setMoneyItem("savings", row.id, "target", v)}
            type="number" min="0"
            step={displayCurrency === USD ? "0.01" : "1"}
            style={{ textAlign: "right" }}
          />
        </div>
        <div className="goal-fund-field">
          <label>Saved</label>
          <Input
            value={inputValue(row.saved ?? 0, displayCurrency, exchange)}
            onChange={(v) => setMoneyItem("savings", row.id, "saved", v)}
            type="number" min="0"
            step={displayCurrency === USD ? "0.01" : "1"}
            style={{ textAlign: "right" }}
          />
        </div>
        <div className="goal-fund-field">
          <label>Monthly</label>
          <Input
            value={inputValue(row.monthly ?? 0, displayCurrency, exchange)}
            onChange={(v) => setMoneyItem("savings", row.id, "monthly", v)}
            type="number" min="0"
            step={displayCurrency === USD ? "0.01" : "1"}
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
}) {
  const accent = ACCENT[section];
  const template = ["minmax(0,1fr)", ...columns.map(() => "76px"), "28px"].join(" ");

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
          {!rows.length && <div className="empty-inline">No goal funds yet — click Add.</div>}
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
                return (
                  <Input
                    key={column}
                    value={inputValue(row[column] ?? 0, displayCurrency, exchange)}
                    onChange={(value) => setMoneyItem(section, row.id, column, value)}
                    type="number"
                    min="0"
                    step={displayCurrency === USD ? "0.01" : "1"}
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
        {!rows.length && <div className="empty-inline">No items yet — click Add.</div>}
      </div>
    </Card>
  );
}
