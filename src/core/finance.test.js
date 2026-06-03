import { describe, it, expect } from "vitest";
import {
  CURRENT_SCHEMA,
  allocationSuggestion,
  ensureActiveMonth,
  financeTotals,
  getMonth,
  normalizeFinance,
} from "./finance.js";

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
