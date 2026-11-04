/**
 * lib/speak.ts — CLIENT SIDE ONLY
 *
 * speak(text) uses the Web Speech Synthesis API to speak text in Hindi.
 * Includes workarounds for Chrome's known TTS bugs:
 *   1. speechSynthesis stalls if cancel() is called immediately before speak()
 *   2. voices list is empty on first call — must wait for voiceschanged
 *   3. Chrome pauses utterances if the tab loses focus — resume() loop fix
 */

let cachedVoice: SpeechSynthesisVoice | null = null;
let voicesFetched = false;

/** Pick the best Hindi voice from the available list. */
function pickBestVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // Priority: exact hi-IN → any hi-* → en-IN → first available
  return (
    voices.find((v) => v.lang === "hi-IN") ??
    voices.find((v) => v.lang.startsWith("hi")) ??
    voices.find((v) => v.lang === "en-IN") ??
    voices[0] ??
    null
  );
}

/** Wait for voices to load (resolves immediately if already loaded). */
function waitForVoices(): Promise<void> {
  return new Promise((resolve) => {
    if (speechSynthesis.getVoices().length > 0) { resolve(); return; }
    const handler = () => {
      speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve();
    };
    speechSynthesis.addEventListener("voiceschanged", handler);
    // Safety: some browsers never fire voiceschanged
    setTimeout(resolve, 2500);
  });
}

/**
 * Speak `text` using the Web Speech Synthesis API.
 *
 * Returns a Promise that resolves when speech ends.
 * Never rejects — errors are swallowed so a failed TTS doesn't break the UI.
 */
export async function speak(text: string): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  // ── Cancel safely ─────────────────────────────────────────────────────
  // Chrome bug: calling speak() immediately after cancel() can stall.
  // Fix: cancel, yield one tick, then speak.
  speechSynthesis.cancel();
  await new Promise<void>((r) => setTimeout(r, 50));

  // ── Load voices once ──────────────────────────────────────────────────
  if (!voicesFetched) {
    await waitForVoices();
    voicesFetched = true;
  }

  if (!cachedVoice) {
    cachedVoice = pickBestVoice();
  }

  return new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);

    if (cachedVoice) {
      utterance.voice = cachedVoice;
      utterance.lang  = cachedVoice.lang;
    } else {
      utterance.lang = "hi-IN";
    }

    utterance.rate   = 0.92;  // slightly slower — clearer for Hindi
    utterance.pitch  = 1.0;
    utterance.volume = 1.0;

    utterance.onend   = () => resolve();
    utterance.onerror = (e) => {
      // "interrupted" fires when cancel() is called — not a real error
      if (e.error !== "interrupted") {
        console.warn("[speak] TTS error:", e.error);
      }
      resolve(); // always resolve so callers don't hang
    };

    // ── Chrome stall workaround ──────────────────────────────────────────
    // Chrome pauses synthesis when the tab loses focus or after ~15s.
    // Fix: poll every 2s and call resume() if paused.
    let stallGuard: ReturnType<typeof setInterval> | null = null;

    utterance.onstart = () => {
      stallGuard = setInterval(() => {
        if (speechSynthesis.paused) speechSynthesis.resume();
        // If synthesis is no longer speaking and we haven't resolved yet,
        // the utterance was dropped silently — resolve to unblock.
        if (!speechSynthesis.speaking) {
          if (stallGuard) clearInterval(stallGuard);
          resolve();
        }
      }, 2000);
    };

    const cleanup = () => {
      if (stallGuard) { clearInterval(stallGuard); stallGuard = null; }
    };

    const origOnEnd   = utterance.onend;
    const origOnError = utterance.onerror;
    utterance.onend   = (e) => { cleanup(); (origOnEnd as ((e: SpeechSynthesisEvent) => void))?.(e); };
    utterance.onerror = (e) => { cleanup(); (origOnError as ((e: SpeechSynthesisErrorEvent) => void))?.(e); };

    speechSynthesis.speak(utterance);

    // ── Safety timeout ───────────────────────────────────────────────────
    // If TTS hasn't started within 3s or hangs, resolve anyway.
    setTimeout(() => {
      if (!speechSynthesis.speaking) {
        cleanup();
        resolve();
      }
    }, 3000);
  });
}

/** Cancel any in-progress speech immediately. */
export function cancelSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    speechSynthesis.cancel();
  }
}
