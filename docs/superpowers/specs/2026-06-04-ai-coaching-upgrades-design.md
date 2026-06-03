# Design: AI Coaching Upgrades (trend-aware, proactive, explanatory)

**Date:** 2026-06-04
**Status:** Approved by user (chose all three items)

## Goal

Make the AI stop being "this-month-only and click-only." Three upgrades:

1. **Multi-month trend awareness** — feed `monthlySeries` into the advice + analytics
   prompts so the AI can spot trends ("eating-out up 18% over 3 months").
2. **Proactive spend nudge** — when a logged expense pushes the day past the safe
   daily spend, show an instant deterministic banner + a one-line AI enrichment
   (AI fired only on threshold cross, not on every log — avoids latency/token spam).
3. **Waterfall narration** — a "Why this order?" action that has the AI explain, in
   plain words, why goal sequencing funds Emergency before House, etc.

## Changes

### `src/core/finance.js`
- Add `spendNudge(finance, spendingCap, monthKeyArg?)` → `{ over, spentToday, safeDaily, overBy }`.
  - `safeDaily` = adaptive: `(spendingCap − spentBeforeToday) / daysRemaining` (matches the
    forecast card's logic), floored at 0.
  - `spentToday` = sum of today's logged expenses (current month only).
  - `over` = `spentToday > safeDaily && safeDaily > 0`; `overBy = spentToday − safeDaily`.
- Unit-tested.

### `src/core/groq.js`
- `getFinancialAdvice(...)` gains `series` param. When ≥2 months present, add a
  "RECENT MONTHS (oldest→newest)" section (label, spent, net, discretionary per month)
  and a rule: *call out any category or net trend across months before single-month tips.*
- `askFinanceAnalyticsQuestion(...)` gains the same `series` section (cheap, improves answers).
- New `getSpendNudge({ spentToday, safeDaily, overBy, note, categoryName, exchange })` →
  **one** sentence, ≤60 words, max ~160 tokens, temp 0.3. Friendly, specific, no shaming.
- New `explainWaterfall({ suggestion, savings, exchange })` → 2–3 sentences explaining the
  funding order (stability → time-sensitive → wealth), referencing the actual goal names.

### `src/core/finance.js` AI model
- `normalizeAi` gains a `waterfall` field (persist the explanation like forecast/advice/split).

### `src/features/FinanceTab.jsx`
- **#1:** `AiAdviceModal` passes `series: monthlySeries(model, 6)` to `getFinancialAdvice`.
- **#2:** after `addExpense` for a normal expense (not "money in"), compute `spendNudge`;
  if `over`, set ephemeral `nudge` state → render a banner in the Spend tab immediately,
  then fire `getSpendNudge` and append the AI sentence when it resolves. Dismissible.
- **#3:** `RecommendedSplitCard` gets a "Why this order?" button → calls `explainWaterfall`,
  persists to `model.ai.waterfall`, renders below the split with a timestamp.

### `src/features/AnalyticsTab.jsx`
- `FinanceAiAnalyst` passes `series: monthlySeries(finance, 6)` into
  `askFinanceAnalyticsQuestion`.

## Error handling
- All AI calls already degrade through `/api/groq`; nudge AI failure leaves the
  deterministic banner intact (no error shown for the enrichment).
- Trend section only added when ≥2 months exist; otherwise prompts unchanged.

## Verification
- Unit test `spendNudge` (over / under / no-safe-budget cases).
- Build green; Playwright on dev: log an over-budget expense → banner appears;
  advice modal still returns; "Why this order?" renders an explanation. Zero console errors.

## Out of scope
- Persisting nudges across reloads (they're momentary alerts).
- Memory of whether the user acted on past advice.
