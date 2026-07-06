import { useMemo } from "react";
import { CheckCircle2, Circle, Route } from "lucide-react";
import { Card, SectionTitle } from "../components/ui";
import { localDate } from "../core/date";

const TRACK_META = {
  "AWS Certifications": { emoji: "☁️", color: "#38bdf8" },
  "Hardware / Edge-AI": { emoji: "🤖", color: "#34d4a4" },
  "Fat Loss": { emoji: "💪", color: "#e9c46a" },
};

const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

// Days until target (negative = overdue).
const daysTo = (iso, today) => Math.round((new Date(iso) - new Date(today)) / 86400000);

export function RoadmapTab({ roadmap = [], setRoadmap }) {
  const today = localDate();

  const groups = useMemo(() => {
    const order = [];
    const map = {};
    roadmap.forEach((m) => {
      if (!map[m.track]) { map[m.track] = []; order.push(m.track); }
      map[m.track].push(m);
    });
    return order.map((track) => {
      const items = map[track].slice().sort((a, b) => (a.target || "").localeCompare(b.target || ""));
      const done = items.filter((i) => i.done).length;
      return { track, items, done, total: items.length };
    });
  }, [roadmap]);

  const totalDone = roadmap.filter((m) => m.done).length;

  const toggle = (id) =>
    setRoadmap((prev) => prev.map((m) => (m.id === id ? { ...m, done: !m.done } : m)));

  // The next unchecked milestone across everything, by date.
  const nextUp = useMemo(
    () => roadmap.filter((m) => !m.done).slice().sort((a, b) => (a.target || "").localeCompare(b.target || ""))[0],
    [roadmap],
  );

  return (
    <div className="roadmap-tab">
      <SectionTitle
        icon={<Route size={20} />}
        title="Roadmap"
        action={<span className="rm-overall">{totalDone} / {roadmap.length} done</span>}
      />
      <p className="rm-sub">Your researched path to end of 2026 and beyond — tick a step as you finish it.</p>

      {nextUp && (
        <div className="rm-next">
          <span className="rm-next-label">Next up</span>
          <div className="rm-next-body">
            <strong>{nextUp.title}</strong>
            <small>{TRACK_META[nextUp.track]?.emoji} {nextUp.track} · target {fmtDate(nextUp.target)}</small>
          </div>
        </div>
      )}

      {groups.map(({ track, items, done, total }) => {
        const meta = TRACK_META[track] || { emoji: "•", color: "#8a8aa8" };
        const pct = total ? Math.round((done / total) * 100) : 0;
        return (
          <Card key={track} className="rm-card">
            <div className="rm-head">
              <h3><span className="rm-emoji">{meta.emoji}</span> {track}</h3>
              <div className="rm-progress">
                <span>{done}/{total}</span>
                <div className="rm-bar"><i style={{ width: `${pct}%`, background: meta.color }} /></div>
              </div>
            </div>
            <ul className="rm-list">
              {items.map((m) => {
                const dd = daysTo(m.target, today);
                const state = m.done ? "done" : dd < 0 ? "overdue" : dd <= 21 ? "soon" : "future";
                return (
                  <li key={m.id} className={`rm-item ${state}`}>
                    <button className="rm-check" onClick={() => toggle(m.id)} aria-label={m.done ? "Mark not done" : "Mark done"}>
                      {m.done ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                    </button>
                    <div className="rm-item-body">
                      <span className="rm-title">{m.title}</span>
                      {m.note ? <small className="rm-note">{m.note}</small> : null}
                    </div>
                    <span className="rm-date">
                      {fmtDate(m.target)}
                      {!m.done && dd >= 0 && dd <= 21 ? <em> · {dd}d</em> : null}
                      {!m.done && dd < 0 ? <em className="late"> · overdue</em> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
