/**
 * lib/ledger.ts — SERVER SIDE ONLY
 *
 * applyEntries(entries, transcript) writes ledger rows to Supabase using the
 * service role key. Returns either confirmed results or a clarification request
 * when a customer name is ambiguous.
 */

import { createSupabaseServerClient } from "@/lib/supabase";
import type { Entry } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LedgerResult {
  customer: { id: string; name: string };
  balance: number;
  transactionId: string | null;
}

export interface PendingState {
  entries: Entry[];
  transcript: string;
}

export type ApplyResult =
  | { status: "ok"; results: LedgerResult[] }
  | {
      status: "clarify";
      question: string;
      options: string[];
      pending: PendingState;
    };

interface MatchRow {
  id: string;
  name: string;
  similarity: number;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const STRONG_MATCH_THRESHOLD = 0.6;  // top match must be at least this
const GAP_THRESHOLD          = 0.15; // must be this much better than #2

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calls the match_customers() SQL function.
 * Returns candidates ordered by similarity descending (only > 0.4).
 */
async function fuzzyMatchCustomers(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  name: string
): Promise<MatchRow[]> {
  const { data, error } = await supabase.rpc("match_customers", {
    search: name,
  });
  if (error) throw new Error(`fuzzy match failed: ${error.message}`);
  return (data ?? []) as MatchRow[];
}

/**
 * Decide what to do with fuzzy results for a single name.
 *
 * Returns:
 *   { kind: "found",   customer }  — confident single match
 *   { kind: "create"             }  — no match, create new customer
 *   { kind: "clarify", options  }  — ambiguous, need user input
 */
type ResolveDecision =
  | { kind: "found"; customer: { id: string; name: string } }
  | { kind: "create" }
  | { kind: "clarify"; options: string[] };

function decide(candidates: MatchRow[]): ResolveDecision {
  if (candidates.length === 0) return { kind: "create" };

  const top = candidates[0];
  const second = candidates[1];

  // Strong match: top score is high enough AND clearly better than #2
  const gap = second ? top.similarity - second.similarity : Infinity;
  if (top.similarity >= STRONG_MATCH_THRESHOLD && gap >= GAP_THRESHOLD) {
    return { kind: "found", customer: { id: top.id, name: top.name } };
  }

  // Multiple close candidates — ask the user to clarify
  if (candidates.length >= 2) {
    // Show top 3 at most
    return {
      kind: "clarify",
      options: candidates.slice(0, 3).map((c) => c.name),
    };
  }

  // Single weak match — treat as create (don't guess)
  return { kind: "create" };
}

/** Create a new customer and return them. */
async function createCustomer(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  name: string
): Promise<{ id: string; name: string }> {
  const { data, error } = await supabase
    .from("customers")
    .insert({ name })
    .select("id, name")
    .single();
  if (error || !data)
    throw new Error(`Customer creation failed: ${error?.message}`);
  return data;
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

/** Build and batch-insert transaction rows; return balances. */
async function writeTransactions(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  entries: Entry[],
  customers: { id: string; name: string }[],
  transcript: string
): Promise<LedgerResult[]> {
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
        customer_id: customer.id,
        kind: "sale",
        total,
        paid,
        delta: total - paid,
        raw_transcript: transcript,
      });
    } else {
      let paid: number;
      if (entry.clear_all) {
        const balance = await fetchBalance(supabase, customer.id);
        paid = Math.max(balance, 0);
      } else {
        paid = entry.amount ?? 0;
      }
      rows.push({
        customer_id: customer.id,
        kind: "payment",
        total: null,
        paid,
        delta: -paid,
        raw_transcript: transcript,
      });
    }
  }

  // Batch insert — all or nothing
  const { data: inserted, error: insertErr } = await supabase
    .from("transactions")
    .insert(rows)
    .select("id, customer_id");

  if (insertErr)
    throw new Error(`Transaction insert failed: ${insertErr.message}`);

  // Fetch updated balances
  const uniqueIds = [...new Set(customers.map((c) => c.id))];
  const { data: balances, error: balErr } = await supabase
    .from("customer_balances")
    .select("id, name, balance")
    .in("id", uniqueIds);

  if (balErr) throw new Error(`Balance refetch failed: ${balErr.message}`);

  const balMap = new Map(
    (balances ?? []).map((b) => [b.id, Number(b.balance)])
  );

  return customers.map((customer, i) => ({
    customer,
    balance: balMap.get(customer.id) ?? 0,
    transactionId: inserted?.[i]?.id ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * applyEntries — resolves customer names (fuzzy), validates ambiguity,
 * and writes transactions. May return a clarify request instead of results.
 *
 * SERVER SIDE ONLY.
 */
export async function applyEntries(
  entries: Entry[],
  transcript: string
): Promise<ApplyResult> {
  const supabase = createSupabaseServerClient();

  // Resolve each entry's customer name
  const decisions: ResolveDecision[] = [];
  for (const entry of entries) {
    const candidates = await fuzzyMatchCustomers(supabase, entry.customer);
    decisions.push(decide(candidates));
  }

  // Check if any entry needs clarification
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    if (d.kind === "clarify") {
      return {
        status: "clarify",
        question: `Did you mean one of these for "${entries[i].customer}"?`,
        options: d.options,
        pending: { entries, transcript },
      };
    }
  }

  // All resolved — create missing customers then write
  const customers: { id: string; name: string }[] = [];
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    if (d.kind === "found") {
      customers.push(d.customer);
    } else {
      // create
      const created = await createCustomer(supabase, entries[i].customer);
      customers.push(created);
    }
  }

  const results = await writeTransactions(supabase, entries, customers, transcript);
  return { status: "ok", results };
}

/**
 * applyPendingWithCustomer — applies stored pending entries after the user
 * confirmed a customer name from the clarification options.
 *
 * SERVER SIDE ONLY.
 */
export async function applyPendingWithCustomer(
  pending: PendingState,
  chosenName: string
): Promise<LedgerResult[]> {
  const supabase = createSupabaseServerClient();

  // Find the chosen customer by exact name (they're already in the DB)
  const { data, error } = await supabase
    .from("customers")
    .select("id, name")
    .ilike("name", chosenName)
    .maybeSingle();

  if (error || !data)
    throw new Error(`Could not find chosen customer "${chosenName}"`);

  // Map all pending entries to this single customer
  // (Phase 4 scope: clarify only triggers when all entries share the same ambiguous name)
  const customers = pending.entries.map(() => data);
  return writeTransactions(supabase, pending.entries, customers, pending.transcript);
}
