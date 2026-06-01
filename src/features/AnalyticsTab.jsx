import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { BarChart3, BrainCircuit, CheckSquare, Send, TrendingUp, Wallet } from "lucide-react";
import { Button, Card, ChartTip, Pill, SectionTitle, Stat } from "../components/ui";
import { C, CHART_COLORS, STATUSES, STATUS_COLOR } from "../core/constants";
import {
  addDays,
  dateRange,
  fmt,
  monthKey,
  parseDate,
  startOfWeekISO,
  sum,
} from "../core/date";
import {
  AMD,
  displayMoney,
  expenseAmountAMD,
  financeTotals,
  normalizeFinance,
  savingsPlan,
} from "../core/finance";
import { askDataQuestion } from "../core/groq";

export function AnalyticsTab({ tasks, habits, goals, finance }) {
  const financeModel = useMemo(() => normalizeFinance(finance), [finance]);
  const totals = useMemo(() => financeTotals(financeModel), [financeModel]);
  const moneyTip = (value) => displayMoney(value, AMD, financeModel.exchange);

  // ── overall stats ──────────────────────────────────────────────
  const done = tasks.filter((t) => t.status === "Done").length;
  const net = totals.income - totals.expenses;
  const savingsRate = totals.income > 0
    ? Math.round((totals.monthlyGoal / totals.income) * 100)
    : 0;

  // ── finance charts data ────────────────────────────────────────
  const cashFlowData = useMemo(() => [
    { name: "Income",      Amount: totals.income },
    { name: "Fixed",       Amount: -totals.fixed },
    { name: "Variable",    Amount: -(totals.variableManual + totals.loggedExpenses) },
    { name: "Goal Target", Amount: -totals.monthlyGoal },
    { name: "After Plan",  Amount: totals.leftAfterPlan },
  ], [totals]);

  const categoryData = useMemo(() => {
    const month = monthKey();
    const map = financeModel.expenses
      .filter((e) => (e.date || "").startsWith(month))
      .reduce((m, e) => {
        const k = e.categoryName || "Other";
        m.set(k, (m.get(k) || 0) + expenseAmountAMD(e, financeModel.exchange));
        return m;
      }, new Map());
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [financeModel]);

  const fundData = useMemo(() =>
    savingsPlan(financeModel).map((f) => ({
      name: f.name,
      Saved: f.saved,
      Remaining: f.remaining,
      "Monthly Target": f.suggestedMonthly,
    })), [financeModel]);

  const budgetData = useMemo(() => [
    { name: "Income",   Budget: sum(financeModel.income,   "budget"), Actual: sum(financeModel.income,   "actual") },
    { name: "Fixed",    Budget: sum(financeModel.fixed,    "budget"), Actual: sum(financeModel.fixed,    "actual") },
    { name: "Variable", Budget: sum(financeModel.variable, "budget"), Actual: sum(financeModel.variable, "actual") + totals.loggedExpenses },
    { name: "Savings",  Budget: sum(financeModel.savings,  "target"), Actual: sum(financeModel.savings,  "saved") },
  ], [financeModel, totals.loggedExpenses]);

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
        <Stat label="Savings Rate"  value={savingsRate}  suffix="%" color={C.purple} />
        <Stat label="Monthly Net"   value={displayMoney(net, AMD, financeModel.exchange)} color={net >= 0 ? C.green : C.red} />
      </div>

      {/* ── AI Data Assistant ─────────────────────────────────── */}
      <AiAssistant tasks={tasks} habits={habits} goals={goals} finance={financeModel} totals={totals} exchange={financeModel.exchange} />

      {/* ── Finance Analytics ─────────────────────────────────── */}
      <div className="analytics-section">
        <SectionTitle
          title="Finance Analytics"
          icon={<Wallet />}
          action={<Pill color={C.blue}>1 USD = {Math.round(financeModel.exchange.rate).toLocaleString()} AMD</Pill>}
        />
        <div className="stats-grid">
          <Stat label="After Plan"    value={displayMoney(totals.leftAfterPlan, AMD, financeModel.exchange)} color={totals.leftAfterPlan >= 0 ? C.green : C.red} />
          <Stat label="Logged Spend"  value={displayMoney(totals.loggedExpenses, AMD, financeModel.exchange)} color={C.amber} />
          <Stat label="Saved Total"   value={displayMoney(totals.saved, AMD, financeModel.exchange)} color={C.blue} />
          <Stat label="Monthly Goals" value={displayMoney(totals.monthlyGoal, AMD, financeModel.exchange)} color={C.purple} />
        </div>
        <div className="charts-grid">
          <ChartCard title="Cash Flow This Month">
            <BarChart data={cashFlowData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fill: C.muted }} />
              <YAxis tick={{ fill: C.muted }} />
              <Tooltip content={<ChartTip formatter={moneyTip} />} />
              <Bar dataKey="Amount" radius={[4, 4, 0, 0]}>
                {cashFlowData.map((e) => <Cell key={e.name} fill={e.Amount >= 0 ? C.green : C.red} />)}
              </Bar>
            </BarChart>
          </ChartCard>
          <ChartCard title="Spend by Category">
            <PieChart>
              <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={82}>
                {categoryData.map((e, i) => <Cell key={e.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTip formatter={moneyTip} />} />
              <Legend />
            </PieChart>
          </ChartCard>
          <ChartCard title="Goal Funding Gap">
            <BarChart data={fundData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis type="number" tick={{ fill: C.muted }} />
              <YAxis type="category" dataKey="name" tick={{ fill: C.muted }} width={150} />
              <Tooltip content={<ChartTip formatter={moneyTip} />} />
              <Legend />
              <Bar dataKey="Saved"     stackId="f" fill={C.green} />
              <Bar dataKey="Remaining" stackId="f" fill={C.red}   radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartCard>
          <ChartCard title="Required Monthly per Goal">
            <BarChart data={fundData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fill: C.muted }} />
              <YAxis tick={{ fill: C.muted }} />
              <Tooltip content={<ChartTip formatter={moneyTip} />} />
              <Bar dataKey="Monthly Target" fill={C.blue} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>
        </div>
      </div>

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
          <ChartCard title="Budget vs Actual">
            <BarChart data={budgetData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fill: C.muted }} />
              <YAxis tick={{ fill: C.muted }} />
              <Tooltip content={<ChartTip formatter={moneyTip} />} />
              <Legend />
              <Bar dataKey="Budget" fill={C.blue}  radius={[4, 4, 0, 0]} />
              <Bar dataKey="Actual" fill={C.green} radius={[4, 4, 0, 0]} />
            </BarChart>
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

function AiAssistant({ tasks, habits, goals, finance, totals, exchange }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer]     = useState("");
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
  return (
    <Card className={className}>
      <h3 style={{ marginBottom: 12 }}>{title}</h3>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
