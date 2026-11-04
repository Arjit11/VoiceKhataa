import { NextRequest, NextResponse } from "next/server";
import { parseTranscript } from "@/lib/parse";
import { applyEntries } from "@/lib/ledger";

const MAX_LENGTH = 500;

export async function POST(req: NextRequest) {
  // ── Parse body ─────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("transcript" in body)
  ) {
    return NextResponse.json(
      { ok: false, error: "transcript field is required" },
      { status: 400 }
    );
  }

  const { transcript } = body as { transcript: unknown };

  if (typeof transcript !== "string" || transcript.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "transcript must be a non-empty string" },
      { status: 400 }
    );
  }

  if (transcript.length > MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `transcript must be ${MAX_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  const text = transcript.trim();

  // ── Gemini extraction ──────────────────────────────────────────────
  let parsed;
  try {
    parsed = await parseTranscript(text);
  } catch (err) {
    console.error("[/api/process] parse error:", err);
    return NextResponse.json(
      { ok: false, error: "Could not process transcript. Please try again." },
      { status: 500 }
    );
  }

  // ── Ledger write (entries intent only) ────────────────────────────
  if (parsed.intent === "entries" && parsed.entries.length > 0) {
    try {
      const results = await applyEntries(parsed.entries, text);
      return NextResponse.json({ ok: true, parsed, results }, { status: 200 });
    } catch (err) {
      console.error("[/api/process] ledger error:", err);
      return NextResponse.json(
        { ok: false, error: "Transcript parsed but could not write to ledger." },
        { status: 500 }
      );
    }
  }

  // ── Other intents — return parsed only ────────────────────────────
  return NextResponse.json({ ok: true, parsed }, { status: 200 });
}
