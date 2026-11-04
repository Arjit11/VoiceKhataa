/**
 * lib/undo.ts — SERVER SIDE ONLY
 *
 * undoLast() deletes the most recent "sentence" of transactions:
 * rows sharing the same raw_transcript, created within 5 seconds of the
 * newest transaction in the table.
 *
 * Returns the affected customers with their new balances.
 */

import { createSupabaseServerClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export type UndoResult =
  | { kind: "undone";  deleted: number; affected: { name: string; balance: number }[] }
  | { kind: "nothing" };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function undoLast(): Promise<UndoResult> {
  const supabase = createSupabaseServerClient();

  // ── Step 1: find the newest transaction ─────────────────────────────
  const { data: newest, error: newestErr } = await supabase
    .from("transactions")
    .select("id, raw_transcript, created_at, customer_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (newestErr) throw new Error(`undo fetch failed: ${newestErr.message}`);
  if (!newest) return { kind: "nothing" };

  const newestTime = new Date(newest.created_at).getTime();
  const windowStart = new Date(newestTime - 5000).toISOString();

  // ── Step 2: find all rows in the same "sentence" ─────────────────────
  // Same raw_transcript AND created within 5 seconds of the newest row
  const { data: group, error: groupErr } = await supabase
    .from("transactions")
    .select("id, customer_id")
    .eq("raw_transcript", newest.raw_transcript)
    .gte("created_at", windowStart);

  if (groupErr) throw new Error(`undo group fetch failed: ${groupErr.message}`);
  if (!group || group.length === 0) return { kind: "nothing" };

  const ids         = group.map((r) => r.id);
  const customerIds = [...new Set(group.map((r) => r.customer_id as string))];

  // ── Step 3: delete them all ──────────────────────────────────────────
  const { error: delErr } = await supabase
    .from("transactions")
    .delete()
    .in("id", ids);

  if (delErr) throw new Error(`undo delete failed: ${delErr.message}`);

  // ── Step 4: return new balances ──────────────────────────────────────
  const { data: balances, error: balErr } = await supabase
    .from("customer_balances")
    .select("name, balance")
    .in("id", customerIds);

  if (balErr) throw new Error(`undo balance refetch failed: ${balErr.message}`);

  return {
    kind:     "undone",
    deleted:  ids.length,
    affected: (balances ?? []).map((b) => ({
      name:    b.name as string,
      balance: Number(b.balance),
    })),
  };
}
