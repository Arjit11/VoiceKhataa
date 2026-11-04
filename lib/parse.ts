/**
 * lib/parse.ts — SERVER SIDE ONLY
 *
 * parseTranscript(transcript) calls Gemini with response-schema mode,
 * validates the output with Zod, and retries once on validation failure.
 *
 * Phase 3 hook: extend the system prompt or swap the model here.
 */

import { getGeminiClient } from "@/lib/gemini";
import { ParsedSchema, type Parsed } from "@/lib/schema";
import { Type, type Schema as GenaiSchema } from "@google/genai";

// ---------------------------------------------------------------------------
// Gemini response schema (mirrors ParsedSchema in GenAI Schema format)
// ---------------------------------------------------------------------------

const RESPONSE_SCHEMA: GenaiSchema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: ["entries", "query", "undo", "unclear"],
      description: "Overall intent of the transcript",
    },
    entries: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: {
            type: Type.STRING,
            enum: ["sale", "payment"],
          },
          customer: { type: Type.STRING },
          total: { type: Type.NUMBER },
          paid: { type: Type.NUMBER },
          amount: { type: Type.NUMBER },
          clear_all: { type: Type.BOOLEAN },
        },
        required: ["kind", "customer"],
      },
    },
    query: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        type: {
          type: Type.STRING,
          enum: ["top_debtors", "customer_balance", "total_outstanding"],
        },
        customer: { type: Type.STRING },
        limit: { type: Type.NUMBER },
      },
      required: ["type"],
    },
  },
  required: ["intent", "entries", "query"],
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `
You are a ledger assistant for Indian kirana (grocery) shops.
Input: a speech-to-text transcript in Hindi, Punjabi, English or any mix (Hinglish).
The transcript may contain recognition errors; use context to infer meaning.

OUTPUT FORMAT: strict JSON matching the provided schema. No markdown, no explanation.

RULES:

## intent
- "entries"  → one or more ledger actions (sale or payment)
- "query"    → a question about the ledger
- "undo"     → user wants to cancel the last action ("last wala hata do", "galat ho gaya", "undo karo")
- "unclear"  → anything else (greetings, random speech, unrecognised content)

## entries array
- One sentence can contain multiple entries; extract ALL in order.
- Always populate "entries" (empty array [] for non-entry intents).

### sale entry (kind = "sale")
- Customer bought goods. Fields: customer, total, paid.
- total = full bill amount.
- paid = amount paid RIGHT NOW in the same sentence. If the sentence says "X abhi diye" or
  "X de diya" alongside the sale, that is paid. If nothing is paid now, paid = 0.
- "baaki udhaar" confirms remaining balance goes to credit — still set paid to whatever WAS paid.
- Example: "Sharma ji ne 450 ka saaman liya, 200 abhi diye, baaki udhaar"
  → kind:"sale", customer:"Sharma ji", total:450, paid:200
- Example: "Verma ji ne 500 ka saaman liya, sab udhaar"
  → kind:"sale", customer:"Verma ji", total:500, paid:0

### payment entry (kind = "payment")
- Customer paid an old due. Fields: customer, amount OR clear_all.
- If a specific amount is mentioned: set amount = that number.
- If everything is cleared with no amount spoken ("sab clear", "poora de diya", "hisaab clear"):
  set clear_all = true (omit amount).
- Keywords: "clear kar diya", "de diye", "jama kiye", "chukta kar diya", "bhar diya".
- Example: "Gurpreet ne purana 300 clear kar diya"
  → kind:"payment", customer:"Gurpreet", amount:300
- Example: "Ramesh ne sab clear kar diya"
  → kind:"payment", customer:"Ramesh", clear_all:true

## query object
- Populate ONLY when intent = "query"; otherwise set to null.
- "top_debtors": "sabse zyada udhaar kiska hai", "kaun kaun baki hai", "top debtors"
- "customer_balance": "Sharma ji ka kitna baaki hai", "X ka balance"
- "total_outstanding": "kul kitna udhaar hai", "total outstanding"

## Numbers
Convert spoken numbers to digits:
ek=1, do=2, teen=3, chaar=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, das=10,
bees=20, tees=30, chalis=40, pachaas=50, saath=60, sattar=70, assi=80, nabbe=90,
sau=100, dhai sau=250, paanch sau=500, ek hazaar=1000, etc.
Compound: "teen sau pachaas" = 350, "do hazaar paanch sau" = 2500.

## Customer names
- Always output names in Roman/Latin script (e.g. "Sharma ji", "Gurpreet", "Verma ji").
- If the input is in Devanagari (Hindi script), transliterate the name to Roman script.
- Capitalise the first letter of each word.
- Preserve honourifics: ji, bhai, bhaiya, didi, sahib.

## Script handling
- Input may be in Devanagari (Hindi script), Roman Hinglish, or a mix.
- Devanagari examples: शर्मा जी = "Sharma ji", गुरप्रीत = "Gurpreet", वर्मा जी = "Verma ji",
  रमेश = "Ramesh", सुनीता देवी = "Sunita Devi".
- Devanagari digits: ५ = 5, ५०० = 500, ४०० = 400, १००० = 1000.
- Always output customer names in Roman script regardless of input script.

## Sale with partial payment
- "X ne Y ka saman liya aur Z diye" → kind:"sale", total:Y, paid:Z.
- "X ne Y rupay ka saman kharida aur Z diye" (Devanagari or Roman) → same pattern.
- Devanagari example: "शर्मा जी ने 500 रुपए का सामान खरीदा और 400 दिए"
  → kind:"sale", customer:"Sharma ji", total:500, paid:400
- The word "diye" / "दिए" after a sale amount = partial payment at time of sale → set paid.

## Important
- Do NOT invent data not present in the transcript.
- If unclear, prefer "unclear" over guessing.
`.trim();

