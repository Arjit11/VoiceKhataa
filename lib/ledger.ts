/**
 * lib/ledger.ts — SERVER SIDE ONLY
 *
 * applyEntries(entries, transcript) writes ledger rows to Supabase using the
 * service role key and returns each affected customer's new balance.
 *
 * Phase 4 hook: replace the ilike name lookup with a fuzzy trigram search.
 */

import { createSupabaseServerClient } from "@/lib/supabase";
import type { Entry } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface LedgerResult {
  customer: { id: string; name: string };
  balance: number;
  transactionId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find a customer by exact (case-insensitive) name, or create them. */
async function findOrCreateCustomer(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  name: string
): Promise<{ id: string; name: string }> {
  // Phase 4: replace this with a trigram similarity search
  const { data: existing, error } = await supabase
    .from("customers")
    .select("id, name")
    .ilike("name", name)
    .maybeSingle();

  if (error) throw new Error(`Customer lookup failed: ${error.message}`);

  if (existing) return existing;

  // Create new customer
  const { data: created, error: createErr } = await supabase
    .from("customers")
    .insert({ name })
    .select("id, name")
    .single();

  if (createErr || !created)
    throw new Error(`Customer creation failed: ${createErr?.message}`);

  return created;
}

/** Fetch a customer's current balance from the view. */
async function fetchBalance(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  customerId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("customer_balances")
    .select("balance")
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw new Error(`Balance fetch failed: ${error.message}`);
  return Number(data?.balance ?? 0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function applyEntries(
  entries: Entry[],
  transcript: string
): Promise<LedgerResult[]> {
  const supabase = createSupabaseServerClient();

  // ── Step 1: resolve / create all customers ───────────────────────────────
  const customers = await Promise.all(
    entries.map((e) => findOrCreateCustomer(supabase, e.customer))
  );

  // ── Step 2: build transaction rows ───────────────────────────────────────
  const rows: {
    customer_id: string;
    kind: string;
    total: number | null;
    paid: number | null;
    delta: number;
    raw_transcript: string;
  }[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const customer = customers[i];

    if (entry.kind === "sale") {
      const total = entry.total ?? 0;
      const paid  = entry.paid  ?? 0;
      rows.push({
        customer_id:    customer.id,
        kind:           "sale",
        total,
        paid,
        delta:          total - paid,   // positive = customer now owes more
        raw_transcript: transcript,
      });
    } else {
      // payment
      let paid: number;
      if (entry.clear_all) {
        // Fetch current balance so we can zero it out exactly
        const balance = await fetchBalance(supabase, customer.id);
        paid = Math.max(balance, 0); // only make sense to clear positive balance
      } else {
        paid = entry.amount ?? 0;
      }
      rows.push({
        customer_id:    customer.id,
        kind:           "payment",
        total:          null,
        paid,
        delta:          -paid,          // negative = customer owes less
        raw_transcript: transcript,
      });
    }
  }

  // ── Step 3: batch insert (all-or-nothing) ─────────────────────────────────
  const { data: inserted, error: insertErr } = await supabase
    .from("transactions")
    .insert(rows)
    .select("id, customer_id");

  if (insertErr)
    throw new Error(`Transaction insert failed: ${insertErr.message}`);

  // ── Step 4: fetch new balances ────────────────────────────────────────────
  const uniqueCustomerIds = [...new Set(customers.map((c) => c.id))];

  const { data: balances, error: balErr } = await supabase
    .from("customer_balances")
    .select("id, name, balance")
    .in("id", uniqueCustomerIds);

  if (balErr) throw new Error(`Balance refetch failed: ${balErr.message}`);

  const balanceMap = new Map(
    (balances ?? []).map((b) => [b.id, Number(b.balance)])
  );

  // ── Step 5: build results ─────────────────────────────────────────────────
  return customers.map((customer, i) => ({
    customer,
    balance: balanceMap.get(customer.id) ?? 0,
    transactionId: inserted?.[i]?.id ?? null,
  }));
}
