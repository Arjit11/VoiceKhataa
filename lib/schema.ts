import { z } from "zod";

// ---------------------------------------------------------------------------
// Entry — a single ledger action extracted from the transcript
// ---------------------------------------------------------------------------

export const EntrySchema = z.object({
  /** "sale" = goods sold; "payment" = customer paid an old due */
  kind: z.enum(["sale", "payment"]),
  /** Customer name in Roman script, honourifics preserved ("Sharma ji") */
  customer: z.string(),
  /** sale only: total bill amount */
  total: z.number().optional(),
  /** sale only: amount paid right now (0 if nothing paid) */
  paid: z.number().optional(),
  /** payment only: amount paid towards old dues */
  amount: z.number().optional(),
  /** payment only: true when everything is cleared and no amount was spoken */
  clear_all: z.boolean().optional(),
});

export type Entry = z.infer<typeof EntrySchema>;

// ---------------------------------------------------------------------------
// Query — a question about the ledger
// ---------------------------------------------------------------------------

export const QuerySchema = z
  .object({
    type: z.enum([
      "top_debtors",       // "sabse zyada udhaar kiska hai"
      "customer_balance",  // "Sharma ji ka kitna baaki hai"
      "total_outstanding", // "total kitna udhaar hai"
    ]),
    /** Filled for customer_balance queries */
    customer: z.string().optional(),
    /** Filled for top_debtors queries (default assumed by Phase 3: 5) */
    limit: z.number().optional(),
  })
  .nullable();

export type Query = z.infer<typeof QuerySchema>;

// ---------------------------------------------------------------------------
// Top-level parsed result
// ---------------------------------------------------------------------------

export const ParsedSchema = z.object({
  intent: z.enum(["entries", "query", "undo", "unclear"]),
  entries: z.array(EntrySchema),
  query: QuerySchema,
});

export type Parsed = z.infer<typeof ParsedSchema>;
