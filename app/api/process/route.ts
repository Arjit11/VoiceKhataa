import { NextRequest, NextResponse } from "next/server";
import { parseTranscript } from "@/lib/parse";
import { applyEntries, applyPendingWithCustomer, type PendingState } from "@/lib/ledger";
import { validateEntries } from "@/lib/validate";
import { createSupabaseServerClient } from "@/lib/supabase";
import { buildReply } from "@/lib/reply";

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
    const reply = buildReply({ type: "error" });
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body", reply },
      { status: 400 }
    );
  }

  const parsed = parseBody(rawBody);
  if ("error" in parsed) {
    const reply = buildReply({ type: "error" });
    return NextResponse.json(
      { ok: false, error: parsed.error, reply },
      { status: parsed.status }
    );
  }

  const { transcript, pending } = parsed;

  // ── Clarification answer path ───────────────────────────────────────
  if (pending) {
    const chosen = await pickOption(transcript, pending.entries.map((e) => e.customer));

    if (!chosen) {
      const reply = buildReply({ type: "cancelled" });
      return NextResponse.json({ ok: true, cancelled: true, reply });
    }

    try {
      const results = await applyPendingWithCustomer(pending, chosen);
      const reply = buildReply({ type: "resolved", resolvedAs: chosen, results });
      return NextResponse.json({ ok: true, results, resolvedAs: chosen, reply });
    } catch (err) {
      console.error("[/api/process] pending apply error:", err);
      const reply = buildReply({ type: "error" });
      return NextResponse.json(
        { ok: false, error: "Could not apply pending entries.", reply },
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
    const reply = buildReply({ type: "error" });
    return NextResponse.json(
      { ok: false, error: "Could not process transcript. Please try again.", reply },
      { status: 500 }
    );
  }

  // ── Validate entries ───────────────────────────────────────────────
  if (geminiParsed.intent === "entries" && geminiParsed.entries.length > 0) {
    const validationErr = validateEntries(geminiParsed.entries);
    if (validationErr) {
      const { code, detail } = validationErr;
      const reply = buildReply({ type: "error" });
      return NextResponse.json(
        { ok: false, code, detail, reply },
        { status: 400 }
      );
    }

    // ── Apply to ledger ──────────────────────────────────────────────
    try {
      const ledgerResult = await applyEntries(geminiParsed.entries, transcript);

      if (ledgerResult.status === "clarify") {
        // Use the first entry's customer name for the spoken question
        const customerName = geminiParsed.entries[0]?.customer ?? "customer";
        const reply = buildReply({
          type: "clarify",
          question: ledgerResult.question,
          options: ledgerResult.options,
          customerName,
        });
        return NextResponse.json({
          ok: true,
          parsed: geminiParsed,
          clarify: {
            question: ledgerResult.question,
            options:  ledgerResult.options,
            pending:  ledgerResult.pending,
          },
          reply,
        });
      }

      const reply = buildReply({ type: "ok", results: ledgerResult.results });
      return NextResponse.json({
        ok: true,
        parsed: geminiParsed,
        results: ledgerResult.results,
        reply,
      });
    } catch (err) {
      console.error("[/api/process] ledger error:", err);
      const reply = buildReply({ type: "error" });
      return NextResponse.json(
        { ok: false, error: "Transcript parsed but could not write to ledger.", reply },
        { status: 500 }
      );
    }
  }

  // ── Other intents (query, undo, unclear) ───────────────────────────
  const reply = buildReply({ type: "unclear" });
  return NextResponse.json({ ok: true, parsed: geminiParsed, reply });
}
