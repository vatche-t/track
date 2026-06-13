// Shared helpers for the Telegram bot (webhook + cron). Files in /api starting
// with "_" are NOT routed by Vercel, so this is a private module.
//
// All state lives in the existing kv_store (no new tables). The bot acts for a
// single user (TRACKER_USER_ID) using the Supabase SERVICE key (server-side only).
import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.SUPABASE_URL || "https://iuuvgmdvdohlurqhnxui.supabase.co";
const UID = process.env.TRACKER_USER_ID;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL || "https://track.vatche.me";
const TG = `https://api.telegram.org/bot${TOKEN}`;

// Lazily create the client so a missing/late env var can't crash the function at
// import time (which would 500 every request, even the auth check).
let _supa = null;
function db() {
  if (!_supa) {
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error("SUPABASE_SERVICE_KEY is not set");
    _supa = createClient(SUPA_URL, key, { auth: { persistSession: false } });
  }
  return _supa;
}

// ── kv_store access (per-user JSON blobs, same keys the app uses) ──────────
export async function kvGet(key, fallback = null) {
  const { data } = await db().from("kv_store").select("value").eq("user_id", UID).eq("key", key).maybeSingle();
  return data?.value ?? fallback;
}
export async function kvSet(key, value) {
  await db().from("kv_store").upsert(
    { user_id: UID, key, value, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" },
  );
}

// Bot config/state lives in its own kv key.
const TG_KEY = "pt_telegram";
const DEFAULT_CFG = {
  chatId: null,
  prefs: { spending: true, habit: true, recap: true },
  mutedUntil: null,
  reminders: [],   // { id, text, at (ISO), sent }
  pending: null,   // { type: "why", habitId, habitName }
  lastCheckin: null,
  reasons: [],     // { date, habit, reason }
};
export async function getCfg() {
  const c = await kvGet(TG_KEY, null);
  return { ...DEFAULT_CFG, ...(c || {}) };
}
export async function setCfg(cfg) {
  await kvSet(TG_KEY, cfg);
}

// ── Telegram API ───────────────────────────────────────────────────────────
export async function tgSend(chatId, text, extra = {}) {
  if (!chatId) return;
  await fetch(`${TG}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra }),
  });
}
export async function tgAnswerCallback(id, text = "") {
  await fetch(`${TG}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: id, text }),
  });
}
export function habitButtons(habitId) {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Done", callback_data: `done:${habitId}` },
        { text: "❌ Not yet", callback_data: `miss:${habitId}` },
      ]],
    },
  };
}

// ── Money / data helpers (self-contained — /api can't import the Vite app) ──
const amd = (n) => `${Math.round(+n || 0).toLocaleString()} AMD`;

export async function financeSnapshot() {
  const fin = (await kvGet("pt_finance", {})) || {};
  const month = new Date().toISOString().slice(0, 7);
  const am = fin.activeMonth || month;
  const exps = (fin.expenses || []).filter((e) => (e.date || "").startsWith(month));
  const spent = exps.reduce((s, e) => s + Math.max(0, +e.amountAMD || 0), 0);
  const income = (fin.months?.[am]?.income || fin.income || []).reduce((s, r) => s + (+r.actual || 0), 0);
  const cap = 300000;
  const now = new Date();
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dom = now.getDate();
  const projected = dom > 0 ? Math.round((spent / dom) * dim) : 0;
  const catMap = {};
  exps.forEach((e) => {
    if ((+e.amountAMD || 0) > 0) catMap[e.categoryName || "Other"] = (catMap[e.categoryName || "Other"] || 0) + (+e.amountAMD || 0);
  });
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const goals = (fin.savings || []).map((g) => ({ name: g.name, saved: +g.saved || 0, target: +g.target || 0 }));
  return { fin, month, spent, income, cap, projected, dim, dom, topCats, goals, onTrack: projected <= cap };
}

export function lastNDates(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Build a compact data context + ask the AI via the existing /api/groq proxy
// (which prefers OpenRouter). Mirrors the in-app Kai chat, grounded in data.
export async function askAI(question) {
  const f = await financeSnapshot();
  const habits = (await kvGet("pt_habits", [])) || [];
  const dates = lastNDates(30);
  const habitLines = habits.map((h) => {
    const done = dates.filter((d) => h.log?.[d]).length;
    return `${h.name}: ${Math.round((done / 30) * 100)}% last 30d`;
  }).join(" | ") || "none";
  const cats = f.topCats.map(([n, v]) => `${n}: ${amd(v)}`).join(" | ") || "none";
  const goals = f.goals.map((g) => `${g.name}: ${amd(g.saved)}/${amd(g.target)}`).join(" | ") || "none";

  const SYSTEM = `You are Kai, a sharp personal finance + productivity assistant for Vatche in Yerevan, Armenia. Money is AMD. Use ONLY the data given; never invent numbers. Be concrete, short, plain. No markdown headers. If a number is missing, say so. Answer in <= 5 short lines.`;
  const context = `DATA (today ${todayISO()}):
Income this month: ${amd(f.income)} | Spent: ${amd(f.spent)} | Spending cap: ${amd(f.cap)} | Projected month-end: ${amd(f.projected)} (${f.onTrack ? "on track" : "OVER PACE"})
Spending cap is the only spending limit; savings/goal transfers are NOT a cap.
Top categories: ${cats}
Goals (saved/target): ${goals}
Habit consistency: ${habitLines}`;

  try {
    const res = await fetch(`${APP_URL}/api/groq`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `${context}\n\nQUESTION: ${question}` }],
        max_tokens: 600,
        temperature: 0.3,
        reasoning_effort: "low",
      }),
    });
    const data = await res.json();
    const txt = data?.choices?.[0]?.message?.content?.trim();
    return txt || "I couldn't get an answer just now — try again.";
  } catch {
    return "AI is unavailable right now. Try again in a moment.";
  }
}

// A formatted Telegram report (HTML) of money + habits.
export async function buildReport() {
  const f = await financeSnapshot();
  const habits = (await kvGet("pt_habits", [])) || [];
  const dates = lastNDates(30);
  const habitLines = habits.map((h) => {
    const done = dates.filter((d) => h.log?.[d]).length;
    const pct = Math.round((done / 30) * 100);
    const bar = "▰".repeat(Math.round(pct / 10)) + "▱".repeat(10 - Math.round(pct / 10));
    return `${h.name}\n  ${bar} ${pct}%`;
  }).join("\n");
  const cats = f.topCats.map(([n, v]) => `  • ${n}: ${amd(v)}`).join("\n") || "  (none)";
  const goals = f.goals.map((g) => {
    const pct = g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0;
    return `  • ${g.name}: ${pct}% (${amd(g.saved)}/${amd(g.target)})`;
  }).join("\n") || "  (none)";
  return (
    `<b>📊 Your report — ${f.month}</b>\n\n` +
    `<b>Money</b>\nIncome: ${amd(f.income)}\nSpent: ${amd(f.spent)} of ${amd(f.cap)} cap\nProjected: ${amd(f.projected)} ${f.onTrack ? "✅ on track" : "⚠️ over pace"}\n\n` +
    `<b>Top spending</b>\n${cats}\n\n` +
    `<b>Goals</b>\n${goals}\n\n` +
    `<b>Habits (last 30 days)</b>\n${habitLines || "  (none yet)"}`
  );
}

export { amd };
