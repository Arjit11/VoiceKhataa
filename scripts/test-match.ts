#!/usr/bin/env npx tsx
/**
 * scripts/test-match.ts
 *
 * Tests the match_customers() SQL function directly.
 * Run with:  npx tsx --tsconfig tsconfig.json scripts/test-match.ts
 *
 * Requires the schema (including match_customers) to be applied in Supabase
 * and seed data to be present.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type MatchRow = { id: string; name: string; similarity: number };

async function match(search: string): Promise<MatchRow[]> {
  const { data, error } = await supabase.rpc("match_customers", { search });
  if (error) throw new Error(error.message);
  return (data ?? []) as MatchRow[];
}

function fmt(rows: MatchRow[]): string {
  if (rows.length === 0) return "  (no matches)";
  return rows
    .map((r) => `  → "${r.name}" (${r.similarity.toFixed(3)})`)
    .join("\n");
}

async function main() {
  console.log("VoiceKhata — match_customers test\n");

  const cases: { search: string; expect: string }[] = [
    {
      search: "Sharmaji",
      expect: 'Should match "Sharma ji" with high similarity (≥ 0.6)',
    },
    {
      search: "sharma",
      expect: 'Should match "Sharma ji" (honorific stripped)',
    },
    {
      search: "Gurpreet",
      expect: 'Should match "Gurpreet" exactly (1.0)',
    },
    {
      search: "Rakesh",
      expect:
        'Should match "Ramesh" weakly — may trigger clarify (gap < 0.15)',
    },
    {
      search: "Verma",
      expect: 'Should match "Verma ji" (honorific stripped)',
    },
    {
      search: "xyz_no_one",
      expect: "Should return no matches → new customer would be created",
    },
  ];

  for (const { search, expect } of cases) {
    console.log(`Search: "${search}"`);
    console.log(`Expect: ${expect}`);
    try {
      const rows = await match(search);
      console.log(fmt(rows));

      if (rows.length >= 2) {
        const gap = rows[0].similarity - rows[1].similarity;
        const wouldClarify = rows[0].similarity < 0.6 || gap < 0.15;
        console.log(
          `  gap=${gap.toFixed(3)} → would ${wouldClarify ? "CLARIFY ⚠️" : "use top match ✓"}`
        );
      } else if (rows.length === 1) {
        const strong = rows[0].similarity >= 0.6;
        console.log(
          `  → would ${strong ? "use top match ✓" : "CREATE new customer (weak match)"}`
        );
      }
    } catch (e) {
      console.error(`  ERROR: ${e instanceof Error ? e.message : e}`);
    }
    console.log();
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
