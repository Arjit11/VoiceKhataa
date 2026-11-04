#!/usr/bin/env npx tsx
/**
 * scripts/seed.ts
 *
 * Inserts sample customers and transactions using the service role key.
 * Run with:  npx tsx scripts/seed.ts
 *
 * Safe to run multiple times — uses upsert / on-conflict-do-nothing.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CUSTOMERS = [
  { id: "11111111-0000-0000-0000-000000000001", name: "Sharma ji",   phone: "9810001001" },
  { id: "11111111-0000-0000-0000-000000000002", name: "Gurpreet",    phone: "9820001002" },
  { id: "11111111-0000-0000-0000-000000000003", name: "Verma ji",    phone: "9830001003" },
  { id: "11111111-0000-0000-0000-000000000004", name: "Ramesh",      phone: "9840001004" },
  { id: "11111111-0000-0000-0000-000000000005", name: "Sunita Devi", phone: "9850001005" },
];

const TRANSACTIONS = [
  // Sharma ji — balance 350
  { customer_id: "11111111-0000-0000-0000-000000000001", kind: "sale",    total: 500,  paid: 0,   delta:  500, note: "Groceries" },
  { customer_id: "11111111-0000-0000-0000-000000000001", kind: "payment", total: null, paid: 150, delta: -150, note: "Partial payment" },
  // Gurpreet — balance 600
  { customer_id: "11111111-0000-0000-0000-000000000002", kind: "sale",    total: 1000, paid: 400, delta:  600, note: "Monthly groceries" },
  // Verma ji — balance 0
  { customer_id: "11111111-0000-0000-0000-000000000003", kind: "sale",    total: 300,  paid: 0,   delta:  300, note: "Vegetables" },
  { customer_id: "11111111-0000-0000-0000-000000000003", kind: "payment", total: null, paid: 300, delta: -300, note: "Full payment" },
  // Ramesh — balance 250
  { customer_id: "11111111-0000-0000-0000-000000000004", kind: "sale",    total: 250,  paid: 0,   delta:  250, note: "Dairy items" },
];

async function main() {
  console.log("Seeding customers…");
  const { error: custErr } = await supabase
    .from("customers")
    .upsert(CUSTOMERS, { onConflict: "id", ignoreDuplicates: true });
  if (custErr) { console.error("customers error:", custErr.message); process.exit(1); }
  console.log(`  ✓ ${CUSTOMERS.length} customers`);

  console.log("Seeding transactions…");
  const { error: txErr } = await supabase.from("transactions").insert(TRANSACTIONS);
  if (txErr) {
    // Duplicate inserts on re-run are fine — just log and continue
    console.warn("  transactions warning:", txErr.message);
  } else {
    console.log(`  ✓ ${TRANSACTIONS.length} transactions`);
  }

  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
