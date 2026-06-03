// Vercel serverless function: fetches the daily Bible verse server-side so the
// browser never hits labs.bible.org cross-origin (which CORS-blocks on HTTPS).
const VERSE_API =
  "https://labs.bible.org/api/?passage=votd&type=json&formatting=plain";

const clean = (text) =>
  String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();

export default async function handler(req, res) {
  try {
    const upstream = await fetch(VERSE_API, { headers: { Accept: "application/json" } });
    const data = await upstream.json();
    const item = Array.isArray(data) ? data[0] : data;
    const reference =
      item?.display_ref ||
      `${item?.bookname || ""} ${item?.chapter || ""}:${item?.verse || ""}`.trim();
    const text = clean(item?.text);
    if (!text) throw new Error("empty verse");
    // Cache at the edge for a day — the verse of the day only changes daily.
    res.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=86400");
    return res.status(200).json({ text, reference });
  } catch {
    return res.status(502).json({ error: { message: "Verse unavailable" } });
  }
}
