# Finance Overview + Split-Coach Redesign — Design

**Date:** 2026-06-13
**Status:** Approved (design); pending implementation plan
**Author:** Claude (with Vatche)

## Problem

The Finance **Overview** is the most important screen in the app, but a live review of
`track.vatche.me` (logged in, walked every view via Playwright) surfaced concrete problems:

1. **The Recommended Split — the app's core "tell me how to split my money" coach — is
   effectively broken.** Clicking **Ask AI** produced no visible output and no console error;
   the split has **no deterministic plain-language guidance**, so it relies entirely on an AI
   call that can silently return empty (the gpt-oss reasoning model returns empty `content`
   when the answer is short, and `chat()` throws an error that barely surfaces at the bottom of
   a long card). The card reads as a dense static breakdown that never says *how* to split.
2. **Overview information hierarchy is weak** at 16″ desktop — the page is a tall stack of
   cards with no clear hero, and the split (the thing the user most wants) is buried below the
   forecast.
3. **AI insights contradict live numbers.** Kai answered "you're well under your cap of
   1,050,000 AMD" — it mistook the *savings-transfer plan* for the *spending cap* (real cap =
   300,000), while the Forecast card simultaneously said "over pace, projected 516,120."
4. **Stale persisted AI** on the Forecast card showed a 10-day-old summary ("on track,
   projected 149,000, 27 days left") next to live stats saying over-pace / 516,120 / 17 days.
5. **"Wants −11,433 AMD"** — reimbursements push the Needs-vs-Wants bucket negative, reading as
   broken.
6. **"Savings plan / mo 1,050,000"** displayed flatly next to 523,000 income looks alarming
   (it's the sum of all funds' monthly targets, which exceeds income).
7. **A stray Recharts axis label ("0k" / "600k") leaks** to the document root and floats at the
   bottom of every finance view.

## Goal / North Star

When income arrives, the app proactively says: **"Hey Vatche, you received X — here's how to
split it,"** with a clear, always-correct, plain-English breakdown and a one-tap **Apply**. The
split divides **actual income received** this month (never promises money not in hand).

## Scope

In scope: the Finance **Overview** tab (`planMode === "overview"`) — KPI row, the new
**Split-Coach hero**, the Forecast card, and the Needs-vs-Wants card — plus the AI-grounding and
display-correctness fixes (#3–#7). Responsive for 16″ desktop and mobile (iPhone-13 class).

Out of scope (unchanged this pass): Spend/Setup/Goals/Wealth tabs (Spend was already rebuilt in
Phase 1), the docked Kai panel shell (already shipped — only its data payload changes), and the
OpenRouter provider switch (already shipped; activation is a Vercel env-var step for the user).

## Approved Design

### A. Layout (desktop 16″ → mobile)

Order, top to bottom:

1. **KPI row** — 4 cards: `Income received` (of planned), `Spent` (with "% of cap", red when
   over pace), `Net this month` (free to assign), `Saved so far` (across N goals).
   - Desktop: `grid-template-columns: repeat(4, 1fr)`. Mobile: 2×2.
   - **Replaces** the current "Savings plan / mo: 1,050,000" headline tile (fix #6). The
     savings-plan figure moves into context where it's explained (Setup / over-commit banner),
     not shown as a raw alarming KPI.
2. **Split-Coach hero** (full width) — see section B.
3. **Lower row** — Forecast (≈1.6fr) + Needs-vs-Wants (≈1fr). Desktop two-column; mobile stacks.

Mobile: all sections single-column; the Split-Coach hero stays near the top (just under KPIs).

### B. Split-Coach hero (style B — allocation bar + legend)

- **Greeting + headline:** "✦ Hey Vatche / You received {income} AMD — here's how to split it."
  When income is 0 for the month, headline becomes a neutral prompt ("Log this month's income
  to see your split").
- **Proportion bar:** a single horizontal stacked bar; segment widths = each allocation /
  income. Colors: spending card = amber, goals = green shades, flex = blue.
- **Legend:** one row per allocation — name, one-line reason (`small`), amount (right-aligned,
  tabular). Order = the existing `allocationSuggestion` waterfall (spending card → goals by
  priority → skills/fun → unassigned surplus).
- **Plain-English summary (deterministic, always present):** a generated sentence built from
  the allocation numbers — NOT from AI. Example: "57% protects your spending cap, 33% builds
  your Emergency fund (top empty goal), 10% guilt-free fun. Nothing unassigned." This is the
  core fix for #1 — the card always explains itself even when AI is unavailable.
- **Actions:** `→ Apply this split` (primary; writes contributions to goals as today's `Apply`
  does), `Why this order?` (existing `explainWaterfall`, optional AI), `Refine with AI`
  (existing `refineRecommendedSplit`, optional AI). AI results render inline **below** the
  deterministic summary and are clearly labeled/timestamped; **AI is enhancement, never the
  only content.** AI errors show as a small inline notice, not silent.
- **Reality pill:** a small status pill ("⚡ Over pace — projected {proj} vs {cap} cap" or "On
  track") so the coach is consistent with the Forecast (addresses #3 at the UI level).

### C. AI grounding fix (#3)

`askFinanceAnalyticsQuestion` and `refineRecommendedSplit` payloads must include the **spending
cap (300,000), projected month-end total, and the on-track/over-pace flag** (the same values the
Forecast computes), with explicit labels distinguishing **spending cap** from **savings
transfers**. Add a prompt rule: "The spending cap is the life cap; savings transfers are NOT a
spending limit — never conflate them." This stops Kai from calling 1,050,000 the cap.

### D. Stale-AI handling (#4)

Persisted AI summaries (forecast, split, advice) carry `generatedAt`. Treat a summary as stale
when **`generatedAt` is older than 24h**, OR when the current month differs from the month the
summary was generated in. When stale, render it **dimmed** with a "may be outdated — refresh"
affordance. Never show stale AI with the same visual weight as live deterministic numbers.
(Numeric-drift detection beyond the month check is out of scope for this pass — the 24h + month
rule is sufficient and unambiguous.)

### E. Needs-vs-Wants fix (#5)

Display `Wants = max(0, discretionarySpent)`; when reimbursements would make it negative, show 0
and a small note "(net of refunds)". Needs unchanged. Savings-rate calc unchanged.

### F. Chart-label leak fix (#7)

Find the Recharts element whose `tickFormatter` emits `${value/1000}k` and is escaping to the
document root (a stray label / mis-parented `<text>` or a tooltip leak). Contain it within the
chart's `ResponsiveContainer`. Verify on the live page the floating "0k/600k" node is gone.

## Components & Interfaces

- **`SplitCoachCard`** (new, replaces `RecommendedSplitCard`): props `{ income, totals,
  model, suggestion, applySuggestion, displayCurrency, exchange, setFinance }`.
  - Pure-render from `suggestion` (already computed by `allocationSuggestion`) — no new math in
    the component beyond percentages and the deterministic summary string.
  - New helper `splitSummarySentence(suggestion, income)` in `core/finance.js` (unit-tested):
    returns the plain-English string from allocation amounts. Deterministic, no AI.
- **`SpendingForecastCard`** (existing): unchanged math; fix label leak; expose `cap`,
  `projectedTotal`, `onTrack` so the hero's reality pill and the AI payload can reuse them
  (lift these into the parent `FinanceTab` so both the hero and forecast read one source).
- **`NeedsWantsCard`** (existing): floor Wants at 0.
- **`core/groq.js`**: extend `askFinanceAnalyticsQuestion` + `refineRecommendedSplit` data
  blocks with cap/projection/pace + the disambiguation rule.
- **KPI row**: inline in `FinanceTab` overview branch; drop the savings-plan headline tile.

## Data Flow

`finance` → `normalizeFinance` → `financeTotals` (already month-scoped) and
`allocationSuggestion(income, savings)` → `FinanceTab` computes forecast values (cap, projected,
onTrack) once → passes to both `SplitCoachCard` (hero) and `SpendingForecastCard`. Apply writes
per-goal contributions via the existing `applySuggestion` path (unchanged).

## Error Handling

- AI calls: on throw/empty, show a small inline "AI unavailable — showing the calculated split"
  notice; the deterministic content remains. Never blank the card.
- Income = 0: neutral prompt, no bar, Apply disabled.
- No goals configured: hero shows spending card + flex + an "add a goal to put the rest to work"
  nudge instead of an empty waterfall.

## Testing

- **Unit (vitest):** `splitSummarySentence` (normal split, all-to-one-goal, surplus unassigned,
  zero income); `Wants` flooring with a reimbursement that would go negative; AI payload builder
  includes cap/projected/pace fields.
- **Runtime (Playwright, read-only on prod, no writes):** Overview renders KPI row + hero +
  lower row; hero shows the deterministic summary with AI **off**; "Refine with AI" renders
  inline labeled text; no floating "0k/600k" node; console error-free. (Apply is NOT exercised
  against cloud data.)

## Responsive

- KPI row: 4-up desktop, 2-up mobile.
- Hero body: 2-col (legend | summary+actions) desktop, single-col mobile; bar full width both.
- Lower row: 2-col desktop, stacked mobile.
- Reuse existing 900px / 560px breakpoints in `AppStyles.jsx`.

## Risks / Notes

- Replacing `RecommendedSplitCard` touches a large component file; keep the new card a focused,
  self-contained function and move the summary math to `core/finance.js` for testability.
- Do not pollute real cloud data during verification (add-then-nothing; never click Reset/Apply
  on prod during review).
