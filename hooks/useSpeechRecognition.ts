import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSpeechRecognitionCtor,
  type ISpeechRecognition,
  type RecogLang,
  type SpeechRecognitionEvent,
  type SpeechRecognitionErrorEvent,
} from "@/lib/speech-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecognitionStatus = "idle" | "listening" | "error";

export interface UseSpeechRecognitionReturn {
  /** False when the browser has no SpeechRecognition API (show a friendly message). */
  isSupported: boolean;
  status: RecognitionStatus;
  /** The error code from the last onerror event (e.g. "not-allowed", "no-speech"). */
  errorCode: string | null;
  /** Live partial text while the user is speaking. */
  interimText: string;
  start: () => void;
  stop: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useSpeechRecognition
 *
 * Encapsulates all Web Speech API state and logic.
 * Calls onTranscript(text) with the final recognised string.
 *
 * Phase 2 hook point: replace the onTranscript prop to route the text to
 * /api/process instead of (or in addition to) the local handler.
 */
export function useSpeechRecognition({
  lang,
  onTranscript,
}: {
  lang: RecogLang;
  onTranscript: (text: string) => void;
}): UseSpeechRecognitionReturn {
  const Ctor = getSpeechRecognitionCtor();
  const isSupported = Ctor !== null;

  const [status, setStatus] = useState<RecognitionStatus>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [interimText, setInterimText] = useState("");

  // Stable refs so event handlers don't go stale
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const startingRef = useRef(false); // guard against double-taps while starting
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // Stop & clean up on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    startingRef.current = false;
    // status will flip to "idle" via the onend callback
  }, []);

  const start = useCallback(() => {
    if (!Ctor) return;
    if (startingRef.current || status === "listening") return; // guard double-tap
    startingRef.current = true;

    // Abort any previous instance
    recognitionRef.current?.abort();

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      startingRef.current = false;
      setStatus("listening");
      setErrorCode(null);
      setInterimText("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const finalText = result[0].transcript.trim();
          if (finalText) {
            onTranscriptRef.current(finalText);
            setInterimText("");
          }
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) setInterimText(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      startingRef.current = false;
      setStatus("error");
      setErrorCode(event.error);
      setInterimText("");
    };

    recognition.onend = () => {
      startingRef.current = false;
      // Only reset to idle if we didn't already land in error
      setStatus((prev) => (prev === "listening" ? "idle" : prev));
      setInterimText("");
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      // start() throws if called in a bad state
      startingRef.current = false;
      setStatus("idle");
    }
  }, [Ctor, lang, status]);

  return { isSupported, status, errorCode, interimText, start, stop };
}
