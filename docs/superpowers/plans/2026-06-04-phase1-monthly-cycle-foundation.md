# Phase 1: Monthly Cycle Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single global finance setup into a per-month model with carry-forward and a month switcher, without breaking any existing screen.

**Architecture:** `finance.months[key]` holds each month's `income/fixed/variable/contributions/ai`. `normalizeFinance` migrates the old flat shape into `months[currentMonth]` once, then **mirrors the active month's setup onto the top level** so existing read sites keep working unchanged. Writes to income/fixed/variable target `months[activeMonth]`; savings/expenses/categories stay global. `financeTotals(finance, monthKey?)` is month-scoped.

**Tech Stack:** React + Vite, Vitest (added here for pure-logic tests), existing `core/finance.js` + `core/date.js`.

---

## File structure

- `vitest.config.js` (create) — test runner for core logic.
- `src/core/finance.js` (modify) — model, migration, helpers, month-scoped totals.
- `src/core/finance.test.js` (create) — unit tests for migration/helpers/totals.
- `src/features/FinanceTab.jsx` (modify) — write to active month, month switcher UI, over-commit guard.
- `src/features/AnalyticsTab.jsx`, `src/features/WeeklyReviewTab.jsx`, `src/features/ExportModal.jsx` (modify) — read via normalized model (mostly unchanged thanks to mirroring; verify).
- `package.json` (modify) — add `test` script + vitest dev dep.

---

## Task 1: Add Vitest for core-logic testing

**Files:**
- Create: `vitest.config.js`
- Modify: `package.json`

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest@2`
Expected: adds vitest to devDependencies, no errors.

- [ ] **Step 2: Create `vitest.config.js`**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
  },
});
```

- [ ] **Step 3: Add test script to `package.json`**

In the `"scripts"` block add:
```json
    "test": "vitest run"
```

- [ ] **Step 4: Create a smoke test** `src/core/finance.test.js`

```js
import { describe, it, expect } from "vitest";
import { normalizeFinance } from "./finance.js";

describe("finance smoke", () => {
  it("normalizes an empty object", () => {
    expect(normalizeFinance({})).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.js src/core/finance.test.js
git commit -m "test: add vitest for finance core logic"
```

---

## Task 2: Per-month normalize helpers + defaults

**Files:**
- Modify: `src/core/finance.js`

Extracts the inline defaults into reusable factories and adds a per-month setup normalizer. No behavior change yet (still flat).

- [ ] **Step 1: Add default factories near the top of `finance.js`** (after `DEFAULT_SAVINGS_FUNDS`)

```js
export const CURRENT_SCHEMA = 2;

const defaultIncome = () => [
  { id: uid(), name: "Senior AI Engineer salary", budget: 1200000, actual: 1200000 },
];
const defaultFixed = () => [
  { id: uid(), name: "Rent", budget: 90000, actual: 90000 },
  { id: uid(), name: "Utilities", budget: 30000, actual: 30000 },
];
const defaultVariable = () => [
  { id: uid(), name: "Groceries", budget: 20000, actual: 0 },
  { id: uid(), name: "Transport", budget: 18000, actual: 0 },
  { id: uid(), name: "Eating out", budget: 43000, actual: 0 },
  { id: uid(), name: "Cigarettes", budget: 13500, actual: 0 },
];
```

- [ ] **Step 2: Add the per-month setup normalizer** (near `normalizeAi`)

```js
const normalizeMonthSetup = (setup = {}) => ({
  income: Array.isArray(setup.income)
    ? setup.income.map((row) => moneyRow(row, ["budget", "actual"]))
    : defaultIncome(),
  fixed: Array.isArray(setup.fixed)
    ? setup.fixed.map((row) => moneyRow(row, ["budget", "actual"]))
    : defaultFixed(),
  variable: Array.isArray(setup.variable)
    ? setup.variable.map((row) => moneyRow(row, ["budget", "actual"]))
    : defaultVariable(),
  contributions:
    setup.contributions && typeof setup.contributions === "object"
      ? setup.contributions
      : {},
  ai: normalizeAi(setup.ai),
});
```

- [ ] **Step 3: Add a failing test** in `src/core/finance.test.js`

```js
import { normalizeFinance, CURRENT_SCHEMA } from "./finance.js";

it("month setup gets defaults when absent", () => {
  const f = normalizeFinance({});
  const key = Object.keys(f.months)[0];
  expect(f.months[key].income.length).toBeGreaterThan(0);
  expect(f.months[key].contributions).toEqual({});
  expect(f.schemaVersion).toBe(CURRENT_SCHEMA);
});
```

