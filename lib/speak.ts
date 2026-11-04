/**
 * lib/speak.ts — CLIENT SIDE ONLY
 *
 * speak(text) uses the Web Speech Synthesis API to speak text in Hindi.
 * - Prefers a voice whose lang starts with "hi".
 * - Cancels any ongoing speech before starting.
 * - Returns a Promise that resolves when speech ends, rejects on error.
 */

// Module-level voice cache (reset if voices reload)
let cachedVoice: SpeechSynthesisVoice | null = null;
let voicesFetched = false;

/** Pick the best Hindi voice from the available list. */
function pickHindiVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // Prefer exact hi-IN, then any hi-*, then fall back to default
  const hiIN  = voices.find((v) => v.lang === "hi-IN");
  const hiAny = voices.find((v) => v.lang.startsWith("hi"));
  return hiIN ?? hiAny ?? null;
}

/** Wait for voices to load (fires immediately if already loaded). */
function waitForVoices(): Promise<void> {
  return new Promise((resolve) => {
    if (speechSynthesis.getVoices().length > 0) {
      resolve();
      return;
    }
    const handler = () => {
      speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve();
    };
    speechSynthesis.addEventListener("voiceschanged", handler);
    // Safety timeout: some browsers never fire voiceschanged
    setTimeout(resolve, 2000);
  });
}

/**
 * Speak `text` using speech synthesis.
 * Stops any ongoing speech first.
 * Returns a Promise that resolves when the utterance ends.
 */
export async function speak(text: string): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return; // SSR or unsupported browser — silent fail
  }

  // Cancel any ongoing speech immediately
  speechSynthesis.cancel();

  // Load voices once
  if (!voicesFetched) {
    await waitForVoices();
    voicesFetched = true;
  }

  // Always re-pick — voices list can change after the first load
  if (!cachedVoice) {
    cachedVoice = pickHindiVoice();
  }

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);

    if (cachedVoice) {
      utterance.voice = cachedVoice;
      utterance.lang  = cachedVoice.lang;
    } else {
      utterance.lang = "hi-IN"; // hint even without a matched voice
    }

    utterance.rate   = 0.95; // slightly slower for clarity
    utterance.pitch  = 1.0;
    utterance.volume = 1.0;

    utterance.onend   = () => resolve();
    utterance.onerror = (e) => {
      // "interrupted" fires when cancel() is called — not a real error
      if (e.error === "interrupted") resolve();
      else reject(new Error(`Speech error: ${e.error}`));
    };

    speechSynthesis.speak(utterance);
  });
}

/** Cancel any in-progress speech immediately. */
export function cancelSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    speechSynthesis.cancel();
  }
}
