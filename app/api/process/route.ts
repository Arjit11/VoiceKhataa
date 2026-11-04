import { NextRequest, NextResponse } from "next/server";
import { parseTranscript } from "@/lib/parse";
import { applyEntries, applyPendingWithCustomer, type PendingState } from "@/lib/ledger";
import { validateEntries } from "@/lib/validate";
import { createSupabaseServerClient } from "@/lib/supabase";

const MAX_LENGTH = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse and validate the request body. */
function parseBody(body: unknown): {
  transcript: string;
  pending?: PendingState;
} | { error: string; status: number } {
  if (typeof body !== "object" || body === null || !("transcript" in body)) {
    return { error: "transcript field is required", status: 400 };
  }
  const { transcript, pending } = body as {
    transcript: unknown;
    pending?: unknown;
  };
  if (typeof transcript !== "string" || transcript.trim().length === 0) {
    return { error: "transcript must be a non-empty string", status: 400 };
  }
  if (transcript.length > MAX_LENGTH) {
    return {
      error: `transcript must be ${MAX_LENGTH} characters or fewer`,
      status: 400,
    };
  }
  return {
    transcript: transcript.trim(),
    pending: pending as PendingState | undefined,
  };
}

/**
 * Find which option in the clarification list best matches the new transcript.
 * Uses the match_customers RPC with the spoken text as the search term.
 * Returns the best matching option name, or null if nothing is good enough.
 */
async function pickOption(
  transcript: string,
  options: string[]
): Promise<string | null> {
  const supabase = createSupabaseServerClient();

  // Fuzzy match the new transcript against the candidate names
  const { data, error } = await supabase.rpc("match_customers", {
    search: transcript,
  });
  if (error || !data) return null;

  type Row = { id: string; name: string; similarity: number };
  const rows = (data as Row[]).filter((r) =>
    options.map((o) => o.toLowerCase()).includes(r.name.toLowerCase())
  );

  if (rows.length === 0) return null;
  const best = rows[0];
  return best.similarity >= 0.4 ? best.name : null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // ── Parse body ─────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = parseBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: parsed.status }
    );
  }

  const { transcript, pending } = parsed;

  // ── Clarification answer path ───────────────────────────────────────
  if (pending) {
    const chosen = await pickOption(transcript, pending.entries.map((e) => e.customer));

    if (!chosen) {
      // No match found — tell client to cancel
      return NextResponse.json({ ok: true, cancelled: true });
    }

    try {
      const results = await applyPendingWithCustomer(pending, chosen);
      return NextResponse.json({ ok: true, results, resolvedAs: chosen });
    } catch (err) {
      console.error("[/api/process] pending apply error:", err);
      return NextResponse.json(
        { ok: false, error: "Could not apply pending entries." },
        { status: 500 }
      );
    }
  }

  // ── Normal path: Gemini extraction ─────────────────────────────────
  let geminiParsed;
  try {
    geminiParsed = await parseTranscript(transcript);
  } catch (err) {
    console.error("[/api/process] parse error:", err);
    return NextResponse.json(
      { ok: false, error: "Could not process transcript. Please try again." },
      { status: 500 }
    );
  }

  // ── Validate entries ───────────────────────────────────────────────
  if (geminiParsed.intent === "entries" && geminiParsed.entries.length > 0) {
    const validationErr = validateEntries(geminiParsed.entries);
    if (validationErr) {
      const { code, detail } = validationErr;
      return NextResponse.json(
        { ok: false, code, detail },
        { status: 400 }
      );
    }

    // ── Apply to ledger ──────────────────────────────────────────────
    try {
      const ledgerResult = await applyEntries(geminiParsed.entries, transcript);

      if (ledgerResult.status === "clarify") {
        return NextResponse.json({
          ok: true,
          parsed: geminiParsed,
          clarify: {
            question: ledgerResult.question,
            options:  ledgerResult.options,
            pending:  ledgerResult.pending,
          },
        });
      }

      return NextResponse.json({
        ok: true,
        parsed: geminiParsed,
        results: ledgerResult.results,
      });
    } catch (err) {
      console.error("[/api/process] ledger error:", err);
      return NextResponse.json(
        { ok: false, error: "Transcript parsed but could not write to ledger." },
        { status: 500 }
      );
    }
  }

  // ── Other intents — return parsed only ─────────────────────────────
  return NextResponse.json({ ok: true, parsed: geminiParsed });
}
