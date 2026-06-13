// Telegram webhook (Vercel serverless). Telegram POSTs every update here.
// Handles commands, button taps (habit done/miss + "why"), and free-form
// messages → AI chat grounded in your data. Always returns 200 fast.
import {
  getCfg, setCfg, kvGet, kvSet, tgSend, tgAnswerCallback,
  habitButtons, askAI, buildReport, todayISO,
} from "./_tglib.js";

const HELP = [
  "🤖 <b>Your tracker bot</b>",
  "",
  "Just message me a question and I'll answer from your data — e.g. <i>“how much did I spend on eating out?”</i> or <i>“am I on track this month?”</i>",
  "",
  "<b>Commands</b>",
  "/report — money + habits summary",
  "/checkin — log today's habits",
  "/addtask &lt;text&gt; — add a task for today",
  "/remind 18:00 &lt;text&gt; — one-off reminder",
  "/alerts — toggle alerts on/off",
  "/mute &lt;hours&gt; — pause alerts",
  "/help — this message",
].join("\n");

async function logHabit(habitId) {
  const habits = (await kvGet("pt_habits", [])) || [];
  let name = habitId;
  const next = habits.map((h) => {
    if (h.id === habitId) { name = h.name; return { ...h, log: { ...(h.log || {}), [todayISO()]: true } }; }
    return h;
  });
  await kvSet("pt_habits", next);
  return name;
}

async function addTask(title) {
  const tasks = (await kvGet("pt_tasks", [])) || [];
  const task = {
    id: `tg-${Date.now().toString(36)}`,
    date: todayISO(), title, category: "Personal", priority: "Medium",
    status: "To Do", est: 0, actual: 0,
  };
  await kvSet("pt_tasks", [task, ...tasks]);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).end();
  }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { body = {}; } }

  try {
    const cfg = await getCfg();

    // ── Button taps (habit done / miss → why) ──────────────────────────────
    const cb = body.callback_query;
    if (cb) {
      const chatId = cb.message?.chat?.id;
      const [action, habitId] = String(cb.data || "").split(":");
      if (action === "done") {
        const name = await logHabit(habitId);
        await tgAnswerCallback(cb.id, "Logged 💪");
        await tgSend(chatId, `✅ <b>${name}</b> logged for today. Nice — keep the chain alive.`);
      } else if (action === "miss") {
        const habits = (await kvGet("pt_habits", [])) || [];
        const name = habits.find((h) => h.id === habitId)?.name || "that habit";
        cfg.pending = { type: "why", habitId, habitName: name };
        await setCfg(cfg);
        await tgAnswerCallback(cb.id);
        await tgSend(chatId, `No worries. What got in the way of <b>${name}</b>? (reply in one line — it helps spot the pattern)`);
      }
      return res.status(200).end();
    }

    const msg = body.message;
    const text = msg?.text?.trim();
    const chatId = msg?.chat?.id;
    if (!text || !chatId) return res.status(200).end();

    const [cmd, ...rest] = text.split(/\s+/);
    const arg = rest.join(" ");
    const lc = cmd.toLowerCase();

    // ── Pending "why" capture ──────────────────────────────────────────────
    if (cfg.pending?.type === "why" && !text.startsWith("/")) {
      cfg.reasons = [...(cfg.reasons || []), { date: todayISO(), habit: cfg.pending.habitName, reason: text }].slice(-100);
      cfg.pending = null;
      await setCfg(cfg);
      await tgSend(chatId, "Got it — noted. Tomorrow's a fresh start. Remember: never miss twice. 🙂");
      return res.status(200).end();
    }

    // ── Commands ───────────────────────────────────────────────────────────
    if (lc === "/start") {
      cfg.chatId = chatId;
      await setCfg(cfg);
      await tgSend(chatId, `Linked ✅ You'll get your alerts and check-ins here.\n\n${HELP}`);
    } else if (lc === "/help") {
      await tgSend(chatId, HELP);
    } else if (lc === "/report") {
      await tgSend(chatId, await buildReport());
    } else if (lc === "/checkin") {
      const habits = (await kvGet("pt_habits", [])) || [];
      const today = todayISO();
      const pending = habits.filter((h) => !h.log?.[today]);
      if (!pending.length) { await tgSend(chatId, "All habits already logged today. 🔥"); }
      else { for (const h of pending) await tgSend(chatId, `Did you do <b>${h.name}</b> today?`, habitButtons(h.id)); }
    } else if (lc === "/addtask") {
      if (!arg) { await tgSend(chatId, "Usage: /addtask Buy protein"); }
      else { await addTask(arg); await tgSend(chatId, `📝 Added task: <b>${arg}</b> (today). It'll show in your app.`); }
    } else if (lc === "/remind") {
      const m = arg.match(/^(\d{1,2}):(\d{2})\s+(.+)$/);
      if (!m) { await tgSend(chatId, "Usage: /remind 18:00 call accountant"); }
      else {
        const when = new Date(); when.setHours(+m[1], +m[2], 0, 0);
        if (when < new Date()) when.setDate(when.getDate() + 1);
        cfg.reminders = [...(cfg.reminders || []), { id: `r-${Date.now().toString(36)}`, text: m[3], at: when.toISOString(), sent: false }];
        await setCfg(cfg);
        await tgSend(chatId, `⏰ Reminder set for ${m[1]}:${m[2]}: <b>${m[3]}</b>`);
      }
    } else if (lc === "/alerts") {
      cfg.prefs = cfg.prefs || {};
      const on = !(cfg.prefs.spending && cfg.prefs.habit && cfg.prefs.recap);
      cfg.prefs = { spending: on, habit: on, recap: on };
      cfg.mutedUntil = null;
      await setCfg(cfg);
      await tgSend(chatId, `Alerts turned <b>${on ? "ON" : "OFF"}</b> (spending, habit check-ins, weekly recap).`);
    } else if (lc === "/mute") {
      const h = Number(arg) || 24;
      cfg.mutedUntil = new Date(Date.now() + h * 3600e3).toISOString();
      await setCfg(cfg);
      await tgSend(chatId, `🔕 Muted for ${h}h.`);
    } else if (text.startsWith("/")) {
      await tgSend(chatId, `Unknown command.\n\n${HELP}`);
    } else {
      // ── Free-form → AI chat grounded in your data ────────────────────────
      const answer = await askAI(text);
      await tgSend(chatId, answer);
    }
  } catch (e) {
    // Never 500 to Telegram (it would retry forever). Swallow + 200.
  }
  return res.status(200).end();
}
