-- Real-money purchases backbone (run in the Supabase SQL editor, after medals.sql).
-- This is the ONE place a paid purchase turns into medals / membership / ad-free. It's called only
-- by trusted server code (the Stripe webhook edge function, and later the RevenueCat webhook for
-- iOS/Android) using the service role — never by the client. Granting is idempotent: the same
-- transaction id can be delivered twice by a payment provider and it will only credit once.

-- ---------------------------------------------------------------------------
-- billing_products: what each purchasable product grants. The product id is shared across every
-- platform (it's the metadata we attach to a Stripe Checkout session, and the entitlement id on
-- the mobile stores), so the grant logic never has to care which store the money came from.
-- ---------------------------------------------------------------------------
create table if not exists public.billing_products (
  id text primary key,                 -- e.g. 'pack_500', 'membership', 'adfree'
  kind text not null,                  -- 'medals' | 'membership' | 'adfree'
  medals int not null default 0,       -- medals to grant (packs, or the membership/ad-free bonus)
  months int not null default 0,       -- membership months to add per purchase / renewal
  usd numeric not null default 0       -- display price, for reference (the store is the source of truth)
);
alter table public.billing_products enable row level security;
drop policy if exists "billing products read" on public.billing_products;
create policy "billing products read" on public.billing_products for select using (true);

insert into public.billing_products (id, kind, medals, months, usd) values
  ('pack_500',    'medals',      500, 0,  1.99),
  ('pack_1400',   'medals',     1400, 0,  4.99),
  ('pack_3200',   'medals',     3200, 0,  9.99),
  ('pack_7000',   'medals',     7000, 0, 19.99),
  ('pack_16000',  'medals',    16000, 0, 39.99),
  ('membership',  'membership', 1000, 1, 15.00),  -- $15/mo: +1 month and 1,000 medals each renewal
  ('adfree',      'adfree',     1000, 0, 14.99)   -- one-time: removes ads + 1,000 medals
on conflict (id) do update set
  kind = excluded.kind, medals = excluded.medals, months = excluded.months, usd = excluded.usd;

-- ---------------------------------------------------------------------------
-- purchases: an audit row per real-money transaction, and the idempotency guard. `txn` is the
-- payment provider's own id (Stripe checkout session / event id, or a store transaction id), so a
-- duplicate webhook delivery is a no-op.
-- ---------------------------------------------------------------------------
create table if not exists public.purchases (
  txn text primary key,                -- provider transaction id (unique → idempotent)
  user_id uuid not null references auth.users (id) on delete cascade,
  product text not null,
  platform text not null,              -- 'web' | 'ios' | 'android'
  created_at timestamptz not null default now()
);
alter table public.purchases enable row level security;
drop policy if exists "own purchases read" on public.purchases;
create policy "own purchases read" on public.purchases for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- grant_purchase: the shared, idempotent grant. Trusted callers only (service role). Returns a
-- small json result. Safe to call again with the same txn — it just reports a duplicate.
-- ---------------------------------------------------------------------------
create or replace function public.grant_purchase(p_user uuid, p_product text, p_txn text, p_platform text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
  v_medals int;
  v_months int;
begin
  if p_user is null or p_txn is null or p_product is null then
    return json_build_object('ok', false, 'error', 'missing args');
  end if;

  -- Idempotency: a provider may deliver the same event more than once.
  if exists (select 1 from public.purchases where txn = p_txn) then
    return json_build_object('ok', true, 'duplicate', true);
  end if;

  select kind, medals, months into v_kind, v_medals, v_months
  from public.billing_products where id = p_product;
  if not found then
    return json_build_object('ok', false, 'error', 'unknown product');
  end if;

  insert into public.purchases (txn, user_id, product, platform)
  values (p_txn, p_user, p_product, p_platform);

  if v_medals > 0 then
    update public.profiles set medals = medals + v_medals where id = p_user;
    insert into public.medal_ledger (user_id, delta, reason, ref)
    values (p_user, v_medals, case when v_kind = 'membership' then 'sub_grant' else 'buy' end, p_product);
  end if;

  if v_months > 0 then
    -- Extend from the later of "now" or the current expiry, so renewals stack and lapses reset.
    update public.profiles
    set premium_until = greatest(coalesce(premium_until, now()), now()) + (v_months || ' months')::interval
    where id = p_user;
  end if;

  if v_kind = 'adfree' then
    update public.profiles set ad_free = true where id = p_user;
  end if;

  return json_build_object('ok', true, 'product', p_product);
end;
$$;