- [ ] **Step 4: Run — expect FAIL** (months not built yet)

Run: `npm test`
Expected: FAIL — `f.months` is undefined.

(Implementation that makes it pass lands in Task 3.)

---

## Task 3: Migrate + build `months` in `normalizeFinance`

**Files:**
- Modify: `src/core/finance.js` (replace `normalizeFinance`)

- [ ] **Step 1: Replace `normalizeFinance`** with the month-aware version

```js
const contributionsFromSavings = (savings = []) => {
  const map = {};
  savings.forEach((fund) => {
    if (fund.id && +fund.monthly > 0) map[fund.id] = +fund.monthly;
  });
  return map;
};

export const normalizeFinance = (finance = {}) => {
  const exchange = normalizeExchange(finance.exchange);

  // Migrate the old flat shape (no `months`) into months[currentMonth] once.
  const sourceMonths = finance.months || {
    [monthKey()]: {
      income: finance.income,
      fixed: finance.fixed,
      variable: finance.variable,
      contributions: contributionsFromSavings(finance.savings),
      ai: finance.ai,
    },
  };

  const months = {};
  Object.keys(sourceMonths).forEach((key) => {
    months[key] = normalizeMonthSetup(sourceMonths[key]);
  });
  if (!Object.keys(months).length) months[monthKey()] = normalizeMonthSetup({});

  const activeMonth =
    finance.activeMonth && months[finance.activeMonth]
      ? finance.activeMonth
      : months[monthKey()]
        ? monthKey()
        : Object.keys(months).sort().pop();

  const active = months[activeMonth];

  return {
    schemaVersion: CURRENT_SCHEMA,
    activeMonth,
    months,
    // Active-month setup mirrored to top level so existing read sites keep working.
    income: active.income,
    fixed: active.fixed,
    variable: active.variable,
    contributions: active.contributions,
    ai: active.ai,
    // Global data
    savings: Array.isArray(finance.savings)
      ? finance.savings.map(normalizeSavingsRow)
      : DEFAULT_SAVINGS_FUNDS,
    expenses: (finance.expenses || []).map((expense) =>
      normalizeExpense(expense, exchange),
    ),
    categories: withDefaultCategories(finance.categories),
    exchange,
  };
};
```

- [ ] **Step 2: Run the Task 2 test — expect PASS**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Add a lossless-migration test**

```js
it("migrates flat shape into current month losslessly", () => {
  const flat = {
    income: [{ id: "i1", name: "Salary", budget: 1200000, actual: 523000 }],
    fixed: [{ id: "f1", name: "Rent", budget: 90000, actual: 0 }],
    variable: [{ id: "v1", name: "Groceries", budget: 20000, actual: 0 }],
    savings: [{ id: "house", name: "House", target: 7500000, saved: 0, monthly: 600000 }],
    expenses: [],
  };
  const f = normalizeFinance(flat);
  const m = f.months[f.activeMonth];
  expect(m.income[0].actual).toBe(523000);
  expect(m.contributions.house).toBe(600000); // monthly moved to contribution
  expect(f.income).toBe(m.income); // top-level mirrors active month
});
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/finance.js src/core/finance.test.js
git commit -m "feat: month-keyed finance model with backward-compatible migration"
```

---

## Task 4: `getMonth` + carry-forward + `ensureActiveMonth`

**Files:**
- Modify: `src/core/finance.js`

- [ ] **Step 1: Add helpers** (after `normalizeFinance`)

```js
// Deep-ish copy of a month setup with fresh row ids so editing a carried-forward
// month never mutates the source month's rows.
const copyMonthSetup = (setup) => ({
  income: setup.income.map((row) => ({ ...row, id: uid() })),
  fixed: setup.fixed.map((row) => ({ ...row, id: uid() })),
  variable: setup.variable.map((row) => ({ ...row, id: uid() })),
  contributions: { ...setup.contributions },
  ai: { forecast: null, advice: null, split: null, generatedAt: {} },
});

// Returns the setup for `key`, carrying forward from the most recent earlier month
// when that month does not exist yet. Pure — does not mutate `finance`.
export const getMonth = (finance, key) => {
  const model = finance.months ? finance : normalizeFinance(finance);
  if (model.months[key]) return model.months[key];
  const earlier = Object.keys(model.months).filter((k) => k < key).sort();
  const source = earlier.length ? model.months[earlier[earlier.length - 1]] : null;
  return source ? copyMonthSetup(source) : normalizeMonthSetup({});
};

// Ensures the current calendar month exists (carried forward) and is active.
// Returns a new finance object; safe to feed to setFinance.
export const ensureActiveMonth = (finance) => {
  const model = normalizeFinance(finance);
  const key = monthKey();
  if (model.months[key]) {
    return model.activeMonth === key ? model : { ...model, activeMonth: key };
  }
  return {
    ...model,
    activeMonth: key,
    months: { ...model.months, [key]: getMonth(model, key) },
  };
};
```

