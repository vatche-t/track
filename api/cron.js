// Proactive alerts — called every ~10 min by Supabase pg_cron (or Vercel Cron).
// Decides what (if anything) to send: spending over-pace, evening habit check-in,
// due reminders, Monday weekly recap. Times are Armenia local (UTC+4).
import {
  getCfg, setCfg, kvGet, tgSend, habitButtons, financeSnapshot, buildReport, todayISO, amd,
} from "./_tglib.js";

const ARM_OFFSET_H = 4; // Asia/Yerevan = UTC+4 (no DST)

export default async function handler(req, res) {
  // Accept Vercel Cron's auto Bearer or our pg_cron Bearer.
  const auth = req.headers.authorization || "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }

  const cfg = await getCfg();
  const chatId = cfg.chatId;
  if (!chatId) return res.status(200).json({ skipped: "no chat linked" });
  if (cfg.mutedUntil && new Date(cfg.mutedUntil) > new Date()) {
    return res.status(200).json({ skipped: "muted" });
  }

  const arm = new Date(Date.now() + ARM_OFFSET_H * 3600e3);
  const hour = arm.getUTCHours();
  const dow = arm.getUTCDay(); // 0 Sun .. 1 Mon
  const today = todayISO();
  const sent = [];
  let dirty = false;

  // 1) Due custom reminders (every run).
  const reminders = cfg.reminders || [];
  for (const r of reminders) {
    if (!r.sent && new Date(r.at) <= new Date()) {
      await tgSend(chatId, `⏰ <b>Reminder:</b> ${r.text}`);
      r.sent = true; dirty = true; sent.push("reminder");
    }
  }
  cfg.reminders = reminders.filter((r) => !r.sent || (Date.now() - new Date(r.at).getTime() < 7 * 864e5));

  // 2) Spending over-pace — once/day, evening-ish.
  if (cfg.prefs?.spending && hour >= 13 && cfg.lastSpendingAlert !== today) {
    const f = await financeSnapshot();
    if (!f.onTrack && f.cap > 0) {
      const overPct = Math.round(((f.projected - f.cap) / f.cap) * 100);
      const safe = Math.max(0, Math.round((f.cap - f.spent) / Math.max(1, f.dim - f.dom)));
      await tgSend(chatId, `⚠️ <b>Spending over pace</b>\nProjected ${amd(f.projected)} vs your ${amd(f.cap)} cap (${overPct}% over). Keep it under ~${amd(safe)}/day to recover.`);
      cfg.lastSpendingAlert = today; dirty = true; sent.push("spending");
    }
  }

  // 3) Evening habit check-in — once/day at ~20:00 local, ask for unlogged habits.
  if (cfg.prefs?.habit && hour >= 20 && cfg.lastCheckin !== today) {
    const habits = (await kvGet("pt_habits", [])) || [];
    const pending = habits.filter((h) => !h.log?.[today]);
    if (pending.length) {
      await tgSend(chatId, `🌙 <b>Evening check-in</b> — ${pending.length} habit${pending.length === 1 ? "" : "s"} left today:`);
      for (const h of pending) await tgSend(chatId, `Did you do <b>${h.name}</b>?`, habitButtons(h.id));
    } else {
      await tgSend(chatId, "🌙 All habits logged today — that's a clean day. 🔥");
    }
    cfg.lastCheckin = today; dirty = true; sent.push("checkin");
  }

  // 4) Weekly recap — Monday ~09:00 local, once.
  const weekTag = `${arm.getUTCFullYear()}-W${Math.ceil(arm.getUTCDate() / 7)}-${arm.getUTCMonth()}`;
  if (cfg.prefs?.recap && dow === 1 && hour >= 9 && cfg.lastRecap !== weekTag) {
    await tgSend(chatId, await buildReport());
    cfg.lastRecap = weekTag; dirty = true; sent.push("recap");
  }

  if (dirty) await setCfg(cfg);
  return res.status(200).json({ ok: true, sent });
}
