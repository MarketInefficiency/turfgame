-- Medals economy (run once in the Supabase SQL editor, after schema.sql).
-- Adds the medal balance + premium flags, an audit ledger, server-authoritative cosmetic pricing,
-- and the award/spend functions. Balance is NEVER writable by the client (RLS below + the columns
-- are only changed by these SECURITY DEFINER functions / the service role).

-- ---------------------------------------------------------------------------
-- profiles: balance + premium flags
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists medals int not null default 0,
  add column if not exists ad_free boolean not null default false,
  add column if not exists premium_until timestamptz;

-- ---------------------------------------------------------------------------
-- medal_ledger: every balance change, for auditing (money-adjacent)
-- ---------------------------------------------------------------------------
create table if not exists public.medal_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  delta int not null,
  reason text not null, -- 'earn' | 'buy' | 'spend' | 'grant' | 'sub_grant'
  ref text,
  created_at timestamptz not null default now()
);
alter table public.medal_ledger enable row level security;
drop policy if exists "own ledger read" on public.medal_ledger;
create policy "own ledger read" on public.medal_ledger for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- cosmetics: server-authoritative pricing (mirrors the client catalog).
-- 'default' items are free and never bought, so they're omitted (ids are unique here).
-- ---------------------------------------------------------------------------
create table if not exists public.cosmetics (
  id text primary key,
  type text not null,
  medal_cost int not null default 0,
  free boolean not null default false
);
alter table public.cosmetics enable row level security;
drop policy if exists "cosmetics read" on public.cosmetics;
create policy "cosmetics read" on public.cosmetics for select using (true);

insert into public.cosmetics (id, type, medal_cost, free) values
  ('skin_emerald', 'skin', 0, true),
  ('skin_sky', 'skin', 0, true),
  ('skin_coral', 'skin', 300, false),
  ('skin_gold', 'skin', 300, false),
  ('skin_violet', 'skin', 300, false),
  ('cap_gold', 'capital', 700, false),
  ('cap_obsidian', 'capital', 1200, false),
  ('cap_ember', 'capital', 1800, false),
  ('sword_crimson', 'sword', 350, false),
  ('sword_azure', 'sword', 350, false),
  ('sword_silver', 'sword', 350, false)
on conflict (id) do update set medal_cost = excluded.medal_cost, type = excluded.type, free = excluded.free;

-- ---------------------------------------------------------------------------
-- award_medals: called by the game server (service role) when a player is defeated.
-- ---------------------------------------------------------------------------
create or replace function public.award_medals(p_user uuid, p_amount int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_amount = 0 then return; end if;
  update public.profiles set medals = medals + p_amount where id = p_user;
  insert into public.medal_ledger (user_id, delta, reason) values (p_user, p_amount, p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- buy_cosmetic: the player spends medals for a cosmetic. Atomic, server-authoritative —
-- the price comes from the cosmetics table, never the client. Returns a small json result.
-- ---------------------------------------------------------------------------
create or replace function public.buy_cosmetic(p_id text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_cost int;
  v_type text;
  v_free boolean;
  v_bal int;
begin
  if v_uid is null then return json_build_object('ok', false, 'error', 'not signed in'); end if;
  select medal_cost, type, free into v_cost, v_type, v_free from public.cosmetics where id = p_id;
  if not found then return json_build_object('ok', false, 'error', 'unknown item'); end if;
  if v_free then return json_build_object('ok', false, 'error', 'that one is free'); end if;
  if exists (select 1 from public.entitlements where user_id = v_uid and cosmetic_id = p_id) then
    return json_build_object('ok', true, 'already', true);
  end if;
  select medals into v_bal from public.profiles where id = v_uid for update;
  if v_bal < v_cost then return json_build_object('ok', false, 'error', 'not enough medals'); end if;
  update public.profiles set medals = medals - v_cost where id = v_uid;
  insert into public.entitlements (user_id, cosmetic_id, cosmetic_type, source) values (v_uid, p_id, v_type, 'medals');
  insert into public.medal_ledger (user_id, delta, reason, ref) values (v_uid, -v_cost, 'spend', p_id);
  return json_build_object('ok', true, 'spent', v_cost);
end;
$$;