- [ ] **Step 2: Add tests**

```js
import { getMonth, ensureActiveMonth } from "./finance.js";

it("getMonth carries forward an editable copy without mutating source", () => {
  const f = normalizeFinance({
    months: { "2026-05": { income: [{ id: "i", name: "Salary", budget: 1000, actual: 1000 }], fixed: [], variable: [], contributions: {} } },
    activeMonth: "2026-05",
  });
  const june = getMonth(f, "2026-06");
  june.income[0].actual = 999;
  expect(f.months["2026-05"].income[0].actual).toBe(1000); // source untouched
  expect(june.income[0].id).not.toBe("i"); // fresh id
});

it("ensureActiveMonth creates the current month", () => {
  const f = ensureActiveMonth({ months: { "2020-01": { income: [], fixed: [], variable: [], contributions: {} } }, activeMonth: "2020-01" });
  expect(f.months[f.activeMonth]).toBeTruthy();
  expect(f.activeMonth.length).toBe(7);
});
```

- [ ] **Step 3: Run — expect PASS**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/finance.js src/core/finance.test.js
git commit -m "feat: getMonth carry-forward + ensureActiveMonth helpers"
```

---

## Task 5: Month-scoped `financeTotals`

**Files:**
- Modify: `src/core/finance.js` (update `financeTotals` signature + body)

- [ ] **Step 1: Update `financeTotals` to accept an optional month key**

Replace the first lines of `financeTotals` so income/fixed/variable come from the selected month, and contributions come from that month (falling back to fund.monthly):

```js
export const financeTotals = (finance, monthKeyArg) => {
  const normalized = normalizeFinance(finance);
  const key = monthKeyArg || normalized.activeMonth;
  const setup = normalized.months[key] || normalized.months[normalized.activeMonth];

  const income = sum(setup.income, "actual");
  const incomePlan = sum(setup.income, "budget");
  const fixedPlan = sum(setup.fixed, "budget");
  const variablePlan = sum(setup.variable, "budget");

  const typeById = new Map(normalized.categories.map((c) => [c.id, c.type]));
  const typeByName = new Map(
    normalized.categories.map((c) => [String(c.name).toLowerCase(), c.type]),
  );
  let spent = 0;
  let fixedSpent = 0;
  normalized.expenses
    .filter((expense) => (expense.date || "").startsWith(key))
    .forEach((expense) => {
      const amount = expenseAmountAMD(expense, normalized.exchange);
      spent += amount;
      const type =
        typeById.get(expense.categoryId) ||
        typeByName.get(String(expense.categoryName || "").toLowerCase());
      if (type === "fixed") fixedSpent += amount;
    });
  const variableSpent = spent - fixedSpent;

  const saved = sum(normalized.savings, "saved");
  const monthlyGoal = normalized.savings.reduce((total, fund) => {
    const override = setup.contributions[fund.id];
    return total + (override != null ? +override || 0 : +fund.monthly || 0);
  }, 0);

  const net = income - spent;
  const availableToSave = Math.max(0, net);
  const planBalance = incomePlan - fixedPlan - variablePlan - monthlyGoal;

  return {
    monthKey: key,
    income, spent, net, netThisMonth: net, availableToSave,
    fixed: fixedSpent, variableManual: variableSpent,
    incomePlan, fixedPlan, variablePlan, planBalance,
    monthlyGoal, savingsPlan: monthlyGoal, saved,
    expenses: spent, loggedExpenses: spent, leftAfterPlan: planBalance,
  };
};
```

Note: this **replaces** the existing `currentMonthExpenses(normalized)` usage inside totals with an inline month filter on `key`. Leave the exported `currentMonthExpenses` function as-is (still used elsewhere).

- [ ] **Step 2: Add tests**

```js
import { financeTotals } from "./finance.js";

