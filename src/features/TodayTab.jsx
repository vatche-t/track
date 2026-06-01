import { useState } from "react";
import { BookOpen, CalendarDays, Check, Play, Plus } from "lucide-react";
import { Button, Card, Empty, Input, MotionCheck, Pill } from "../components/ui";
import { C } from "../core/constants";
import {
  activeTask,
  addDays,
  dateRange,
  dayName,
  habitStreak,
  localDate,
  orderedTasks,
  parseDate,
  startOfWeekISO,
  submitOnEnter,
  uid,
} from "../core/date";
import { useBibleVerse } from "../hooks/useBibleVerse";

export function TodayTab({
  tasks,
  setTasks,
  habits,
  setHabits,
  setTab,
  startFocus,
}) {
  const verse = useBibleVerse();
  const [quickTitle, setQuickTitle] = useState("");
  const [quickDate, setQuickDate] = useState(localDate());
  const [selectedDay, setSelectedDay] = useState(localDate());
  const today = localDate();
  const weekDays = dateRange(startOfWeekISO());
  const todayTasks = orderedTasks(tasks.filter((task) => task.date === today));
  const selectedTasks = orderedTasks(
    tasks.filter((task) => task.date === selectedDay),
  );
  const overdue = tasks.filter((task) => task.date < today && activeTask(task));
  const doneToday = todayTasks.filter((task) => task.status === "Done").length;
  const habitDone = habits.filter((habit) => habit.log?.[today]).length;
  const progress =
    todayTasks.length + habits.length
      ? Math.round(
          ((doneToday + habitDone) / (todayTasks.length + habits.length)) * 100,
        )
      : 0;
  const updateTask = (id, patch) =>
    setTasks(
      tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    );
  const addQuickTask = () => {
    if (!quickTitle.trim()) return;
    setTasks([
      {
        id: uid(),
        order: Date.now(),
        date: quickDate,
        title: quickTitle.trim(),
        category: "Personal",
        priority: "Medium",
        status: "To Do",
        est: 25,
        actual: 0,
        recurring: false,
        notes: "",
        subtasks: [],
      },
      ...tasks,
    ]);
    setQuickTitle("");
  };
  const toggleHabit = (habitId) =>
    setHabits(
      habits.map((habit) =>
        habit.id === habitId
          ? { ...habit, log: { ...habit.log, [today]: !habit.log?.[today] } }
          : habit,
      ),
    );
  return (
    <div className="today-shell">
      <div className="hero-panel">
        <div>
          <span className="eyebrow">Daily command</span>
          <h2>
            {new Date().getHours() < 12
              ? "Good morning"
              : new Date().getHours() < 18
                ? "Good afternoon"
                : "Good evening"}
            , steady progress today.
          </h2>
          <p>
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="hero-meter" aria-label="Daily completion">
          <strong>{progress}%</strong>
          <span>
            {doneToday}/{todayTasks.length} tasks - {habitDone}/{habits.length}{" "}
            habits
          </span>
        </div>
      </div>
      <Card className="verse-card">
        <BookOpen size={22} />
        <div>
          <span>Verse of the Day</span>
          <p>{verse.text}</p>
          <strong>{verse.reference}</strong>
        </div>
      </Card>
      <div className="today-grid">
        <Card>
          <div className="card-head">
            <h3>Today's Tasks</h3>
            {overdue.length ? (
              <Pill color={C.amber}>{overdue.length} overdue</Pill>
            ) : (
              <Pill color={C.green}>Clear</Pill>
            )}
          </div>
          <div className="stack">
            {todayTasks.map((task) => (
              <div className="today-task" key={task.id}>
                <MotionCheck
                  className={task.status === "Done" ? "check done" : "check"}
                  onClick={() =>
                    updateTask(task.id, {
                      status: task.status === "Done" ? "To Do" : "Done",
                    })
                  }
                >
                  {task.status === "Done" && <Check size={14} />}
                </MotionCheck>
                <div>
                  <strong className={task.status === "Done" ? "complete" : ""}>
                    {task.title}
                  </strong>
                  <span>
                    {task.priority} - {task.category}
                  </span>
                </div>
                <Button
                  title="Focus on this task"
                  onClick={() => startFocus(task.id)}
                >
                  <Play size={14} /> Focus
                </Button>
              </div>
            ))}
            {!todayTasks.length && <Empty>No tasks scheduled for today.</Empty>}
          </div>
          <div className="quick-add" onKeyDown={submitOnEnter(addQuickTask)}>
            <Input
              value={quickTitle}
              onChange={setQuickTitle}
              placeholder="Add a calm next step"
            />
            <Input value={quickDate} onChange={setQuickDate} type="date" />
            <Button
              onClick={() => setQuickDate(localDate(addDays(new Date(), 1)))}
            >
              Tomorrow
            </Button>
            <Button variant="primary" onClick={addQuickTask}>
              <Plus size={15} /> Add
            </Button>
          </div>
        </Card>
        <Card>
          <div className="card-head">
            <h3>Weekly Calendar</h3>
            <CalendarDays size={18} color={C.blue} />
          </div>
          <div className="week-strip">
            {weekDays.map((date) => {
              const dayTasks = tasks.filter((task) => task.date === date);
              const done = dayTasks.filter(
                (task) => task.status === "Done",
              ).length;
              return (
                <button
                  key={date}
                  className={
                    date === today
                      ? "week-day today"
                      : date === selectedDay
                        ? "week-day selected"
                        : "week-day"
                  }
                  onClick={() => setSelectedDay(date)}
                >
                  <span>{dayName(parseDate(date))}</span>
                  <strong>{parseDate(date).getDate()}</strong>
                  <div className="dots">
                    {dayTasks.slice(0, 4).map((task) => (
                      <i
                        key={task.id}
                        style={{
                          background:
                            task.status === "Done"
                              ? C.green
                              : task.status === "In Progress"
                                ? C.amber
                                : task.date < today
                                  ? C.red
                                  : C.muted,
                        }}
                      />
                    ))}
                  </div>
                  <small>
                    {done}/{dayTasks.length}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="selected-day-panel">
            <span>{selectedDay}</span>
            {selectedTasks.length ? (
              selectedTasks.map((task) => (
                <p key={task.id}>
                  {task.title} <b>{task.status}</b>
                </p>
              ))
            ) : (
              <p>No tasks on this day.</p>
            )}
          </div>
        </Card>
      </div>
      <Card>
        <div className="card-head">
          <h3>Today's Habits</h3>
          <Button onClick={() => setTab("habits")}>Open habits</Button>
        </div>
        <div className="habit-pills">
          {habits.map((habit) => (
            <button
              key={habit.id}
              className={habit.log?.[today] ? "habit-pill on" : "habit-pill"}
              onClick={() => toggleHabit(habit.id)}
            >
              <Check size={15} />
              <span>{habit.name}</span>
              <b>{habitStreak(habit)}</b>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
