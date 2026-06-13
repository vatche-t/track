// Vercel serverless function: proxies chat-completion requests so API keys never
// reach the client bundle. POST { messages, model, max_tokens, temperature,
// reasoning_effort } -> the upstream's JSON response is returned verbatim.
//
// Provider selection (server-side, by env):
//   - If OPENROUTER_API_KEY is set, requests go to OpenRouter using
//     OPENROUTER_MODEL (overrides the model the client sends).
//   - Otherwise it falls back to Groq with GROQ_API_KEY.
// This lets production keep working on Groq until the OpenRouter env vars are
// added in Vercel, and switch over the moment they are.

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!openrouterKey && !groqKey) {
    return res.status(500).json({
      error: { message: "No AI provider configured (set OPENROUTER_API_KEY or GROQ_API_KEY)." },
    });
  }

  // Body may arrive parsed (Vercel) or as a raw string; handle both.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      return res.status(400).json({ error: { message: "Invalid JSON body." } });
    }
  }
  body = body || {};

  const { messages, model, max_tokens, temperature, reasoning_effort } = body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: { message: "`messages` array is required." } });
  }

  const useOpenRouter = Boolean(openrouterKey);
  const url = useOpenRouter ? OPENROUTER_API : GROQ_API;
  const apiKey = useOpenRouter ? openrouterKey : groqKey;

  const payload = {
    model: useOpenRouter ? process.env.OPENROUTER_MODEL || model : model,
    messages,
  };
  if (max_tokens !== undefined) payload.max_tokens = max_tokens;
  if (temperature !== undefined) payload.temperature = temperature;
  // reasoning_effort is Groq-specific; only forward it on the Groq path.
  if (!useOpenRouter && reasoning_effort !== undefined) {
    payload.reasoning_effort = reasoning_effort;
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (useOpenRouter) {
    // OpenRouter recommends these for free-tier attribution / ranking.
    headers["HTTP-Referer"] = "https://track.vatche.me";
    headers["X-Title"] = "Tracker";
  }

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(data);
  } catch {
    return res.status(502).json({ error: { message: "Upstream AI request failed." } });
  }
}
