import { describe, it, expect } from "vitest";
import {
  detectBank, parseAmeria, parseIneco, parseStatement, categorize,
  classifyTxn, buildImport, matchKey,
} from "./statementImport.js";

// Synthetic statements in each bank's real layout (no private data in git).
const AMERIA = `info@ameriabank.am
Account statement* Export date: 06/07/2026
Total debits: 1,700.00 AMD
Total credits: 5,000.00 AMD
Account number: 1570024200712000
Closing balance (as of 30/06/26, 00:00): 3,300.00 AMD
Transaction date in account currency
Արմենիան
01/06/26, 02/06/26, Քարտային Ք : DOWNTOWN CAFE 1
Քարդ / փոխհաշվարկ -1,200.00 AMD -1,200.00 AMD
14:34 15:36 գործարք YEREVAN AM 2833
ներ
Արմենիան Ք : Քարտից քարտ
02/06/26, 02/06/26, Քարտային
Քարդ / փոխհաշվարկ փոխանցում +5,000.00 AMD +5,000.00 AMD
13:05 13:05 գործարք
ներ INECOBANK
Արմենիան
03/06/26, 04/06/26, Քարտային Ք : VM MARKET LLC
Քարդ / փոխհաշվարկ -500.00 AMD -500.00 AMD
10:00 11:00 գործարք YEREVAN AM 1
ներ`.split("\n");

const INECO = `INECOBANK CJSC
Account number 2050098896557001
0 +5,000.00 -1,650.00 0 0
01/06/2026 500.00 AMD -500.00 02/06/2026 Withdrawal from card account - YANDEX.GO\\70 - YANDEX.GO(AMD)
01/06/2026 1,000.00 AMD -1,000.00 02/06/2026
Withdrawal from card account - LONG ELECTRICITY NAME - COMN001ELE utility payment
01/06/2026 5,000.00 AMD +5,000.00 02/06/2026 Card replenishment - Transfer from NANEH HOVANESIAN - P2P(AMD)
01/06/2026 150.00 AMD -150.00 02/06/2026 Withdrawal from card account - TELCELL TRANSPORT\\3 - TELCELL TRANS(AMD)
+3,350.00 Balance - Closing balance of the account at the end of the day`.split("\n");

describe("detectBank", () => {
  it("detects each bank", () => {
    expect(detectBank(AMERIA.join(" "))).toBe("ameria");
    expect(detectBank(INECO.join(" "))).toBe("ineco");
    expect(detectBank("random")).toBe(null);
  });
});

describe("categorize", () => {
  it("maps merchants; transport beats plain telcell", () => {
    expect(categorize("VM MARKET LLC")).toBe("groceries");
    expect(categorize("DOWNTOWN CAFE 1")).toBe("eating_out");
    expect(categorize("YANDEX.GO")).toBe("transport");
    expect(categorize("TELCELL TRANSPORT")).toBe("transport");
    expect(categorize("TELCELL top-up")).toBe("other");
    expect(categorize("ANTHROPIC CLAUDE")).toBe("skills");
    expect(categorize("something unknown")).toBe("other");
  });
});

describe("parseAmeria", () => {
  const p = parseAmeria(AMERIA);
  it("reads stated totals + account + closing balance", () => {
    expect(p.stated.debits).toBe(1700);
    expect(p.stated.credits).toBe(5000);
    expect(p.stated.account).toBe("1570024200712000");
    expect(p.stated.closingBalance).toBe(3300);
  });
  it("parses all blocks and reconciles debits", () => {
    expect(p.txns.length).toBe(3);
    const out = p.txns.filter((t) => t.direction === "out").reduce((s, t) => s + t.amountAMD, 0);
    expect(out).toBe(1700);
  });
});

describe("parseIneco", () => {
  const p = parseIneco(INECO);
  it("reads stated totals from the summary line", () => {
    expect(p.stated.debits).toBe(1650);
    expect(p.stated.credits).toBe(5000);
    expect(p.stated.closingBalance).toBe(3350);
  });
  it("parses rows including a description that wrapped to the next line", () => {
    const out = p.txns.filter((t) => t.direction === "out").reduce((s, t) => s + t.amountAMD, 0);
    expect(out).toBe(1650); // 500 + 1000(wrapped electricity) + 150
    const elec = p.txns.find((t) => t.amountAMD === 1000);
    expect(elec.desc.toLowerCase()).toContain("electricity");
  });
});

