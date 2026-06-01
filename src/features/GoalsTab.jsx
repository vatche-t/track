import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Target, Trash2 } from "lucide-react";
import { Button, Card, CardGrid, Input, Pill, SectionTitle } from "../components/ui";
import { PRIORITIES, PRIORITY_COLOR } from "../core/constants";
import { localDate, submitOnEnter, uid } from "../core/date";

export function GoalsTab({ goals, setGoals }) {
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
          </Card>
        ))}
      </CardGrid>
    </div>
  );
}
