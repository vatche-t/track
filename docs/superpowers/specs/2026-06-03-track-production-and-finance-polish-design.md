# Design: Production-Ready Tracker (Supabase + Auth) & Finance UI Polish

**Date:** 2026-06-03
**Status:** Approved (pending spec review)
**Author:** vatche + Claude

## 1. Goal

Take the local-only Tracker app to a production-ready, deployable state while polishing
the Finance experience. Two clusters of work, delivered as **one combined plan**:

- **Cluster A — Finance UI polish & bug fix** (frontend only):
  1. Rework the Spending Forecast chart into a smooth, animated Recharts chart.
  2. Move AI Financial Advice behind a button that opens a popup/modal.
  3. Fix the bug where AI-generated output disappears (it is never persisted).
- **Cluster B — Production backend** (architecture):
  4. Move all app data from browser localStorage/SQLite to Supabase Postgres.
  5. Add simple single-user email/password auth.
  6. Hide the Groq API key behind a serverless function.
  7. Deploy to Vercel.

## 2. Decisions (locked with user)

| Decision | Choice |
|---|---|
| Sequencing | One combined plan |
| Backend stack | **Supabase** (managed Postgres + built-in auth + RLS) |
| Auth scope | **Single user** (one private login, public signup disabled) |
| Forecast chart | **Animated Recharts** area/line |
| Groq key | **Server-side**, behind a `/api/groq` Vercel serverless function |
| Data scope | **All tabs** sync to cloud (tasks, habits, goals, routines, reviews, finance) |
| SPA ↔ DB | **Direct `supabase-js` from the browser, protected by RLS** (no custom API layer for data) |

Rationale for Supabase: data must survive 1+ year (free tier does not expire stored
rows), email/password auth is built in so "simple auth on Postgres" needs almost no
custom code, RLS makes the browser-resident anon key safe, and it deploys cleanly
alongside a Vite SPA on Vercel.

## 3. Architecture

```
Browser (Vite SPA on Vercel)
 ├─ supabase-js ──(RLS, anon key)──> Supabase Postgres   [all app data]
 │                                    └─ Supabase Auth     [email/password session]
 └─ fetch /api/groq ──(server key)──> Vercel Serverless ──> Groq API   [AI calls]
```

- **Data path:** direct browser → Supabase, guarded by Row-Level Security. No custom
  data API. Anon key is public/safe because RLS restricts every row to `auth.uid()`.
- **AI path:** browser → `/api/groq` (Vercel function holding `GROQ_API_KEY`) → Groq.
  The key never reaches the client bundle.

### 3.1 Data layer — keep the existing `store` interface

The app already routes all persistence through a tiny kv interface in
`src/core/storage.js`: `store.get(key, fallback)` / `store.set(key, value)`. We preserve
this interface exactly and swap the implementation.

**Supabase table `kv_store`:**

| column | type | notes |
|---|---|---|
| user_id | uuid | FK → auth.users.id, default `auth.uid()` |
| key | text | e.g. `pt_finance`, `pt_tasks` |
| value | jsonb | the serialized state blob |
| updated_at | timestamptz | default now() |

- Primary key: `(user_id, key)`.
- RLS policies: `select/insert/update/delete` allowed only when `user_id = auth.uid()`.

This mirrors the current local kv store 1:1, so consuming code
(`useTrackerData.js`, the tabs) changes minimally.

**New `store` behavior (write-through cache):**
- `get(key)`: if session present, read from Supabase; on network failure, fall back to
  localStorage cache; if still nothing, return fallback. Cache every successful read to
  localStorage.
- `set(key, value)`: write to localStorage immediately (instant UX), and write through to
  Supabase **debounced** (~500–800ms per key) to avoid hammering the DB on every keystroke.
- Without a session (logged out), behave exactly like today (localStorage only) — used
  during first-run before login.

### 3.2 Auth (single user)

- Add `@supabase/supabase-js`; create a single shared client in `src/core/supabase.js`.
- Public signup **disabled** in the Supabase dashboard; the one account is created once
  (dashboard or a one-time signup).
- `src/features/AuthGate.jsx` wraps `<App/>`: shows a minimal email/password login screen
  until a session exists; renders the app once authenticated. Includes a sign-out control
  (placed in the header).
- Session persistence handled by `supabase-js` (localStorage-backed) — survives reloads.

### 3.3 Migration of existing data (no data loss)

On first authenticated load:
1. Read all `kv_store` rows for the user from Supabase.
2. If cloud is **empty** for a given key but localStorage holds data, push local → cloud
   once (non-destructive seed). Never overwrite non-empty cloud data with local.
3. Existing JSON/Excel export (`ExportModal.jsx`) remains as a manual backup/restore path.

### 3.4 AI changes

**Serverless proxy (`/api/groq.js`):**
- Vercel serverless function. Reads `GROQ_API_KEY` from server env, forwards the
  `messages`/params payload to Groq's chat completions endpoint, returns the response.
