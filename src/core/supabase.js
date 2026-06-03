import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Returns false when either env var is missing, so the app falls back to
// local-only mode (SQLite/localStorage, no login required).
export const isSupabaseConfigured = () => Boolean(url && anonKey);

// Singleton client. Created only when configured; otherwise null so callers
// can short-circuit to local-only behavior.
export const supabase = isSupabaseConfigured()
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
