# Friendlier Charts, Tables & AI Alerts — Design + Plan (Phase 3)

**Date:** 2026-06-13
**Status:** Approved direction (all four areas); building in slices.

## North star (from research)
**The headline is a sentence, not a metric.** Lead every chart/panel with a generated
plain-language takeaway; the chart becomes supporting evidence. Alerts cite the numbers + the
driver, come in severity tiers, and are dismissible. Tone = supportive coach, never scold.

## Foundation: `src/core/coach.js` (pure, unit-tested)
A deterministic copy + insight engine reused by chart takeaways AND the alert system (so both
work with zero AI dependency; AI is optional enrichment).

- `chartTakeaway(kind, data)` → plain sentence per chart:
  - `forecast`: "You're on pace to spend ~516k vs your 300k cap — about 18% over." / "On track…"
  - `trend`: "You spent 12% more than last month." / "Spending is steady vs last month."
  - `category`: "Dining is your biggest category at 38% of spend."
  - `variance`: "You're under plan on everything except Variable."
- `buildInsights(model, totals, fc)` → array of `{ id, severity: 'high'|'med'|'low', icon, title,
  body, action? }`, each citing numbers + driver. Rules:
  - high: projected over cap (over-pace), or net negative this month.
  - med: a category > 1.5× its share-of-norm (anomaly); approaching cap (>90%).
  - low: savings milestone (a fund crossed 25/50/75/100%); new-month greeting; weekly recap.
- Coaching copy templates: on-track / over-pace / big one-off / milestone / new-month — short,
  numeric, non-judgmental, offer a choice.

## Slice 1 (this build): takeaways + comparative forecast + insight banner
1. `coach.js` with `chartTakeaway` + `buildInsights` + tests.
2. Plain-language `<h3>`/caption takeaway above: Spending Forecast (FinanceTab), Monthly Trend,
   Budget Variance, Spend Concentration.
3. Forecast chart: labeled `ReferenceLine` (cap) already present → add **last-month-avg**
   reference line + **`ReferenceArea` overspend shading** + **comparative tooltip** ("$80 more
   than usual").
4. **Insight banner** on Overview (top): renders the single highest-severity insight as a
   dismissible card (red = act, amber = watch); low-severity items deferred to slice 3.

## Slice 2: friendlier tables
- Inline mini-bar per category/budget row (% used, green/amber/red), delta arrows (▲/▼ + color),
  plainer labels, progressive disclosure (collapse rows; expand on tap). Bullet-graph styling for
  Budget Variance (actual bar + plan tick + good/bad band).

## Slice 3: fuller AI alert system
- Insight **stack** with severity tiers (banner / inline / chat badge), **weekly recap** (Mondays)
  + start/end-of-month coaching, **dismiss + snooze + "calm mode"** persisted in finance.ai or a
  small `insights` settings object. AI (OpenRouter gpt-oss-120b:free) optionally elaborates a
  selected insight in the Kai panel; deterministic copy is the always-on baseline.

## Testing
- vitest for `chartTakeaway` (each kind incl. zero/edge) and `buildInsights` (severity selection,
  anomaly threshold, milestone crossing, citing numbers).
- Playwright read-only on prod: takeaways render, forecast shows ref line + shading, banner shows
  for the over-pace state, console clean. No Apply/Reset.

## Notes
- Category bar (finance) already sorted-horizontal; cashflow already a ladder — no pie to replace
  on the finance side (the pie is Track-only and out of scope).
- Persisted insight dismissals must write into the active month (same month-keyed `ai`/settings
  path as the persistAi fix) so they survive reloads correctly.
