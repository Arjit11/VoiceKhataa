import { NextResponse } from "next/server";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini";
import { createSupabaseServerClient } from "@/lib/supabase";

// --- helpers -----------------------------------------------------------

/** Check all required env vars and return true/false per key (never the value) */
function checkEnv() {
  const vars = [
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  return Object.fromEntries(vars.map((v) => [v, Boolean(process.env[v])]));
}

/** Send a tiny prompt to Gemini and return ok + message */
async function checkGemini(): Promise<{ ok: boolean; message: string }> {
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: "Reply with the word OK" }] }],
    });
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    return { ok: true, message: text || "Connected (empty response)" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

/** Run a lightweight query against Supabase */
async function checkSupabase(): Promise<{ ok: boolean; message: string }> {
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true });

    if (!error) {
      return { ok: true, message: "connected" };
    }

    // PGRST116 = table does not exist → still means the DB is reachable
    if (error.code === "PGRST116" || error.message?.includes("does not exist")) {
      return { ok: true, message: "connected (no tables yet)" };
    }

    return { ok: false, message: error.message };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

// --- route handler -----------------------------------------------------

export async function GET() {
  // Run both checks in parallel so one slow call doesn't delay the other
  const [gemini, supabase] = await Promise.all([checkGemini(), checkSupabase()]);

  return NextResponse.json({
    gemini,
    supabase,
    env: checkEnv(),
  });
}
