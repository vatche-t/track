import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, BrainCircuit, Send, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { Button, Card, ChartTip, Input, Pill, SectionTitle, Stat } from "../components/ui";
import { C, CHART_COLORS, STATUSES, STATUS_COLOR } from "../core/constants";
import {
  addDays,
  dateRange,
  monthKey,
  parseDate,
  startOfWeekISO,
  sum,
} from "../core/date";
import {
  AMD,
  amd,
  displayMoney,
  expenseAmountAMD,
  financeTotals,
  monthlySeries,
  normalizeFinance,
  savingsPlan,
} from "../core/finance";
import { askDataQuestion, askFinanceAnalyticsQuestion } from "../core/groq";

export function AnalyticsTab({ tasks, habits, goals, finance }) {
  const financeModel = useMemo(() => normalizeFinance(finance), [finance]);
  const totals = useMemo(() => financeTotals(financeModel), [financeModel]);

  // ── overall stats ──────────────────────────────────────────────
  const done = tasks.filter((t) => t.status === "Done").length;
  const habitCompletions = habits.reduce(
    (count, habit) =>
      count + Object.entries(habit.log || {}).filter(([date, value]) => date.startsWith(monthKey()) && value).length,
    0,
  );
  const goalAverage = goals.length
    ? Math.round(goals.reduce((total, goal) => total + (+goal.progress || 0), 0) / goals.length)
    : 0;

  // ── finance charts data ────────────────────────────────────────
  // ── tracker charts data ────────────────────────────────────────
  const taskStatus = useMemo(() =>
    STATUSES.map((s) => ({ name: s, value: tasks.filter((t) => t.status === s).length })).filter((r) => r.value),
    [tasks]);

  const habitData = useMemo(() =>
    habits.map((h) => ({
      name: h.name,
      Done: Object.entries(h.log || {}).filter(([d, v]) => d.startsWith(monthKey()) && v).length,
    })), [habits]);

  const goalData = goals.map((g) => ({ name: g.title, Progress: g.progress }));

  const trendData = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => {
      const weekStart = startOfWeekISO(addDays(parseDate(startOfWeekISO()), -7 * (7 - i)));
      const days = new Set(dateRange(weekStart));
      const wt = tasks.filter((t) => days.has(t.date));
      const hd = habits.reduce((n, h) =>
        n + Object.entries(h.log || {}).filter(([d, v]) => days.has(d) && v).length, 0);
      return { week: weekStart.slice(5), "Tasks Done": wt.filter((t) => t.status === "Done").length, "Habit Days": hd };
    }), [tasks, habits]);

  return (
    <div className="analytics-shell">
      {/* ── top overview stats ───────────────────────────────── */}
      <SectionTitle title="Analytics" icon={<BarChart3 />} />
      <div className="stats-grid">
        <Stat label="Tasks Done"    value={done}         color={C.green} />
        <Stat label="Completion"    value={tasks.length ? Math.round((done / tasks.length) * 100) : 0} suffix="%" color={C.blue} />
        <Stat label="Habit Days"    value={habitCompletions} color={C.amber} />
        <Stat label="Goal Average"  value={goalAverage} suffix="%" color={C.purple} />
      </div>

      {/* ── AI Data Assistant ─────────────────────────────────── */}
      <AiAssistant tasks={tasks} habits={habits} goals={goals} finance={financeModel} totals={totals} exchange={financeModel.exchange} />

      {/* ── Finance Analytics ─────────────────────────────────── */}
      {/* ── Tracker Analytics ─────────────────────────────────── */}
      <div className="analytics-section">
        <SectionTitle title="Tracker Analytics" icon={<TrendingUp />} />
        <div className="charts-grid">
          <ChartCard title="Task Status">
            <PieChart>
              <Pie data={taskStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={82}>
                {taskStatus.map((e, i) => <Cell key={e.name} fill={STATUS_COLOR[e.name] || CHART_COLORS[i]} />)}
              </Pie>
              <Tooltip content={<ChartTip />} />
              <Legend />
            </PieChart>
          </ChartCard>
          <ChartCard title="Habit Completion This Month">
            <BarChart data={habitData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis type="number" tick={{ fill: C.muted }} />
              <YAxis type="category" dataKey="name" tick={{ fill: C.muted }} width={120} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="Done" fill={C.amber} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartCard>
          <ChartCard title="Goal Progress">
            <BarChart data={goalData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: C.muted }} />
              <YAxis type="category" dataKey="name" tick={{ fill: C.muted }} width={120} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="Progress" fill={C.purple} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartCard>
          <ChartCard title="8 Week Trend" className="chart-full">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="week" tick={{ fill: C.muted }} />
              <YAxis tick={{ fill: C.muted }} />
              <Tooltip content={<ChartTip />} />
              <Legend />
              <Line type="monotone" dataKey="Tasks Done" stroke={C.green} strokeWidth={3} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Habit Days"  stroke={C.blue}  strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

export function FinanceAnalyticsPanel({ finance }) {
  const financeModel = useMemo(() => normalizeFinance(finance), [finance]);
  const totals = useMemo(() => financeTotals(financeModel), [financeModel]);

  const cashFlowData = useMemo(() => [
    { name: "Income (this month)", Amount: totals.income },
    { name: "Fixed", Amount: -totals.fixed },
    { name: "Variable", Amount: -totals.variableManual },
    { name: "Net this month", Amount: totals.net },
  ], [totals]);

  const categoryData = useMemo(() => {
    const month = monthKey();
    const map = financeModel.expenses
      .filter((expense) => (expense.date || "").startsWith(month))
      .reduce((next, expense) => {
        const name = expense.categoryName || "Other";
        next.set(name, (next.get(name) || 0) + expenseAmountAMD(expense, financeModel.exchange));
        return next;
      }, new Map());
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [financeModel]);

  const fundData = useMemo(() => savingsPlan(financeModel), [financeModel]);

  const budgetData = useMemo(() => [
    {
      name: "Income",
      budget: sum(financeModel.income, "budget"),
      actual: sum(financeModel.income, "actual"),
      direction: "higher",
    },
    {
      name: "Fixed",
      budget: sum(financeModel.fixed, "budget"),
      actual: totals.fixed,
      direction: "lower",
    },
    {
      name: "Variable",
      budget: sum(financeModel.variable, "budget"),
      actual: totals.variableManual,
      direction: "lower",
    },
    {
      name: "Monthly goals",
      budget: sum(financeModel.savings, "monthly"),
      actual: totals.monthlyGoal,
      direction: "higher",
    },
  ], [financeModel, totals]);

  const runwayData = useMemo(() => {
    const monthlyOutflow = Math.max(1, totals.expenses + totals.monthlyGoal);
    return {
      monthlyOutflow,
      months: totals.saved > 0 ? totals.saved / monthlyOutflow : 0,
      savingsRate: totals.income > 0 ? Math.round((totals.monthlyGoal / totals.income) * 100) : 0,
      spendRate: totals.income > 0 ? Math.round((totals.expenses / totals.income) * 100) : 0,
    };
  }, [totals]);

  return (
    <div className="analytics-shell">
      <SectionTitle
        title="Finance Analytics"
        icon={<Wallet />}
        action={<Pill color={C.blue}>1 USD = {Math.round(financeModel.exchange.rate).toLocaleString()} AMD</Pill>}
      />
      <div className="stats-grid">
        <Stat label="Net this month" value={displayMoney(totals.net, AMD, financeModel.exchange)} color={totals.net >= 0 ? C.green : C.red} />
        <Stat label="Spent" value={displayMoney(totals.spent, AMD, financeModel.exchange)} color={C.amber} />
        <Stat label="Saved Total" value={displayMoney(totals.saved, AMD, financeModel.exchange)} color={C.blue} />
        <Stat label="Plan balance / mo" value={displayMoney(totals.planBalance, AMD, financeModel.exchange)} color={totals.planBalance >= 0 ? C.green : C.red} />
      </div>
      <FinanceAiAnalyst finance={financeModel} totals={totals} exchange={financeModel.exchange} />
      <div className="finance-analytics-grid">
        <MonthlyTrendPanel finance={financeModel} />
        <WhatIfPanel finance={financeModel} totals={totals} exchange={financeModel.exchange} />
        <CashFlowNarrative data={cashFlowData} totals={totals} exchange={financeModel.exchange} />
        <SpendCategoryBoard categories={categoryData} exchange={financeModel.exchange} />
        <BudgetVarianceBoard rows={budgetData} exchange={financeModel.exchange} />
        <GoalFundingBoard funds={fundData} exchange={financeModel.exchange} />
        <RunwayPanel data={runwayData} totals={totals} exchange={financeModel.exchange} />
      </div>
    </div>
  );
}

// Phase 5: spend / net / income across recent months.
function MonthlyTrendPanel({ finance }) {
  const data = useMemo(() => monthlySeries(finance, 6), [finance]);
  const hasHistory = data.length > 1;
  return (
    <Card className="finance-panel finance-panel-wide">
      <div className="finance-panel-head">
        <div>
          <span className="eyebrow">month over month</span>
          <h3>Spending & net trend</h3>
        </div>
        <Pill color={C.blue}>{data.length} mo</Pill>
      </div>
      {hasHistory ? (
        <ResponsiveContainer width="100%" height={210}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="trendSpent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.red} stopOpacity={0.35} />
                <stop offset="100%" stopColor={C.red} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.border} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 11, fontWeight: 700 }} axisLine={{ stroke: C.border }} tickLine={false} />
            <YAxis width={44} tick={{ fill: C.muted, fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip content={({ active, payload, label }) => (active && payload?.length ? (
              <div className="chart-tip"><b>{label}</b>{payload.map((p) => (<div key={p.name} style={{ color: p.color }}>{p.name}: {amd(p.value)}</div>))}</div>
            ) : null)} />
            <Area name="Spent" dataKey="spent" stroke={C.red} strokeWidth={2.4} fill="url(#trendSpent)" isAnimationActive animationDuration={650} />
            <Line name="Income" dataKey="income" stroke={C.muted} strokeWidth={1.6} strokeDasharray="5 5" dot={false} isAnimationActive animationDuration={650} />
            <Line name="Net" dataKey="net" stroke={C.green} strokeWidth={3} dot={{ r: 3 }} isAnimationActive animationDuration={750} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="empty-inline">Trends appear once you have more than one month of data. Keep logging — next month this fills in.</div>
      )}
    </Card>
  );
}

// Phase 5: cut a discretionary amount per month → see a goal funded sooner.
function WhatIfPanel({ finance, totals, exchange }) {
  const [cut, setCut] = useState(20000);
  const funds = savingsPlan(finance).filter((f) => f.remaining > 0);
  const [fundId, setFundId] = useState(funds[0]?.id || "");
  const fund = funds.find((f) => f.id === fundId) || funds[0];

  const baseMonthly = fund ? ((finance.contributions?.[fund.id] ?? +fund.monthly) || 0) : 0;
  const newMonthly = baseMonthly + (+cut || 0);
  const monthsBase = baseMonthly > 0 ? Math.ceil(fund.remaining / baseMonthly) : Infinity;
  const monthsNew = newMonthly > 0 ? Math.ceil(fund.remaining / newMonthly) : Infinity;
  const sooner = Number.isFinite(monthsBase) && Number.isFinite(monthsNew) ? monthsBase - monthsNew : null;

  return (
    <Card className="finance-panel">
      <div className="finance-panel-head">
        <div>
          <span className="eyebrow">what if</span>
          <h3>Trade-off simulator</h3>
        </div>
        <Sparkles size={18} color={C.amber} />
      </div>
      {fund ? (
        <div className="whatif-body">
          <div className="whatif-controls">
            <label>
              <span>Cut per month (AMD)</span>
              <Input value={String(cut)} onChange={(v) => setCut(+String(v).replace(/[^\d]/g, "") || 0)} />
            </label>
            <label>
              <span>Move it to</span>
              <Input value={fund.name} onChange={(name) => { const f = funds.find((x) => x.name === name); if (f) setFundId(f.id); }} options={funds.map((f) => f.name)} />
            </label>
          </div>
          <div className="whatif-result">
            <p>
              Adding <b>{displayMoney(cut, AMD, exchange)}</b>/mo to <b>{fund.name}</b> changes its funding from{" "}
              <b>{Number.isFinite(monthsBase) ? `${monthsBase} mo` : "never"}</b> to{" "}
              <b style={{ color: C.green }}>{Number.isFinite(monthsNew) ? `${monthsNew} mo` : "never"}</b>
              {sooner != null && sooner > 0 ? <> — <b style={{ color: C.green }}>{sooner} months sooner</b>.</> : "."}
            </p>
            <small>Tip: that {displayMoney(cut, AMD, exchange)} could come from your wants ({displayMoney(totals.discretionarySpent, AMD, exchange)} this month).</small>
          </div>
        </div>
      ) : (
        <div className="empty-inline">Add a savings goal with a remaining gap to simulate trade-offs.</div>
      )}
    </Card>
  );
}

function CashFlowNarrative({ data, totals, exchange }) {
  const max = Math.max(1, ...data.map((row) => Math.abs(row.Amount)));
  return (
    <Card className="finance-panel finance-panel-wide">
      <div className="finance-panel-head">
        <div>
          <span className="eyebrow">cash flow bridge</span>
          <h3>Where this month’s money goes</h3>
        </div>
        <strong className={totals.net >= 0 ? "good" : "bad"}>
          {displayMoney(totals.net, AMD, exchange)}
        </strong>
      </div>
      <div className="cashflow-ladder">
        {data.map((row) => {
          const isPositive = row.Amount >= 0;
          const width = Math.max(8, Math.round((Math.abs(row.Amount) / max) * 100));
          return (
            <div className="cashflow-step" key={row.name}>
              <div>
                <span>{row.name}</span>
                <b>{displayMoney(row.Amount, AMD, exchange)}</b>
              </div>
              <div className="cashflow-track">
                <i
                  className={isPositive ? "inflow" : "outflow"}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="finance-readout">
        <span>Income</span><b>{displayMoney(totals.income, AMD, exchange)}</b>
        <span>Spent</span><b>{displayMoney(totals.spent, AMD, exchange)}</b>
        <span>Net this month</span><b>{displayMoney(totals.net, AMD, exchange)}</b>
      </div>
    </Card>
  );
}

function SpendCategoryBoard({ categories, exchange }) {
  const total = categories.reduce((next, row) => next + row.value, 0);
  const top = categories.slice(0, 6);

  return (
    <Card className="finance-panel">
      <div className="finance-panel-head">
        <div>
          <span className="eyebrow">category pressure</span>
          <h3>Spend concentration</h3>
        </div>
        <strong>{displayMoney(total, AMD, exchange)}</strong>
      </div>
      <div className="category-bars">
        {top.length ? top.map((row, index) => {
          const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
          return (
            <div className="category-bar-row" key={row.name}>
              <div>
                <span>{row.name}</span>
                <b>{displayMoney(row.value, AMD, exchange)}</b>
              </div>
              <div className="category-bar-track">
                <i style={{ width: `${pct}%`, background: CHART_COLORS[index % CHART_COLORS.length] }} />
              </div>
              <em>{pct}%</em>
            </div>
          );
        }) : <div className="empty-inline">No spending logged this month.</div>}
      </div>
    </Card>
  );
}

function BudgetVarianceBoard({ rows, exchange }) {
  return (
    <Card className="finance-panel">
      <div className="finance-panel-head">
        <div>
          <span className="eyebrow">plan control</span>
          <h3>Budget variance</h3>
        </div>
      </div>
      <div className="variance-list">
        {rows.map((row) => {
          const variance = row.actual - row.budget;
          const max = Math.max(1, row.actual, row.budget);
          const budgetWidth = Math.max(4, Math.round((row.budget / max) * 100));
          const actualWidth = Math.max(4, Math.round((row.actual / max) * 100));
          const favorable = row.direction === "higher" ? variance >= 0 : variance <= 0;
          return (
            <div className="variance-row" key={row.name}>
              <div className="variance-title">
                <span>{row.name}</span>
                <b className={favorable ? "good" : "bad"}>{displayMoney(variance, AMD, exchange)}</b>
              </div>
              <div className="variance-bars">
                <i className="budget" style={{ width: `${budgetWidth}%` }}><span>Plan</span></i>
                <i className="actual" style={{ width: `${actualWidth}%` }}><span>Actual</span></i>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function GoalFundingBoard({ funds, exchange }) {
  return (
    <Card className="finance-panel finance-panel-wide">
      <div className="finance-panel-head">
        <div>
          <span className="eyebrow">goal runway</span>
          <h3>Funding progress by priority</h3>
        </div>
      </div>
      <div className="goal-board">
        {funds.map((fund) => (
          <div className="goal-card" key={fund.id}>
            <div className="goal-card-top">
              <span>{fund.name}</span>
              <b>{fund.progress}%</b>
            </div>
            <div className="goal-card-bar">
              <i style={{ width: `${fund.progress}%` }} />
            </div>
            <div className="goal-card-meta">
              <span>Saved {displayMoney(fund.saved, AMD, exchange)}</span>
              <span>Gap {displayMoney(fund.remaining, AMD, exchange)}</span>
              <span>Monthly {displayMoney(fund.suggestedMonthly, AMD, exchange)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RunwayPanel({ data, totals, exchange }) {
  const health = totals.leftAfterPlan >= 0 ? "good" : "bad";
  return (
    <Card className="finance-panel">
      <div className="finance-panel-head">
        <div>
          <span className="eyebrow">stability signal</span>
          <h3>Runway and ratios</h3>
        </div>
      </div>
      <div className="ratio-grid">
        <div>
          <span>Cash runway</span>
          <b>{data.months.toFixed(1)} mo</b>
          <small>Saved total / monthly outflow</small>
        </div>
        <div>
          <span>Spend rate</span>
          <b>{data.spendRate}%</b>
          <small>Expenses / income</small>
        </div>
        <div>
          <span>Goal rate</span>
          <b>{data.savingsRate}%</b>
          <small>Goal transfers / income</small>
        </div>
        <div>
          <span>After-plan status</span>
          <b className={health}>{displayMoney(totals.leftAfterPlan, AMD, exchange)}</b>
          <small>Income - expenses - goals</small>
        </div>
      </div>
    </Card>
  );
}

function FinanceAiAnalyst({ finance, totals, exchange }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [history, setHistory] = useState([]);

  const ask = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setErr("");
    setQuestion("");
    try {
      const text = await askFinanceAnalyticsQuestion(q, { finance, totals, exchange });
      setHistory((items) => [...items, { q, a: text }]);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = [
    "What is hurting my savings plan the most?",
    "Can I afford my monthly goal transfers?",
    "Which category should I cut first?",
    "How far am I from my house down payment?",
  ];

  return (
    <Card>
      <div className="card-head">
        <div>
          <h3><BrainCircuit size={18} /> Finance AI Analyst</h3>
          <span>Ask about finance data. A snapshot is sent to AI only when you click Ask.</span>
        </div>
        {history.length > 0 && (
          <button className="icon-btn" onClick={() => setHistory([])} title="Clear history" style={{ fontSize: 11, color: C.muted }}>
            Clear
          </button>
        )}
      </div>
      <div className="ai-chat-input" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && ask()}>
        <input
          className="field"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='Ask: "What is my real monthly surplus?" or "Which goal needs more money?"'
          disabled={busy}
        />
        <Button variant="primary" onClick={ask} disabled={busy || !question.trim()}>
          {busy ? "..." : <><Send size={14} /> Ask</>}
        </Button>
      </div>
      {err && <div className="rate-error" style={{ marginTop: 8 }}>{err}</div>}
      {history.length > 0 && (
        <div className="ai-history">
          {history.map((item, i) => (
            <div key={i} className="ai-exchange">
              <div className="ai-q"><span>You</span>{item.q}</div>
              <div className="ai-a">
                {item.a.split("\n").filter(Boolean).map((line, j) => <p key={j}>{line}</p>)}
              </div>
            </div>
          ))}
        </div>
      )}
      {!history.length && !busy && (
        <div className="ai-suggestions">
          {suggestions.map((text) => (
            <button key={text} className="ai-suggestion-chip" onClick={() => setQuestion(text)}>{text}</button>
          ))}
        </div>
      )}
    </Card>
  );
}

function AiAssistant({ tasks, habits, goals, finance, totals, exchange }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState("");
  const [history, setHistory]   = useState([]);

  const ask = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setErr("");
    setQuestion("");
    try {
      const text = await askDataQuestion(q, { tasks, habits, goals, finance, totals, exchange });
      setHistory((h) => [...h, { q, a: text }]);
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
          <h3><BrainCircuit size={18} /> AI Data Assistant</h3>
          <span>Ask anything about your tasks, habits, goals, or finances</span>
        </div>
        {history.length > 0 && (
          <button className="icon-btn" onClick={() => setHistory([])} title="Clear history" style={{ fontSize: 11, color: C.muted }}>
            Clear
          </button>
        )}
      </div>
      <div className="ai-chat-input" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && ask()}>
        <input
          className="field"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='e.g. "Am I on track for my house goal?" or "What are my worst spending habits?"'
          disabled={busy}
        />
        <Button variant="primary" onClick={ask} disabled={busy || !question.trim()}>
          {busy ? "…" : <><Send size={14} /> Ask</>}
        </Button>
      </div>
      {err && <div className="rate-error" style={{ marginTop: 8 }}>{err}</div>}
      {history.length > 0 && (
        <div className="ai-history">
          {history.map((item, i) => (
            <div key={i} className="ai-exchange">
              <div className="ai-q"><span>You</span>{item.q}</div>
              <div className="ai-a">
                {item.a.split("\n").filter(Boolean).map((line, j) => <p key={j}>{line}</p>)}
              </div>
            </div>
          ))}
        </div>
      )}
      {!history.length && !busy && (
        <div className="ai-suggestions">
          {["Am I on track for my savings goals?", "Which habit needs the most attention?", "How can I reach my house goal faster?"].map((s) => (
            <button key={s} className="ai-suggestion-chip" onClick={() => setQuestion(s)}>{s}</button>
          ))}
        </div>
      )}
    </Card>
  );
}

export function ChartCard({ title, children, className = "" }) {
  const boxRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return undefined;

    const update = () => {
      const rect = node.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Card className={className}>
      <h3 style={{ marginBottom: 12 }}>{title}</h3>
      <div className="chart-box" ref={boxRef}>
        {size.width > 1 && size.height > 1 && isValidElement(children)
          ? cloneElement(children, { width: size.width, height: size.height })
          : null}
      </div>
    </Card>
  );
}
