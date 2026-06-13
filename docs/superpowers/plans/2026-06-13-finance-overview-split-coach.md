# Finance Overview + Split-Coach Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Finance Overview lead with an always-correct "Hey Vatche, you received X — here's how to split it" coach, fix the AI cap-confusion / stale-AI / negative-Wants / chart-leak bugs, and lay it out cleanly for 16″ desktop and mobile.

**Architecture:** Pure, unit-tested helpers in `src/core/finance.js` (deterministic split summary, forecast values, Wants clamp, AI-staleness) and `src/core/groq.js` (shared spending-context block). A new focused `SplitCoachCard` component replaces `RecommendedSplitCard` and renders from those helpers; AI is enhancement layered below deterministic content. `FinanceTab` computes forecast values once and shares them. CSS added to `AppStyles.jsx`.

**Tech Stack:** React + Vite, recharts, framer-motion, vitest, Playwright (read-only prod verification).

---

### Task 1: Deterministic split summary helper

**Files:**
- Modify: `src/core/finance.js` (add `splitSummarySentence` near `allocationSuggestion`, ~line 772)
- Test: `src/core/finance.test.js`

- [ ] **Step 1: Write the failing test**

Add to `src/core/finance.test.js`:

```js
import { splitSummarySentence } from "./finance.js";

describe("splitSummarySentence", () => {
  const income = 523000;
  const suggestion = [
    { name: "Spending card", amount: 300000, kind: "reserve" },
    { name: "Emergency fund", amount: 173000, kind: "goal", progress: 0 },
    { name: "Skills / fun", amount: 50000, kind: "reserve" },
  ];

  it("describes proportions and the top goal, with nothing unassigned", () => {
    const s = splitSummarySentence(suggestion, income);
    expect(s).toContain("57%"); // 300000/523000
    expect(s).toContain("Emergency fund");
    expect(s).toMatch(/nothing (left )?unassigned/i);
  });

  it("calls out unassigned surplus when present", () => {
    const withSurplus = [
      { name: "Spending card", amount: 300000, kind: "reserve" },
      { name: "Emergency fund", amount: 100000, kind: "goal", progress: 0 },
      { name: "Unassigned surplus", amount: 123000, kind: "unassigned" },
    ];
    const s = splitSummarySentence(withSurplus, income);
    expect(s).toMatch(/123,000 AMD (is )?unassigned|add .* goal/i);
  });

  it("prompts to log income when income is zero", () => {
    expect(splitSummarySentence([], 0)).toMatch(/log .* income/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- finance.test.js`
Expected: FAIL — `splitSummarySentence is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/core/finance.js` (after `allocationSuggestion`, before the next export):

```js
// Deterministic, AI-free plain-English summary of the recommended split.
// Built only from the allocation amounts so the coach always explains itself.
export const splitSummarySentence = (suggestion = [], income = 0) => {
  const amount = +income || 0;
  if (amount <= 0) return "Log this month's income to see how to split it.";
  const pct = (v) => Math.round(((+v || 0) / amount) * 100);
  const card = suggestion.find((i) => i.kind === "reserve" && /spending/i.test(i.name));
  const goals = suggestion.filter((i) => i.kind === "goal" && (+i.amount || 0) > 0);
  const flex = suggestion.find((i) => i.kind === "reserve" && /skill|fun/i.test(i.name));
  const unassigned = suggestion.find((i) => i.kind === "unassigned" && (+i.amount || 0) > 0);

  const parts = [];
  if (card) parts.push(`${pct(card.amount)}% protects your spending cap`);
  if (goals[0]) parts.push(`${pct(goals[0].amount)}% builds your ${goals[0].name} (top priority goal)`);
  if (flex && (+flex.amount || 0) > 0) parts.push(`${pct(flex.amount)}% is guilt-free fun`);

  let sentence = parts.join(", ") + ".";
  if (unassigned) {
    sentence += ` ${Math.round(+unassigned.amount).toLocaleString()} AMD is unassigned — add or raise a goal target to give it a job.`;
  } else {
    sentence += " Nothing left unassigned.";
  }
  return sentence;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- finance.test.js`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add src/core/finance.js src/core/finance.test.js
