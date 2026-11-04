-- =============================================================================
-- VoiceKhata — Seed Data (Phase 3)
-- Run AFTER schema.sql in the Supabase SQL editor
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Sample customers
-- ---------------------------------------------------------------------------
insert into customers (id, name, phone) values
  ('11111111-0000-0000-0000-000000000001', 'Sharma ji',   '9810001001'),
  ('11111111-0000-0000-0000-000000000002', 'Gurpreet',    '9820001002'),
  ('11111111-0000-0000-0000-000000000003', 'Verma ji',    '9830001003'),
  ('11111111-0000-0000-0000-000000000004', 'Ramesh',      '9840001004'),
  ('11111111-0000-0000-0000-000000000005', 'Sunita Devi', '9850001005')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Sample transactions  (delta > 0 = owes money, delta < 0 = paid down)
-- ---------------------------------------------------------------------------

-- Sharma ji: bought 500 on credit, paid back 150 → balance 350
insert into transactions (customer_id, kind, total, paid, delta, note) values
  ('11111111-0000-0000-0000-000000000001', 'sale',    500,  0,    500,  'Groceries'),
  ('11111111-0000-0000-0000-000000000001', 'payment', null, 150, -150, 'Partial payment');

-- Gurpreet: bought 1000, paid 400 at time of sale → balance 600
insert into transactions (customer_id, kind, total, paid, delta, note) values
  ('11111111-0000-0000-0000-000000000002', 'sale', 1000, 400, 600, 'Monthly groceries');

-- Verma ji: bought 300, cleared 300 → balance 0
insert into transactions (customer_id, kind, total, paid, delta, note) values
  ('11111111-0000-0000-0000-000000000003', 'sale',    300,   0,    300, 'Vegetables'),
  ('11111111-0000-0000-0000-000000000003', 'payment', null, 300,  -300, 'Full payment');

-- Ramesh: balance 250
insert into transactions (customer_id, kind, total, paid, delta, note) values
  ('11111111-0000-0000-0000-000000000004', 'sale', 250, 0, 250, 'Dairy items');

-- Sunita Devi: balance 0 (never bought anything — just registered)
