import { useState } from "react";
import { Check, Flame, Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, MotionCheck, SectionTitle } from "../components/ui";
import {
  dateRange,
  dayName,
  habitStreak,
  localDate,
  parseDate,
  startOfWeekISO,
  submitOnEnter,
  uid,
} from "../core/date";

export function HabitsTab({ habits, setHabits }) {
  const [name, setName] = useState("");
  const week = dateRange(startOfWeekISO());
  const add = () => {
    if (!name.trim()) return;
    setHabits([...habits, { id: uid(), name, target: 7, log: {} }]);
    setName("");
  };
  const toggle = (habitId, date) =>
    setHabits(
      habits.map((h) =>
        h.id === habitId
          ? { ...h, log: { ...h.log, [date]: !h.log?.[date] } }
          : h,
      ),
    );
  return (
    <div>
      <SectionTitle title="Habits" icon={<Flame />} />
      <Card>
        <div className="form-grid habit-add" onKeyDown={submitOnEnter(add)}>
          <Input value={name} onChange={setName} placeholder="New habit" />
          <Button variant="primary" onClick={add}>
            <Plus size={16} /> Add
          </Button>
        </div>
      </Card>
      <Card>
        <div className="habit-table">
          <div />
          {week.map((date) => (
            <div className="habit-date" key={date}>
              {dayName(parseDate(date))}
              <span>{date.slice(5)}</span>
            </div>
          ))}
          {habits.map((habit) => (
            <FragmentRow
              key={habit.id}
              habit={habit}
              week={week}
              habits={habits}
              setHabits={setHabits}
              toggle={toggle}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
function FragmentRow({ habit, week, habits, setHabits, toggle }) {
  return (
    <>
      <div className="habit-name">
        <div>
          <strong>{habit.name}</strong>
          <span>{habitStreak(habit)} day streak</span>
        </div>
        <Input
          value={habit.target || 7}
          onChange={(v) =>
            setHabits(
              habits.map((h) =>
                h.id === habit.id
                  ? { ...h, target: Math.max(1, Math.min(7, +v || 1)) }
                  : h,
              ),
            )
          }
          type="number"
          min="1"
          max="7"
          title="Weekly target"
        />
        <button
          className="icon-btn danger"
          onClick={() => setHabits(habits.filter((h) => h.id !== habit.id))}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {week.map((date) => (
        <MotionCheck
          key={date}
          className={habit.log?.[date] ? "habit-cell on" : "habit-cell"}
          onClick={() => toggle(habit.id, date)}
        >
          {habit.log?.[date] && <Check size={15} />}
        </MotionCheck>
      ))}
    </>
  );
}
