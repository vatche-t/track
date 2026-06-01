import { useEffect, useMemo, useState } from "react";
import { DEFAULTS } from "../core/defaults";
import { localDate } from "../core/date";
import { ensureStarterExpenses } from "../core/finance";
import { store } from "../core/storage";

const usePersistWhenLoaded = (loaded, key, value) => {
  useEffect(() => {
    if (loaded) store.set(key, value);
  }, [loaded, key, value]);
};

export function useTrackerData() {
  const [loaded, setLoaded] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [goals, setGoals] = useState([]);
  const [habits, setHabits] = useState([]);
  const [finance, setFinance] = useState(DEFAULTS.finance);
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [
        savedTasks,
        savedRecurringTemplates,
        savedRoutines,
        resetDate,
        savedGoals,
        savedHabits,
        savedFinance,
        savedReviews,
      ] = await Promise.all([
        store.get("pt_tasks", DEFAULTS.tasks),
        store.get("pt_recurring", DEFAULTS.recurringTemplates),
        store.get("pt_routines", DEFAULTS.routines),
        store.get("pt_routines_reset_date", ""),
        store.get("pt_goals", DEFAULTS.goals),
        store.get("pt_habits", DEFAULTS.habits),
        store.get("pt_finance", DEFAULTS.finance),
        store.get("pt_reviews", DEFAULTS.reviews),
      ]);

      if (cancelled) return;

      let nextRoutines = savedRoutines;
      if (resetDate !== localDate()) {
        nextRoutines = savedRoutines.map((routine) => ({
          ...routine,
          done: false,
        }));
        await Promise.all([
          store.set("pt_routines", nextRoutines),
          store.set("pt_routines_reset_date", localDate()),
        ]);
      }

      if (cancelled) return;
      setTasks(savedTasks);
      setRecurringTemplates(savedRecurringTemplates);
      setRoutines(nextRoutines);
      setGoals(savedGoals);
      setHabits(savedHabits);
      setFinance(ensureStarterExpenses(savedFinance));
      setReviews(savedReviews);
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  usePersistWhenLoaded(loaded, "pt_tasks", tasks);
  usePersistWhenLoaded(loaded, "pt_recurring", recurringTemplates);
  usePersistWhenLoaded(loaded, "pt_routines", routines);
  usePersistWhenLoaded(loaded, "pt_goals", goals);
  usePersistWhenLoaded(loaded, "pt_habits", habits);
  usePersistWhenLoaded(loaded, "pt_finance", finance);
  usePersistWhenLoaded(loaded, "pt_reviews", reviews);

  const data = useMemo(
    () => ({
      tasks,
      recurringTemplates,
      routines,
      goals,
      habits,
      finance,
      reviews,
    }),
    [tasks, recurringTemplates, routines, goals, habits, finance, reviews],
  );

  const setters = useMemo(
    () => ({
      tasks: setTasks,
      recurringTemplates: setRecurringTemplates,
      routines: setRoutines,
      goals: setGoals,
      habits: setHabits,
      finance: setFinance,
      reviews: setReviews,
    }),
    [],
  );

  return {
    loaded,
    data,
    setters,
    tasks,
    setTasks,
    recurringTemplates,
    setRecurringTemplates,
    routines,
    setRoutines,
    goals,
    setGoals,
    habits,
    setHabits,
    finance,
    setFinance,
    reviews,
    setReviews,
  };
}
