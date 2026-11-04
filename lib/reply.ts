/**
 * lib/reply.ts — SERVER SIDE ONLY
 *
 * buildReply() converts an already-resolved API result into a Hindi/Hinglish
 * spoken reply string. Numbers come from real DB balances (LedgerResult),
 * never from the LLM.
 */

import type { LedgerResult } from "@/lib/ledger";

// ---------------------------------------------------------------------------
// Input types (mirror what /api/process returns)
// ---------------------------------------------------------------------------

export interface ReplyInput {
  kind:
    | { type: "ok";       results: LedgerResult[] }
    | { type: "clarify";  question: string; options: string[]; customerName: string }
    | { type: "unclear" }
    | { type: "error" }
    | { type: "cancelled" }
    | { type: "resolved"; resolvedAs: string; results: LedgerResult[] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  // Integer if whole, one decimal place otherwise
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function sentenceForResult(r: LedgerResult): string {
  const name = r.customer.name;
  const bal  = r.balance;

  if (bal > 0)  return `${name} ke ${fmt(bal)} rupaye baaki hain.`;
  if (bal === 0) return `${name} ka hisaab clear.`;
  // overpayment (advance)
  return `${name} ke ${fmt(Math.abs(bal))} rupaye advance hain.`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildReply(input: ReplyInput["kind"]): string {
  switch (input.type) {
    case "ok":
    case "resolved": {
      if (!input.results || input.results.length === 0) {
        return "Maaf kijiye, samajh nahi aaya. Dobara boliye.";
      }
      return input.results.map(sentenceForResult).join(" ");
    }

    case "clarify": {
      const opts = input.options;
      if (opts.length === 0) return "Kaunsa customer? Dobara boliye.";
      if (opts.length === 1) return `Kya aap ${opts[0]} ki baat kar rahe hain?`;
      // list first two options verbally
      const spoken = opts.slice(0, 2).join(" ya ");
      return `Kaunse ${input.customerName}? ${spoken}?`;
    }

    case "unclear":
      return "Maaf kijiye, samajh nahi aaya. Dobara boliye.";

    case "cancelled":
      return "Theek hai, command cancel kar diya.";

    case "error":
      return "Kuch gadbad ho gayi. Dobara try kijiye.";
  }
}
