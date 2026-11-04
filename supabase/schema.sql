-- =============================================================================
-- VoiceKhata — Supabase Schema (Phase 3)
-- Run this in the Supabase SQL editor (Dashboard → SQL editor → New query)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  created_at  timestamptz default now()
);

-- Trigram index for fast fuzzy/ilike searches on name (Phase 4 will use this)
create index if not exists customers_name_gin
  on customers using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table if not exists transactions (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id) on delete cascade,
  kind            text not null check (kind in ('sale', 'payment')),
  total           numeric(10,2) check (total >= 0),
  paid            numeric(10,2) check (paid >= 0),
  delta           numeric(10,2) not null,   -- positive = customer owes more
  note            text,
  raw_transcript  text,
  created_at      timestamptz default now()
);

create index if not exists transactions_customer_id_idx
  on transactions(customer_id);

create index if not exists transactions_created_at_idx
  on transactions(created_at desc);

-- ---------------------------------------------------------------------------
-- customer_balances view
-- ---------------------------------------------------------------------------
create or replace view customer_balances as
  select
    c.id,
    c.name,
    c.phone,
    coalesce(sum(t.delta), 0)       as balance,
    max(t.created_at)               as last_activity
  from customers c
  left join transactions t on t.customer_id = c.id
  group by c.id, c.name, c.phone;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table customers    enable row level security;
alter table transactions enable row level security;

-- Drop existing policies if re-running
drop policy if exists "anon_select_customers"    on customers;
drop policy if exists "anon_select_transactions" on transactions;

-- Allow anon read (demo mode — no auth yet)
create policy "anon_select_customers"
  on customers for select
  to anon
  using (true);

create policy "anon_select_transactions"
  on transactions for select
  to anon
  using (true);

-- Service role bypasses RLS automatically — no policy needed for server writes.

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Enable Realtime publication for both tables so the client can subscribe
-- (run once; harmless if already set)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename = 'customers'
  ) then
    alter publication supabase_realtime add table customers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table transactions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fuzzy name matching function (Phase 4)
-- ---------------------------------------------------------------------------
-- Run this in the Supabase SQL editor AFTER the base schema above.
-- Requires pg_trgm (already enabled above).
--
-- Normalization: strip spaces and the honorific "ji" before comparing, so
-- "Sharma ji", "Sharmaji", "sharma ji" all map to the same token "sharma".
-- ---------------------------------------------------------------------------

create or replace function match_customers(search text)
returns table(id uuid, name text, similarity float) as $$
  with normalized as (
    select
      c.id,
      c.name,
      similarity(
        regexp_replace(lower(c.name),  '\s*\yji\y\s*|\s+', '', 'g'),
        regexp_replace(lower(search),  '\s*\yji\y\s*|\s+', '', 'g')
      ) as sim
    from customers c
  )
  select id, name, sim as similarity
  from   normalized
  where  sim > 0.4
  order  by sim desc;
$$ language sql stable security definer;

-- Allow the anon role to call this function (needed from server via service key
-- it already works; this grant lets the anon client call it too if needed)
grant execute on function match_customers(text) to anon, authenticated;
