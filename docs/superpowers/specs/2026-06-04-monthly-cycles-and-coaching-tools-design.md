# Design: Monthly Budget Cycles + Pro Coaching Tools

**Date:** 2026-06-04
**Status:** Approved by user ("plan and apply everything as you recommend")

## Goal

Turn the single-period finance app into a **month-by-month system with history**, then
layer on the coaching tools that make it professional-grade. Built in phases; each phase
ships independently and stays backward-compatible with data already in Supabase.

## Locked decisions

| Decision | Choice |
|---|---|
| Month model | Snapshot per month, carried forward from previous |
| Recurring entry | One-click "Log" button per setup row |
| Savings funds | Goals global (target + running saved); contribution per-month |
| Rollover | Auto-create current month on calendar change + manual month switcher |
| Scope | Plan full vision, build in phases |
| Debt | Optional module (empty if none; user has not confirmed debt) |

## Data model

Old (flat, currently in Supabase):
```
finance = { income[], fixed[], variable[], savings[], expenses[], categories[], exchange, ai }
```

New:
```
finance = {
  schemaVersion: 2,
  activeMonth: "2026-06",
  months: {
    "2026-06": {
      income[], fixed[], variable[],
      contributions: { [fundId]: amountAMD },   // per-month transfer into each global fund
      ai: { forecast, advice, split, generatedAt }
    },
    ...
  },
  savings: [ { id, name, target, saved, targetDate, priority, monthly(default) } ],  // GLOBAL
  debts:   [ { id, name, balance, rate, minPayment } ],                              // GLOBAL, optional
  sinkingFunds: [ { id, name, annualAmount, saved } ],                               // GLOBAL, optional
  netWorthHistory: { "2026-06": { assets, debts, net } },                            // monthly snapshots
  categories[], exchange,                                                            // GLOBAL
}
```

**Backward compatibility (critical):** `normalizeFinance` detects the old flat shape (no
`months`) and migrates the flat `income/fixed/variable` into `months[currentMonth]`,
moving each fund's `monthly` into that month's `contributions`. Non-destructive; runs once
(guarded by `schemaVersion`). Every consumer reads through helpers, never raw `finance.income`.

**Helpers** (in `core/finance.js`):
- `getMonth(finance, key)` — returns that month's setup; if missing, carries forward a copy
  of the most recent prior month (or seed defaults if none).
- `ensureActiveMonth(finance)` — on load, creates the current calendar month via carry-forward.
- `financeTotals(finance, monthKey?)` — all existing fields, scoped to a month (defaults to active).

## Phases

### Phase 1 — Monthly cycle foundation (structural, unblocks all)
- New model + backward-compatible migration in `normalizeFinance`.
- `getMonth` / `ensureActiveMonth` / month-scoped `financeTotals`.
- **Month switcher** (`← June 2026 →`) in the Finance header; auto-create current month.
- All Setup editing writes to the **active month**.
- Over-commitment guard: warn when month contributions + life cap > planned income.
- Update consumers (FinanceTab, AnalyticsTab, WeeklyReviewTab, ExportModal, groq) to read
  the active/selected month.

### Phase 2 — Daily ergonomics
- **One-click "Log" button** on each Fixed/Variable setup row → logs that planned amount as
  an expense in the active month (category matched by name). Pairs with the existing
  "Money in" reimbursement toggle.
- **Needs vs Wants**: each category tagged `essential` | `discretionary`; a savings-rate +
  needs/wants gauge on the overview.

### Phase 3 — Smarter plan (coach logic)
- **Goal sequencing waterfall**: funds have a priority order; allocation fully funds the top
  goal before rolling the remainder to the next (replaces parallel funding). Default order:
  Emergency → Fiancée relocation → Support buffer → House → Investment.
- Fix seeded over-commitment: suggest contributions that fit `income − cap`.
- **Runway indicator** surfaced to the top: "X months covered if income stops."

### Phase 4 — Wealth tracking
- **Debt module** (optional): balances, rates, min payments; high-interest flagged; included
  in net worth; payoff ordering (avalanche).
- **Net worth tracker**: assets (fund saved totals + cash) − debts; monthly snapshot + trend.
- **Sinking funds**: irregular/annual costs saved at 1/12 per month.

### Phase 5 — Insight
- **Cross-month analytics**: month-over-month comparison + trend charts across months.
- **What-if simulator**: "cut eating-out 20k → House arrives N months sooner."
- **FX / multi-currency holdings**: track savings split AMD vs USD.
- **Multi-month AI**: advice that reasons over several months of history.

## Error handling & migration safety
- Migration only triggers when `schemaVersion < 2`; writes the new shape once; old keys left
  intact until confirmed. Existing JSON/Excel export remains the manual safety net.
- Empty optional modules (debts, sinkingFunds) render nothing — zero friction if unused.
- All money still AMD-normalized; per-month FX rate preserved on each expense.

## Verification
- Unit-check `normalizeFinance` migrates the real flat data → `months["2026-06"]` losslessly.
- `financeTotals(finance, key)` returns correct per-month numbers; carry-forward produces an
  editable copy without mutating the prior month.
- Build green; Playwright on prod: switch months, edit a month without affecting another,
  one-click Log adds an expense, net worth/goal-waterfall render.

## Out of scope
- Bank/API import, multi-user, real-time multi-device sync, tax/investment-product advice.
