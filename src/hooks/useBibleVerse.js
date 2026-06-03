import { useEffect, useState } from "react";
import {
  cleanVerseText,
  fallbackVerse,
  localDate,
  normalizeVerse,
} from "../core/date";

export function useBibleVerse() {
  const [verse, setVerse] = useState(() => {
    try {
      return normalizeVerse(
        JSON.parse(localStorage.getItem(`pt_bible_${localDate()}`)) ||
          JSON.parse(localStorage.getItem("pt_bible_last")) ||
          fallbackVerse,
      );
    } catch {
      return fallbackVerse;
    }
  });

  useEffect(() => {
    const cacheKey = `pt_bible_${localDate()}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setVerse(normalizeVerse(JSON.parse(cached)));
      return;
    }
    let cancelled = false;
    // Go through our own serverless proxy (/api/verse) to avoid the browser CORS
    // block when calling labs.bible.org directly from the HTTPS site.
    fetch("/api/verse")
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data) => {
        if (data?.error || !data?.text) return Promise.reject(data);
        const next = {
          text: cleanVerseText(data.text || fallbackVerse.text),
          reference: data.reference || fallbackVerse.reference,
        };
        localStorage.setItem(cacheKey, JSON.stringify(next));
        localStorage.setItem("pt_bible_last", JSON.stringify(next));
        if (!cancelled) setVerse(next);
      })
      .catch(() => {
        try {
          setVerse(
            normalizeVerse(
              JSON.parse(localStorage.getItem("pt_bible_last")) ||
                fallbackVerse,
            ),
          );
        } catch {
          setVerse(fallbackVerse);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return verse;
}
