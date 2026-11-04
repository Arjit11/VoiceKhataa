# VoiceKhata — Demo Script & Test Guide

## 3-Minute Demo Script

| Segment | Duration | What you do / say |
|---|---|---|
| **Problem** | 20 s | "Every kirana shopkeeper keeps a physical udhaar notebook. It's slow, it's error-prone, and when the shop is busy both hands are full. VoiceKhata replaces the notebook — you just speak." |
| **Live entry** | 60 s | Tap mic → say **"Sharma ji ne paanch sau ka saman liya"** → show ledger update → say **"Ramesh ne 200 diye"** → show balance drop → replay the spoken reply |
| **Query** | 30 s | Type or say **"Sharma ji kitna baaki hai"** → app reads balance aloud. "No typing, no searching, no math." |
| **WhatsApp reminder** | 30 s | Tap the green WhatsApp button on Sharma ji's row → show the pre-filled message in WhatsApp → "One tap and the reminder is sent." |
| **Judge turn** | 20 s | Hand the phone to a judge. Ask them to speak any customer name and an amount. Let it run live. |
| **Honesty note** | 20 s | "The WhatsApp message opens a prefilled chat — the shopkeeper still taps Send. Speech recognition runs in Chrome, so it works best on Android Chrome. Everything else — Gemini parsing, Supabase storage, fuzzy name matching, spoken replies — is real and live." |

---

## 10 Test Sentences

Run these in order after a demo reset. Each shows the transcript, the expected Gemini intent, and the expected ledger result.

| # | Speak / Type | Expected intent | Expected ledger result |
|---|---|---|---|
| 1 | `Sharma ji ne 500 ka saman liya` | `entries` — sale | Sharma ji balance **+500** (now 850) |
| 2 | `Ramesh ne 200 diye` | `entries` — payment | Ramesh balance **−200** (now 50) |
| 3 | `Gurpreet ne paanch sau liye` | `entries` — sale | Gurpreet balance **+500** (now 1100) |
| 4 | `Sharma ji kitna baaki hai` | `query` — customer balance | Speaks Sharma ji's current balance |
| 5 | `Sabka total kitna hai` | `query` — total dues | Speaks sum of all positive balances |
| 6 | `last wala hata do` | `undo` | Most recent transaction removed |
| 7 | `Sharma ne 100 liye` *(ambiguous — matches Sharma ji)* | `clarify` → options shown | Waits for confirmation, then applies |
| 8 | `Verma ji ne teen sau ka doodh liya` | `entries` — sale | Verma ji balance **+300** |
| 9 | `Sunita ne 150 diye` | `entries` — payment | Sunita Devi balance **−150** (goes negative if no prior balance — expected) |
| 10 | `Ramesh ne ek hazaar rupaye ka saman liya aur 400 diye` | `entries` — sale with partial payment | Ramesh balance **+600** |

> **If a sentence fails**: paste the raw transcript and the JSON response from `/api/process` here. Do **not** silently tweak the Gemini prompt — report first.

---

## Pre-Demo Checklist

- [ ] **Browser**: Chrome (not Safari, Firefox, or Edge) — Web Speech API works best in Chrome
- [ ] **Mic**: browser has mic permission — test with `/lang-test` page first
- [ ] **Volume**: device volume at max — spoken replies must be audible
- [ ] **Network**: hotspot ready as backup if venue Wi-Fi is unreliable
- [ ] **Reset demo data**: open `https://voice-khataa-aef9.vercel.app?admin=1`, tap **Reset Demo**, confirm
- [ ] **Deployed URL open**: `https://voice-khataa-aef9.vercel.app` on the demo device
- [ ] **Backup video**: 2-minute screen recording of the full flow saved to phone, in case live fails
- [ ] **Tab only**: close all other browser tabs — no distractions, faster network
- [ ] **Phone charged**: >80% battery, screen timeout set to Never (or 5 min)
- [ ] **Text backup**: typed fallback input works without mic — test it once before the demo

---

## Useful URLs

| URL | Purpose |
|---|---|
| `https://voice-khataa-aef9.vercel.app` | Main app (demo) |
| `https://voice-khataa-aef9.vercel.app?admin=1` | Shows Reset Demo button |
| `https://voice-khataa-aef9.vercel.app?debug=1` | Shows raw Gemini parse result |
| `https://voice-khataa-aef9.vercel.app/lang-test` | Test speech recognition per language |
| `https://voice-khataa-aef9.vercel.app/api/health` | Health check (Gemini + Supabase) |
