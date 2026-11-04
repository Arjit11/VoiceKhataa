#!/usr/bin/env npx tsx
/**
 * scripts/test-parse.ts
 *
 * Run with:  npx tsx scripts/test-parse.ts
 *
 * Loads .env.local so GEMINI_API_KEY is available, then runs all test
 * sentences through parseTranscript() and prints a formatted summary.
 */

import { config } from "dotenv";
import path from "path";

// Load .env.local from project root before importing anything that reads env.
// Must happen before any lib/ import that reads process.env.
const envPath = path.resolve(process.cwd(), ".env.local");
config({ path: envPath });

// Confirm the key model loaded (helpful for debugging)
const model = process.env.GEMINI_MODEL ?? "(not set — will use default)";
console.log(`Using model: ${model}\n`);

import { parseTranscript } from "../lib/parse";
import type { Parsed } from "../lib/schema";

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const TEST_CASES: { label: string; transcript: string }[] = [
  {
    label: "Two entries: sale 450/200 + payment 300",
    transcript:
      "Sharma ji ne 450 ka saaman liya, 200 abhi diye, baaki udhaar. Aur Gurpreet ne purana 300 clear kar diya.",
  },
  {
    label: "Sale 500 all on credit",
    transcript: "Verma ji ne paanch sau ka saaman liya, sab udhaar",
  },
  {
    label: "Payment: clear all",
    transcript: "Ramesh ne sab clear kar diya",
  },
  {
    label: "Query: top debtors",
    transcript: "Kis kis ka udhaar sabse zyada hai",
  },
  {
    label: "Undo",
    transcript: "Last wala hata do",
  },
  {
    label: "Unclear (weather question)",
    transcript: "mausam kaisa hai",
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function summarise(parsed: Parsed): string {
  const lines: string[] = [`  intent : ${parsed.intent}`];

  if (parsed.entries.length > 0) {
    parsed.entries.forEach((e, i) => {
      const details =
        e.kind === "sale"
          ? `total=${e.total ?? "?"}, paid=${e.paid ?? 0}`
          : e.clear_all
          ? "clear_all=true"
          : `amount=${e.amount ?? "?"}`;
      lines.push(`  entry ${i + 1}: [${e.kind}] ${e.customer} — ${details}`);
    });
  }

  if (parsed.query) {
    lines.push(`  query  : ${parsed.query.type}${parsed.query.customer ? ` (${parsed.query.customer})` : ""}`);
  }

  return lines.join("\n");
}

async function main() {
  console.log("VoiceKhata — parseTranscript test suite\n");

  for (const { label, transcript } of TEST_CASES) {
    console.log(`─── ${label}`);
    console.log(`    "${transcript}"`);
    try {
      const parsed = await parseTranscript(transcript);
      console.log(summarise(parsed));
      console.log();
    } catch (err) {
      console.error(`    ERROR: ${err instanceof Error ? err.message : String(err)}`);
      console.log();
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
