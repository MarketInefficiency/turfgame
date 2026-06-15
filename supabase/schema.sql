-- Turfgame account schema (Supabase / Postgres).
-- Run this once in the Supabase SQL editor after creating the project.
--
-- Design: every player (including anonymous "guest" sign-ins) gets one auth.users row.
-- A profile row is auto-created for them. Cosmetics they own live in `entitlements`; the
-- three currently-equipped cosmetics live on the profile. Row Level Security ensures a
-- client can only read/write its own rows; purchases are written server-side (service role).

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  -- case-insensitive uniqueness: "Bob" and "bob" can't both exist
  username_lower text unique generated always as (lower(username)) stored,
  created_at timestamptz not null default now(),
  -- equipped cosmetics; 'default' is the free base look everyone starts with
  equipped_skin text not null default 'default',
  equipped_capital text not null default 'default',
  equipped_sword text not null default 'default'
);

-- ---------------------------------------------------------------------------
-- entitlements: every cosmetic a user owns (free grant, IAP, or web Stripe)
-- ---------------------------------------------------------------------------
create table if not exists public.entitlements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  cosmetic_id text not null,                 -- e.g. 'skin_emerald', 'sword_dragon'
  cosmetic_type text not null check (cosmetic_type in ('skin', 'capital', 'sword')),
  source text not null default 'grant',      -- 'grant' | 'iap' | 'stripe'
  acquired_at timestamptz not null default now(),
  unique (user_id, cosmetic_id)
);

-- ---------------------------------------------------------------------------
-- Auto-create a profile whenever a new auth user (incl. anonymous) is created
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.entitlements enable row level security;

-- profiles: a user can read and update only their own row (insert covered by the trigger)
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- entitlements: a user can read their own; writes happen server-side via the service role,
-- which bypasses RLS, so no client insert/update policy is granted on purpose.
drop policy if exists "own entitlements read" on public.entitlements;
create policy "own entitlements read" on public.entitlements
  for select using (auth.uid() = user_id);
