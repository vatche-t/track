import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Returns false when either env var is missing, so the app falls back to
// local-only mode (SQLite/localStorage, no login required).
export const isSupabaseConfigured = () => Boolean(url && anonKey);

// Singleton client. Created only when configured; otherwise null so callers
// can short-circuit to local-only behavior. createClient throws on a malformed
// URL (e.g. a bare project ref instead of https://<ref>.supabase.co), so guard
// it and fall back to local-only mode rather than crashing the app.
function createSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  try {
    return createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  } catch (err) {
    console.warn(
      `[supabase] Invalid configuration — running in local-only mode. ${err?.message || err}`,
    );
    return null;
  }
}

export const supabase = createSupabaseClient();
