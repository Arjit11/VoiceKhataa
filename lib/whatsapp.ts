/**
 * lib/whatsapp.ts
 *
 * Builds a WhatsApp deeplink pre-filled with a Hindi payment reminder message.
 * Client-safe: only uses NEXT_PUBLIC_ env vars, no secrets.
 *
 * Also exports normalizePhone() so the API route can share the same validation.
 */

// ---------------------------------------------------------------------------
// Phone normaliser
// ---------------------------------------------------------------------------

/**
 * Normalize a raw phone string to a 12-digit E.164 string (without +).
 * Returns null if the result is not a valid Indian mobile number.
 *
 * Rules:
 *  - Strip spaces, dashes, dots, parentheses, leading + or 0
 *  - If 10 digits remain → prefix with 91
 *  - Accept if result is exactly 12 digits starting with "91"
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Remove everything except digits
  let digits = raw.replace(/\D/g, "");

  // Strip leading 0 (STD code style like 09876543210)
  if (digits.startsWith("0")) digits = digits.slice(1);

  // Strip country code if present as 91xxxxxxxxxx (12 digits)
  // or just leave 10 digits to prefix below
  if (digits.length === 10) {
    digits = "91" + digits;
  }

  // Must be exactly 12 digits starting with 91
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Link builder
// ---------------------------------------------------------------------------

export interface ReminderParams {
  name: string;
  balance: number;
  phone: string | null | undefined;
  shopName?: string;
}

/**
 * Build a WhatsApp wa.me deeplink with a pre-filled Hindi reminder message.
 * Returns null if the phone number is invalid or missing.
 */
export function buildReminderLink(params: ReminderParams): string | null {
  const phone = normalizePhone(params.phone);
  if (!phone) return null;

  const shopName =
    params.shopName ??
    process.env.NEXT_PUBLIC_SHOP_NAME ??
    "hamari dukaan";

  // Balance as a whole number (or one decimal if needed)
  const bal = Number.isInteger(params.balance)
    ? String(params.balance)
    : params.balance.toFixed(1);

  const message =
    `Namaste ${params.name}, ${shopName} mein aapke ${bal} rupaye baaki hain. ` +
    `Kripya jaldi de dijiye. Dhanyavaad.`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
