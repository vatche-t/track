import { useEffect, useState } from "react";
import { Check, ClipboardList, Star, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  Empty,
  Input,
  SectionTitle,
  Stat,
  Textarea,
} from "../components/ui";
import { C, RATING } from "../core/constants";
import {
  dateRange,
  localDate,
  parseDate,
  startOfWeekISO,
  uid,
} from "../core/date";
import { amd, financeTotals, normalizeFinance } from "../core/finance";

const REVIEW_FIELDS = [
  ["wins", "Wins", "What moved forward?"],
  ["challenges", "Challenges", "What got in the way?"],
  ["lessons", "Lessons", "What did this week teach you?"],
  ["priorities", "Next Week's Priorities", "What deserves focus next?"],
  ["gratitude", "Gratitude", "What are you thankful for?"],
];

export function getWeekStats(weekStart, tasks, habits, goals, finance) {
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
  const totals = financeTotals(normalizeFinance(finance));
  return {
    tasksDone: weekTasks.filter((task) => task.status === "Done").length,
    tasksTotal: weekTasks.length,
    habitDays,
    activeGoals: goals.filter((goal) => goal.status === "In Progress").length,
    netFinance: totals.income - totals.expenses,
  };
}

export function WeeklyReviewTab({
  reviews,
  setReviews,
  tasks,
  habits,
  goals,
  finance,
}) {
  const currentWeek = startOfWeekISO();
  const [draft, setDraft] = useState(
    () =>
      reviews.find((review) => review.week === currentWeek) || {
        week: currentWeek,
        mood: 3,
        productivity: 3,
        wins: "",
        challenges: "",
        lessons: "",
        priorities: "",
        gratitude: "",
      },
  );
  const stats = getWeekStats(draft.week, tasks, habits, goals, finance);
  useEffect(() => {
    const match = reviews.find((review) => review.week === draft.week);
    setDraft(
      match || {
        week: draft.week,
        mood: 3,
        productivity: 3,
        wins: "",
        challenges: "",
        lessons: "",
        priorities: "",
        gratitude: "",
      },
    );
  }, [draft.week, reviews]);
  const save = () => {
    const review = {
      ...draft,
      id: draft.id || uid(),
      createdAt: draft.createdAt || localDate(),
      updatedAt: localDate(),
      stats,
    };
    setReviews(
      [
        review,
        ...reviews.filter(
          (item) => item.id !== review.id && item.week !== review.week,
        ),
      ].sort((a, b) => b.week.localeCompare(a.week)),
    );
  };
  return (
    <div>
      <SectionTitle
        title="Weekly Review"
        icon={<ClipboardList />}
        action={
          <Button variant="primary" onClick={save}>
            <Check size={16} /> Save Review
          </Button>
        }
      />
      <Card className="review-editor">
        <div className="review-top">
          <div>
            <label>Week Starting</label>
            <Input
              value={draft.week}
              onChange={(v) =>
                setDraft({ ...draft, week: startOfWeekISO(parseDate(v)) })
              }
              type="date"
            />
          </div>
          <Rating
            label="Mood"
            value={draft.mood}
            onChange={(mood) => setDraft({ ...draft, mood })}
          />
          <Rating
            label="Productivity"
            value={draft.productivity}
            onChange={(productivity) => setDraft({ ...draft, productivity })}
          />
        </div>
        <div className="stats-grid">
          <Stat
            label="Tasks Done"
            value={stats.tasksDone + "/" + stats.tasksTotal}
            color={C.green}
          />
          <Stat label="Habit Days" value={stats.habitDays} color={C.blue} />
          <Stat
            label="Active Goals"
            value={stats.activeGoals}
            color={C.amber}
          />
          <Stat
            label="Monthly Net"
            value={amd(stats.netFinance)}
            color={stats.netFinance >= 0 ? C.green : C.red}
          />
        </div>
        <div className="review-grid">
          {REVIEW_FIELDS.map(([key, label, placeholder]) => (
            <div key={key}>
              <label>{label}</label>
              <Textarea
                value={draft[key] || ""}
                onChange={(v) => setDraft({ ...draft, [key]: v })}
                placeholder={placeholder}
                rows={4}
              />
            </div>
          ))}
        </div>
      </Card>
      <div className="block">
        <div className="eyebrow">Past Reviews</div>
        <div className="stack">
          {reviews.map((review) => (
            <Card key={review.id}>
              <div className="card-head">
                <h3>Week of {review.week}</h3>
                <div className="actions">
                  <span className="stars">Mood {review.mood || 0}/5</span>
                  <Button onClick={() => setDraft(review)}>Open</Button>
                  <button
                    className="icon-btn danger"
                    onClick={() =>
                      setReviews(reviews.filter((r) => r.id !== review.id))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="review-summary">
                <span>
                  Tasks {review.stats?.tasksDone || 0}/
                  {review.stats?.tasksTotal || 0}
                </span>
                <span>Habit days {review.stats?.habitDays || 0}</span>
                <span>Goals {review.stats?.activeGoals || 0}</span>
                <span>{"Net " + amd(review.stats?.netFinance || 0)}</span>
              </div>
              {REVIEW_FIELDS.filter(([key]) => review[key]).map(
                ([key, label]) => (
                  <p key={key}>
                    <b>{label}:</b> {review[key]}
                  </p>
                ),
              )}
            </Card>
          ))}
          {!reviews.length && <Empty>No saved reviews yet.</Empty>}
        </div>
      </div>
    </div>
  );
}

export function Rating({ label, value, onChange }) {
  return (
    <div>
      <label>{label}</label>
      <div className="rating">
        {RATING.map((rate) => (
          <button
            key={rate}
            className={rate <= value ? "on" : ""}
            onClick={() => onChange(rate)}
          >
            <Star size={17} fill={rate <= value ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
    </div>
  );
}
