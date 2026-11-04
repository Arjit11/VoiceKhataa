"use client";

import { useCallback, useRef, useState } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import type { RecogLang } from "@/lib/speech-types";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGS: { code: RecogLang; label: string }[] = [
  { code: "hi-IN", label: "Hindi / Hinglish (hi-IN)" },
  { code: "pa-IN", label: "Punjabi (pa-IN)" },
  { code: "en-IN", label: "English India (en-IN)" },
];

/** Human-friendly messages for every error code the browser can emit. */
function errorMessage(code: string | null, isSupported: boolean): string {
  if (!isSupported) return "🌐 Please use Chrome for voice input.";
  switch (code) {
    case "not-allowed":
      return "🔒 Mic permission denied. Please allow mic access in your browser.";
    case "no-speech":
      return "🤫 No speech detected. Tap again and speak clearly.";
    case "network":
      return "📡 Network error. Check your connection and try again.";
    case "language-not-supported":
      return "⚠️ This language is not supported in your browser.";
    case null:
      return "";
    default:
      return `⚠️ Error: ${code}. Please try again.`;
  }
}

// ---------------------------------------------------------------------------
// Mic button
// ---------------------------------------------------------------------------

type MicStatus = "idle" | "listening" | "error";

function MicButton({
  status,
  onClick,
  disabled,
}: {
  status: MicStatus;
  onClick: () => void;
  disabled: boolean;
}) {
  const base =
    "w-32 h-32 rounded-full flex items-center justify-center shadow-lg transition-colors duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2";

  const colours: Record<MicStatus, string> = {
    idle: "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-400",
    listening: "bg-red-500 hover:bg-red-600 focus-visible:ring-red-400 animate-pulse",
    error: "bg-orange-500 hover:bg-orange-600 focus-visible:ring-orange-400",
  };

  const label: Record<MicStatus, string> = {
    idle: "Start recording",
    listening: "Stop recording",
    error: "Try again",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label[status]}
      className={`${base} ${colours[status]} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {/* Mic SVG icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="white"
        className="w-14 h-14"
        aria-hidden="true"
      >
        {status === "listening" ? (
          /* square = stop */
          <rect x="6" y="6" width="12" height="12" rx="2" />
        ) : (
          /* mic */
          <>
            <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
            <path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V20H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 11z" />
          </>
        )}
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// VoiceCapture
// ---------------------------------------------------------------------------

/**
 * Props:
 *   onTranscript – called with every final transcript, from mic or typed input.
 *                  Defaults to console.log + local "Last command" state.
 *                  Phase 2 will pass its own handler (e.g. POST to /api/process).
 */
export interface VoiceCaptureProps {
  onTranscript?: (text: string) => void;
}

export default function VoiceCapture({ onTranscript }: VoiceCaptureProps) {
  const [lang, setLang] = useState<RecogLang>("hi-IN");
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [typedText, setTypedText] = useState("");

  // ------------------------------------------------------------------
  // onTranscript handler (Phase 2 hook point)
  // ------------------------------------------------------------------
  const handleTranscript = useCallback(
    (text: string) => {
      console.log("[VoiceKhata] transcript:", text);
      setLastCommand(text);
      onTranscript?.(text);
    },
    [onTranscript]
  );

  // ------------------------------------------------------------------
  // Speech recognition
  // ------------------------------------------------------------------
  const { isSupported, status, errorCode, interimText, start, stop } =
    useSpeechRecognition({ lang, onTranscript: handleTranscript });

  const toggleMic = () => {
    if (status === "listening") stop();
    else start();
  };

  // ------------------------------------------------------------------
  // Typed fallback
  // ------------------------------------------------------------------
  const typedInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const text = typedText.trim();
    if (!text) return;
    handleTranscript(text);
    setTypedText("");
    typedInputRef.current?.focus();
  }, [typedText, handleTranscript]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSend();
  };

  // ------------------------------------------------------------------
  // Transcript display: show interim while listening, else last command
  // ------------------------------------------------------------------
  const displayText = interimText || lastCommand || "";
  const isInterim = Boolean(interimText);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <main className="min-h-screen flex flex-col items-center justify-between px-4 py-10 bg-white">
      {/* ── Top section ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm gap-6">

        {/* Title */}
        <div className="text-center select-none">
          <p className="text-5xl font-bold text-gray-900 leading-tight">बोलिए</p>
          <p className="text-lg text-gray-500 mt-1">Tap and speak</p>
        </div>

        {/* Language selector */}
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as RecogLang)}
          disabled={status === "listening"}
          aria-label="Recognition language"
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base bg-white
                     focus:outline-none focus:ring-2 focus:ring-blue-400
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>

        {/* Mic button */}
        <MicButton
          status={isSupported ? status : "error"}
          onClick={toggleMic}
          disabled={!isSupported}
        />

        {/* Error / status message */}
        {(!isSupported || status === "error") && (
          <p className="text-center text-base font-medium text-orange-600 max-w-xs">
            {errorMessage(errorCode, isSupported)}
          </p>
        )}

        {status === "listening" && !errorCode && (
          <p className="text-sm text-red-500 font-medium animate-pulse">
            🎙️ Listening…
          </p>
        )}

        {/* Transcript box */}
        <div
          aria-live="polite"
          aria-label="Transcript"
          className={`w-full min-h-20 rounded-2xl border px-4 py-3 text-base leading-relaxed
                      ${
                        isInterim
                          ? "border-blue-300 bg-blue-50 text-blue-800 italic"
                          : "border-gray-200 bg-gray-50 text-gray-700"
                      }`}
        >
          {displayText || (
            <span className="text-gray-400">Your speech will appear here…</span>
          )}
        </div>

        {/* ── Typed fallback ───────────────────────────────────── */}
        <div className="w-full">
          <div className="flex items-center gap-1 mb-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 px-2">or type</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="flex gap-2">
            <input
              ref={typedInputRef}
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command…"
              aria-label="Type a command"
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-base
                         focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={handleSend}
              disabled={!typedText.trim()}
              aria-label="Send typed command"
              className="px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold
                         hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-colors"
            >
              Send
            </button>
          </div>
        </div>

        {/* Last command box */}
        {lastCommand && (
          <div className="w-full rounded-2xl border border-green-300 bg-green-50 px-4 py-3">
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">
              Last command
            </p>
            <p className="text-base text-green-900 font-medium break-words">
              {lastCommand}
            </p>
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="mt-8 flex gap-6 text-sm text-gray-400">
        <Link href="/lang-test" className="hover:text-blue-600 transition-colors">
          Lang test
        </Link>
        <a
          href="/api/health"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-600 transition-colors"
        >
          Health check
        </a>
      </footer>
    </main>
  );
}
