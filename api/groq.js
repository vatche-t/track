// Vercel serverless function: proxies chat-completion requests to Groq so the
// API key never reaches the client bundle. POST { messages, model, max_tokens,
// temperature, reasoning_effort } -> Groq's JSON response is returned verbatim.

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: { message: "GROQ_API_KEY is not configured on the server." } });
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
    return res
      .status(400)
      .json({ error: { message: "`messages` array is required." } });
  }

  const payload = { model, messages };
  if (max_tokens !== undefined) payload.max_tokens = max_tokens;
  if (temperature !== undefined) payload.temperature = temperature;
  if (reasoning_effort !== undefined) payload.reasoning_effort = reasoning_effort;

  try {
    const groqRes = await fetch(GROQ_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await groqRes.json().catch(() => ({}));
    return res.status(groqRes.status).json(data);
  } catch {
    return res
      .status(502)
      .json({ error: { message: "Upstream Groq request failed." } });
  }
}
