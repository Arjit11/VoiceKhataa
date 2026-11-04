# VoiceKhata 🎙️

Hands-free udhaar (credit) ledger for Indian kirana shopkeepers.  
Speak a command in Hindi/Hinglish → Gemini extracts names and amounts → the live ledger updates instantly.

---

## Features

- **Voice input** — speak in Hindi, Hinglish, Punjabi, or English (India)
- **Gemini AI** — extracts customer names and amounts from natural speech
- **Live ledger** — real-time Supabase table with balances
- **WhatsApp reminders** — one-tap pre-filled message per customer
- **Typed fallback** — always-visible text input for no-mic situations
- **Offline banner** — warns when connectivity is lost
- **Undo** — cancel the last entry within 5 seconds
- **Query** — ask "Sharma ji kitna diya?" to get a balance

---

## Environment Variables

Create a `.env.local` file at the project root (never commit this file):

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Gemini
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_MODEL=gemini-flash-lite-latest

# Shop name shown in WhatsApp reminders (optional)
NEXT_PUBLIC_SHOP_NAME=Arjit General Store
```

| Variable | Side | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | ✅ | Public project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | ✅ | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | ✅ | Never expose to browser |
| `GEMINI_API_KEY` | **Server only** | ✅ | Never expose to browser |
| `GEMINI_MODEL` | **Server only** | ✅ | Use `gemini-flash-lite-latest` |
| `NEXT_PUBLIC_SHOP_NAME` | Client | ☑️ Optional | Defaults to `hamari dukaan` |

> **Security**: In Vercel, add `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` as server-only variables — do **not** tick "Expose to browser". Only `NEXT_PUBLIC_*` variables go to the client bundle.

---

## Database Setup (Supabase)

Run SQL in the **Supabase SQL editor** in this exact order:

### Step 1 — Run `schema.sql`

Open `schema.sql` from this repo and paste it into the SQL editor, then click **Run**.

This creates:
- `customers` table (id, name, phone, balance, timestamps)
- `transactions` table (id, customer_id, amount, note, timestamps)
- `match_customers(search text)` RPC function for fuzzy name matching

### Step 2 — Run `seed.sql` (optional)

Open `seed.sql` and run it to populate a few demo customers (Sharma ji, Gupta ji, etc.).

---

## Local Development

```bash
npm install
cp .env.example .env.local   # fill in your values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Debug panel**: append `?debug=1` to the URL to see the raw Gemini parse result.  
**Lang test**: visit `/lang-test` to test speech recognition for different languages.

---

## Vercel Deployment

1. Push this repo to GitHub (`.env.local` is git-ignored automatically).
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your GitHub repo.
3. In **Environment Variables**, add all 6 variables from the table above.
   - For `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY`: **do not** tick "Expose to browser".
4. Click **Deploy**.
5. After deploy, open the Vercel URL and test with a voice command.

---

## Project Structure

```
VoiceKhata/
├── app/
│   ├── page.tsx                  # Home: VoiceCapture + Ledger
│   ├── lang-test/page.tsx        # Language recognition test page
│   └── api/
│       ├── process/route.ts      # Main AI + ledger route (rate-limited)
│       ├── customers/
│       │   └── phone/route.ts    # PATCH phone number (server role)
│       └── health/route.ts       # Health check endpoint
├── components/
│   ├── VoiceCapture.tsx          # Mic UI, typed fallback, reply, debug
│   └── Ledger.tsx                # Live table, WhatsApp buttons, Remind all
├── hooks/
│   └── useSpeechRecognition.ts   # Web Speech API hook
├── lib/
│   ├── gemini.ts                 # Gemini API client (server only)
│   ├── parse.ts                  # parseTranscript() — Gemini prompt (server only)
│   ├── ledger.ts                 # applyEntries, fuzzy match (server only)
│   ├── query.ts                  # runQuery — read-only balance queries (server only)
│   ├── undo.ts                   # undoLast — 5s window (server only)
│   ├── reply.ts                  # buildReply — Hindi response strings (server only)
│   ├── validate.ts               # validateEntries — amount/name checks (server only)
│   ├── rateLimit.ts              # In-memory sliding window, 60 req/60s (server only)
│   ├── supabase.ts               # Service-role Supabase client (server only)
│   ├── supabaseClient.ts         # Anon Supabase client (client-safe)
│   ├── whatsapp.ts               # buildReminderLink (client-safe)
│   ├── speak.ts                  # speak() / cancelSpeech() — TTS (client-safe)
│   ├── schema.ts                 # Zod schemas / shared types
│   └── speech-types.ts           # RecogLang union type
├── schema.sql                    # Run first in Supabase SQL editor
├── seed.sql                      # Run second (optional demo data)
├── .env.example                  # Copy → .env.local and fill in values
└── .gitignore                    # .env.local is listed here
```

---

## Usage Examples

Speak (or type) any of these:

| Command | What happens |
|---|---|
| `Sharma ji ne 500 liye` | Adds ₹500 debit for Sharma ji |
| `Gupta ji ne 200 diye` | Adds ₹200 credit for Gupta ji |
| `Sharma ji kitna baaki hai` | Reads Sharma ji's balance aloud |
| `last wala hata do` | Undoes the most recent entry (5s window) |
| WhatsApp button | Opens WhatsApp with a pre-filled reminder in Hindi |

---

## Rate Limiting

`/api/process` applies an in-memory sliding-window limit of **60 requests per 60 seconds per IP**. This resets on cold start (suitable for single-instance demos). Requests over the limit receive HTTP 429 with a `Retry-After` header.

---

## License

MIT
