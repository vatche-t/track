import { describe, it, expect } from "vitest";
import { chartTakeaway, buildInsights } from "./coach.js";

describe("chartTakeaway", () => {
  it("forecast: over-pace cites projection, cap, and % over", () => {
    const s = chartTakeaway("forecast", { projectedTotal: 516120, spendingCap: 300000, onTrack: false });
    expect(s).toContain("516,120");
    expect(s).toContain("300,000");
    expect(s).toMatch(/72%|over/);
  });
  it("forecast: on track is reassuring", () => {
    const s = chartTakeaway("forecast", { projectedTotal: 149000, spendingCap: 300000, onTrack: true });
    expect(s.toLowerCase()).toContain("on track");
  });
  it("trend: more than last month", () => {
    expect(chartTakeaway("trend", { thisMonth: 280000, lastMonth: 200000, hasHistory: true }))
      .toMatch(/40% more/);
  });
  it("trend: no history prompts to keep logging", () => {
    expect(chartTakeaway("trend", { hasHistory: false })).toMatch(/keep logging/i);
  });
  it("category: names the top category and its share", () => {
    const s = chartTakeaway("category", { topName: "Dining", topValue: 38000, total: 100000 });
    expect(s).toContain("Dining");
    expect(s).toContain("38%");
  });
  it("variance: all within plan", () => {
    expect(chartTakeaway("variance", { overCount: 0, total: 4 })).toMatch(/within plan/i);
  });
});

describe("buildInsights", () => {
  it("surfaces over-pace as the top high-severity insight", () => {
    const ins = buildInsights({
      totals: { net: 100000, income: 523000, spent: 223652 },
      fc: { onTrack: false, projectedTotal: 516120, safeToday: 4491 },
      spendingCap: 300000,
      categories: [],
      dayOfMonth: 13,
    });
    expect(ins[0].severity).toBe("high");
    expect(ins[0].id).toBe("over-pace");
    expect(ins[0].body).toContain("516,120");
  });

  it("flags net-negative and concentration", () => {
    const ins = buildInsights({
      totals: { net: -20000, income: 100000, spent: 120000 },
      fc: { onTrack: true, projectedTotal: 120000, safeToday: 0 },
      spendingCap: 300000,
      categories: [{ name: "Rent", value: 90000 }, { name: "Food", value: 30000 }],
      dayOfMonth: 15,
    });
    expect(ins.some((i) => i.id === "net-negative" && i.severity === "high")).toBe(true);
    expect(ins.some((i) => i.id === "cat-Rent" && i.severity === "med")).toBe(true);
  });

  it("falls back to an encouraging low insight when all is well", () => {
    const ins = buildInsights({
      totals: { net: 50000, income: 100000, spent: 40000 },
      fc: { onTrack: true, projectedTotal: 80000, safeToday: 5000 },
      spendingCap: 300000,
      // Even spread so no single category hits the 40% concentration rule.
      categories: [{ name: "Food", value: 15000 }, { name: "Transport", value: 15000 }, { name: "Fun", value: 14000 }],
      dayOfMonth: 15,
    });
    expect(ins[0].id).toBe("all-good");
    expect(ins[0].severity).toBe("low");
  });

  it("greets at the start of a new month", () => {
    const ins = buildInsights({
      totals: { net: 10000, income: 523000, spent: 5000 },
      fc: { onTrack: true, projectedTotal: 30000, safeToday: 9000 },
      spendingCap: 300000,
      categories: [],
      dayOfMonth: 2,
    });
    expect(ins.some((i) => i.id === "new-month")).toBe(true);
  });
});
