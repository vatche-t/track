# Design: Track (Productivity) Coaching + AI

**Date:** 2026-06-04
**Status:** Approved by user (verse=fix; all 4 AI features; AI + Top-3 + goal links)

## Goal

Bring the same coaching depth we built for Finance to the productivity side: fix the
verse card, add real planning structure (Top 3 MITs + goal→task links), and add four AI
coaches. Track data already persists to Supabase (confirmed: `pt_tasks`, `pt_goals`,
`pt_habits`, `pt_routines`, `pt_recurring`, `pt_reviews`).

## Locked decisions
- Verse: **fix it** — reliable daily Bible verse via a server-side proxy (keep cross).
- AI features: **all four** — Daily Planner (Top 3), Weekly Review coach, Goal→tasks, habit nudge.
- Structure: **AI + Top-3 MITs + goal→task links**.

## Phases

### T1 — Verse fix (server-side proxy)
- `api/verse.js`: Vercel serverless fn; fetches `labs.bible.org/api/?passage=votd&type=json&formatting=plain`
  server-side (no browser CORS), returns `{ text, reference }`; tolerant of failure.
- `useBibleVerse` calls `/api/verse` instead of the third-party host directly. Keeps the
  date cache (`pt_bible_<date>`) and fallback verse. In local-only mode (no `/api`),
  the existing fallback still applies.

### T2 — Structure: Top 3 MITs + goal links
- **Task model:** add optional `goalId` (links to a goal) and `mit` (boolean, "most
  important task today"). Backward compatible — absent on old tasks.
- **TodayTab:**
  - A "Top 3 today" card at the top: shows tasks flagged `mit` for today (max 3),
    with check + focus. Each today task gets a star toggle to set/clear MIT (cap 3/day).
  - Linked goal name shown as a chip on a task when `goalId` is set.
- **TasksTab:** task editor gains a "Goal" selector (none / each goal title) writing `goalId`.

### T3 — Track AI (4 coaches) — `src/core/groq.js`
- `getDailyPlan({ tasks, overdue, goals, habits, date })` → picks **Top 3** for today with a
  one-line why each. Grounded in the real task/goal list; never invents tasks.
- `getWeeklyReviewSummary({ weekTasks, habits, goals })` → 3-4 sentence summary + one
  pattern + one concrete adjustment.
- `breakdownGoal({ goal })` → 3-5 concrete, schedulable next tasks (short titles).
- `getHabitNudge({ habit, streak, missedDays })` → one encouraging sentence + a
  habit-stacking tip. No shaming.

**UI wiring:**
- **TodayTab:** "Plan my day" button → `getDailyPlan` → shows suggested Top 3; "Apply" marks
  those tasks `mit`. Ephemeral result (re-plan daily).
- **WeeklyReviewTab:** "AI summary" button → `getWeeklyReviewSummary`; can be saved into the
  review record's notes.
- **GoalsTab:** per-goal "Break into tasks" button → `breakdownGoal` → creates tasks dated
  today with `goalId` set, then confirms.
- **HabitsTab:** when a habit's streak is 0 but it has history, show a small "AI nudge"
  affordance → `getHabitNudge`.

All AI calls reuse the proven `/api/groq` transport. Track AI outputs stay ephemeral
(component state) except goal-breakdown (creates real persisted tasks) and weekly summary
(optionally saved to the review).

## Mobile
- New cards/sections reuse existing responsive classes (stack on mobile, 16px inputs).

## Error handling
- Verse: proxy failure → fallback verse (unchanged behavior).
- AI: failures surface inline per existing pattern; no data written on failure.

## Verification
- `spendNudge`-style unit test not needed (mostly UI/prompts); add a small test for the
  MIT cap helper if logic warrants.
- Build green; Playwright on dev: star a task → appears in Top 3 (cap at 3); "Plan my day"
  button present; goal "Break into tasks" creates tasks; verse proxy returns on prod.

## Out of scope
- Auto goal-progress from linked task completion (could come later).
- Persisting daily AI plans across reloads.
