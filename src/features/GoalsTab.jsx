import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Sparkles, Target, Trash2 } from "lucide-react";
import { Button, Card, CardGrid, Input, Pill, SectionTitle } from "../components/ui";
import { PRIORITIES, PRIORITY_COLOR } from "../core/constants";
import { localDate, submitOnEnter, uid } from "../core/date";
import { breakdownGoal } from "../core/groq";

export function GoalsTab({ goals, setGoals, setTasks }) {
  const [busyGoal, setBusyGoal] = useState("");
  const [breakdownFor, setBreakdownFor] = useState(null);
  const [draft, setDraft] = useState({
    title: "",
    category: "Career",
    target: localDate(),
    status: "In Progress",
    priority: "Medium",
    progress: 0,
  });
  const add = () => {
    if (!draft.title.trim()) return;
    setGoals([
      { id: uid(), ...draft, progress: +draft.progress || 0 },
      ...goals,
    ]);
    setDraft({
      title: "",
      category: "Career",
      target: localDate(),
      status: "In Progress",
      priority: "Medium",
      progress: 0,
    });
  };
  const update = (id, patch) =>
    setGoals(
      goals.map((goal) => (goal.id === id ? { ...goal, ...patch } : goal)),
    );

  // AI: break a goal into concrete tasks, create them dated today, linked to the goal.
  const breakInto = async (goal) => {
    setBusyGoal(goal.id);
    setBreakdownFor(null);
    try {
      const text = await breakdownGoal({ goal });
      const titles = text
        .split("\n")
        .map((line) => line.replace(/^[\s\d.\-*)]+/, "").trim())
        .filter((line) => line.length > 2)
        .slice(0, 5);
      if (!titles.length) return;
      const newTasks = titles.map((title, i) => ({
        id: uid(),
        order: Date.now() + i,
        date: localDate(),
        title,
        category: goal.category || "Personal",
        priority: "Medium",
        status: "To Do",
        est: 30,
        actual: 0,
        recurring: false,
        notes: "",
        subtasks: [],
        goalId: goal.id,
      }));
      setTasks((prev) => [...newTasks, ...prev]);
      setBreakdownFor({ id: goal.id, count: titles.length });
    } catch {
      setBreakdownFor({ id: goal.id, error: true });
    } finally {
      setBusyGoal("");
    }
  };

  return (
    <div>
      <SectionTitle title="Goals" icon={<Target />} />
      <Card>
        <div className="form-grid goal-grid" onKeyDown={submitOnEnter(add)}>
          <Input
            value={draft.title}
            onChange={(v) => setDraft({ ...draft, title: v })}
            placeholder="Goal title"
          />
          <Input
            value={draft.category}
            onChange={(v) => setDraft({ ...draft, category: v })}
            placeholder="Category"
          />
          <Input
            value={draft.target}
            onChange={(v) => setDraft({ ...draft, target: v })}
            type="date"
          />
          <Input
            value={draft.priority}
            onChange={(v) => setDraft({ ...draft, priority: v })}
            options={PRIORITIES}
          />
          <Input
            value={draft.progress}
            onChange={(v) => setDraft({ ...draft, progress: v })}
            type="number"
            min="0"
            max="100"
          />
          <Button variant="primary" onClick={add}>
            <Plus size={16} /> Add
          </Button>
        </div>
      </Card>
      <CardGrid>
        {goals.map((goal) => (
          <Card key={goal.id}>
            <div className="card-head">
              <h3>{goal.title}</h3>
              <Pill color={PRIORITY_COLOR[goal.priority]}>{goal.priority}</Pill>
            </div>
            <div className="meta-line">
              {goal.category} - target {goal.target}
            </div>
            <div className="progress">
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: Math.min(100, +goal.progress || 0) + "%" }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
            <div className="split">
              <Input
                value={goal.status}
                onChange={(v) => update(goal.id, { status: v })}
                options={["In Progress", "Done", "Paused", "Cancelled"]}
              />
              <Input
                value={goal.progress}
                onChange={(v) =>
                  update(goal.id, {
                    progress: Math.max(0, Math.min(100, +v || 0)),
                  })
                }
                type="number"
                min="0"
                max="100"
              />
              <button
                className="icon-btn danger"
                onClick={() => setGoals(goals.filter((g) => g.id !== goal.id))}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="goal-ai">
              <Button onClick={() => breakInto(goal)} disabled={busyGoal === goal.id}>
                {busyGoal === goal.id ? "Thinking..." : <><Sparkles size={14} /> Break into tasks</>}
              </Button>
              {breakdownFor?.id === goal.id && (
                <span className={breakdownFor.error ? "goal-ai-msg err" : "goal-ai-msg"}>
                  {breakdownFor.error
                    ? "Couldn't generate tasks — try again."
                    : `Added ${breakdownFor.count} tasks to Today, linked to this goal.`}
                </span>
              )}
            </div>
          </Card>
        ))}
      </CardGrid>
    </div>
  );
}
