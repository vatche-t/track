import { useEffect } from "react";

export function useKeyboardShortcuts(tabs, setTab) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      const isEditable =
        target?.isContentEditable ||
        ["INPUT", "SELECT", "TEXTAREA"].includes(target?.tagName);
      if (isEditable) return;

      const index = Number(event.key);
      if (index >= 1 && index <= tabs.length) {
        event.preventDefault();
        setTab(tabs[index - 1][0]);
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setTab("tasks");
        window.setTimeout(
          () => document.querySelector("[data-new-task]")?.focus(),
          0,
        );
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tabs, setTab]);
}
