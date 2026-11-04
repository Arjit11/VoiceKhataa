/**
 * lib/query.ts — SERVER SIDE ONLY
 *
 * runQuery() executes read-only ledger queries from the customer_balances view.
 * Never writes to the database.
 */

import { createSupabaseServerClient } from "@/lib/supabase";
import type { Query } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export type QueryResult =
  | { kind: "top_debtors";       debtors: { name: string; balance: number }[] }
  | { kind: "customer_balance";  name: string; balance: number }
  | { kind: "customer_clarify";  options: string[]; customerName: string }
  | { kind: "total_outstanding"; total: number; count: number };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runQuery(query: Query): Promise<QueryResult> {
  if (!query) throw new Error("query is null");
  const supabase = createSupabaseServerClient();

  switch (query.type) {
    // ── Top debtors ────────────────────────────────────────────────────
    case "top_debtors": {
      const limit = query.limit ?? 3;
      const { data, error } = await supabase
        .from("customer_balances")
        .select("name, balance")
        .gt("balance", 0)
        .order("balance", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`top_debtors query failed: ${error.message}`);

      return {
        kind: "top_debtors",
        debtors: (data ?? []).map((r) => ({
          name:    r.name as string,
          balance: Number(r.balance),
        })),
      };
    }

    // ── Customer balance ───────────────────────────────────────────────
    case "customer_balance": {
      const name = query.customer ?? "";
      if (!name) throw new Error("customer_balance query missing customer name");

      // Use fuzzy matcher to find the right customer
      const { data: matches, error: matchErr } = await supabase.rpc(
        "match_customers",
        { search: name }
      );
      if (matchErr) throw new Error(`match_customers failed: ${matchErr.message}`);

      type MatchRow = { id: string; name: string; similarity: number };
      const rows = (matches ?? []) as MatchRow[];

      if (rows.length === 0) {
        // No match — treat as balance 0 for a new name
        return { kind: "customer_balance", name, balance: 0 };
      }

      const top    = rows[0];
      const second = rows[1];
      const gap    = second ? top.similarity - second.similarity : Infinity;

      // Ambiguous — ask user to clarify
      if (top.similarity < 0.6 || gap < 0.15) {
        if (rows.length >= 2) {
          return {
            kind:         "customer_clarify",
            options:      rows.slice(0, 3).map((r) => r.name),
            customerName: name,
          };
        }
      }

      // Confident match — fetch their balance
      const { data: bal, error: balErr } = await supabase
        .from("customer_balances")
        .select("name, balance")
        .eq("id", top.id)
        .maybeSingle();

      if (balErr) throw new Error(`balance fetch failed: ${balErr.message}`);

      return {
        kind:    "customer_balance",
        name:    (bal?.name as string) ?? top.name,
        balance: Number(bal?.balance ?? 0),
      };
    }

    // ── Total outstanding ──────────────────────────────────────────────
    case "total_outstanding": {
      const { data, error } = await supabase
        .from("customer_balances")
        .select("balance")
        .gt("balance", 0);

      if (error) throw new Error(`total_outstanding query failed: ${error.message}`);

      const rows = (data ?? []) as { balance: number }[];
      const total = rows.reduce((sum, r) => sum + Number(r.balance), 0);
      return { kind: "total_outstanding", total, count: rows.length };
    }
  }
}
