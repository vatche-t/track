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
    fetch("https://labs.bible.org/api/?passage=votd&type=json&formatting=plain")
      .then((response) => response.json())
      .then((data) => {
        const item = Array.isArray(data) ? data[0] : data;
        const next = {
          text: cleanVerseText(item?.text || fallbackVerse.text),
          reference:
            item?.display_ref ||
            `${item?.bookname || ""} ${item?.chapter || ""}:${item?.verse || ""}`.trim() ||
            fallbackVerse.reference,
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
