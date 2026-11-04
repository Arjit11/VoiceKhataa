/**
 * lib/validate.ts
 *
 * Pre-write validation for ledger entries.
 * Call this BEFORE applyEntries to catch bad data early.
 */

import type { Entry } from "@/lib/schema";

export interface ValidationError {
  ok: false;
  code: "invalid_entry";
  detail: string;
}

const MAX_NAME_LENGTH = 60;

/**
 * Validates all entries.
 * Returns the first ValidationError found, or null if everything is valid.
 */
export function validateEntries(entries: Entry[]): ValidationError | null {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const idx = entries.length > 1 ? ` (entry ${i + 1})` : "";

    // ── Customer name ──────────────────────────────────────────────────
    if (!e.customer || e.customer.trim().length === 0) {
      return err(`Customer name is missing${idx}.`);
    }
    if (e.customer.trim().length > MAX_NAME_LENGTH) {
      return err(
        `Customer name is too long${idx} (max ${MAX_NAME_LENGTH} characters).`
      );
    }

    // ── Sale ───────────────────────────────────────────────────────────
    if (e.kind === "sale") {
      const total = e.total ?? 0;
      const paid = e.paid ?? 0;

      if (total <= 0) {
        return err(`Sale total must be greater than 0${idx}.`);
      }
      if (paid < 0) {
        return err(`Amount paid cannot be negative${idx}.`);
      }
      if (paid > total) {
        return err(
          `Amount paid (${paid}) cannot exceed the total (${total})${idx}.`
        );
      }
    }

    // ── Payment ────────────────────────────────────────────────────────
    if (e.kind === "payment") {
      if (!e.clear_all) {
        const amount = e.amount ?? 0;
        if (amount <= 0) {
          return err(`Payment amount must be greater than 0${idx}.`);
        }
      }
    }
  }

  return null; // all valid
}

function err(detail: string): ValidationError {
  return { ok: false, code: "invalid_entry", detail };
}
