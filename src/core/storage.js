import initSqlJs from "sql.js";
import sqliteWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

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
export const store = {
  async get(key, fallback) {
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
  },
  async set(key, value) {
    const db = await getSqliteDb();
    db.run(
      "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)",
      [key, JSON.stringify(value), new Date().toISOString()],
    );
    await persistSqlite(db);
  },
};