it("financeTotals scopes to the given month", () => {
  const f = normalizeFinance({
    months: {
      "2026-06": { income: [{ id: "i", name: "S", budget: 1200000, actual: 523000 }], fixed: [{ id: "f", name: "Rent", budget: 90000, actual: 0 }], variable: [], contributions: { house: 600000 } },
    },
    activeMonth: "2026-06",
    savings: [{ id: "house", name: "House", target: 7500000, saved: 0, monthly: 600000 }],
    categories: [{ id: "rent", name: "Rent", type: "fixed" }, { id: "groceries", name: "Groceries", type: "variable" }],
    expenses: [
      { id: "a", date: "2026-06-01", note: "Rent", amount: 180000, currency: "AMD", amountAMD: 180000, categoryId: "rent", categoryName: "Rent" },
      { id: "b", date: "2026-05-01", note: "Old", amount: 999, currency: "AMD", amountAMD: 999, categoryId: "groceries", categoryName: "Groceries" },
    ],
  });
  const t = financeTotals(f, "2026-06");
  expect(t.income).toBe(523000);
  expect(t.spent).toBe(180000);     // May expense excluded
  expect(t.fixed).toBe(180000);
  expect(t.net).toBe(343000);
  expect(t.monthlyGoal).toBe(600000); // contribution override
  expect(t.planBalance).toBe(1200000 - 90000 - 0 - 600000); // 510000
});
```

- [ ] **Step 3: Run — expect PASS**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/finance.js src/core/finance.test.js
git commit -m "feat: month-scoped financeTotals with per-month contributions"
```

---

## Task 6: FinanceTab writes to the active month + month switcher

**Files:**
- Modify: `src/features/FinanceTab.jsx`

- [ ] **Step 1: Import helpers + icons**

Add to the `core/finance` import: `ensureActiveMonth`. Add to the lucide-react import: `ChevronLeft, ChevronRight`.

- [ ] **Step 2: Ensure the active month exists on mount**

Inside `FinanceTab`, after `const model = useMemo(...)`, add:

```js
useEffect(() => {
  setFinance((previous) => ensureActiveMonth(previous));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

const activeMonth = model.activeMonth;
const PER_MONTH = new Set(["income", "fixed", "variable"]);
```

- [ ] **Step 3: Route per-month writes into `months[activeMonth]`**

Replace `setItem`, `addItem`, `delItem` so income/fixed/variable target the active month while savings stays global:

```js
const setItem = (section, id, patch) =>
  updateFinance((previous) => {
    if (PER_MONTH.has(section)) {
      const key = previous.activeMonth;
      const month = previous.months[key];
      return {
        ...previous,
        months: {
          ...previous.months,
          [key]: {
            ...month,
            [section]: month[section].map((row) => (row.id === id ? { ...row, ...patch } : row)),
          },
        },
      };
    }
    return {
      ...previous,
      [section]: previous[section].map((row) => (row.id === id ? { ...row, ...patch } : row)),
    };
  });

const addItem = (section) =>
  updateFinance((previous) => {
    const newRow = { id: uid(), name: "", budget: 0, actual: 0, target: 0, saved: 0, monthly: 0, targetDate: "" };
    if (PER_MONTH.has(section)) {
      const key = previous.activeMonth;
      const month = previous.months[key];
      return { ...previous, months: { ...previous.months, [key]: { ...month, [section]: [...month[section], newRow] } } };
    }
    return { ...previous, [section]: [...previous[section], newRow] };
  });

const delItem = (section, id) =>
  updateFinance((previous) => {
    if (PER_MONTH.has(section)) {
      const key = previous.activeMonth;
      const month = previous.months[key];
      return { ...previous, months: { ...previous.months, [key]: { ...month, [section]: month[section].filter((row) => row.id !== id) } } };
    }
    return { ...previous, [section]: previous[section].filter((row) => row.id !== id) };
  });
```

Note: `updateFinance` already wraps with `normalizeFinance(previous)`, so `previous.months` and `previous.activeMonth` are always present.

- [ ] **Step 4: Add a month-switcher helper**

```js
const shiftMonth = (key, delta) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
};
const goMonth = (delta) =>
  updateFinance((previous) => {
    const key = shiftMonth(previous.activeMonth, delta);
    const months = previous.months[key]
      ? previous.months
      : { ...previous.months, [key]: getMonth(previous, key) };
    return { ...previous, activeMonth: key, months };
  });
```

Add `getMonth` to the `core/finance` import.

- [ ] **Step 5: Render the switcher in the header toolbar**

In the `currency-toolbar` div, before the `AI Advice` button, add:

```jsx
<div className="month-switcher">
  <button type="button" onClick={() => goMonth(-1)} title="Previous month"><ChevronLeft size={15} /></button>
  <strong>{monthLabel(activeMonth)}</strong>
  <button
    type="button"
    onClick={() => goMonth(1)}
    disabled={activeMonth >= monthKey()}
    title="Next month"
  ><ChevronRight size={15} /></button>
</div>
```