- `src/core/groq.js` changes only its `chat()` transport: POST to `/api/groq` instead of
  `https://api.groq.com/...`. Prompt logic, models, and helpers are unchanged.
- `getKey()` / `VITE_GROQ_API_KEY` client lookup is removed.

**Persist AI outputs (fixes the "not showing" bug):**
- Add `finance.ai = { forecast, advice, split, generatedAt }` to the finance model
  (extend `normalizeFinance` defaults so it is always present).
- `SpendingForecastCard`, `AiAdviceCard`, `RecommendedSplitCard` read their text from
  `finance.ai` and write generated results back via `setFinance` (which persists through
  the store). They no longer rely on ephemeral local `useState` for the *result*.
- Each shows a "generated X ago" timestamp and a Refresh action.

**AI advice → modal:**
- New `src/components/Modal.jsx` (lightweight, framer-motion fade/scale, click-outside +
  Esc to close) — reused for any future popups.
- `AiAdviceCard` becomes a button ("AI Advice"); clicking opens the modal, which shows the
  last saved advice (or an empty state) plus a Refresh button. Generating writes to
  `finance.ai.advice`.

### 3.5 Spending forecast chart

- Replace the hand-rolled SVG (`FinanceTab.jsx:783-804`) with an animated Recharts
  `AreaChart`/`ComposedChart`:
  - **Ideal pace** line (cap spread evenly across the month).
  - **Actual cumulative** spend up to today, continuing as a **projected** line/area to
    month end (color shifts to red when over pace).
  - Gradient fill under actual, smooth `isAnimationActive` draw-in, tooltip on hover.
- Keep the existing stat tiles (`Spent so far / Projected / Safe per day / Cap`) and the
  insights row (`Remaining budget`, `Pace delta`). Tune spacing/visual polish.
- Cumulative actual series is derived from `model.expenses` for the current month
  (sum per day), not just the current two-point projection.

## 4. Components & files

**New:**
- `src/core/supabase.js` — Supabase client singleton.
- `src/features/AuthGate.jsx` — login screen + session gate.
- `src/components/Modal.jsx` — reusable modal.
- `api/groq.js` — Vercel serverless Groq proxy.
- `supabase/schema.sql` — `kv_store` table + RLS policies (checked into repo).
- `.env.example`, `vercel.json` (if needed for SPA routing/functions).

**Modified:**
- `src/core/storage.js` — Supabase-backed write-through store.
- `src/core/groq.js` — call `/api/groq`; drop client key.
- `src/core/finance.js` — add `ai` field to `normalizeFinance`.
- `src/features/FinanceTab.jsx` — Recharts forecast, persisted AI, advice modal.
- `src/hooks/useTrackerData.js` — first-login migration seed; load after auth.
- `src/main.jsx` / `src/App.jsx` — wrap in `AuthGate`; add sign-out to header.

## 5. Environment & deployment

- **Env vars (Vercel):**
  - `VITE_SUPABASE_URL` (public)
  - `VITE_SUPABASE_ANON_KEY` (public; safe under RLS)
  - `GROQ_API_KEY` (server-only; used by `/api/groq`)
- **Deploy:** Vite build → Vercel static output + serverless `/api`. Vercel clones the repo
  to a clean path, so the local Windows `%`-path workaround in `vite.config.js` is inert in
  CI (no change needed, but verify the build).
- `supabase/schema.sql` is applied once to the Supabase project (SQL editor or CLI).

## 6. Error handling

- **Offline / Supabase unreachable:** reads fall back to localStorage cache; writes queue to
  localStorage and retry on next successful `set`. App stays usable offline; data reconciles
  when back online (last-write-wins per key — acceptable for single user).
- **Auth expired:** `AuthGate` detects missing session and returns to login without losing
  local cache.
- **Groq/`/api/groq` failure:** surfaced inline in the relevant card/modal (existing error
  UI pattern), AI output simply not updated.
- **Migration safety:** seed is non-destructive (only writes when cloud key is empty).

## 7. Testing & verification

The project currently has **no automated test suite**. To keep scope sane we focus tests on
the data-loss-risk areas:

- Unit-test the new `store` write-through/fallback logic (mock Supabase + localStorage):
  cloud read, offline fallback, debounced write, non-destructive migration seed.
- Manual verification checklist: login/logout, data survives reload and a second device,
  forecast chart renders + animates, AI advice modal persists across reloads, Groq key
  absent from the built client bundle, Vercel deploy serves app + `/api/groq`.

## 8. Out of scope (YAGNI)

- Multi-user accounts / signup flow / per-user onboarding.
- Real-time multi-device live sync (write-through + reload is enough for one user).
- Conflict resolution beyond last-write-wins.
- Migrating away from the kv-blob model to fully normalized finance tables.

## 9. Risks

- **Data loss during migration** — mitigated by non-destructive seed + existing export.
- **RLS misconfiguration** exposing data — mitigated by single-user scope + explicit policy
  tests before go-live.
- **Windows `%`-path build quirk** on Vercel — low risk (clean CI path), verified during
  first deploy.
