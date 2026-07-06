import { useMemo, useRef, useState } from "react";
import { Upload, CheckCircle2, AlertTriangle, FileText, X } from "lucide-react";
import { Modal } from "../components/Modal";
import { Button } from "../components/ui";
import { buildImport, parseStatement, CATEGORY_NAME } from "../core/statementImport";
import { getMonth } from "../core/finance";

const AMD = "AMD";
const amd = (n) => `${Math.round(+n || 0).toLocaleString()} AMD`;
const CAT_IDS = Object.keys(CATEGORY_NAME);

// Extract text lines from a PDF File using pdf.js (lazy-loaded so it costs
// nothing until the user actually imports). Groups text items into visual
// lines by y-coordinate — the same shape statementImport.js expects.
async function extractLines(file) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  ).default;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const byY = {};
    for (const it of tc.items) {
      if (!it.str.trim() && it.str !== " ") continue;
      const y = Math.round(it.transform[5]);
      (byY[y] = byY[y] || []).push({ x: it.transform[4], s: it.str });
    }
    Object.keys(byY)
      .map(Number)
      .sort((a, b) => b - a)
      .forEach((y) => {
        const line = byY[y].sort((a, b) => a.x - b.x).map((o) => o.s).join(" ").replace(/\s+/g, " ").trim();
        if (line) out.push(line);
      });
  }
  return out;
}

const bankLabel = (b) => (b === "ameria" ? "Ameriabank" : b === "ineco" ? "Inecobank" : b || "Statement");