// ---------------------------------------------------------------------------
// Core extraction
// ---------------------------------------------------------------------------

async function callGemini(
  transcript: string,
  extraUserContext?: string
): Promise<Parsed> {
  const ai = getGeminiClient();
  // Read model lazily so scripts that load dotenv after import still work
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  const userText = extraUserContext
    ? `Transcript: ${transcript}\n\nNote: ${extraUserContext}`
    : `Transcript: ${transcript}`;

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: userText }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!raw) throw new Error("Gemini returned an empty response");

  const json: unknown = JSON.parse(raw);
  // May throw ZodError — caller decides whether to retry
  const parsed = ParsedSchema.parse(json);
  return roundNumbers(parsed);
}

/** Round all numeric fields to avoid floating-point noise from the model. */
function roundNumbers(p: import("@/lib/schema").Parsed): import("@/lib/schema").Parsed {
  return {
    ...p,
    entries: p.entries.map((e) => ({
      ...e,
      total: e.total != null ? Math.round(e.total) : undefined,
      paid: e.paid != null ? Math.round(e.paid) : undefined,
      amount: e.amount != null ? Math.round(e.amount) : undefined,
    })),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * parseTranscript — converts a raw transcript to a validated Parsed object.
 * Retries once if the first attempt produces invalid JSON or fails Zod validation.
 *
 * SERVER SIDE ONLY — never import this in client components.
 */
export async function parseTranscript(transcript: string): Promise<Parsed> {
  try {
    return await callGemini(transcript);
  } catch (firstError) {
    const errorMsg =
      firstError instanceof Error ? firstError.message : String(firstError);

    // Retry once with the validation error appended so Gemini can self-correct
    try {
      return await callGemini(
        transcript,
        `Your previous response failed validation with this error: ${errorMsg}. ` +
          "Please return valid JSON that strictly matches the required schema."
      );
    } catch (secondError) {
      const msg =
        secondError instanceof Error ? secondError.message : String(secondError);
      throw new Error(`Parse failed after retry: ${msg}`);
    }
  }
}
