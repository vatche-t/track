import { useState } from "react";
import { Check, Plus, RefreshCw, Sunrise, Trash2 } from "lucide-react";
import { Button, Card, Input, MotionCheck, SectionTitle } from "../components/ui";
import { submitOnEnter, uid } from "../core/date";

export function RoutinesTab({ routines, setRoutines }) {
  const [draft, setDraft] = useState({
    name: "",
    time: "08:00",
    block: "Morning",
  });
  const blocks = ["Morning", "Afternoon", "Evening"];
  const add = () => {
    if (!draft.name.trim()) return;
    setRoutines([...routines, { id: uid(), ...draft, done: false }]);
    setDraft({ name: "", time: draft.time, block: draft.block });
  };
  return (
    <div>
      <SectionTitle
        title="Routines"
        icon={<Sunrise />}
        action={
          <Button
            onClick={() =>
              setRoutines(routines.map((r) => ({ ...r, done: false })))
            }
          >
            <RefreshCw size={16} /> Reset
          </Button>
        }
      />
      <Card>
        <div className="form-grid routine-grid" onKeyDown={submitOnEnter(add)}>
          <Input
            value={draft.name}
            onChange={(v) => setDraft({ ...draft, name: v })}
            placeholder="Routine item"
          />
          <Input
            value={draft.time}
            onChange={(v) => setDraft({ ...draft, time: v })}
            type="time"
          />
          <Input
            value={draft.block}
            onChange={(v) => setDraft({ ...draft, block: v })}
            options={blocks}
          />
          <Button variant="primary" onClick={add}>
            <Plus size={16} /> Add
          </Button>
        </div>
      </Card>
      <div className="cards-grid">
        {blocks.map((block) => {
          const items = routines
            .filter((r) => r.block === block)
            .sort((a, b) => a.time.localeCompare(b.time));
          if (!items.length) return null;
          return (
            <Card key={block}>
              <div className="card-head">
                <h3>{block}</h3>
                <span>
                  {items.filter((r) => r.done).length}/{items.length}
                </span>
              </div>
              <div className="stack">
                {items.map((item) => (
                  <div className="simple-row" key={item.id}>
                    <MotionCheck
                      className={item.done ? "check done" : "check"}
                      onClick={() =>
                        setRoutines(
                          routines.map((r) =>
                            r.id === item.id ? { ...r, done: !r.done } : r,
                          ),
                        )
                      }
                    >
                      {item.done && <Check size={14} />}
                    </MotionCheck>
                    <time>{item.time}</time>
                    <strong className={item.done ? "complete" : ""}>
                      {item.name}
                    </strong>
                    <button
                      className="icon-btn danger"
                      onClick={() =>
                        setRoutines(routines.filter((r) => r.id !== item.id))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