export function StatementImportModal({ open, onClose, model, updateFinance }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);   // buildImport output
  const [fileNames, setFileNames] = useState([]);
  const [excluded, setExcluded] = useState({}); // key -> true (skip)
  const [catOverride, setCatOverride] = useState({}); // key -> categoryId
  const [creditOn, setCreditOn] = useState({}); // key -> bool
  const [balTarget, setBalTarget] = useState({}); // balanceIdx -> accountId
  const [overrideRecon, setOverrideRecon] = useState(false);
  const inputRef = useRef(null);

  const accounts = model.accounts || [];

  const reset = () => {
    setResult(null); setError(""); setFileNames([]); setExcluded({});
    setCatOverride({}); setCreditOn({}); setBalTarget({}); setOverrideRecon(false);
  };
  const close = () => { reset(); onClose(); };

  const onFiles = async (files) => {
    const list = Array.from(files || []).filter((f) => /\.pdf$/i.test(f.name));
    if (!list.length) { setError("Please choose PDF statement files."); return; }
    setBusy(true); setError("");
    try {
      const parsed = [];
      for (const f of list) parsed.push(parseStatement(await extractLines(f)));
      const unknown = parsed.find((p) => !p.bank);
      if (unknown) throw new Error("Couldn't recognize one file as an Ameria or Inecobank statement.");
      const r = buildImport(parsed, model.expenses || []);
      setResult(r);
      setFileNames(list.map((f) => f.name));
      // default credit toggles + balance targets (heuristic match by bank)
      const c = {}; r.credits.forEach((x) => { c[x.key] = x.include; }); setCreditOn(c);
      const bt = {};
      r.balances.forEach((b, i) => {
        const pre = accounts.find((a) => (a.statementAccount || "") === b.account)
          || accounts.find((a) => String(a.name || "").toLowerCase().includes(b.bank));
        bt[i] = pre ? pre.id : "";
      });
      setBalTarget(bt);
    } catch (e) {
      setError(e?.message || "Failed to read the statement.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // Grouped expenses for the review, honoring category overrides.
  const grouped = useMemo(() => {
    if (!result) return [];
    const g = {};
    result.expenses.forEach((e) => {
      const catId = catOverride[e.key] || e.expense.categoryId;
      const name = CATEGORY_NAME[catId] || e.expense.categoryName;
      (g[name] = g[name] || []).push(e);
    });
    return Object.entries(g).sort((a, b) => sumRows(b[1]) - sumRows(a[1]));
  }, [result, catOverride, excluded]);

  function sumRows(rows) {
    return rows.filter((e) => !excluded[e.key]).reduce((s, e) => s + e.expense.amountAMD, 0);
  }

  const reconOk = result ? result.reconciliation.every((r) => r.ok) : true;
  const includedExpenses = result ? result.expenses.filter((e) => !excluded[e.key]) : [];
  const dupCount = includedExpenses.filter((e) => e.dupOfId).length;
  const totalIn = result ? result.credits.filter((c) => creditOn[c.key]).reduce((s, c) => s + c.amountAMD, 0) : 0;
  const totalOut = includedExpenses.reduce((s, e) => s + e.expense.amountAMD, 0);

  const doImport = () => {
    updateFinance((p) => {
      const next = { ...p };
      // 1. Keep-newer dedup: drop existing expenses matched by an included row.
      const dupIds = new Set(includedExpenses.filter((e) => e.dupOfId).map((e) => e.dupOfId));
      const kept = (p.expenses || []).filter((e) => !dupIds.has(e.id));
      const added = includedExpenses.map((e) => {
        const catId = catOverride[e.key] || e.expense.categoryId;
        return { ...e.expense, categoryId: catId, categoryName: CATEGORY_NAME[catId] || e.expense.categoryName };
      });
      next.expenses = [...kept, ...added];

      // 2. Income top-ups → months[month].income, deduped by id (keep-newer) so
      //    re-importing the same statement never double-counts income. A month
      //    that doesn't exist yet is seeded from the carried-forward plan (rent,
      //    utilities, salary baseline) — not a bare empty month.
      const months = { ...(p.months || {}) };
      (result.credits || []).filter((c) => creditOn[c.key]).forEach((c) => {
        const mk = c.date.slice(0, 7);
        const base = months[mk] || getMonth(p, mk);
        const m = { ...base, income: [...(base.income || [])] };
        m.income = m.income.filter((r) => r.id !== c.key); // drop prior copy (keep-newer)
        m.income.push({
          id: c.key, name: c.label || "Top-up", actual: Math.round(c.amountAMD),
          budget: Math.round(c.amountAMD), saved: 0, target: 0, monthly: 0, targetDate: "",
        });
        months[mk] = m;
      });
      next.months = months;

      // 3. Wealth: set matched account balances to statement closing balances.
      //    Use the LAST matching balance so two statements mapped to one account
      //    don't silently drop the later (correct) closing balance.
      const mapped = (p.accounts || []).map((a) => {
        const hits = (result.balances || []).filter((b, i) => balTarget[i] === a.id);
        const hit = hits[hits.length - 1];
        return hit ? { ...a, balance: Math.round(hit.closingBalance), statementAccount: hit.account } : a;
      });
      // Statements the user chose to add as a brand-new account.
      const addedAccounts = (result.balances || [])
        .filter((b, i) => balTarget[i] === "__new__")
        .map((b) => ({
          id: `acct-${b.bank}-${String(b.account).slice(-4)}`,
          name: `${bankLabel(b.bank)} ·${String(b.account).slice(-4)}`,
          bank: bankLabel(b.bank), currency: "AMD",
          balance: Math.round(b.closingBalance || 0), role: "",
          statementAccount: b.account,
        }));
      next.accounts = [...mapped, ...addedAccounts];
      return next;
    });
    close();
  };

  return (
    <Modal open={open} onClose={close} title="Import bank statements" wide>
      <div className="stmt-import">
        {!result && (
          <div
            className={`stmt-drop ${busy ? "busy" : ""}`}
            onClick={() => !busy && inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
          >
            <input ref={inputRef} type="file" accept="application/pdf" multiple hidden
              onChange={(e) => onFiles(e.target.files)} />
            <Upload size={26} />
            <p>{busy ? "Reading your statements…" : "Drop your Ameria / Inecobank PDF statements here"}</p>
            <small>{busy ? "Extracting and categorizing transactions" : "or click to choose files · upload all your cards for the month at once"}</small>
          </div>
        )}

        {error && <div className="stmt-err"><AlertTriangle size={15} /> {error}</div>}

        {result && (
          <>
            <div className="stmt-files">
              {fileNames.map((n) => <span key={n}><FileText size={13} /> {n}</span>)}
              <button className="stmt-restart" onClick={reset}><X size={13} /> start over</button>
            </div>

            {/* Reconciliation guard — proves the parse matched the bank's own total */}
            <div className="stmt-recon">
              {result.reconciliation.map((r, i) => (
                <div key={i} className={`recon ${r.ok ? "ok" : "bad"}`}>
                  {r.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  <b>{bankLabel(r.bank)}{r.account ? ` ·${String(r.account).slice(-4)}` : ""}</b>
                  {r.ok
                    ? <span>matches statement — {amd(r.statedDebits)} ✓</span>
                    : <span>parsed {amd(r.parsedDebits)} vs statement {amd(r.statedDebits)} ({r.diff > 0 ? "+" : ""}{amd(r.diff)})</span>}
                </div>
              ))}
            </div>

            <div className="stmt-summary">
              <div><span>Expenses</span><b>{amd(totalOut)}</b><small>{includedExpenses.length} txns</small></div>
              <div><span>Income / top-ups</span><b>{amd(totalIn)}</b><small>{result.credits.filter((c) => creditOn[c.key]).length} added</small></div>
              {dupCount > 0 && <div className="dup"><span>Duplicates</span><b>{dupCount}</b><small>newer kept, old replaced</small></div>}
            </div>

            {/* Income / top-ups */}
            {result.credits.length > 0 && (
              <div className="stmt-block">
                <h4>Money in — is this real income?</h4>
                {result.credits.map((c) => (
                  <label key={c.key} className="stmt-credit">
                    <input type="checkbox" checked={!!creditOn[c.key]}
                      onChange={(e) => setCreditOn((s) => ({ ...s, [c.key]: e.target.checked }))} />
                    <span className="nm">{c.label}<small>{bankLabel(c.bank)} · {c.date}</small></span>
                    <b>{amd(c.amountAMD)}</b>
                  </label>
                ))}
                <p className="stmt-hint">Card-to-card top-ups between your own accounts are off by default (not real income).</p>
              </div>
            )}

            {/* Wealth: closing balances → accounts */}
            {result.balances.length > 0 && accounts.length > 0 && (
              <div className="stmt-block">
                <h4>Update account balances (Wealth)</h4>
                {result.balances.map((b, i) => (
                  <div key={i} className="stmt-bal">
                    <span className="nm">{bankLabel(b.bank)} ·{String(b.account).slice(-4)}<small>closing {amd(b.closingBalance)}</small></span>
                    <select value={balTarget[i] || ""} onChange={(e) => setBalTarget((s) => ({ ...s, [i]: e.target.value }))}>
                      <option value="">— don't update —</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      <option value="__new__">＋ Add as new account</option>
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* Expenses by category */}
            <div className="stmt-block">
              <h4>Expenses by category <small>tap a category to fix it</small></h4>
              {grouped.map(([cat, rows]) => (
                <details key={cat} className="stmt-cat">
                  <summary><span>{cat}</span><b>{amd(sumRows(rows))}</b><em>{rows.filter((r) => !excluded[r.key]).length}</em></summary>
                  {rows.map((e) => (
                    <div key={e.key} className={`stmt-row ${excluded[e.key] ? "off" : ""} ${e.dupOfId ? "dup" : ""}`}>
                      <input type="checkbox" checked={!excluded[e.key]}
                        onChange={(ev) => setExcluded((s) => ({ ...s, [e.key]: !ev.target.checked }))} />
                      <span className="nm">{e.expense.note}<small>{e.expense.date}{e.dupOfId ? " · replaces older" : ""}</small></span>
                      <select value={catOverride[e.key] || e.expense.categoryId}
                        onChange={(ev) => setCatOverride((s) => ({ ...s, [e.key]: ev.target.value }))}>
                        {CAT_IDS.map((id) => <option key={id} value={id}>{CATEGORY_NAME[id]}</option>)}
                      </select>
                      <b>{amd(e.expense.amountAMD)}</b>
                    </div>
                  ))}
                </details>
              ))}
            </div>

            {!reconOk && (
              <label className="stmt-override">
                <input type="checkbox" checked={overrideRecon} onChange={(e) => setOverrideRecon(e.target.checked)} />
                A statement above didn't match its own total — import anyway
              </label>
            )}
            <div className="stmt-actions">
              <Button variant="primary" onClick={doImport}
                disabled={(!includedExpenses.length && !totalIn) || (!reconOk && !overrideRecon)}>
                <CheckCircle2 size={15} /> Import {includedExpenses.length} expenses{totalIn ? ` + ${amd(totalIn)} in` : ""}
              </Button>
              <Button onClick={close}>Cancel</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
