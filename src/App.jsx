import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  CheckSquare,
  ClipboardList,
  Cloud,
  Database,
  Download,
  Flame,
  Home,
  LogOut,
  Sunrise,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "./components/ui";
import { isSupabaseConfigured } from "./core/supabase";
import { signOut } from "./features/AuthGate";
import { activeTask, isMonday, lastWeekISO, localDate } from "./core/date";
import { AnalyticsTab } from "./features/AnalyticsTab";
import { ExportModal } from "./features/ExportModal";
import { FinanceTab } from "./features/FinanceTab";
import { FocusBar } from "./features/FocusBar";
import { GoalsTab } from "./features/GoalsTab";
import { HabitsTab } from "./features/HabitsTab";
import { RoutinesTab } from "./features/RoutinesTab";
import { TasksTab } from "./features/TasksTab";
import { TodayTab } from "./features/TodayTab";
import { WeeklyReviewTab } from "./features/WeeklyReviewTab";
import { useFocusTimer } from "./hooks/useFocusTimer";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useTrackerData } from "./hooks/useTrackerData";

const TRACK_TABS = [
  ["today", "Today", Home],
  ["tasks", "Tasks", CheckSquare],
  ["routines", "Routines", Sunrise],
  ["goals", "Goals", Target],
  ["habits", "Habits", Flame],
  ["review", "Weekly Review", ClipboardList],
  ["analytics", "Analytics", BarChart3],
];

export default function App() {
  const [activeApp, setActiveApp] = useState("track");
  const [tab, setTab] = useState("today");
  const [showExport, setShowExport] = useState(false);
  const {
    loaded,
    data: trackerData,
    setters,
    tasks,
    setTasks,
    recurringTemplates,
    setRecurringTemplates,
    routines,
    setRoutines,
    goals,
    setGoals,
    habits,
    setHabits,
    finance,
    setFinance,
    reviews,
    setReviews,
  } = useTrackerData();
  const { timer, setTimer, startFocus } = useFocusTimer();
  const data = useMemo(
    () => ({ ...trackerData, timer }),
    [trackerData, timer],
  );
  const dailyStats = useMemo(() => {
    const todayTasks = tasks.filter((task) => task.date === localDate());
    const doneTasks = todayTasks.filter(
      (task) => task.status === "Done",
    ).length;
    const doneHabits = habits.filter(
      (habit) => habit.log?.[localDate()],
    ).length;
    const total = todayTasks.length + habits.length;
    const done = doneTasks + doneHabits;
    return {
      doneTasks,
      totalTasks: todayTasks.length,
      doneHabits,
      totalHabits: habits.length,
      percent: total ? Math.round((done / total) * 100) : 0,
    };
  }, [tasks, habits]);
  const reviewDue =
    isMonday() && !reviews.some((review) => review.week === lastWeekISO());
  const badges = useMemo(
    () => ({
      tasks: tasks.filter(
        (task) => task.date === localDate() && activeTask(task),
      ).length,
      review: reviewDue ? 1 : 0,
    }),
    [tasks, reviewDue],
  );

  useKeyboardShortcuts(TRACK_TABS, (nextTab) => {
    setActiveApp("track");
    setTab(nextTab);
  });

  if (!loaded) return <div className="loading">Loading tracker data...</div>;

  const synced = isSupabaseConfigured();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="mark">
            <TrendingUp size={22} />
          </div>
          <div>
            <h1>Tracker</h1>
            <span>{synced ? "Cloud sync" : "Browser-local"} - {localDate()}</span>
          </div>
        </div>
        <div className="header-actions">
          <div
            className="privacy-badge"
            title={
              synced
                ? "Your data syncs privately to your Supabase account (encrypted in transit, row-level secured to you) and caches locally for offline use. AI buttons send a small snapshot only when clicked."
                : "Your data stays in this browser. AI buttons send a small snapshot only when clicked."
            }
          >
            {synced ? <Cloud size={14} /> : <Database size={14} />}
            <span>{synced ? "Cloud synced" : "Local data"}</span>
          </div>
          <div className="app-switch" aria-label="Choose app">
            <button
              type="button"
              className={activeApp === "track" ? "active" : ""}
              onClick={() => setActiveApp("track")}
            >
              <Home size={16} /> Track
            </button>
            <button
              type="button"
              className={activeApp === "finance" ? "active" : ""}
              onClick={() => setActiveApp("finance")}
            >
              <Wallet size={16} /> Finance
            </button>
          </div>
          <div className="planning-badge">
            <strong>{dailyStats.percent}%</strong>
            <span>
              {dailyStats.doneTasks}/{dailyStats.totalTasks} tasks -{" "}
              {dailyStats.doneHabits}/{dailyStats.totalHabits} habits
            </span>
          </div>
          <Button variant="outline" onClick={() => setShowExport(true)}>
            <Download size={16} /> Export / Backup
          </Button>
          {isSupabaseConfigured() && (
            <Button variant="outline" onClick={signOut} title="Sign out">
              <LogOut size={16} /> Sign out
            </Button>
          )}
        </div>
      </header>
      {activeApp === "track" && (
        <nav className="tabs">
          {TRACK_TABS.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`${tab === id ? "active" : ""} ${id === "review" && reviewDue ? "needs-review" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={17} /> {label}
              {badges[id] ? (
                <span className="tab-count">{badges[id]}</span>
              ) : null}
            </button>
          ))}
        </nav>
      )}
      <main>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeApp}-${tab}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeApp === "finance" && (
              <FinanceTab finance={finance} setFinance={setFinance} />
            )}
            {activeApp === "track" && (
              <>
                {tab === "today" && (
                  <TodayTab
                    tasks={tasks}
                    setTasks={setTasks}
                    habits={habits}
                    setHabits={setHabits}
                    goals={goals}
                    setTab={setTab}
                    startFocus={startFocus}
                  />
                )}
                {tab === "tasks" && (
                  <TasksTab
                    tasks={tasks}
                    setTasks={setTasks}
                    recurringTemplates={recurringTemplates}
                    setRecurringTemplates={setRecurringTemplates}
                    startFocus={startFocus}
                  />
                )}
                {tab === "routines" && (
                  <RoutinesTab routines={routines} setRoutines={setRoutines} />
                )}
                {tab === "goals" && (
                  <GoalsTab goals={goals} setGoals={setGoals} setTasks={setTasks} />
                )}
                {tab === "habits" && (
                  <HabitsTab habits={habits} setHabits={setHabits} />
                )}
                {tab === "review" && (
                  <WeeklyReviewTab
                    reviews={reviews}
                    setReviews={setReviews}
                    tasks={tasks}
                    habits={habits}
                    goals={goals}
                    finance={finance}
                  />
                )}
                {tab === "analytics" && (
                  <AnalyticsTab
                    tasks={tasks}
                    habits={habits}
                    goals={goals}
                    finance={finance}
                  />
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      {showExport && (
        <ExportModal
          data={data}
          setters={setters}
          onClose={() => setShowExport(false)}
        />
      )}
      {activeApp === "track" && (
        <AnimatePresence>
          <FocusBar timer={timer} setTimer={setTimer} tasks={tasks} />
        </AnimatePresence>
      )}
    </div>
  );
}