describe("classifyTxn", () => {
  it("classifies expense / internal / fee / income", () => {
    expect(classifyTxn({ merchant: "VM MARKET", desc: "VM MARKET", direction: "out" }).kind).toBe("expense");
    expect(classifyTxn({ merchant: "x", desc: "Currency exchange", direction: "in" }).kind).toBe("internal");
    expect(classifyTxn({ merchant: "x", desc: "SMS fee - SMS FEE", direction: "out" }).kind).toBe("fee");
    expect(classifyTxn({ merchant: "x", desc: "Card replenishment - Personal transfer", direction: "in" }).kind).toBe("internal");
    const inc = classifyTxn({ merchant: "x", desc: "Card replenishment - Transfer from NANEH HOVANESIAN - P2P", direction: "in" });
    expect(inc.kind).toBe("income");
    expect(inc.label).toContain("NANEH");
  });
  it("does NOT drop an outgoing purchase just because it contains a bank name", () => {
    // incoming card-to-card (bank name only) is internal…
    expect(classifyTxn({ merchant: "INECOBANK", desc: "INECOBANK", direction: "in" }).kind).toBe("internal");
    // …but an outgoing purchase at an Inecobank-branded merchant is a real expense
    expect(classifyTxn({ merchant: "INECOBANK POS TERMINAL", desc: "INECOBANK POS TERMINAL", direction: "out" }).kind).toBe("expense");
  });
});

describe("buildImport", () => {
  it("produces reconciled expenses, one income, ignores internal transfers", () => {
    const r = buildImport([parseAmeria(AMERIA), parseIneco(INECO)], []);
    // Ameria: Downtown + VM (2). Ineco: Yandex + electricity + telcell (3). = 5 expenses.
    expect(r.expenses.length).toBe(5);
    expect(r.credits.filter((c) => c.include).length).toBe(1); // Naneh only
    expect(r.reconciliation.every((x) => x.ok)).toBe(true);
    expect(r.balances.length).toBe(2);
  });

  it("dedup keep-newer: a matching existing expense is flagged dupOfId", () => {
    const existing = [{
      id: "old-1", source: "Ameriabank", date: "2026-06-01", amountAMD: 1200, note: "DOWNTOWN CAFE 1 YEREVAN AM 2833",
    }];
    const r = buildImport([parseAmeria(AMERIA)], existing);
    const dup = r.expenses.find((e) => e.expense.amountAMD === 1200);
    expect(dup.dupOfId).toBe("old-1"); // caller removes old, keeps this newer one
  });
});

describe("regression: review-found bugs", () => {
  it("wrapped-desc fallback does NOT swallow a non-description footer line", () => {
    const WRAP = `INECOBANK CJSC
Account number 205
0 +0.00 -500.00 0 0
01/06/2026 500.00 AMD -500.00 02/06/2026
The end of the statement`.split("\n");
    const p = parseIneco(WRAP);
    expect(p.txns[0].merchant.toLowerCase()).not.toContain("end of the statement");
  });

  it("aggregated bank-fee expense is deduped on re-import (keep-newer)", () => {
    const FEE = `INECOBANK CJSC
Account number 205
0 +0.00 -60.00 0 0
01/06/2026 60.00 AMD -60.00 02/06/2026 SMS fee - SMS FEE`.split("\n");
    const first = buildImport([parseIneco(FEE)], []);
    const fee = first.expenses.find((e) => e.expense.source === "Bank fees");
    expect(fee).toBeTruthy();
    const second = buildImport([parseIneco(FEE)], [fee.expense]);
    const fee2 = second.expenses.find((e) => e.expense.source === "Bank fees");
    expect(fee2.dupOfId).toBe(fee.expense.id); // flagged so the caller replaces, not duplicates
  });

  it("fees are attributed to their own statement's month, not a global-latest date", () => {
    const JUNE = `INECOBANK CJSC
Account number 1
0 +0.00 -60.00 0 0
15/06/2026 60.00 AMD -60.00 16/06/2026 SMS fee - SMS FEE`.split("\n");
    const JULY = `INECOBANK CJSC
Account number 2
0 +0.00 -60.00 0 0
15/07/2026 60.00 AMD -60.00 16/07/2026 SMS fee - SMS FEE`.split("\n");
    const r = buildImport([parseIneco(JUNE), parseIneco(JULY)], []);
    const feeDates = r.expenses.filter((e) => e.expense.source === "Bank fees").map((e) => e.expense.date);
    expect(feeDates).toContain("2026-06-15");
    expect(feeDates).toContain("2026-07-15");
  });
});

describe("matchKey", () => {
  it("is stable across case/whitespace of the same merchant", () => {
    expect(matchKey("ameria", "2026-06-01", 1200, "DOWNTOWN CAFE 1"))
      .toBe(matchKey("ameria", "2026-06-01", 1200.0, "  downtown cafe 1  "));
  });
});
