import initSqlJs from "sql.js";
import sqliteWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { isSupabaseConfigured, supabase } from "./supabase";

const bytesToBase64 = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};
const base64ToBytes = (base64) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
let sqlitePromise;
async function getSqliteDb() {
  if (!sqlitePromise) {
    sqlitePromise = (async () => {
      const SQL = await initSqlJs({ locateFile: () => sqliteWasmUrl });
      const saved = localStorage.getItem("pt_sqlite_db");
      const db = saved
        ? new SQL.Database(base64ToBytes(saved))
        : new SQL.Database();
      db.run(
        "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)",
      );
      return db;
    })();
  }
  return sqlitePromise;
}
async function persistSqlite(db) {
  localStorage.setItem("pt_sqlite_db", bytesToBase64(db.export()));
}

// --- Local (SQLite + localStorage) primitives — also serve as offline cache ---
async function localGet(key, fallback) {
  try {
    const db = await getSqliteDb();
    const stmt = db.prepare("SELECT value FROM kv WHERE key = ?");
    stmt.bind([key]);
    const row = stmt.step() ? stmt.getAsObject().value : null;
    stmt.free();
    if (row) return JSON.parse(row);
    const legacy = localStorage.getItem(key);
    return legacy ? JSON.parse(legacy) : fallback;
  } catch {
    return fallback;
  }
}

async function localSet(key, value) {
  try {
    const db = await getSqliteDb();
    db.run(
      "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)",
      [key, JSON.stringify(value), new Date().toISOString()],
    );
    await persistSqlite(db);
  } catch {
    // SQLite unavailable — localStorage mirror below still holds the value.
  }
}

// localStorage write-through cache for cloud reads (instant + offline fallback).
const cacheKey = (key) => `pt_cloud_cache:${key}`;
const readCache = (key, fallback) => {
  try {
    const raw = localStorage.getItem(cacheKey(key));
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const writeCache = (key, value) => {
  try {
    localStorage.setItem(cacheKey(key), JSON.stringify(value));
  } catch {
    // ignore quota / serialization errors
  }
};

const isEmptyValue = (value) =>
  value === null ||
  value === undefined ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);

// Cached session check — avoids an async round-trip on every get/set.
async function currentUserId() {
  if (!isSupabaseConfigured() || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch {
    return null;
  }
}

// --- Debounced per-key cloud write-through ---
const pendingWrites = new Map(); // key -> value
const writeTimers = new Map(); // key -> timeout id
const WRITE_DEBOUNCE_MS = 600;

async function flushCloudWrite(key) {
  writeTimers.delete(key);
  if (!pendingWrites.has(key)) return;
  const value = pendingWrites.get(key);
  pendingWrites.delete(key);
  const userId = await currentUserId();
  if (!userId || !supabase) return;
  try {
    await supabase
      .from("kv_store")
      .upsert(
        { user_id: userId, key, value, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" },
      );
  } catch {
    // Network failure — keep the localStorage cache; next set() retries.
    pendingWrites.set(key, value);
  }
}

function scheduleCloudWrite(key, value) {
  pendingWrites.set(key, value);
  if (writeTimers.has(key)) clearTimeout(writeTimers.get(key));
  writeTimers.set(
    key,
    setTimeout(() => flushCloudWrite(key), WRITE_DEBOUNCE_MS),
  );
}

// Keys the migration seed knows about (mirrors useTrackerData).
const KNOWN_KEYS = [
  "pt_tasks",
  "pt_recurring",
  "pt_routines",
  "pt_routines_reset_date",
  "pt_goals",
  "pt_habits",
  "pt_finance",
  "pt_reviews",
];

export const store = {
  async get(key, fallback) {
    const userId = await currentUserId();
    if (!userId || !supabase) {
      return localGet(key, fallback);
    }
    try {
      const { data, error } = await supabase
        .from("kv_store")
        .select("value")
        .eq("user_id", userId)
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      if (data && data.value !== null && data.value !== undefined) {
        writeCache(key, data.value);
        return data.value;
      }
      // Cloud has no row yet — fall back to local cache / sqlite.
      return readCache(key, await localGet(key, fallback));
    } catch {
      // Network error: localStorage cache, then SQLite, then fallback.
      return readCache(key, await localGet(key, fallback));
    }
  },

  async set(key, value) {
    // Always write locally first for instant UX + offline cache.
    writeCache(key, value);
    await localSet(key, value);
    const userId = await currentUserId();
    if (userId && supabase) {
      scheduleCloudWrite(key, value);
    }
  },

  // Non-destructive first-login seed: push local → cloud only when the cloud
  // key is empty/absent. Never overwrites a non-empty cloud value.
  async migrateLocalToCloud() {
    const userId = await currentUserId();
    if (!userId || !supabase) return;
    for (const key of KNOWN_KEYS) {
      try {
        const { data, error } = await supabase
          .from("kv_store")
          .select("value")
          .eq("user_id", userId)
          .eq("key", key)
          .maybeSingle();
        if (error) throw error;
        const cloudValue = data?.value;
        if (!isEmptyValue(cloudValue)) continue; // cloud already has data
        const localValue = await localGet(key, undefined);
        if (isEmptyValue(localValue)) continue; // nothing to push
        await supabase.from("kv_store").upsert(
          {
            user_id: userId,
            key,
            value: localValue,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,key" },
        );
        writeCache(key, localValue);
      } catch {
        // Skip this key on error; migration is best-effort and non-destructive.
      }
    }
  },
};
