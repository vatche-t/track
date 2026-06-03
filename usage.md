# Usage Guide

This app is a local-first tracker with a Finance Command Center. Use it to keep your daily tasks, spending, savings goals, and finance analytics in one browser.

## Finance Safety

Your tracker and finance data is stored in this browser. The app uses browser-local SQLite saved through `localStorage`, so your normal finance records are not uploaded to a backend by default.

What leaves the browser:

- Exchange-rate refresh sends only a rate request. It does not send your income, expenses, or goals.
- AI buttons send a small finance snapshot only when you click an AI button.
- Export / Backup creates files for you to keep. Anyone with those files can read the exported data.

Keep in mind:

- Clearing browser data can delete the local database.
- Switching browsers or devices will not automatically move your finance data.
- Use Export / Backup before clearing storage, changing machines, or making major edits.
- AI advice is guidance, not professional financial advice. Check important money decisions yourself.

## Daily Finance Flow

1. Open the app and switch the top app toggle to `Finance`.
2. Start in `Plan`.
3. Check the top summary: expenses, monthly goal, and after-plan amount.
4. Use the Finance Plan sub-tabs in this order: `Overview`, `Spend`, `Setup`, `Goals`.
5. Use `Analytics` when you want a deeper review of patterns, gaps, and progress.

## Finance Plan

Finance Plan is where you maintain the live budget model.

### Overview

Use this tab first. It shows whether your current money plan is healthy.

What it shows:

- `Spending Forecast`: how much of the monthly spending cap is already used.
- `Projected total`: where spending may end by month-end.
- `Safe to spend / day`: how much you can spend daily and stay inside the cap.
- `Recommended split`: how income should be divided between reserves and goals.
- `Ask AI`: sends the current finance snapshot only when clicked.
- `Apply`: writes the recommended monthly amounts into your goals.

How to benefit:

- Check this before spending.
- If `After Plan` is negative, lower spending, lower monthly goal amounts, or increase income.
- Use `Apply` only when the recommended split looks right.

### Spend

Use this tab to log expenses.

What it shows:

- Date
- Expense note
- Amount
- Currency, AMD or USD
- Suggested category
- Expense history

How to benefit:

- Log spending as soon as it happens.
- Write useful notes like `Food`, `Taxi`, `Phone accessory`, or `Rent`.
- Categories improve analytics, so correct the suggested category when needed.

### Setup

Use this tab when your income or baseline budget changes.

What it shows:

- `Income Sources`: salary, side income, paid-back money, bonus, or other inflows.
- `Fixed Baseline`: recurring costs that are hard to avoid.
- `Monthly Variable Plan`: flexible monthly spending buckets.

How to benefit:

- Put stable recurring money in `Income Sources`.
- Keep fixed costs realistic.
- Keep variable plan tight so goals get funded before extra spending happens.

### Goals

Use this tab to manage savings targets.

What it shows:

- Goal name
- Target amount
- Goal date
- Saved amount
- Monthly amount
- Suggested monthly amount

How to benefit:

- Keep important goals separate: emergency fund, relocation support, house down payment, investment seed fund.
- Update `Saved` when money is actually moved or reserved.
- Use suggested monthly amounts as a guide, but adjust if the plan becomes too aggressive.

## Finance Analytics

Finance Analytics is for review, not daily data entry.

What it shows:

- Cash flow narrative
- Spend by category
- Budget versus actual
- Goal funding progress
- Runway / finance health
- AI analyst for finance questions

How to benefit:

- Review weekly.
- Ask direct questions like `What is hurting my savings rate?` or `Which goal is underfunded?`
- Use analytics to decide what to change in `Setup` or `Goals`.

## Best Routine

Daily:

- Log spending in `Spend`.
- Check `Overview` before making larger purchases.

Weekly:

- Open `Analytics`.
- Review categories and budget variance.
- Export a backup.

Monthly:

- Update income if it changed.
- Click `Apply` on the recommended split if the plan still matches your priorities.
- Update saved amounts after moving money to actual savings or investment accounts.
