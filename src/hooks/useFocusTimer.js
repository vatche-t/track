import { useEffect, useState } from "react";

const WORK_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

export function useFocusTimer() {
  const [timer, setTimer] = useState({
    running: false,
    seconds: WORK_SECONDS,
    mode: "work",
    taskId: null,
  });

  const startFocus = (taskId) =>
    setTimer({
      running: true,
      seconds: WORK_SECONDS,
      mode: "work",
      taskId,
    });

  useEffect(() => {
    if (!timer.running) return undefined;
    const id = window.setInterval(() => {
      setTimer((current) => {
        if (!current.running) return current;
        if (current.seconds > 1) {
          return { ...current, seconds: current.seconds - 1 };
        }

        const nextMode = current.mode === "work" ? "break" : "work";
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(
            nextMode === "break" ? "Focus complete" : "Break complete",
            {
              body:
                nextMode === "break"
                  ? "Take a five minute reset."
                  : "Ready for another calm focus block.",
            },
          );
        }

        return {
          ...current,
          mode: nextMode,
          seconds: nextMode === "work" ? WORK_SECONDS : BREAK_SECONDS,
          running: false,
        };
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [timer.running]);

  useEffect(() => {
    if (
      "Notification" in window &&
      Notification.permission === "default" &&
      timer.running
    ) {
      Notification.requestPermission();
    }
  }, [timer.running]);

  return { timer, setTimer, startFocus };
}
