# Design: Finance Model Correctness (single source of truth, real net, reimbursements)

**Date:** 2026-06-03
**Status:** Approved by user ("continue the implementation")

## Problem

`financeTotals` double-counts and fabricates debt:

- `expenses = fixed.actual + variableManual + loggedExpenses` **stacks the seeded
  Fixed Baseline (Rent 90k + Utilities 30k = 120,000) on top of logged expenses.**
  Real logged total = 206,582; app shows 326,582 (206,582 + 120,000). Confirmed exact.
- `leftAfterPlan = income.actual − expenses − monthlyGoal` compares a **full-month
  savings plan (1,050,000)** against a **half-month actual income (523,000)** →
  fake −853,582 "debt". Income is normally 1,200,000; this month was a half-month.
- Logged expenses and Setup rows are disconnected; no reconciliation.
- No way to record money coming back (roommate's 90,000 rent share, refunds).

## The rule (agreed)

**Logged expenses are the single source of truth.** Two non-mixed lenses:

- **This month (actual):** `income.actual` (523,000) − `spent` (sum of this month's
  logged expenses, 206,582) = **Net this month (+196,418)**. Never shows fake debt.
- **Monthly plan (budget):** `income.budget` (1,200,000) − planned fixed/variable
  budgets − planned savings (1,050,000) = **plan balance** (tells you if a normal
  month balances; this is where over-commitment is flagged, vs full income).

## Changes

### `src/core/finance.js` — `financeTotals`
Single source = logged expenses. New/changed fields:

| field | meaning |
|---|---|
| `income` | sum `income.actual` (unchanged) |
| `incomePlan` | sum `income.budget` (NEW) |
| `spent` / `expenses` / `loggedExpenses` | total of this month's logged expenses (reimbursements negative). **`expenses` no longer adds setup actuals.** |
| `fixed` | logged spend where category type === `fixed` (derived breakdown, not setup actual) |
| `variableManual` | `spent − fixed` (everything non-fixed; keeps `fixed + variableManual === spent`) |
| `fixedPlan`, `variablePlan` | sum of budget columns (NEW) |
| `monthlyGoal` / `savingsPlan` | sum `savings.monthly` (unchanged) |
| `saved` | sum `savings.saved` (unchanged) |
| `net` / `netThisMonth` | `income − spent` (CHANGED: real cash position, no savings subtraction) |
| `availableToSave` | `max(0, net)` (NEW) |
| `planBalance` / `leftAfterPlan` | `incomePlan − fixedPlan − variablePlan − monthlyGoal` (CHANGED: full-month plan balance) |

### Reimbursements (negative expenses)
- Expense form gets an **Expense / Money in** toggle (`draft.kind`). "Money in" stores
  a negative `amount`/`amountAMD` (roommate −90,000 in Rent). Reduces `spent` and the
  category's derived actual. Full history preserved.
- `createExpense` accepts a signed amount; list/format already handle negatives.

### `src/features/FinanceTab.jsx`
- Cap meter `loggedThisMonth = totals.spent` (was fixed+variable+logged).
- Replace 3 stat cards with: **Income** (`523,000 · plan 1.2M`), **Spent**, **Net this
  month** (green/red on sign), **Savings** (`1,050,000/mo` + affordability badge).
- Forecast `spentSoFar = totals.spent`.
- Setup Fixed/Variable **Actual** column becomes **read-only, derived** from logged
  expenses by category name; only **Budget** stays editable. Income section unchanged.
- Expense form: add the Expense / Money in toggle.

### `src/features/AnalyticsTab.jsx`
- Cashflow ladder Variable line: `-(totals.variableManual)` (drop `+ loggedExpenses`
  double-count); Fixed line stays `-totals.fixed`; together they equal total spent.
- Budget-vs-actual variable `actual` uses `totals.variableManual` (not
  `sum(variable,"actual") + loggedExpenses`).
- Relabel "After Plan" → "Plan balance (full month)" so a negative there reads as an
  over-committed *plan*, not this-month debt. Add a "Net this month" stat.

### `src/core/groq.js`
- Aliases keep prompts valid. Update the two finance prompts' labels: distinguish
  "income received this month" vs "planned monthly income", and "net this month" vs
  "monthly plan balance", so advice stops treating the plan gap as debt.

## Out of scope
- Auto right-sizing the seeded mega-goals (House 600k/mo). The affordability badge
  surfaces it; the user keeps control.
- Per-expense split UI beyond the reimbursement toggle.

## Verification
- Unit-check `financeTotals` with the user's real numbers: spent = 206,582,
  net = +196,418, planBalance computed from 1.2M plan.
- Build green; Playwright on prod: Spent reads 206,582 (not 326,582), Net positive,
  logging a −90,000 reimbursement drops Spent to 116,582.