Add `monthKey` to the `core/date` import.

- [ ] **Step 6: Add minimal CSS** in `src/styles/AppStyles.jsx` (append to the `.currency-toolbar` line)

```
.month-switcher{display:flex;align-items:center;gap:6px;padding:3px 4px;border:1px solid ${C.border};border-radius:10px;background:${C.surface}}.month-switcher strong{min-width:120px;text-align:center;font-size:12px;font-weight:800;color:${C.text}}.month-switcher button{border:0;background:transparent;color:${C.muted};cursor:pointer;padding:4px;border-radius:6px;display:grid;place-items:center}.month-switcher button:hover:not(:disabled){color:${C.green}}.month-switcher button:disabled{opacity:.35;cursor:not-allowed}
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: built successfully.

- [ ] **Step 8: Commit**

```bash
git add src/features/FinanceTab.jsx src/styles/AppStyles.jsx
git commit -m "feat: month switcher + per-month setup editing in FinanceTab"
```

---

## Task 7: Over-commitment guard

**Files:**
- Modify: `src/features/FinanceTab.jsx`

- [ ] **Step 1: Compute the warning** (after `totals` is available)

```js
const overcommit = totals.monthlyGoal + spendingCap - totals.incomePlan;
```

- [ ] **Step 2: Render a banner under the stats grid** when over-committed

```jsx
{overcommit > 0 && (
  <div className="notice notice-warn">
    Your plan needs {displayMoney(totals.monthlyGoal + spendingCap, displayCurrency, exchange)}{" "}
    (savings + {displayMoney(spendingCap, displayCurrency, exchange)} life cap) but planned income is{" "}
    {displayMoney(totals.incomePlan, displayCurrency, exchange)} — over by{" "}
    <b>{displayMoney(overcommit, displayCurrency, exchange)}</b>. Lower a goal contribution or the cap.
  </div>
)}
```

- [ ] **Step 3: Add CSS** for `.notice-warn` in `AppStyles.jsx` (append after `.notice`)

```
.notice-warn{border-color:rgba(233,196,106,.4);background:rgba(233,196,106,.1);color:${C.amber}}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/features/FinanceTab.jsx src/styles/AppStyles.jsx
git commit -m "feat: warn when monthly plan over-commits planned income"
```

---

## Task 8: Verify other consumers still read correctly

**Files:**
- Read/verify: `src/features/AnalyticsTab.jsx`, `src/features/WeeklyReviewTab.jsx`, `src/features/ExportModal.jsx`

These read `model.income/fixed/variable/ai` and `financeTotals(finance)` — all still valid because normalize mirrors the active month and `financeTotals` defaults to active. No code change expected; confirm.

- [ ] **Step 1: Grep for raw flat reads that bypass normalize**

Run (via Grep tool): pattern `finance\.(income|fixed|variable)\b` across `src/features`.
Expected: only reads of *normalized* models (`financeModel.*`, `model.*`), not raw stored `finance.*` writes. If any raw write exists, route it through the Task 6 pattern.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit any fixes** (if needed)

```bash
git add -A
git commit -m "fix: route remaining setup writes through active month"
```

---

## Task 9: Runtime verification (browser)

**Files:** none (verification only)

- [ ] **Step 1: Start dev server** (`npm run dev`) and drive with Playwright using the real login.
- [ ] **Step 2:** Confirm: Finance header shows the month switcher with the current month; editing a Fixed row changes only the active month; clicking `←` shows the prior month (carried-forward copy); editing there does not change the current month after clicking `→`.
- [ ] **Step 3:** Confirm headline cards + analytics still render with no console errors.
- [ ] **Step 4:** Push to `main` so Vercel deploys.

```bash
git push
```

---

## Self-review notes
- **Spec coverage:** per-month model ✓ (T2–T5), migration ✓ (T3), getMonth/carry-forward ✓ (T4), ensureActiveMonth/auto-create ✓ (T4/T6), month switcher ✓ (T6), writes to active month ✓ (T6), over-commit guard ✓ (T7), consumers updated ✓ (T8). Per-month `contributions` ✓ (T3/T5). Debt/sinking/net-worth are later phases (out of scope here).
- **Type consistency:** `getMonth`, `ensureActiveMonth`, `normalizeMonthSetup`, `copyMonthSetup`, `contributionsFromSavings`, `CURRENT_SCHEMA` defined in T2–T4 and used consistently in T5–T6. `financeTotals(finance, monthKey?)` signature used by T6 consumers.
- **No placeholders:** every step has concrete code or an exact command.
