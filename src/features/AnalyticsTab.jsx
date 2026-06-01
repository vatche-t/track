import { useMemo } from "react";
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
import { BarChart3, Wallet } from "lucide-react";
import { Card, ChartTip, Pill, SectionTitle, Stat } from "../components/ui";
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

const LEGEND_STYLE = { color: C.text, fontSize: 12 };

export function AnalyticsTab({ tasks, habits, goals, finance }) {
  const financeModel = useMemo(() => normalizeFinance(finance), [finance]);
  const totals = useMemo(() => financeTotals(financeModel), [financeModel]);
  const moneyTip = (value) => displayMoney(value, AMD, financeModel.exchange);
  const taskStatus = useMemo(
    () =>
      STATUSES.map((status) => ({
        name: status,
        value: tasks.filter((task) => task.status === status).length,
      })).filter((row) => row.value),
    [tasks],
  );
  const financeData = useMemo(
    () => [
      {
        name: "Income",
        Budget: sum(financeModel.income, "budget"),
        Actual: sum(financeModel.income, "actual"),
      },
      {
        name: "Fixed",
        Budget: sum(financeModel.fixed, "budget"),
        Actual: sum(financeModel.fixed, "actual"),
      },
      {
        name: "Variable",
        Budget: sum(financeModel.variable, "budget"),
        Actual: sum(financeModel.variable, "actual") + totals.loggedExpenses,
      },
      {
        name: "Savings",
        Budget: sum(financeModel.savings, "target"),
        Actual: sum(financeModel.savings, "saved"),
      },
    ],
    [financeModel, totals.loggedExpenses],
  );
  const currentExpensesByCategory = useMemo(() => {
    const month = monthKey();
    const rows = financeModel.expenses
      .filter((expense) => (expense.date || "").startsWith(month))
      .reduce((map, expense) => {
        const key = expense.categoryName || "Other";
        map.set(
          key,
          (map.get(key) || 0) + expenseAmountAMD(expense, financeModel.exchange),
        );
        return map;
      }, new Map());
    return [...rows.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [financeModel]);
  const fundData = useMemo(
    () =>
      savingsPlan(financeModel).map((fund) => ({
        name: fund.name,
        Saved: fund.saved,
        Remaining: fund.remaining,
        "Suggested Monthly": fund.suggestedMonthly,
      })),
    [financeModel],
  );
  const cashFlowData = useMemo(
    () => [
      { name: "Income", Amount: totals.income },
      { name: "Fixed", Amount: -totals.fixed },
      { name: "Variable", Amount: -(totals.variableManual + totals.loggedExpenses) },
      { name: "Goal Monthly", Amount: -totals.monthlyGoal },
      { name: "After Plan", Amount: totals.leftAfterPlan },
    ],
    [totals],
  );
  const habitData = useMemo(
    () =>
      habits.map((habit) => ({
        name: habit.name,
        Done: Object.entries(habit.log || {}).filter(
          ([date, done]) => date.startsWith(monthKey()) && done,
        ).length,
      })),
    [habits],
  );
  const trendData = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => {
        const weekStart = startOfWeekISO(
          addDays(parseDate(startOfWeekISO()), -7 * (7 - index)),
        );
        const days = new Set(dateRange(weekStart));
        const weekTasks = tasks.filter((task) => days.has(task.date));
        const habitDays = habits.reduce(
          (total, habit) =>
            total +
            Object.entries(habit.log || {}).filter(
              ([date, done]) => days.has(date) && done,
            ).length,
          0,
        );
        return {
          week: weekStart.slice(5),
          "Tasks Done": weekTasks.filter((task) => task.status === "Done")
            .length,
          "Habit Days": habitDays,
        };
      }),
    [tasks, habits],
  );
  const done = tasks.filter((task) => task.status === "Done").length;
  const net = totals.income - totals.expenses;
  const goalData = goals.map((goal) => ({
    name: goal.title,
    Progress: goal.progress,
  }));
  return (
    <div>
      <SectionTitle title="Analytics" icon={<BarChart3 />} />
      <div className="stats-grid">
        <Stat label="Tasks Done" value={done} color={C.green} />
        <Stat
          label="Completion"
          value={tasks.length ? Math.round((done / tasks.length) * 100) : 0}
          suffix="%"
          color={C.blue}
        />
        <Stat
          label="Active Goals"
          value={goals.filter((goal) => goal.status === "In Progress").length}
          color={C.amber}
        />
        <Stat
          label="Monthly Net"
          value={displayMoney(net, AMD, financeModel.exchange)}
          color={net >= 0 ? C.green : C.red}
        />
      </div>
      <div className="finance-dashboard">
        <SectionTitle
          title="Finance Analytics"
          icon={<Wallet />}
          action={
            <Pill color={C.blue}>
              1 USD = {displayMoney(financeModel.exchange.rate, AMD, financeModel.exchange)}
            </Pill>
          }
        />
        <div className="stats-grid">
          <Stat
            label="Cash After Plan"
            value={displayMoney(totals.leftAfterPlan, AMD, financeModel.exchange)}
            color={totals.leftAfterPlan >= 0 ? C.green : C.red}
          />
          <Stat
            label="Logged Spend"
            value={displayMoney(totals.loggedExpenses, AMD, financeModel.exchange)}
            color={C.amber}
          />
          <Stat
            label="Saved Total"
            value={displayMoney(totals.saved, AMD, financeModel.exchange)}
            color={C.blue}
          />
          <Stat
            label="1 USD ="
            value={`${Math.round(financeModel.exchange.rate).toLocaleString()} AMD`}
            color={C.purple}
          />
        </div>
        <div className="charts-grid">
          <ChartCard title="Cash Flow This Month">
            <BarChart data={cashFlowData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fill: C.muted }} />
              <YAxis tick={{ fill: C.muted }} />
              <Tooltip content={<ChartTip formatter={moneyTip} />} />
              <Bar dataKey="Amount" radius={[4, 4, 0, 0]}>
                {cashFlowData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.Amount >= 0 ? C.green : C.red}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>
          <ChartCard title="Current Month Spend By Category">
            <PieChart>
              <Pie
                data={currentExpensesByCategory}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={82}
              >
                {currentExpensesByCategory.map((entry, index) => (
                  <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTip formatter={moneyTip} />} />
              <Legend />
            </PieChart>
          </ChartCard>
          <ChartCard title="Goal Funding Gap">
            <BarChart data={fundData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis type="number" tick={{ fill: C.muted }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: C.muted }}
                width={150}
              />
              <Tooltip content={<ChartTip formatter={moneyTip} />} />
              <Legend />
              <Bar dataKey="Saved" stackId="fund" fill={C.green} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Remaining" stackId="fund" fill={C.red} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartCard>
          <ChartCard title="Required Monthly By Goal">
            <BarChart data={fundData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fill: C.muted }} />
              <YAxis tick={{ fill: C.muted }} />
              <Tooltip content={<ChartTip formatter={moneyTip} />} />
              <Bar dataKey="Suggested Monthly" fill={C.blue} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>
        </div>
      </div>
      <div className="charts-grid">
        <ChartCard title="Task Status">
          <PieChart>
            <Pie
              data={taskStatus}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={82}
            >
              {taskStatus.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={STATUS_COLOR[entry.name] || CHART_COLORS[index]}
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTip />} />
            <Legend />
          </PieChart>
        </ChartCard>
        <ChartCard title="Budget vs Actual">
          <BarChart data={financeData}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="name" tick={{ fill: C.muted }} />
            <YAxis tick={{ fill: C.muted }} />
            <Tooltip content={<ChartTip formatter={moneyTip} />} />
            <Legend />
            <Bar dataKey="Budget" fill={C.blue} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Actual" fill={C.green} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Habit Completion This Month">
          <BarChart data={habitData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis type="number" tick={{ fill: C.muted }} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: C.muted }}
              width={120}
            />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="Done" fill={C.amber} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Goal Progress">
          <BarChart data={goalData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis type="number" domain={[0, 100]} tick={{ fill: C.muted }} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: C.muted }}
              width={120}
            />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="Progress" fill={C.purple} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="8 Week Trend">
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="week" tick={{ fill: C.muted }} />
            <YAxis tick={{ fill: C.muted }} />
            <Tooltip content={<ChartTip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="Tasks Done"
              stroke={C.green}
              strokeWidth={3}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="Habit Days"
              stroke={C.blue}
              strokeWidth={3}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ChartCard>
      </div>
    </div>
  );
}
export function ChartCard({ title, children }) {
  return (
    <Card>
      <h3>{title}</h3>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
