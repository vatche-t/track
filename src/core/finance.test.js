import { describe, it, expect } from "vitest";
import {
  CURRENT_SCHEMA,
  allocationSuggestion,
  ensureActiveMonth,
  ensureStarterExpenses,
  financeTotals,
  forecastValues,
  getMonth,
  isAiStale,
  normalizeFinance,
  spendNudge,
  splitSummarySentence,
  wantsForDisplay,
} from "./finance.js";
import { localDate, monthKey } from "./date.js";

describe("finance smoke", () => {
  it("normalizes an empty object", () => {
    expect(normalizeFinance({})).toBeTruthy();
  });
});

describe("month model", () => {
  it("month setup gets defaults when absent", () => {
    const f = normalizeFinance({});
    const key = Object.keys(f.months)[0];
    expect(f.months[key].income.length).toBeGreaterThan(0);
    expect(f.months[key].contributions).toEqual({});
    expect(f.schemaVersion).toBe(CURRENT_SCHEMA);
  });

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
    expect(m.contributions.house).toBe(600000);
    expect(f.income).toBe(m.income);
  });

  it("getMonth carries forward an editable copy without mutating source", () => {
    const f = normalizeFinance({
      months: {
        "2026-05": {
          income: [{ id: "i", name: "Salary", budget: 1000, actual: 1000 }],
          fixed: [],
          variable: [],
          contributions: {},
        },
      },
      activeMonth: "2026-05",
    });
    const june = getMonth(f, "2026-06");
    june.income[0].actual = 999;
    expect(f.months["2026-05"].income[0].actual).toBe(1000);
    expect(june.income[0].id).not.toBe("i");
  });

  it("ensureActiveMonth creates the current month", () => {
    const f = ensureActiveMonth({
      months: { "2020-01": { income: [], fixed: [], variable: [], contributions: {} } },
      activeMonth: "2020-01",
    });
    expect(f.months[f.activeMonth]).toBeTruthy();
    expect(f.activeMonth.length).toBe(7);
  });

  it("financeTotals scopes to the given month", () => {
    const f = normalizeFinance({
      months: {
        "2026-06": {
          income: [{ id: "i", name: "S", budget: 1200000, actual: 523000 }],
          fixed: [{ id: "f", name: "Rent", budget: 90000, actual: 0 }],
          variable: [],
          contributions: { house: 600000 },
        },
      },
      activeMonth: "2026-06",
      savings: [{ id: "house", name: "House", target: 7500000, saved: 0, monthly: 600000 }],
      categories: [
        { id: "rent", name: "Rent", type: "fixed" },
        { id: "groceries", name: "Groceries", type: "variable" },
      ],
      expenses: [
        { id: "a", date: "2026-06-01", note: "Rent", amount: 180000, currency: "AMD", amountAMD: 180000, categoryId: "rent", categoryName: "Rent" },
        { id: "b", date: "2026-05-01", note: "Old", amount: 999, currency: "AMD", amountAMD: 999, categoryId: "groceries", categoryName: "Groceries" },
      ],
    });
    const t = financeTotals(f, "2026-06");
    expect(t.income).toBe(523000);
    expect(t.spent).toBe(180000);
    expect(t.fixed).toBe(180000);
    expect(t.net).toBe(343000);
    expect(t.monthlyGoal).toBe(600000);
    expect(t.planBalance).toBe(1200000 - 90000 - 0 - 600000);
  });

  it("splits spend into essential vs discretionary", () => {
    const f = normalizeFinance({
      months: { "2026-06": { income: [], fixed: [], variable: [], contributions: {} } },
      activeMonth: "2026-06",
      expenses: [
        { id: "a", date: "2026-06-01", note: "Rent", amount: 90000, currency: "AMD", amountAMD: 90000, categoryId: "rent", categoryName: "Rent" },
        { id: "b", date: "2026-06-02", note: "Smokes", amount: 5000, currency: "AMD", amountAMD: 5000, categoryId: "cigarettes", categoryName: "Cigarettes" },
      ],
    });
    const t = financeTotals(f, "2026-06");
    expect(t.essentialSpent).toBe(90000);
    expect(t.discretionarySpent).toBe(5000);
  });
});

