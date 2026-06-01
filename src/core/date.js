import { DAYS } from "./constants";

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const localDate = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
export const monthKey = () => localDate().slice(0, 7);
export const fmt = (n) =>
  (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
export const money = (n) =>
  `${Number(n) < 0 ? "-" : ""}$${fmt(Math.abs(Number(n) || 0))}`;
export const dayName = (date = new Date()) => DAYS[(date.getDay() + 6) % 7];
export const parseDate = (iso) => new Date(`${iso}T00:00:00`);
export const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
export const startOfWeekISO = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() + 6) % 7;
  return localDate(addDays(d, -diff));
};
export const dateRange = (startISO, count = 7) =>
  Array.from({ length: count }, (_, i) =>
    localDate(addDays(parseDate(startISO), i)),
  );

export const sum = (items, key) =>
  items.reduce((total, item) => total + (+item[key] || 0), 0);
export const orderedTasks = (items) =>
  [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const activeTask = (task) =>
  task.status !== "Done" && task.status !== "Cancelled";
export const inWeek = (date, weekStart) => {
  const days = new Set(dateRange(weekStart));
  return days.has(date);
};
export const submitOnEnter = (submit) => (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
};
export const habitStreak = (habit, from = localDate()) => {
  let streak = 0;
  let cursor = parseDate(from);
  while (habit.log?.[localDate(cursor)]) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
};
export const isMonday = () => dayName() === "Mon";
export const lastWeekISO = () =>
  startOfWeekISO(addDays(parseDate(startOfWeekISO()), -7));
export const fallbackVerse = {
  text: "Commit your work to the Lord, and your plans will be established.",
  reference: "Proverbs 16:3",
};
export const cleanVerseText = (text) => {
  const withoutTags = String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
  const textarea = document.createElement("textarea");
  textarea.innerHTML = withoutTags;
  return textarea.value;
};
export const normalizeVerse = (verse) => ({
  text: cleanVerseText(verse?.text || fallbackVerse.text),
  reference: verse?.reference || fallbackVerse.reference,
});
