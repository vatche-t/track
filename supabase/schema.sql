-- Tracker app: single key-value store for all app data (tasks, habits, goals,
-- routines, reviews, finance). Mirrors the local kv interface 1:1.
-- Apply once via the Supabase SQL editor or `supabase db push`.

create table if not exists public.kv_store (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Row-Level Security: every row is private to its owner. The anon key shipped to
-- the browser is safe because these policies restrict access to auth.uid().
alter table public.kv_store enable row level security;

drop policy if exists "kv_store_select_own" on public.kv_store;
create policy "kv_store_select_own"
  on public.kv_store for select
  using (user_id = auth.uid());

drop policy if exists "kv_store_insert_own" on public.kv_store;
create policy "kv_store_insert_own"
  on public.kv_store for insert
  with check (user_id = auth.uid());

drop policy if exists "kv_store_update_own" on public.kv_store;
create policy "kv_store_update_own"
  on public.kv_store for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "kv_store_delete_own" on public.kv_store;
create policy "kv_store_delete_own"
  on public.kv_store for delete
  using (user_id = auth.uid());
