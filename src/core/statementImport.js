// Statement import — parses Ameriabank + Inecobank PDF account statements
// (already text-extracted into lines) into categorized expenses, income/top-up
// candidates, and closing balances, with a reconciliation guard against each
// statement's own stated totals so we never silently import wrong data.
//
// The PDF→text extraction happens in the browser (pdf.js) or in tests; this
// module is pure and takes an array of text lines. Everything here is unit
// tested — it is the single source of truth for how a statement becomes data.

// ── Category rules ─────────────────────────────────────────────────────────
// Ordered: first matching keyword wins (so "telcell transport" beats "telcell").
const CATEGORY_RULES = [
  ["transport", ["telcell transport", "yandex.go", "yandex ", "jet app", "royal oil", "upay", "uber", "gg taxi"]],
  ["eating_out", [
    "downtown", "foodcourt", "food court", "cafe", "coffee", "gril.am", "gaudis", "kfc",
    "shamrock", "beatles", "churchil", "forty 44", "patricks", "atenk", "abu hagop",
    "rolling fuds", "newvend", "yandex eats", "yandex eats am", "glovo", "libananyan",
    "veracnund", "fry day", "academy by", "in vino", "gril", "pub", "restaurant", "pizza",
    "burger", "food",
  ]],
  ["groceries", [
    "vm market", "sas ", "yerevan city", "yerevan-city", "parma", "88 supermarket",
    "home supermarket", "home group", "arevsam", "nor zovq", "pak shuka", "hasmik simonyan",
    "grocery", "market", "supermarket", "dalma",
  ]],
  ["utilities", ["ucom", "electricity", "utility", "veon", "vivacell", "internet", " gas ", "water", "էլ. էն"]],
  ["skills", ["anthropic", "claude", "openai", "chatgpt", "proton", "godaddy", "gradaran", "coursera", "udemy", "book"]],
  ["fun", ["esthetic joys", "spotify", "glide adventures", "eventtoura", "new yorker", "terranova", "cinema", "cinemastar", "wildberries"]],
  ["health", ["pharm", "gedeon richter", "natali", "clinic", "medicine", "farm", "դեղատուն"]],
  ["other", ["telcell", "idram", "globbing", "press stand", "evrika", "wwf", "pinduoduo", "atm ", "godaddy"]],
];

const CATEGORY_NAME = {
  groceries: "Groceries", eating_out: "Eating out", transport: "Transport",
  utilities: "Utilities", health: "Health", skills: "Skills", fun: "Fun", other: "Other",
};

export function categorize(merchant) {
  const m = String(merchant || "").toLowerCase();
  for (const [id, keys] of CATEGORY_RULES) {
    if (keys.some((k) => m.includes(k))) return id;
  }
  return "other";
}