git commit -m "feat(finance): deterministic split summary sentence helper"
```

---

### Task 2: Forecast values helper (shared by hero + forecast card)

**Files:**
- Modify: `src/core/finance.js` (add `forecastValues`)
- Test: `src/core/finance.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { forecastValues } from "./finance.js";

describe("forecastValues", () => {
  it("projects month-end spend from daily burn and flags over-pace", () => {
    const v = forecastValues({ spentSoFar: 223652, spendingCap: 300000, dayOfMonth: 13, daysInMonth: 30 });
    expect(v.projectedTotal).toBe(Math.round((223652 / 13) * 30)); // 516120
    expect(v.onTrack).toBe(false);
    expect(v.daysRemaining).toBe(17);
    expect(v.safeToday).toBe(Math.max(0, Math.round((300000 - 223652) / 17)));
  });

  it("is on track when projected stays under cap", () => {
    const v = forecastValues({ spentSoFar: 50000, spendingCap: 300000, dayOfMonth: 10, daysInMonth: 30 });
    expect(v.onTrack).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- finance.test.js`
Expected: FAIL — `forecastValues is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/core/finance.js`:

```js
// Month-end spending projection from current pace. Pure so the Overview hero and
// the Forecast card read one source of truth (no drift between them).
export const forecastValues = ({ spentSoFar = 0, spendingCap = 0, dayOfMonth, daysInMonth }) => {
  const now = new Date();
  const dim = daysInMonth || new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dom = dayOfMonth || now.getDate();
  const daysRemaining = Math.max(1, dim - dom);
  const dailyBurn = dom > 0 ? spentSoFar / dom : 0;
  const projectedTotal = Math.round(dailyBurn * dim);
  const safeToday = Math.max(0, Math.round((spendingCap - spentSoFar) / daysRemaining));
  return {
    daysInMonth: dim,
    dayOfMonth: dom,
    daysRemaining,
    dailyBurn,
    projectedTotal,
    safeToday,
    onTrack: projectedTotal <= spendingCap,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- finance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/finance.js src/core/finance.test.js
git commit -m "feat(finance): shared forecastValues projection helper"
```

---

### Task 3: AI-staleness + Wants-clamp helpers

**Files:**
- Modify: `src/core/finance.js` (add `isAiStale`, `wantsForDisplay`)
- Test: `src/core/finance.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { isAiStale, wantsForDisplay } from "./finance.js";

describe("isAiStale", () => {
  const month = "2026-06";
  it("fresh same-month recent timestamp is not stale", () => {
    const iso = new Date().toISOString();
    expect(isAiStale(iso, month)).toBe(false);
  });
  it("older than 24h is stale", () => {
    const iso = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    expect(isAiStale(iso, month)).toBe(true);
  });
  it("generated in a different month is stale", () => {
    const iso = new Date().toISOString();
    expect(isAiStale(iso, "2026-05")).toBe(true);
  });
  it("missing timestamp is stale", () => {
    expect(isAiStale("", month)).toBe(true);
  });
});

describe("wantsForDisplay", () => {
  it("floors negative discretionary (refund-heavy) at 0", () => {
    expect(wantsForDisplay(-11433)).toBe(0);
  });
  it("passes through positive", () => {
    expect(wantsForDisplay(45017)).toBe(45017);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- finance.test.js`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Write minimal implementation**

Add to `src/core/finance.js`:

```js
// Persisted AI text is stale when older than 24h or generated in a different month.
export const isAiStale = (generatedAt, activeMonth) => {
  if (!generatedAt) return true;
  const t = new Date(generatedAt).getTime();
  if (Number.isNaN(t)) return true;
  if (Date.now() - t > 24 * 3600 * 1000) return true;
  const genMonth = new Date(generatedAt).toISOString().slice(0, 7);
  return Boolean(activeMonth) && genMonth !== activeMonth;
};

// Reimbursements can drive discretionary spend negative; never show negative Wants.
export const wantsForDisplay = (discretionarySpent) => Math.max(0, +discretionarySpent || 0);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- finance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/finance.js src/core/finance.test.js
git commit -m "feat(finance): isAiStale + wantsForDisplay helpers"
```

---

### Task 4: Shared spending-context block for AI prompts (fix cap confusion)

**Files:**
- Modify: `src/core/groq.js` (add `spendingContextBlock`; use it in `askFinanceAnalyticsQuestion` ~line 271 and `refineRecommendedSplit` ~line 190)
- Test: `src/core/groq.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `src/core/groq.test.js`:

```js
import { describe, it, expect } from "vitest";
import { spendingContextBlock } from "./groq.js";

describe("spendingContextBlock", () => {
  it("states the spending cap, projection, pace, and that savings transfers are not a cap", () => {
    const b = spendingContextBlock({ spendingCap: 300000, projectedTotal: 516120, onTrack: false });
    expect(b).toContain("300,000");
    expect(b).toContain("516,120");
    expect(b.toLowerCase()).toContain("over pace");
    expect(b.toLowerCase()).toContain("not a spending");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- groq.test.js`
Expected: FAIL — `spendingContextBlock is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add near the top of `src/core/groq.js` (after the `SYSTEM` const), and export it:

```js
// Shared spending-cap context so AI never confuses the savings-transfer plan with
// the actual monthly spending cap.
export function spendingContextBlock({ spendingCap = 0, projectedTotal = 0, onTrack = true } = {}) {
  const pace = onTrack ? "on track" : "OVER PACE";
  return `SPENDING CAP CONTEXT:
- Monthly spending cap (life cap): ${Math.round(spendingCap).toLocaleString()} AMD. This is the ONLY spending limit.
- Projected month-end spend at current pace: ${Math.round(projectedTotal).toLocaleString()} AMD (${pace}).
- Savings/goal transfers are NOT a spending limit — never call the transfer total a "cap" or compare spending to it.`;
}
```

Then thread it through both callers. In `askFinanceAnalyticsQuestion(question, { finance, totals, exchange, series, spendingCap, projectedTotal, onTrack })` add the params and insert the block into the user content (after the "Recent expenses" line):

```js
Recent expenses - ${recentExpenses}${trendBlock(series)}

${spendingContextBlock({ spendingCap, projectedTotal, onTrack })}
```

In `refineRecommendedSplit({ income, totals, savings, suggestion, exchange, spendingCap, projectedTotal, onTrack })` add the params and append before `TASK:`:

```js
${spendingContextBlock({ spendingCap, projectedTotal, onTrack })}

TASK:
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- groq.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/groq.js src/core/groq.test.js
git commit -m "feat(ai): shared spending-cap context block; stop cap/transfer confusion"
```

---

### Task 5: Lift forecast values into FinanceTab and pass to callers

**Files:**
- Modify: `src/features/FinanceTab.jsx` (compute once near line 183–191; pass to forecast card, split card, and Kai panel)

- [ ] **Step 1: Add the computation**

In `FinanceTab` after `const spendingCap = suggestion[0]?.amount || 300000;` (line ~183) add:

```js
  const fc = useMemo(
    () => forecastValues({ spentSoFar: totals.spent, spendingCap }),
    [totals.spent, spendingCap],
  );
```

Add `forecastValues` to the existing `../core/finance` import.

- [ ] **Step 2: Pass to the Kai panel**

In `FinanceAiPanel`'s `send()` (the `askFinanceAnalyticsQuestion` call ~line 1395) and in the analytics panel caller (`src/features/AnalyticsTab.jsx:516`), pass `spendingCap`, `projectedTotal: fc.projectedTotal`, `onTrack: fc.onTrack`. For `FinanceAiPanel`, thread `spendingCap` and `fc` in as props from `FinanceTab` (extend the `<FinanceAiPanel .../>` props at line ~530).

- [ ] **Step 3: Build to verify no breakage**

Run: `npm run build`
Expected: `✓ built` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/FinanceTab.jsx src/features/AnalyticsTab.jsx
git commit -m "feat(finance): compute forecast values once, feed AI + cards"
```

---

### Task 6: SplitCoachCard component (replaces RecommendedSplitCard)

**Files:**
- Modify: `src/features/FinanceTab.jsx` (replace `RecommendedSplitCard` def ~line 846–999 and its usage ~line 631)

- [ ] **Step 1: Replace the component**

Replace the whole `function RecommendedSplitCard(...) { ... }` with:

```jsx
function SplitCoachCard({ income, totals, model, suggestion, applySuggestion, displayCurrency, exchange, setFinance, fc }) {
  const aiText = model.ai?.split || "";
  const aiAt = model.ai?.generatedAt?.split || "";
  const whyText = model.ai?.waterfall || "";
  const whyAt = model.ai?.generatedAt?.waterfall || "";
  const [aiBusy, setAiBusy] = useState(false);
  const [whyBusy, setWhyBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  const summary = splitSummarySentence(suggestion, income);
  const segs = suggestion
    .filter((i) => (+i.amount || 0) > 0)
    .map((i) => ({
      ...i,
      pct: income > 0 ? Math.round((i.amount / income) * 100) : 0,
      color: i.kind === "unassigned" ? C.amber : /spending/i.test(i.name) ? C.amber
        : /skill|fun/i.test(i.name) ? C.blue : C.green,
    }));
  const splitStale = isAiStale(aiAt, model.activeMonth);

  const askAi = async () => {
    setAiBusy(true); setAiError("");
    try {
      const text = await refineRecommendedSplit({
        income, totals, savings: model.savings, suggestion, exchange,
        spendingCap: suggestion[0]?.amount || 300000,
        projectedTotal: fc?.projectedTotal, onTrack: fc?.onTrack,
      });
      persistAi(setFinance, "split", text);
    } catch (e) { setAiError(e.message || "AI unavailable — showing the calculated split."); }
    finally { setAiBusy(false); }
  };
  const askWhy = async () => {
    setWhyBusy(true); setAiError("");
    try {
      const text = await explainWaterfall({ suggestion, savings: model.savings, exchange });
      persistAi(setFinance, "waterfall", text);
    } catch (e) { setAiError(e.message || "AI unavailable."); }
    finally { setWhyBusy(false); }
  };

  return (
    <Card className="split-coach">
      <div className="split-coach-top">
        <div>
          <span className="greet">✦ Hey Vatche</span>
          <h3>
            {income > 0
              ? `You received ${displayMoney(income, displayCurrency, exchange)} — here's how to split it`
              : "Log this month's income to see your split"}
          </h3>
        </div>
        {income > 0 && (
          <Pill color={fc?.onTrack ? C.green : C.red}>
            {fc?.onTrack ? "On track" : `Over pace — projected ${displayMoney(fc?.projectedTotal || 0, displayCurrency, exchange)}`}
          </Pill>
        )}
      </div>

      {income > 0 && (
        <>
          <div className="split-bar">
            {segs.map((s) => (
              <span key={s.name} style={{ width: `${s.pct}%`, background: s.color }} title={`${s.name} ${s.pct}%`} />
            ))}
          </div>
          <div className="split-coach-body">
            <div className="split-legend">
              {segs.map((s) => (
                <div className="li" key={s.name}>
                  <span className="dot" style={{ background: s.color }} />
                  <span className="nm">{s.name}<small>{s.reason || s.note || ""}</small></span>
                  <b style={{ color: s.color }}>{displayMoney(s.amount, displayCurrency, exchange)}</b>
                </div>
              ))}
            </div>
            <div className="split-coach-side">
              <p className="split-plain">{summary}</p>
              <div className="split-actions">
                <Button variant="primary" onClick={applySuggestion}><ArrowRight size={15} /> Apply this split</Button>
                <Button onClick={askWhy} disabled={whyBusy}>{whyBusy ? "..." : "Why this order?"}</Button>
                <Button onClick={askAi} disabled={aiBusy}>{aiBusy ? "Thinking..." : <><BrainCircuit size={14} /> {aiText ? "Refresh AI" : "Refine with AI"}</>}</Button>
              </div>
              {aiError && <div className="rate-error">{aiError}</div>}
            </div>
          </div>

          {whyText && (
            <div className="split-ai-result why-order">
              {whyAt && <span className="ai-stamp">Why this order · {timeAgo(whyAt)}</span>}
              {whyText.split("\n").filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
            </div>
          )}
          {aiText && (
            <div className={`split-ai-result${splitStale ? " stale" : ""}`}>
              <span className="ai-stamp">
                {splitStale ? "May be outdated · " : "Refined · "}{timeAgo(aiAt)}
                {splitStale && <button className="ai-refresh" onClick={askAi}>refresh</button>}
              </span>
              {aiText.split("\n").filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Update the usage**

Replace the `<RecommendedSplitCard .../>` block (~line 631) with:

```jsx
            <SplitCoachCard
              income={salary}
              totals={totals}
              model={model}
              suggestion={suggestion}
              applySuggestion={applySuggestion}
              displayCurrency={displayCurrency}
              exchange={exchange}
              setFinance={setFinance}
              fc={fc}
            />
```

Add `splitSummarySentence` and `isAiStale` to the `../core/finance` import.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built`, no errors. (If `RecommendedSplitCard` is referenced anywhere else, grep and update — there should be exactly one usage.)

- [ ] **Step 4: Commit**

```bash
git add src/features/FinanceTab.jsx
git commit -m "feat(finance): SplitCoachCard hero with always-on deterministic summary"
```

---

### Task 7: KPI row (drop alarming savings-plan tile) + move split hero above forecast

**Files:**
- Modify: `src/features/FinanceTab.jsx` (stats-grid ~line 580; overview grid order ~line 617–638)

- [ ] **Step 1: Replace the stats-grid**

Replace the four `<Stat>` cards (line ~580–584) with a KPI row that drops "Savings plan / mo" and reframes:

```jsx
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <Stat label="Income received" value={displayMoney(totals.income, displayCurrency, exchange)} color={C.green} sub={`of ${displayMoney(totals.incomePlan, displayCurrency, exchange)} planned`} />
        <Stat label="Spent" value={displayMoney(totals.spent, displayCurrency, exchange)} color={fc.onTrack ? C.text : C.red} sub={`${capPct}% of ${displayMoney(spendingCap, displayCurrency, exchange)} cap`} />
        <Stat label="Net this month" value={displayMoney(totals.net, displayCurrency, exchange)} color={totals.net >= 0 ? C.green : C.red} sub="free to assign" />
        <Stat label="Saved so far" value={displayMoney(totals.saved, displayCurrency, exchange)} color={C.blue} sub={`across ${model.savings.length} goals`} />
      </div>
```

If `Stat` does not support a `sub` prop, check `src/components/ui.jsx` and add an optional `sub` rendered as a `<small>` under the value (small, muted). Show the code you add.

- [ ] **Step 2: Reorder overview so the split hero is first, full width**

In the `planMode === "overview"` block (~line 615–639), change the layout so `SplitCoachCard` is rendered full-width ABOVE the `finance-overview-grid`, and the grid below holds the forecast (left) + needs/wants is moved into the lower row. Target structure:

```jsx
      {planMode === "overview" && (
        <>
          <SplitCoachCard income={salary} totals={totals} model={model} suggestion={suggestion}
            applySuggestion={applySuggestion} displayCurrency={displayCurrency} exchange={exchange}
            setFinance={setFinance} fc={fc} />
          <div className="finance-lower-grid">
            <SpendingForecastCard spentSoFar={totals.spent} spendingCap={spendingCap}
              exchange={exchange} displayCurrency={displayCurrency} model={model} setFinance={setFinance} fc={fc} />
            <NeedsWantsCard totals={totals} model={model} displayCurrency={displayCurrency} exchange={exchange} />
          </div>
        </>
      )}
```

(Remove the old `finance-overview-grid` wrapper that paired forecast + split.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add src/features/FinanceTab.jsx src/components/ui.jsx
git commit -m "feat(finance): KPI row reframe + split-coach hero above forecast"
```

---

### Task 8: NeedsWants flooring + Forecast card uses shared fc + stale forecast dimming

**Files:**
- Modify: `src/features/FinanceTab.jsx` (`NeedsWantsCard` ~line 1731; `SpendingForecastCard` ~line 1137)

- [ ] **Step 1: Floor Wants in NeedsWantsCard**

In `NeedsWantsCard`, replace `const discretionary = totals.discretionarySpent;` with:

```jsx
  const discretionary = wantsForDisplay(totals.discretionarySpent);
  const refundNote = totals.discretionarySpent < 0;
```

And in the Wants legend line add the note when clamped:

```jsx
        <div><i className="wants" /> Wants <b>{displayMoney(discretionary, displayCurrency, exchange)}</b>{refundNote && <small className="muted-note"> (net of refunds)</small>}</div>
```

Add `wantsForDisplay` to the `../core/finance` import.

- [ ] **Step 2: SpendingForecastCard reads shared fc + dims stale AI**

Change `SpendingForecastCard` signature to accept `fc` and use `fc.projectedTotal`, `fc.onTrack`, `fc.safeToday`, `fc.daysRemaining`, `fc.dayOfMonth`, `fc.daysInMonth` instead of recomputing them (keep the per-day `chartData` build). For the persisted forecast text block (~line 1379), wrap with staleness:

```jsx
        {forecast && (
          <div className={`forecast-ai${isAiStale(forecastAt, model.activeMonth) ? " stale" : ""}`}>
            <span className="ai-stamp">
              {isAiStale(forecastAt, model.activeMonth) ? "May be outdated · " : "Generated · "}{timeAgo(forecastAt)}
              {isAiStale(forecastAt, model.activeMonth) && <button className="ai-refresh" onClick={ask}>refresh</button>}
            </span>
            <p>{forecast}</p>
          </div>
        )}
```

Add `isAiStale` to imports if not already present from Task 6.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add src/features/FinanceTab.jsx
git commit -m "fix(finance): floor Wants at 0; forecast shares fc; dim stale AI"
```

---

### Task 9: Fix stray Recharts axis-label leak ("0k"/"600k")

**Files:**
- Modify: `src/features/FinanceTab.jsx` (forecast `ResponsiveContainer` / `YAxis`, ~line 1240–1270)

- [ ] **Step 1: Diagnose**

Run: `grep -n "value / 1000" src/features/FinanceTab.jsx` — the leaking node uses this formatter. The floating node at document root is typically a `<YAxis>` label rendered outside the SVG, or a `ResponsiveContainer` with no fixed height letting a tick escape.

- [ ] **Step 2: Contain it**

Ensure the forecast chart's `ResponsiveContainer` has an explicit numeric `height` and the `YAxis` `tickFormatter` is `(v) => \`${Math.round(v / 1000)}k\`` only on the axis (not duplicated as a standalone element). Remove any stray `{...}k` text node that sits outside `<ResponsiveContainer>`. If a label element exists at the card root emitting the value, delete it.

- [ ] **Step 3: Build + visually confirm later in Task 10**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add src/features/FinanceTab.jsx
git commit -m "fix(finance): contain stray Recharts axis label leaking to page root"
```

---

### Task 10: Styles for KPI row, split-coach hero, lower grid (desktop + mobile)

**Files:**
- Modify: `src/styles/AppStyles.jsx`

- [ ] **Step 1: Add desktop styles**

Append finance styles (near the other finance rules):

```js
.split-coach{background:linear-gradient(135deg,rgba(52,212,164,.10),rgba(86,189,248,.04)),${C.card};border-color:rgba(52,212,164,.32);margin-bottom:16px}
.split-coach-top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
.split-coach .greet{font-size:11px;color:${C.green};font-weight:800;text-transform:uppercase;letter-spacing:.03em}
.split-coach h3{font-size:clamp(17px,2vw,22px);font-weight:800;margin:4px 0 12px;letter-spacing:-.01em}
.split-bar{display:flex;height:30px;border-radius:9px;overflow:hidden;border:1px solid ${C.border};margin-bottom:14px}
.split-bar span{display:block;transition:width .5s ease}
.split-coach-body{display:grid;grid-template-columns:1.25fr 1fr;gap:18px}
.split-legend{display:grid;gap:9px}
.split-legend .li{display:flex;align-items:center;gap:9px;font-size:13px}
.split-legend .dot{width:11px;height:11px;border-radius:3px;flex:none}
.split-legend .nm{min-width:0}.split-legend .nm small{display:block;color:${C.muted};font-size:11px;font-weight:600}
.split-legend b{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:800}
.split-plain{padding:12px 14px;background:rgba(0,0,0,.25);border-radius:10px;font-size:12.5px;line-height:1.55;color:${C.textDim}}
.split-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.split-ai-result{margin-top:12px;padding:11px 13px;border:1px solid ${C.border};border-radius:10px;background:${C.surface}}
.split-ai-result p{margin:3px 0;font-size:13px;line-height:1.45}
.split-ai-result.stale{opacity:.55}
.ai-refresh{margin-left:8px;background:none;border:0;color:${C.green};font-weight:700;cursor:pointer;font-size:11px;text-decoration:underline}
.muted-note{color:${C.muted};font-size:11px}
.finance-lower-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;align-items:start}
```

- [ ] **Step 2: Add `sub` support to Stat if needed**

If Task 7 added a `sub` prop, ensure `.stat small{display:block;color:${C.muted};font-size:11px;font-weight:600;margin-top:2px}` exists (add if missing).

- [ ] **Step 3: Add mobile stacking**

In the existing `@media (max-width:900px)` finance block, add `.split-coach-body,.finance-lower-grid{grid-template-columns:1fr !important}` and ensure `.stats-grid` is 2-up on mobile (reuse existing rule).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add src/styles/AppStyles.jsx
git commit -m "style(finance): split-coach hero, KPI row, responsive lower grid"
```

---

### Task 11: Verify (unit + live read-only) and deploy

**Files:** none (verification)

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: all PASS (new helpers + existing suite).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 3: Push to deploy**

```bash
git push origin main
```

- [ ] **Step 4: Live read-only verification via Playwright MCP**

After Vercel deploys, drive `https://track.vatche.me` (login already known): open Finance → Overview and confirm:
- KPI row shows Income received / Spent (% of cap) / Net / Saved — NO "1,050,000 savings plan" headline tile.
- Split-coach hero is first, full width, with the proportion bar + legend + plain-English summary + Apply / Why this order? / Refine with AI, and an On-track/Over-pace pill.
- "Refine with AI" renders labeled text inline; if it errors, an inline notice shows (never blank).
- Needs vs Wants shows Wants ≥ 0 (with "(net of refunds)" when applicable).
- No floating "0k/600k" node anywhere on the page.
- `browser_console_messages(level:error)` returns 0.

**Do NOT click Apply or Reset on production** (would mutate real cloud data).

- [ ] **Step 5: Final confirmation**

Report results to the user with screenshots. If any check fails, open a follow-up task; do not claim success without the evidence.

---

## Self-Review

**Spec coverage:** Layout (Task 7) · Split-Coach hero style B + deterministic summary (Tasks 1, 6) · actual-income base (Task 6 uses `salary`/`income`) · AI cap grounding (Task 4, 5) · stale-AI dimming (Tasks 3, 6, 8) · Wants floor (Tasks 3, 8) · savings-plan KPI reframe (Task 7) · chart leak (Task 9) · reality pill (Task 6) · responsive (Task 10) · testing unit+runtime (Tasks 1–4, 11). All spec sections map to tasks.

**Placeholder scan:** No TBD/TODO; all code shown. Task 9 step 2 is diagnostic-then-fix (acceptable — the exact leaking node must be located in the live file; the fix action is explicit: contain within `ResponsiveContainer`, remove stray text node).

**Type consistency:** Helper names consistent across tasks — `splitSummarySentence`, `forecastValues`, `isAiStale`, `wantsForDisplay`, `spendingContextBlock`, and the `fc` object shape (`projectedTotal`, `onTrack`, `safeToday`, `daysRemaining`, `dayOfMonth`, `daysInMonth`). `SplitCoachCard` props match its usage in Task 7.
