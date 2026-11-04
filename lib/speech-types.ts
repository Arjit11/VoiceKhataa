// ---------------------------------------------------------------------------
// Shared Web Speech API type definitions.
//
// The SpeechRecognition global is not reliably visible in the Next.js build
// worker, so we define a minimal self-contained interface and re-export it
// from here. Both hooks/useSpeechRecognition.ts and app/lang-test/page.tsx
// use these shapes (lang-test keeps its own inline copy for independence).
// ---------------------------------------------------------------------------

export interface SpeechRecognitionResultItem {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionResultItem;
}

export interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

export interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionCtor = new () => ISpeechRecognition;

export type RecogLang = "hi-IN" | "pa-IN" | "en-IN";

// Extend the Window interface once, globally.
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

/** Returns the SpeechRecognition constructor, or null if unsupported. */
export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}