// ── Helpers ────────────────────────────────────────────────────────────────
const num = (s) => Number(String(s).replace(/,/g, "")) || 0;
const iso2 = (dmy) => {
  // "04/06/26" -> 2026-06-04 ; "04/06/2026" -> 2026-06-04
  const [d, mo, y] = dmy.split("/");
  const yr = y.length === 2 ? `20${y}` : y;
  return `${yr}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
};
// Keep ASCII-ish merchant text: drop Armenian letters and boilerplate noise.
const cleanMerchant = (s) =>
  String(s)
    .replace(/\*\s*This document[\s\S]*$/i, " ")   // strip the statement footer
    .replace(/[Ա-Ֆա-ֆ]+/g, " ")            // Armenian letters
    .replace(/[«»“”"]/g, " ")               // quote marks around Armenian company names
    .replace(/\bՔ\s*:\s*/g, " ")
    .replace(/[+-]?[\d,]+\.\d{2}\s*AMD/gi, " ") // amounts
    .replace(/\b\d{2}:\d{2}\b/g, " ")       // times
    .replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, " ") // dates
    .replace(/\bAMD\b/g, " ")
    .replace(/\bAM\s+\d+\b/g, " ")          // Ameria terminal/location codes ("AM 319273")
    .replace(/\s\d{5,}\b/g, " ")            // trailing long reference numbers
    .replace(/[,:;/\\]+/g, " ")             // stray punctuation left by removed tokens
    .replace(/\s+/g, " ")
    .trim();

// A stable key for dedup (bank + date + amount + merchant head).
export function matchKey(bank, date, amountAMD, merchant) {
  const head = String(merchant || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14);
  return `${bank}|${date}|${Math.round(amountAMD)}|${head}`;
}

// ── Bank detection ─────────────────────────────────────────────────────────
export function detectBank(text) {
  const t = String(text).toLowerCase();
  if (t.includes("ameriabank")) return "ameria";
  if (t.includes("inecobank")) return "ineco";
  return null;
}

// ── Classification (direction + description → kind/category) ────────────────
export function classifyTxn(txn) {
  const d = `${txn.merchant} ${txn.desc || ""}`.toLowerCase();
  const out = txn.direction === "out";
  if (/currency exchange|փոխանակ/.test(d)) return { kind: "internal" };
  if (/sms fee|transfer fee|commission|միջնորդավճար|գանձում/.test(d)) return { kind: "fee" };
  // Explicit transfer wording (both directions). The bank NAME alone (e.g.
  // "INECOBANK", left after Armenian is stripped from an Ameria card-to-card
  // credit) only signals an internal move for INCOMING money — an outgoing
  // purchase at an Inecobank-branded merchant must NOT be dropped as internal.
  const transferKw = /card replenishment|replenishment|personal transfer|transfer to card|քարտից քարտ|card to card/.test(d);
  const bankNameOnly = /\binecobank\b|\bameriabank\b/.test(d);
  if (transferKw || (bankNameOnly && !out)) {
    if (out) return { kind: "internal" };                 // moving own money out
    // incoming transfer: named external person => income candidate, else internal
    const fromName = (txn.desc || "").match(/from\s+([A-Za-z][A-Za-z\s.]+?)(?:\s*-|\s+P2P|\s*\(|$)/i);
    if (fromName) return { kind: "income", label: `From ${fromName[1].trim()}` };
    return { kind: "internal" };
  }
  if (out) {
    const categoryId = categorize(txn.merchant + " " + (txn.desc || ""));
    return { kind: "expense", categoryId, categoryName: CATEGORY_NAME[categoryId] };
  }
  return { kind: "income", label: cleanMerchant(txn.merchant) || "Income" };
}

// ── Ameriabank parser ──────────────────────────────────────────────────────
// Each transaction is a ~5-line block: [prefix, dateLine, amountLine, timesLine, endLine].
// We anchor on the "DD/MM/YY, DD/MM/YY," date line (one per transaction).
const AMERIA_DATELINE = /^(\d{2}\/\d{2}\/\d{2}),\s+(\d{2}\/\d{2}\/\d{2}),/;
const AMOUNT_RE = /([+-])\s?([\d,]+\.\d{2})\s*AMD/;

export function parseAmeria(lines) {
  const stated = { debits: 0, credits: 0, account: null, closingBalance: null };
  for (const l of lines) {
    let m;
    if ((m = l.match(/Total debits:\s*([\d,]+\.\d{2})/))) stated.debits = num(m[1]);
    if ((m = l.match(/Total credits:\s*([\d,]+\.\d{2})/))) stated.credits = num(m[1]);
    if ((m = l.match(/Account number:\s*(\d+)/))) stated.account = m[1];
    if ((m = l.match(/Closing balance \(as of[^)]*\):\s*([\d,]+\.\d{2})/))) stated.closingBalance = num(m[1]);
  }
  const idx = [];
  lines.forEach((l, i) => { if (AMERIA_DATELINE.test(l)) idx.push(i); });
  const txns = [];
  for (const i of idx) {
    const block = lines.slice(Math.max(0, i - 1), i + 4);
    const blob = block.join(" ");
    const am = blob.match(AMOUNT_RE);
    if (!am) continue;
    const date = iso2(lines[i].match(AMERIA_DATELINE)[1]);
    const amountAMD = num(am[2]);
    const direction = am[1] === "-" ? "out" : "in";
    const merchant = cleanMerchant(blob);
    txns.push({ bank: "ameria", date, amountAMD, direction, merchant, desc: merchant });
  }
  return { bank: "ameria", stated, txns };
}

// ── Inecobank parser ───────────────────────────────────────────────────────
// Clean rows: "DD/MM/YYYY AMOUNT CUR ±AMD [exch] DD/MM/YYYY <description>".
// A long merchant name sometimes wraps, leaving the description on the NEXT
// line — so the row head (through the settlement date) and the description are
// captured separately, and the description falls back to the following line.
const INECO_HEAD = /^(\d{2}\/\d{2}\/\d{4})\s+([\d,]+\.\d{2})\s+([A-Z]{3})\s+([+-])([\d,]+\.\d{2})\s+(?:\+[\d,.]+\s+)?(\d{2}\/\d{2}\/\d{4})\s*(.*)$/;

export function parseIneco(lines) {
  const stated = { debits: 0, credits: 0, account: null, closingBalance: null };
  let lastBalance = null;
  for (const l of lines) {
    let m;
    if ((m = l.match(/Account number\s+(\d+)/))) stated.account = m[1];
    // Summary line: "0 +265,657.90 -187,834.40 0 0"
    if ((m = l.match(/([+-]?[\d,]+\.\d{2})\s+(-[\d,]+\.\d{2})\s+0\s+0\s*$/))) {
      stated.credits = Math.abs(num(m[1]));
      stated.debits = Math.abs(num(m[2]));
    }
    if ((m = l.match(/([+-][\d,]+\.\d{2})\s+Balance\s*-\s*Closing balance/))) lastBalance = num(m[1]);
  }
  stated.closingBalance = lastBalance;
  const txns = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(INECO_HEAD);
    if (!m) continue;
    const date = iso2(m[1]);
    const amountAMD = num(m[5]);
    const direction = m[4] === "-" ? "out" : "in";
    let desc = (m[7] || "").trim();
    // Description wrapped to the next line when the merchant name is long. Only
    // adopt it if it actually looks like a transaction description — otherwise a
    // wrapped LAST row could swallow a summary/footer/header line as the merchant.
    if (!desc && lines[i + 1]
      && /^(Withdrawal from card account|Card replenishment|Currency exchange|Utility|Transfer|SMS fee|Cash)/i.test(lines[i + 1].trim())) {
      desc = lines[i + 1].trim();
    }
    // Merchant = between "Withdrawal from card account - " and first "\" or " - ".
    let merchant = desc.replace(/^Withdrawal from card account\s*-\s*/i, "");
    merchant = merchant.split("\\")[0].split(" - ")[0].trim();
    txns.push({ bank: "ineco", date, amountAMD, direction, merchant, desc, account: stated.account });
  }
  return { bank: "ineco", stated, txns };
}

export function parseStatement(lines) {
  const bank = detectBank(lines.join(" "));
  if (bank === "ameria") return parseAmeria(lines);
  if (bank === "ineco") return parseIneco(lines);
  return { bank: null, stated: {}, txns: [] };
}

// ── Build an import preview from one or more parsed statements ──────────────
// existingExpenses: current finance.expenses (for dedup / keep-newer).
export function buildImport(parsedList, existingExpenses = []) {
  const existingKeys = new Map(); // key -> existing expense id
  for (const e of existingExpenses) {
    existingKeys.set(matchKey(bankShort(e.source), e.date, +e.amountAMD || 0, e.note), e.id);
  }
  const expenses = [];
  const credits = [];
  let totalFees = 0;
  const seen = new Set();
  const reconciliation = [];
  const balances = [];
  const FEE_NOTE = "Bank fees (SMS, transfers, commissions)";

  for (const p of parsedList) {
    let parsedOut = 0, parsedIn = 0;
    let stmtFees = 0;                                    // fees for THIS statement only
    for (const t of p.txns) {
      if (t.direction === "out") parsedOut += t.amountAMD; else parsedIn += t.amountAMD;
      const cls = classifyTxn(t);
      if (cls.kind === "fee") { stmtFees += t.amountAMD; continue; }
      if (cls.kind === "internal") continue;
      if (cls.kind === "income") {
        credits.push({
          key: `cr-${t.bank}-${t.date}-${Math.round(t.amountAMD)}-${credits.length}`,
          bank: t.bank, date: t.date, amountAMD: t.amountAMD, label: cls.label, include: isNamedIncome(t),
        });
        continue;
      }
      // expense — dedup within this batch, and flag/keep-newer vs existing
      const key = matchKey(t.bank, t.date, t.amountAMD, t.merchant);
      if (seen.has(key)) continue;
      seen.add(key);
      const dupOfId = existingKeys.get(key) || null;
      expenses.push({
        key, dupOfId,
        expense: {
          id: `imp-${t.bank}-${t.date}-${Math.round(t.amountAMD)}-${expenses.length}`,
          date: t.date, note: t.merchant,
          amount: t.amountAMD, amountAMD: t.amountAMD, originalAmount: t.amountAMD,
          currency: "AMD", fxRate: 1, source: bankLong(t.bank),
          categoryId: cls.categoryId, categoryName: cls.categoryName,
        },
      });
    }
    // One aggregated fee expense PER statement, dated to that statement's own
    // latest transaction date (so fees land in the right month), with keep-newer
    // dedup like any other expense.
    if (stmtFees > 0 && p.txns.length) {
      totalFees += stmtFees;
      const date = p.txns.map((t) => t.date).sort().slice(-1)[0];
      const amt = Math.round(stmtFees);
      const key = matchKey("bank fees", date, amt, FEE_NOTE);
      expenses.push({
        key, dupOfId: existingKeys.get(key) || null,
        expense: {
          id: `imp-fees-${p.bank}-${date}`, date, note: FEE_NOTE,
          amount: amt, amountAMD: amt, originalAmount: amt,
          currency: "AMD", fxRate: 1, source: "Bank fees", categoryId: "other", categoryName: "Other",
        },
      });
    }
    const statedDebits = p.stated?.debits || 0;
    reconciliation.push({
      bank: p.bank, account: p.stated?.account || null,
      parsedDebits: Math.round(parsedOut), statedDebits: Math.round(statedDebits),
      ok: statedDebits === 0 || Math.abs(parsedOut - statedDebits) < 1,
      diff: Math.round(parsedOut - statedDebits),
    });
    if (p.stated?.closingBalance != null) {
      balances.push({ bank: p.bank, account: p.stated.account, closingBalance: p.stated.closingBalance });
    }
  }
  return { expenses, credits, fees: Math.round(totalFees), reconciliation, balances };
}

function isNamedIncome(t) {
  return /transfer from\s+[a-z]/i.test(t.desc || "");
}
function bankShort(source) {
  const s = String(source || "").toLowerCase();
  if (s.includes("ameria")) return "ameria";
  if (s.includes("ineco")) return "ineco";
  return s;
}
function bankLong(bank) {
  return bank === "ameria" ? "Ameriabank" : bank === "ineco" ? "Inecobank" : bank;
}

export { CATEGORY_NAME };
