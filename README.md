# VoiceKhata

Hands-free udhaar (credit) ledger for Indian kirana shopkeepers. Built with
Next.js (App Router), TypeScript, Tailwind CSS, Supabase Postgres, and the
Gemini API.

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in every value:

| Variable | Where to get it |
|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) → Create API key |
| `GEMINI_MODEL` | Leave as `gemini-2.0-flash` or pick another model from AI Studio |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → **Settings → API → Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → **Settings → API → anon / public** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → **Settings → API → service\_role** ⚠️ keep secret |

### 3. Start the dev server

```bash
npm run dev
```

### 4. Verify the setup

Open **Chrome** (required for Speech Recognition) and visit:

1. **`http://localhost:3000/api/health`** — should return JSON with
   `gemini.ok: true` and `supabase.ok: true` (or `"connected (no tables yet)"`
   if you haven't created any tables yet).

2. **`http://localhost:3000/lang-test`** — tap the mic button, speak the
   suggested sentence in Hindi, and confirm the transcript appears.

---

## Vercel Deployment

Push your code to GitHub, then create a new Vercel project pointing at the
repo. Add the following environment variables in
**Vercel → Project → Settings → Environment Variables**:

| Variable | Environment |
|---|---|
| `GEMINI_API_KEY` | Production, Preview, Development |
| `GEMINI_MODEL` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview, Development |

> **Never** tick "Expose to browser" for `GEMINI_API_KEY` or
> `SUPABASE_SERVICE_ROLE_KEY`. They are server-side only.

After adding the variables, trigger a fresh deployment from the Vercel
dashboard.

---

## Project Structure (Phase 0)

```
VoiceKhata/
├── app/
│   ├── layout.tsx          Root layout
│   ├── page.tsx            Home page → links to /lang-test and /api/health
│   ├── globals.css         Tailwind global styles
│   ├── api/
│   │   └── health/
│   │       └── route.ts    GET /api/health — Gemini + Supabase health check
│   └── lang-test/
│       └── page.tsx        Client component — language & voice test
├── lib/
│   ├── gemini.ts           Server-side Gemini client helper
│   └── supabase.ts         Server-side Supabase client (service role)
├── .env.example            Variable names only — copy to .env.local
├── .gitignore              Includes .env.local
└── README.md               This file
```
