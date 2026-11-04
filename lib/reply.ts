/**
 * lib/reply.ts — SERVER SIDE ONLY
 *
 * buildReply() converts an already-resolved API result into a Hindi/Hinglish
 * spoken reply string. Numbers come from real DB balances, never from the LLM.
 */

import type { LedgerResult } from "@/lib/ledger";
import type { QueryResult } from "@/lib/query";
import type { UndoResult } from "@/lib/undo";

// ---------------------------------------------------------------------------
// Input union (every result kind /api/process can produce)
// ---------------------------------------------------------------------------

export type ReplyKind =
  | { type: "ok";               results: LedgerResult[] }
  | { type: "resolved";         resolvedAs: string; results: LedgerResult[] }
  | { type: "clarify";          question: string; options: string[]; customerName: string }
  | { type: "query";            result: QueryResult }
  | { type: "undo";             result: UndoResult }
  | { type: "unclear" }
  | { type: "error" }
  | { type: "cancelled" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function sentenceForLedger(r: LedgerResult): string {
  const name = r.customer.name;
  const bal  = r.balance;
  if (bal > 0)   return `${name} ke ${fmt(bal)} rupaye baaki hain.`;
  if (bal === 0)  return `${name} ka hisaab clear.`;
  return `${name} ke ${fmt(Math.abs(bal))} rupaye advance hain.`;
}

function replyForQuery(result: QueryResult): string {
  switch (result.kind) {
    case "top_debtors": {
      const { debtors } = result;
      if (debtors.length === 0) return "Kisi ka udhaar baaki nahi hai.";

      const parts = debtors.map((d, i) => {
        if (i === 0) return `Sabse zyada udhaar ${d.name} ka hai, ${fmt(d.balance)} rupaye.`;
        return `Phir ${d.name} ka, ${fmt(d.balance)}.`;
      });
      return parts.join(" ");
    }

    case "customer_balance": {
      const { name, balance } = result;
      if (balance > 0)  return `${name} ke ${fmt(balance)} rupaye baaki hain.`;
      if (balance === 0) return `${name} ka hisaab clear.`;
      return `${name} ke ${fmt(Math.abs(balance))} rupaye advance hain.`;
    }

    case "customer_clarify": {
      const opts = result.options;
      if (opts.length === 0) return "Kaunsa customer? Dobara boliye.";
      const spoken = opts.slice(0, 2).join(" ya ");
      return `Kaunse ${result.customerName}? ${spoken}?`;
    }

    case "total_outstanding": {
      const { total, count } = result;
      if (count === 0) return "Kisi ka udhaar baaki nahi hai.";
      return `Kul ${fmt(total)} rupaye baaki hain, ${count} logon ke.`;
    }
  }
}

function replyForUndo(result: UndoResult): string {
  if (result.kind === "nothing") return "Hatane ke liye koi entry nahi hai.";

  const { affected } = result;
  if (affected.length === 0) return "Last entry hata di.";

  const sentences = affected.map((a) => {
    if (a.balance > 0)  return `${a.name} ke ab ${fmt(a.balance)} rupaye baaki hain.`;
    if (a.balance === 0) return `${a.name} ka hisaab ab clear hai.`;
    return `${a.name} ke ab ${fmt(Math.abs(a.balance))} rupaye advance hain.`;
  });

  return `Last entry hata di. ${sentences.join(" ")}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildReply(input: ReplyKind): string {
  switch (input.type) {
    case "ok":
    case "resolved": {
      if (!input.results || input.results.length === 0)
        return "Maaf kijiye, samajh nahi aaya. Dobara boliye.";
      return input.results.map(sentenceForLedger).join(" ");
    }

    case "clarify": {
      const opts = input.options;
      if (opts.length === 0) return "Kaunsa customer? Dobara boliye.";
      if (opts.length === 1) return `Kya aap ${opts[0]} ki baat kar rahe hain?`;
      const spoken = opts.slice(0, 2).join(" ya ");
      return `Kaunse ${input.customerName}? ${spoken}?`;
    }

    case "query":
      return replyForQuery(input.result);

    case "undo":
      return replyForUndo(input.result);

    case "unclear":
      return "Maaf kijiye, samajh nahi aaya. Dobara boliye.";

    case "cancelled":
      return "Theek hai, command cancel kar diya.";

    case "error":
      return "Kuch gadbad ho gayi. Dobara try kijiye.";
  }
}
