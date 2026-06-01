import { useState } from "react";
import {
  Check,
  CheckSquare,
  GripVertical,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  Button,
  Card,
  CardGrid,
  Empty,
  Input,
  MotionCheck,
  Pill,
  SectionTitle,
  Textarea,
} from "../components/ui";
import {
  CATEGORY_OPTIONS,
  DAYS,
  PRIORITIES,
  PRIORITY_COLOR,
  STATUSES,
} from "../core/constants";
import {
  dayName,
  localDate,
  orderedTasks,
  submitOnEnter,
  uid,
} from "../core/date";

export function TasksTab({
  tasks,
  setTasks,
  recurringTemplates,
  setRecurringTemplates,
  startFocus,
}) {
  const [draft, setDraft] = useState({
    title: "",
    date: localDate(),
    category: "Work",
    priority: "Medium",
    est: 30,
    actual: 0,
  });
  const [template, setTemplate] = useState({
    title: "",
    category: "Work",
    priority: "Medium",
    est: 30,
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  });
  const [showRecurring, setShowRecurring] = useState(false);
  const [spawnMsg, setSpawnMsg] = useState("");
  const today = localDate();
  const todayTasks = tasks.filter((task) => task.date === today);
  const otherTasks = tasks.filter((task) => task.date !== today);
  const addTask = () => {
    if (!draft.title.trim()) return;
    setTasks([
      {
        id: uid(),
        order: Date.now(),
        status: "To Do",
        recurring: false,
        notes: "",
        subtasks: [],
        ...draft,
        est: +draft.est || 0,
        actual: +draft.actual || 0,
      },
      ...tasks,
    ]);
    setDraft({
      title: "",
      date: draft.date,
      category: draft.category,
      priority: "Medium",
      est: 30,
      actual: 0,
    });
  };
  const updateTask = (id, patch) =>
    setTasks(
      tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    );
  const deleteTask = (id) => setTasks(tasks.filter((task) => task.id !== id));
  const moveTask = (dragId, overId) => {
    if (!dragId || dragId === overId) return;
    const ordered = [...tasks];
    const from = ordered.findIndex((task) => task.id === dragId);
    const to = ordered.findIndex((task) => task.id === overId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setTasks(ordered.map((task, index) => ({ ...task, order: index })));
  };
  const toggleTemplateDay = (day) =>
    setTemplate((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((d) => d !== day)
        : [...current.days, day],
    }));
  const addTemplate = () => {
    if (!template.title.trim() || !template.days.length) return;
    setRecurringTemplates([
      { id: uid(), ...template, est: +template.est || 0 },
      ...recurringTemplates,
    ]);
    setTemplate({
      title: "",
      category: "Work",
      priority: "Medium",
      est: 30,
      days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    });
  };
  const spawnRecurring = () => {
    const due = recurringTemplates.filter((t) => t.days.includes(dayName()));
    const existing = new Set(
      tasks
        .filter((task) => task.date === today)
        .map((task) => task.templateId || task.title + "|" + task.category),
    );
    const newTasks = due
      .filter(
        (t) => !existing.has(t.id) && !existing.has(t.title + "|" + t.category),
      )
      .map((t) => ({
        id: uid(),
        templateId: t.id,
        order: Date.now(),
        date: today,
        title: t.title,
        category: t.category,
        priority: t.priority,
        status: "To Do",
        est: +t.est || 0,
        actual: 0,
        notes: "",
        subtasks: [],
        recurring: true,
      }));
    if (newTasks.length) setTasks([...newTasks, ...tasks]);
    setSpawnMsg(
      newTasks.length
        ? "Added " +
            newTasks.length +
            " recurring task" +
            (newTasks.length === 1 ? "" : "s") +
            "."
        : "No due recurring tasks to add.",
    );
  };
  return (
    <div>
      <SectionTitle
        title="Daily Tasks"
        icon={<CheckSquare />}
        action={
          <div className="actions">
            <span className="soft-label">
              {todayTasks.filter((t) => t.status === "Done").length}/
              {todayTasks.length} done today
            </span>
            <Button onClick={spawnRecurring}>
              <RefreshCw size={16} /> Spawn Today
            </Button>
            <Button
              variant={showRecurring ? "primary" : "ghost"}
              onClick={() => setShowRecurring(!showRecurring)}
            >
              Manage Recurring
            </Button>
          </div>
        }
      />
      {spawnMsg && <div className="notice">{spawnMsg}</div>}
      {showRecurring && (
        <Card className="accent">
          <div className="card-head">
            <h3>Recurring Templates</h3>
            <span>Choose repeat days, then spawn due items each morning.</span>
          </div>
          <div
            className="form-grid template-grid"
            onKeyDown={submitOnEnter(addTemplate)}
          >
            <Input
              value={template.title}
              onChange={(v) => setTemplate({ ...template, title: v })}
              placeholder="Template title"
            />
            <Input
              value={template.category}
              onChange={(v) => setTemplate({ ...template, category: v })}
              options={CATEGORY_OPTIONS}
            />
            <Input
              value={template.priority}
              onChange={(v) => setTemplate({ ...template, priority: v })}
              options={PRIORITIES}
            />
            <Input
              value={template.est}
              onChange={(v) => setTemplate({ ...template, est: v })}
              type="number"
              min="0"
            />
            <Button variant="primary" onClick={addTemplate}>
              <Plus size={16} /> Add
            </Button>
          </div>
          <div className="day-row">
            {DAYS.map((day) => (
              <button
                key={day}
                className={template.days.includes(day) ? "day active" : "day"}
                onClick={() => toggleTemplateDay(day)}
              >
                {day}
              </button>
            ))}
          </div>
          <div className="stack">
            {recurringTemplates.map((item) => (
              <div className="recurring-row" key={item.id}>
                <RefreshCw size={15} />
                <strong>{item.title}</strong>
                <Pill>{item.category}</Pill>
                <Pill color={PRIORITY_COLOR[item.priority]}>
                  {item.priority}
                </Pill>
                <span>{item.days.join(", ")}</span>
                <button
                  className="icon-btn danger"
                  onClick={() =>
                    setRecurringTemplates(
                      recurringTemplates.filter((t) => t.id !== item.id),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {!recurringTemplates.length && (
              <Empty>No recurring templates yet.</Empty>
            )}
          </div>
        </Card>
      )}
      <Card>
        <div className="form-grid task-grid" onKeyDown={submitOnEnter(addTask)}>
          <Input
            data-new-task
            value={draft.title}
            onChange={(v) => setDraft({ ...draft, title: v })}
            placeholder="New task"
          />
          <Input
            value={draft.date}
            onChange={(v) => setDraft({ ...draft, date: v })}
            type="date"
          />
          <Input
            value={draft.category}
            onChange={(v) => setDraft({ ...draft, category: v })}
            options={CATEGORY_OPTIONS}
          />
          <Input
            value={draft.priority}
            onChange={(v) => setDraft({ ...draft, priority: v })}
            options={PRIORITIES}
          />
          <Input
            value={draft.est}
            onChange={(v) => setDraft({ ...draft, est: v })}
            type="number"
            min="0"
          />
          <Input
            value={draft.actual}
            onChange={(v) => setDraft({ ...draft, actual: v })}
            type="number"
            min="0"
          />
          <Button variant="primary" onClick={addTask}>
            <Plus size={16} /> Add
          </Button>
        </div>
      </Card>
      <TaskList
        title="Today"
        tasks={todayTasks}
        updateTask={updateTask}
        deleteTask={deleteTask}
        moveTask={moveTask}
        startFocus={startFocus}
      />
      <TaskList
        title="Scheduled / Earlier"
        tasks={otherTasks}
        updateTask={updateTask}
        deleteTask={deleteTask}
        moveTask={moveTask}
        startFocus={startFocus}
      />
      {!tasks.length && <Empty>No tasks yet.</Empty>}
    </div>
  );
}

export function TaskList({
  title,
  tasks,
  updateTask,
  deleteTask,
  moveTask,
  startFocus,
}) {
  if (!tasks.length) return null;
  return (
    <div className="block">
      <div className="eyebrow">{title}</div>
      <CardGrid className="stack">
        {orderedTasks(tasks).map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            updateTask={updateTask}
            deleteTask={deleteTask}
            moveTask={moveTask}
            startFocus={startFocus}
          />
        ))}
      </CardGrid>
    </div>
  );
}

export function TaskRow({
  task,
  updateTask,
  deleteTask,
  moveTask,
  startFocus,
}) {
  const [expanded, setExpanded] = useState(false);
  const [subtaskText, setSubtaskText] = useState("");
  const subtasks = task.subtasks || [];
  const addSubtask = () => {
    if (!subtaskText.trim()) return;
    updateTask(task.id, {
      subtasks: [
        ...subtasks,
        { id: uid(), title: subtaskText.trim(), done: false },
      ],
    });
    setSubtaskText("");
  };
  return (
    <Card
      className="task-row"
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => moveTask(e.dataTransfer.getData("text/plain"), task.id)}
    >
      <button className="icon-btn drag" title="Drag to reorder">
        <GripVertical size={16} />
      </button>
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
      <div className="task-main" onClick={() => setExpanded(!expanded)}>
        <strong className={task.status === "Done" ? "complete" : ""}>
          {task.recurring && <RefreshCw size={14} />}
          {task.title}
        </strong>
        <span>
          {task.date} - {task.est || 0}m planned - {task.actual || 0}m actual -{" "}
          {subtasks.filter((s) => s.done).length}/{subtasks.length} subtasks
        </span>
      </div>
      <Pill>{task.category}</Pill>
      <Pill color={PRIORITY_COLOR[task.priority]}>{task.priority}</Pill>
      <Input
        value={task.date}
        onChange={(v) => updateTask(task.id, { date: v })}
        type="date"
      />
      <Input
        value={task.status}
        onChange={(v) => updateTask(task.id, { status: v })}
        options={STATUSES}
      />
      <Button title="Focus on this task" onClick={() => startFocus(task.id)}>
        <Play size={14} />
      </Button>
      <button className="icon-btn danger" onClick={() => deleteTask(task.id)}>
        <Trash2 size={16} />
      </button>
      {expanded && (
        <div className="task-detail">
          <Textarea
            value={task.notes || ""}
            onChange={(v) => updateTask(task.id, { notes: v })}
            rows={3}
            placeholder="Task notes"
          />
          <div className="subtask-add" onKeyDown={submitOnEnter(addSubtask)}>
            <Input
              value={subtaskText}
              onChange={setSubtaskText}
              placeholder="Add subtask"
            />
            <Button onClick={addSubtask}>
              <Plus size={15} /> Add
            </Button>
          </div>
          <div className="stack">
            {subtasks.map((subtask) => (
              <div className="subtask-row" key={subtask.id}>
                <button
                  className={subtask.done ? "check done" : "check"}
                  onClick={() =>
                    updateTask(task.id, {
                      subtasks: subtasks.map((s) =>
                        s.id === subtask.id ? { ...s, done: !s.done } : s,
                      ),
                    })
                  }
                >
                  {subtask.done && <Check size={14} />}
                </button>
                <span className={subtask.done ? "complete" : ""}>
                  {subtask.title}
                </span>
                <button
                  className="icon-btn danger"
                  onClick={() =>
                    updateTask(task.id, {
                      subtasks: subtasks.filter((s) => s.id !== subtask.id),
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
