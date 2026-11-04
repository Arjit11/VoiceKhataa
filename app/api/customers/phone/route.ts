/**
 * app/api/customers/phone/route.ts
 *
 * POST { customerId: string, phone: string }
 * Updates customers.phone using the service role key.
 * Validates the phone number before saving (or clears it if empty string).
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { normalizePhone } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("customerId" in body) ||
    !("phone" in body)
  ) {
    return NextResponse.json(
      { ok: false, error: "customerId and phone are required" },
      { status: 400 }
    );
  }

  const { customerId, phone } = body as { customerId: unknown; phone: unknown };

  if (typeof customerId !== "string" || !customerId) {
    return NextResponse.json({ ok: false, error: "Invalid customerId" }, { status: 400 });
  }

  if (typeof phone !== "string") {
    return NextResponse.json({ ok: false, error: "phone must be a string" }, { status: 400 });
  }

  // Allow empty string to clear the phone
  let normalized: string | null = null;
  if (phone.trim() !== "") {
    normalized = normalizePhone(phone);
    if (!normalized) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Invalid phone number. Enter a 10-digit Indian mobile number (e.g. 9876543210).",
        },
        { status: 400 }
      );
    }
  }

  // Update using service role (anon RLS blocks UPDATE on customers)
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("customers")
    .update({ phone: normalized })
    .eq("id", customerId);

  if (error) {
    console.error("[/api/customers/phone] update error:", error.message);
    return NextResponse.json(
      { ok: false, error: "Could not update phone number." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, phone: normalized });
}
