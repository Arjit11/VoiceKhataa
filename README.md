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

## What is real and what is mocked

### ✅ Real (live, not faked)

| Feature | Detail |
|---|---|
| **Speech recognition** | Web Speech API in Chrome — actual audio captured from mic |
| **Gemini AI parsing** | Live call to `gemini-flash-lite-latest`; extracts customer names, amounts, intent |
| **Supabase storage** | Transactions and customer balances written to a real Postgres database |
| **Live ledger** | Supabase Realtime subscription — ledger updates without page refresh |
| **Fuzzy name matching** | `pg_trgm` trigram similarity via `match_customers` RPC in Postgres |
| **Spoken replies** | Web Speech Synthesis API — actual TTS audio output |
| **WhatsApp link generation** | `wa.me` deep-link with URI-encoded Hindi message, real phone number |

### ⚠️ Limited or by design

| Item | Reality |
|---|---|
| **WhatsApp message** | Opens a pre-filled chat — the shopkeeper still taps **Send** manually; there is no server-side WhatsApp API |
| **Sample customers** | Seeded demo data (Sharma ji, Gurpreet, Verma ji, Ramesh, Sunita Devi) with fake phone numbers |
| **No login / multi-shop** | Single shop only; no authentication — suitable for a solo demo, not production multi-tenant |
| **Speech quality** | Depends on Chrome's on-device speech engine and the microphone; works best on Android Chrome or desktop Chrome |
| **Rate limit** | In-memory sliding window — resets on cold start; not suitable for high-traffic production |

---

## Demo Reset

To reset demo data before a presentation, open `?admin=1` on the app URL. A **Reset Demo** button will appear. Clicking it and confirming calls `POST /api/demo/reset` using the `DEMO_RESET_TOKEN` env var.

Add to `.env.local`:
```env
DEMO_RESET_TOKEN=your-long-random-secret
```
Add the same value in Vercel dashboard → Environment Variables.

See [`docs/DEMO.md`](docs/DEMO.md) for the full 3-minute demo script, 10 test sentences, and pre-demo checklist.

---

## License

MIT