describe("spend nudge", () => {
  it("flags when today's spend exceeds the adaptive safe daily", () => {
    const today = localDate();
    const f = normalizeFinance({
      months: { [monthKey()]: { income: [], fixed: [], variable: [], contributions: {} } },
      activeMonth: monthKey(),
      expenses: [
        { id: "a", date: today, note: "Splurge", amount: 90000, currency: "AMD", amountAMD: 90000, categoryId: "fun", categoryName: "Fun" },
      ],
    });
    // cap 300000 spread over the remaining days; one 90000 day should blow it.
    const n = spendNudge(f, 300000);
    expect(n.spentToday).toBe(90000);
    expect(n.over).toBe(true);
    expect(n.overBy).toBeGreaterThan(0);
  });

  it("does not flag a small spend", () => {
    const today = localDate();
    const f = normalizeFinance({
      months: { [monthKey()]: { income: [], fixed: [], variable: [], contributions: {} } },
      activeMonth: monthKey(),
      expenses: [
        { id: "a", date: today, note: "Coffee", amount: 800, currency: "AMD", amountAMD: 800, categoryId: "eating_out", categoryName: "Eating out" },
      ],
    });
    expect(spendNudge(f, 300000).over).toBe(false);
  });
});

describe("goal sequencing waterfall", () => {
  it("fully funds the top-priority goal before the next", () => {
    const savings = [
      { id: "house", name: "House down payment", target: 7500000, saved: 0, monthly: 0, priority: 4 },
      { id: "emergency", name: "Emergency fund", target: 200000, saved: 0, monthly: 0, priority: 1 },
    ];
    // income 700000: cap 300000 + flex 50000 = leaves 350000 for goals.
    const plan = allocationSuggestion(700000, savings);
    const emergency = plan.find((p) => p.name === "Emergency fund");
    const house = plan.find((p) => p.name === "House down payment");
    expect(emergency.amount).toBe(200000); // filled to its gap first
    expect(house.amount).toBe(150000);     // remainder rolls down
  });
});

describe("savings dedupe + explicit-zero preservation", () => {
  it("normalizeFinance drops duplicate-id savings (keeps first)", () => {
    const f = normalizeFinance({
      savings: [
        { id: "a", name: "Wedding", target: 6000000, monthly: 100000 },
        { id: "a", name: "Fiancee support buffer", target: 1000000, monthly: 100000 },
        { id: "b", name: "Travel", target: 600000, monthly: 50000 },
      ],
    });
    const ids = f.savings.map((s) => s.id);
    expect(ids.filter((x) => x === "a").length).toBe(1);
    expect(f.savings.find((s) => s.id === "a").name).toBe("Wedding");
  });

  it("ensureStarterExpenses preserves an explicit monthly:0 on a default-named fund", () => {
    const out = ensureStarterExpenses({
      seededStarterExpenses: true,
      seededCoreSavingsFunds: true,
      savings: [{ id: "emergency-fund", name: "Emergency fund", target: 1500000, monthly: 0, saved: 0 }],
    });
    const em = out.savings.find((s) => s.id === "emergency-fund");
    expect(em.monthly).toBe(0); // not reset to the default monthly
  });

  it("normalizeFinance preserves the seed flags (so re-seed never re-fires)", () => {
    const f = normalizeFinance({ seededStarterExpenses: true, seededCoreSavingsFunds: true, savings: [] });
    expect(f.seededStarterExpenses).toBe(true);
    expect(f.seededCoreSavingsFunds).toBe(true);
  });

  it("ensureStarterExpenses does not re-seed default funds once the flag is set", () => {
    const out = ensureStarterExpenses({
      seededStarterExpenses: true,
      seededCoreSavingsFunds: true,
      savings: [{ id: "x", name: "Apartment down payment", target: 13000000, monthly: 860000, saved: 0 }],
    });
    expect(out.savings.length).toBe(1);
  });
});

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
    expect(s).toMatch(/123,000 AMD .*unassigned|add .* goal/i);
  });

  it("prompts to log income when income is zero", () => {
    expect(splitSummarySentence([], 0)).toMatch(/log .* income/i);
  });
});

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

describe("isAiStale", () => {
  const month = "2026-06";
  it("fresh same-month recent timestamp is not stale", () => {
    // Use a fixed mid-month date to avoid month-boundary flakiness.
    const iso = "2026-06-13T10:00:00.000Z";
    const realNow = Date.now;
    Date.now = () => new Date("2026-06-13T11:00:00.000Z").getTime();
    expect(isAiStale(iso, month)).toBe(false);
    Date.now = realNow;
  });
  it("older than 24h is stale", () => {
    const iso = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    expect(isAiStale(iso, new Date().toISOString().slice(0, 7))).toBe(true);
  });
  it("generated in a different month is stale", () => {
    const iso = new Date().toISOString();
    expect(isAiStale(iso, "2000-01")).toBe(true);
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
