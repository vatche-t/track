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

  it("says on track when under cap", () => {
    const b = spendingContextBlock({ spendingCap: 300000, projectedTotal: 149000, onTrack: true });
    expect(b.toLowerCase()).toContain("on track");
  });
});
