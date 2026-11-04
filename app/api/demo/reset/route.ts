import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

/**
 * POST /api/demo/reset
 *
 * Protected by the x-demo-token header matching DEMO_RESET_TOKEN env var.
 * Deletes all transactions and customers, then re-inserts seed data.
 * Used for hackathon demo resets only.
 */

// ---------------------------------------------------------------------------
// Seed data — mirrors supabase/seed.sql exactly
// ---------------------------------------------------------------------------

const SEED_CUSTOMERS = [
  { id: "11111111-0000-0000-0000-000000000001", name: "Sharma ji",   phone: "9810001001" },
  { id: "11111111-0000-0000-0000-000000000002", name: "Gurpreet",    phone: "9820001002" },
  { id: "11111111-0000-0000-0000-000000000003", name: "Verma ji",    phone: "9830001003" },
  { id: "11111111-0000-0000-0000-000000000004", name: "Ramesh",      phone: "9840001004" },
  { id: "11111111-0000-0000-0000-000000000005", name: "Sunita Devi", phone: "9850001005" },
];

const SEED_TRANSACTIONS = [
  // Sharma ji: 500 credit, 150 paid → balance 350
  { customer_id: "11111111-0000-0000-0000-000000000001", kind: "sale",    total: 500,  paid: 0,   delta: 500,  note: "Groceries" },
  { customer_id: "11111111-0000-0000-0000-000000000001", kind: "payment", total: null, paid: 150, delta: -150, note: "Partial payment" },
  // Gurpreet: 1000 bought, 400 paid at sale → balance 600
  { customer_id: "11111111-0000-0000-0000-000000000002", kind: "sale",    total: 1000, paid: 400, delta: 600,  note: "Monthly groceries" },
  // Verma ji: 300 credit, 300 paid → balance 0
  { customer_id: "11111111-0000-0000-0000-000000000003", kind: "sale",    total: 300,  paid: 0,   delta: 300,  note: "Vegetables" },
  { customer_id: "11111111-0000-0000-0000-000000000003", kind: "payment", total: null, paid: 300, delta: -300, note: "Full payment" },
  // Ramesh: balance 250
  { customer_id: "11111111-0000-0000-0000-000000000004", kind: "sale",    total: 250,  paid: 0,   delta: 250,  note: "Dairy items" },
  // Sunita Devi: balance 0 (registered only)
];

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────
  const token = req.headers.get("x-demo-token");
  const expected = process.env.DEMO_RESET_TOKEN;

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "DEMO_RESET_TOKEN is not configured on this server." },
      { status: 503 }
    );
  }
  if (!token || token !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized — invalid or missing x-demo-token." },
      { status: 401 }
    );
  }

  const supabase = createSupabaseServerClient();

  // ── Delete all data (FK order: transactions first) ──────────────────────
  const { error: txErr } = await supabase.from("transactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (txErr) {
    console.error("[demo/reset] delete transactions:", txErr);
    return NextResponse.json({ ok: false, error: "Failed to delete transactions." }, { status: 500 });
  }

  const { error: custErr } = await supabase.from("customers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (custErr) {
    console.error("[demo/reset] delete customers:", custErr);
    return NextResponse.json({ ok: false, error: "Failed to delete customers." }, { status: 500 });
  }

  // ── Re-insert seed customers ─────────────────────────────────────────────
  const { error: seedCustErr } = await supabase.from("customers").insert(SEED_CUSTOMERS);
  if (seedCustErr) {
    console.error("[demo/reset] seed customers:", seedCustErr);
    return NextResponse.json({ ok: false, error: "Failed to seed customers." }, { status: 500 });
  }

  // ── Re-insert seed transactions ──────────────────────────────────────────
  const { error: seedTxErr } = await supabase.from("transactions").insert(SEED_TRANSACTIONS);
  if (seedTxErr) {
    console.error("[demo/reset] seed transactions:", seedTxErr);
    return NextResponse.json({ ok: false, error: "Failed to seed transactions." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "Demo data reset successfully.",
    customers: SEED_CUSTOMERS.length,
    transactions: SEED_TRANSACTIONS.length,
  });
}
