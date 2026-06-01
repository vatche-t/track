import { motion } from "framer-motion";
import { Pause, Play, TimerReset, X } from "lucide-react";
import { Button } from "../components/ui";

export function FocusBar({ timer, setTimer, tasks }) {
  const task = tasks.find((item) => item.id === timer.taskId);
  if (!timer.taskId && !timer.running) return null;
  const minutes = String(Math.floor(timer.seconds / 60)).padStart(2, "0");
  const seconds = String(timer.seconds % 60).padStart(2, "0");
  return (
    <motion.div
      className={timer.running ? "focus-bar running" : "focus-bar"}
      initial={{ y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 90, opacity: 0 }}
    >
      <div>
        <span>{timer.mode === "work" ? "Focus" : "Break"}</span>
        <strong>{task?.title || "Untitled focus"}</strong>
      </div>
      <time>
        {minutes}:{seconds}
      </time>
      <div className="actions">
        <Button
          variant="primary"
          onClick={() =>
            setTimer((current) => ({ ...current, running: !current.running }))
          }
        >
          {timer.running ? <Pause size={15} /> : <Play size={15} />}{" "}
          {timer.running ? "Pause" : "Start"}
        </Button>
        <Button
          onClick={() =>
            setTimer((current) => ({
              ...current,
              seconds: current.mode === "work" ? 1500 : 300,
              running: false,
            }))
          }
        >
          <TimerReset size={15} /> Reset
        </Button>
        <button
          className="icon-btn"
          onClick={() =>
            setTimer({
              running: false,
              seconds: 1500,
              mode: "work",
              taskId: null,
            })
          }
        >
          <X size={15} />
        </button>
      </div>
    </motion.div>
  );
}
