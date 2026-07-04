-- ============================================================
-- TaxVault — Secure Cloud Account Setup
-- Run this in Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- STEP 1: User-owned data table.
-- Each row belongs to exactly one authenticated user.
create table if not exists public.taxvault_user_data (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  questionnaire   jsonb,
  tax_year        text,
  owner_name      text,
  deleted_doc_ids jsonb default '[]'::jsonb,
  year_data       jsonb default '{}'::jsonb,
  updated_at      timestamptz default now()
);

-- STEP 2: Row-Level Security — the database itself refuses to serve
-- rows to anyone but their owner, even with the public anon key.
alter table public.taxvault_user_data enable row level security;

drop policy if exists "Users manage own data" on public.taxvault_user_data;
create policy "Users manage own data"
  on public.taxvault_user_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- STEP 3: LOCK DOWN THE OLD TABLE — run this ONLY AFTER you have
-- signed in inside the app and seen "Cloud data migrated to your
-- account". Until then the app still needs the old table as a
-- fallback. Enabling RLS with NO policies blocks ALL anon access —
-- this is intentional: the legacy table is fully locked out once
-- migration is confirmed. Do NOT add any policies to taxvault_data.
-- ============================================================
alter table public.taxvault_data enable row level security;

-- STEP 4: Grant permissions (run this if you see "account table not set up")
grant usage on schema public to authenticated;
grant all on public.taxvault_user_data to authenticated;
