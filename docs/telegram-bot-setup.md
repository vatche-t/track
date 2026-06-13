# Telegram Bot — Setup (your ~10-minute checklist)

The code is built and deployed (`/api/telegram` webhook + `/api/cron` alerts). It's
**inert until you do these steps** — I can't do them (they need your Telegram + Vercel).

## 1. Create the bot (in Telegram)
1. Open a chat with **@BotFather**.
2. Send `/newbot` → pick a name + a username ending in `bot`.
3. Copy the **bot token** it gives you (looks like `123456:ABC-DEF…`). Keep it secret.

## 2. Add Vercel environment variables
Vercel → your project → **Settings → Environment Variables** (Production), add:

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | the token from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | any long random string you invent (e.g. a password) |
| `CRON_SECRET` | another random string |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → **service_role** key (secret!) |
| `TRACKER_USER_ID` | `d5538d66-df67-412c-80d8-bbe0475b76d6` (your user id) |
| `APP_URL` | `https://track.vatche.me` |

Then **redeploy** (Vercel → Deployments → ⋯ → Redeploy) so the vars take effect.
Also make sure **Deployment Protection is OFF** for the project (Settings → Deployment Protection), or Telegram's webhook calls get blocked.

## 3. Register the webhook (run once)
Replace `<TOKEN>` and `<SECRET>` with your bot token and your `TELEGRAM_WEBHOOK_SECRET`, then run in a terminal (or use the `!` prefix here):

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://track.vatche.me/api/telegram","secret_token":"<SECRET>"}'
```
You should get `{"ok":true,...}`.

## 4. (Recommended) Finer-grained alerts via Supabase pg_cron
Vercel's free cron only fires once/day, which is enough for the daily check-in + Monday
recap (already configured in `vercel.json`). For **prompt custom reminders** (`/remind`),
add a 10-minute Supabase cron — run this once in **Supabase → SQL Editor** (replace
`<CRON_SECRET>`):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'tracker-alerts', '*/10 * * * *',
  $$ select net.http_post(
       url := 'https://track.vatche.me/api/cron',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
     ); $$
);
```

## 5. Link your chat
Open your bot in Telegram and send **`/start`**. It replies "Linked ✅" and stores your
chat id. Done.

---

## Using it
- **Ask anything** (free text) → AI answers from your data: *"how much did I spend on eating out?"*, *"am I on track?"*
- **/report** — money + habits summary
- **/checkin** — log today's habits (✅/❌ buttons; ❌ asks why)
- **/addtask Buy protein** — adds a task for today (shows in the app on next refresh)
- **/remind 18:00 call accountant** — one-off reminder
- **/alerts** — toggle alerts on/off · **/mute 3** — pause 3h · **/help**

**Automatic:** evening habit check-in (~20:00), spending over-pace warning, Monday recap.

## Test together
Once you've done steps 1–5, message me "bot is set up" and I'll have you run a couple of
checks (e.g. `getWebhookInfo`, send `/report`) to confirm it's all wired.

## Notes
- Things you add via the bot appear in the app on its **next refresh** (the app reads cloud on load; it's not realtime).
- Everything here is **free** for one user. No paid plans needed.
- **Rotate** any secret if it ever leaks; the service key is powerful — keep it only in Vercel env.
