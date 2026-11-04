/**
 * lib/supabaseClient.ts — BROWSER / CLIENT COMPONENTS ONLY
 *
 * Singleton anon Supabase client using the public NEXT_PUBLIC_ keys.
 * Used for SELECT queries and Realtime subscriptions in client components.
 * Never contains or uses the service role key.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// ---------------------------------------------------------------------------
// Row types (matching the view / tables)
// ---------------------------------------------------------------------------

export interface CustomerBalance {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  last_activity: string | null;
}

export interface Transaction {
  id: string;
  customer_id: string;
  kind: "sale" | "payment";
  total: number | null;
  paid: number | null;
  delta: number;
  note: string | null;
  raw_transcript: string | null;
  created_at: string;
}
