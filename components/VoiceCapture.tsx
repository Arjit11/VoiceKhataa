"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import type { RecogLang } from "@/lib/speech-types";
import type { Parsed } from "@/lib/schema";
import type { PendingState } from "@/lib/ledger";
import { speak, cancelSpeech } from "@/lib/speak";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGS: { code: RecogLang; label: string }[] = [
  { code: "hi-IN", label: "Hindi / Hinglish (hi-IN)" },
  { code: "pa-IN", label: "Punjabi (pa-IN)" },
  { code: "en-IN", label: "English India (en-IN)" },
];

function errorMessage(code: string | null, isSupported: boolean): string {
  if (!isSupported) return "🌐 Please use Chrome for voice input.";
  switch (code) {
    case "not-allowed":            return "🔒 Mic permission denied. Please allow mic access in your browser.";
    case "no-speech":              return "🤫 No speech detected. Tap again and speak clearly.";
    case "network":                return "📡 Network error. Check your connection and try again.";
    case "language-not-supported": return "⚠️ This language is not supported in your browser.";
    case null:                     return "";
    default:                       return `⚠️ Error: ${code}. Please try again.`;
  }
}

// ---------------------------------------------------------------------------
// Mic button
// ---------------------------------------------------------------------------

type MicStatus = "idle" | "listening" | "error";

function MicButton({ status, onClick, disabled }: {
  status: MicStatus; onClick: () => void; disabled: boolean;
}) {
  const base = "w-32 h-32 rounded-full flex items-center justify-center shadow-lg transition-colors duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2";
  const colours: Record<MicStatus, string> = {
    idle:      "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-400",
    listening: "bg-red-500 hover:bg-red-600 focus-visible:ring-red-400 animate-pulse",
    error:     "bg-orange-500 hover:bg-orange-600 focus-visible:ring-orange-400",
  };
  const label: Record<MicStatus, string> = {
    idle: "Start recording", listening: "Stop recording", error: "Try again",
  };
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label[status]}
      className={`${base} ${colours[status]} disabled:opacity-40 disabled:cursor-not-allowed`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"
        className="w-14 h-14" aria-hidden="true">
        {status === "listening" ? (
          <rect x="6" y="6" width="12" height="12" rx="2" />
        ) : (
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
// Spinner
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <div role="status" aria-label="Processing…"
      className="w-6 h-6 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
  );
}

// ---------------------------------------------------------------------------
// API response types (all paths now include reply)
// ---------------------------------------------------------------------------

type ProcessResponse =
  | { ok: true;  parsed: Parsed; results?: unknown;  reply: string }
  | { ok: true;  parsed: Parsed; clarify: { question: string; options: string[]; pending: PendingState }; reply: string }
  | { ok: true;  results: unknown; resolvedAs: string; reply: string }
  | { ok: true;  cancelled: true; reply: string }
  | { ok: false; error: string; code?: string; detail?: string; reply: string };

// ---------------------------------------------------------------------------
// VoiceCapture
// ---------------------------------------------------------------------------

export interface VoiceCaptureProps {
  onTranscript?: (text: string) => void;
}

type ProcessState = "idle" | "loading" | "done" | "error";

export default function VoiceCapture({ onTranscript }: VoiceCaptureProps) {
  const [lang, setLang] = useState<RecogLang>("hi-IN");
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [typedText, setTypedText] = useState("");

  // Suppress hydration mismatch: Speech API is unknown during SSR
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Phase 2: AI processing
  const [processState, setProcessState] = useState<ProcessState>("idle");
  const [parsedResult, setParsedResult] = useState<Parsed | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);

  // Phase 4: clarification
  const [clarifyQuestion, setClarifyQuestion] = useState<string | null>(null);
  const [clarifyOptions, setClarifyOptions] = useState<string[]>([]);
  const [pendingState, setPendingState] = useState<PendingState | null>(null);
  const clarifyMissCount = useRef(0);

  // Phase 5: spoken replies
  const [replyText, setReplyText] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  // Show undo button after a successful entries write
  const [canUndo, setCanUndo] = useState(false);
  const [undoLoading, setUndoLoading] = useState(false);

  // ------------------------------------------------------------------
  // Reset clarification state
  // ------------------------------------------------------------------
  const clearClarify = useCallback(() => {
    setClarifyQuestion(null);
    setClarifyOptions([]);
    setPendingState(null);
    clarifyMissCount.current = 0;
  }, []);

  // ------------------------------------------------------------------
  // Speak a reply (echo prevention: stop mic first)
  // ------------------------------------------------------------------
  // We need stop() from the hook, so we wire it up after the hook call below.
  // Use a ref so speakReply doesn't depend on stop directly.
  const stopRef = useRef<(() => void) | null>(null);

  const speakReply = useCallback(async (text: string) => {
    if (muted) return;
    // Stop mic before speaking so it doesn't hear itself
    stopRef.current?.();
    cancelSpeech();
    try {
      await speak(text);
    } catch {
      // Speech synthesis errors are non-fatal — ignore silently
    }
  }, [muted]);

  // ------------------------------------------------------------------
  // POST to /api/process (supports both normal and pending paths)
  // ------------------------------------------------------------------
  const sendToProcess = useCallback(
    async (text: string, pending?: PendingState) => {
      setProcessState("loading");
      if (!pending) {
        setParsedResult(null);
        setProcessError(null);
        setReplyText(null);
        setCanUndo(false);
      }

      try {
        const body: { transcript: string; pending?: PendingState } = { transcript: text };
        if (pending) body.pending = pending;

        const res = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as ProcessResponse;

        // Always surface the reply text
        const reply = data.reply ?? null;
        if (reply) setReplyText(reply);

        // Cancelled clarification
        if ("cancelled" in data && data.cancelled) {
          clearClarify();
          setProcessError("Could not identify the customer. Command cancelled.");
          setProcessState("error");
          if (reply) await speakReply(reply);
          return;
        }

        if (!data.ok) {
          const errData = data as { ok: false; error: string; detail?: string; reply: string };
          setProcessError(errData.detail ?? errData.error);
          setProcessState("error");
          if (reply) await speakReply(reply);
          return;
        }

        // Clarification needed
        if ("clarify" in data && data.clarify) {
          setClarifyQuestion(data.clarify.question);
          setClarifyOptions(data.clarify.options);
          setPendingState(data.clarify.pending);
          clarifyMissCount.current = 0;
          if ("parsed" in data) setParsedResult(data.parsed);
          setProcessState("done");
          // Speak the clarify question; mic stays idle — user taps to answer
          if (reply) await speakReply(reply);
          return;
        }

        // Resolved after clarification
        if ("resolvedAs" in data) {
          clearClarify();
          setProcessState("done");
          if (reply) await speakReply(reply);
          return;
        }

        // Normal success
        if ("parsed" in data) setParsedResult(data.parsed);
        // Show undo button only after a successful ledger write
        const wasEntry = "parsed" in data &&
          (data as { parsed: { intent: string } }).parsed?.intent === "entries" &&
          !("clarify" in data);
        setCanUndo(wasEntry);
        clearClarify();
        setProcessState("done");
        if (reply) await speakReply(reply);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error. Please try again.";
        setProcessError(msg);
        setProcessState("error");
        const fallback = "Kuch gadbad ho gayi. Dobara try kijiye.";
        setReplyText(fallback);
        await speakReply(fallback);
      }
    },
    [clearClarify, speakReply]
  );

  // ------------------------------------------------------------------
  // Transcript handler
  // ------------------------------------------------------------------
  const handleTranscript = useCallback(
    (text: string) => {
      console.log("[VoiceKhata] transcript:", text);
      setLastCommand(text);
      onTranscript?.(text);

      if (pendingState) {
        clarifyMissCount.current += 1;
        if (clarifyMissCount.current > 2) {
          clearClarify();
          const msg = "Clarification failed too many times. Command cancelled.";
          setProcessError(msg);
          setProcessState("error");
          speakReply("Theek hai, command cancel kar diya.");
          return;
        }
        sendToProcess(text, pendingState);
      } else {
        sendToProcess(text);
      }
    },
    [onTranscript, sendToProcess, pendingState, clearClarify, speakReply]
  );

  // ------------------------------------------------------------------
  // Undo last entry (Phase 6)
  // ------------------------------------------------------------------
  const handleUndo = useCallback(async () => {
    setUndoLoading(true);
    try {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: "last wala hata do" }),
      });
      const data = (await res.json()) as { reply?: string };
      const reply = data.reply ?? "Last entry hata di.";
      setReplyText(reply);
      setCanUndo(false);
      await speakReply(reply);
    } catch {
      const msg = "Kuch gadbad ho gayi. Dobara try kijiye.";
      setReplyText(msg);
      await speakReply(msg);
    } finally {
      setUndoLoading(false);
    }
  }, [speakReply]);

  // ------------------------------------------------------------------
  // Speech recognition
  // ------------------------------------------------------------------
  const { isSupported, status, errorCode, interimText, start, stop } =
    useSpeechRecognition({ lang, onTranscript: handleTranscript });

  // Keep stopRef current so speakReply can call stop() without stale closures
  useEffect(() => { stopRef.current = stop; }, [stop]);

  const toggleMic = () => {
    if (status === "listening") stop();
    else {
      cancelSpeech(); // stop any ongoing TTS before recording
      start();
    }
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
  // Transcript display
  // ------------------------------------------------------------------
  const displayText = interimText || lastCommand || "";
  const isInterim = Boolean(interimText);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <main className="min-h-screen flex flex-col items-center justify-between px-4 py-10 bg-white">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm gap-6">

        {/* Title */}
        <div className="text-center select-none">
          <p className="text-5xl font-bold text-gray-900 leading-tight">बोलिए</p>
          <p className="text-lg text-gray-500 mt-1">Tap and speak</p>
        </div>

        {/* Language selector */}
        <select value={lang} onChange={(e) => setLang(e.target.value as RecogLang)}
          disabled={status === "listening"} aria-label="Recognition language"
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base bg-white
                     focus:outline-none focus:ring-2 focus:ring-blue-400
                     disabled:opacity-50 disabled:cursor-not-allowed">
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>

        {/* Mic button */}
        <MicButton status={mounted ? (isSupported ? status : "error") : "idle"}
          onClick={toggleMic} disabled={mounted && !isSupported} />

        {/* Error / status messages */}
        {mounted && (!isSupported || status === "error") && (
          <p className="text-center text-base font-medium text-orange-600 max-w-xs">
            {errorMessage(errorCode, isSupported)}
          </p>
        )}
        {mounted && status === "listening" && !errorCode && (
          <p className="text-sm text-red-500 font-medium animate-pulse">🎙️ Listening…</p>
        )}

        {/* Transcript box */}
        <div aria-live="polite" aria-label="Transcript"
          className={`w-full min-h-20 rounded-2xl border px-4 py-3 text-base leading-relaxed
                      ${isInterim
                        ? "border-blue-300 bg-blue-50 text-blue-800 italic"
                        : "border-gray-200 bg-gray-50 text-gray-700"}`}>
          {displayText || <span className="text-gray-400">Your speech will appear here…</span>}
        </div>

        {/* ── Phase 5: Reply banner ──────────────────────────────── */}
        {replyText && (
          <div className="w-full rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4"
            aria-live="polite" aria-label="Spoken reply">
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-2">
              Reply
            </p>
            <p className="text-xl font-medium text-indigo-900 leading-snug mb-3">
              {replyText}
            </p>
            <div className="flex items-center gap-3">
              {/* Replay button */}
              <button
                onClick={() => speakReply(replyText)}
                aria-label="Replay spoken reply"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-100
                           hover:bg-indigo-200 text-indigo-700 text-sm font-medium transition-colors">
                🔁 Replay
              </button>
              {/* Mute toggle */}
              <button
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Unmute spoken replies" : "Mute spoken replies"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                            transition-colors ${muted
                              ? "bg-gray-100 hover:bg-gray-200 text-gray-500"
                              : "bg-indigo-100 hover:bg-indigo-200 text-indigo-700"}`}>
                {muted ? "🔇 Muted" : "🔊 Sound on"}
              </button>
              {/* Undo button — shown after a successful entries write */}
              {canUndo && (
                <button
                  onClick={handleUndo}
                  disabled={undoLoading}
                  aria-label="Undo last entry"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100
                             hover:bg-red-200 text-red-700 text-sm font-medium transition-colors
                             disabled:opacity-40 disabled:cursor-not-allowed">
                  {undoLoading ? "…" : "↩ Undo"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Phase 4: Clarification banner ─────────────────────── */}
        {clarifyQuestion && clarifyOptions.length > 0 && (
          <div className="w-full rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-4"
            role="alert" aria-live="assertive">
            <p className="text-sm font-semibold text-yellow-800 mb-3">
              🤔 {clarifyQuestion}
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {clarifyOptions.map((option) => (
                <button key={option}
                  onClick={() => {
                    if (!pendingState) return;
                    setLastCommand(option);
                    sendToProcess(option, pendingState);
                  }}
                  className="px-4 py-2 bg-yellow-200 hover:bg-yellow-300 text-yellow-900
                             font-medium rounded-xl text-sm transition-colors">
                  {option}
                </button>
              ))}
            </div>
            <p className="text-xs text-yellow-600">
              Tap a name above, or speak it. You can also{" "}
              <button onClick={clearClarify}
                className="underline font-medium hover:text-yellow-800">cancel</button>.
            </p>
          </div>
        )}

        {/* Typed fallback */}
        <div className="w-full">
          <div className="flex items-center gap-1 mb-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 px-2">or type</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="flex gap-2">
            <input ref={typedInputRef} type="text" value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingState ? "Type a customer name to clarify…" : "Type a command…"}
              aria-label="Type a command"
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-base
                         focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <button onClick={handleSend}
              disabled={!typedText.trim() || processState === "loading"}
              aria-label="Send typed command"
              className="px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold
                         hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
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
            <p className="text-base text-green-900 font-medium break-words">{lastCommand}</p>
          </div>
        )}

        {/* Processing indicator */}
        {processState === "loading" && (
          <div className="flex items-center gap-3 text-sm text-blue-600">
            <Spinner />
            <span>{pendingState ? "Resolving…" : "Processing with Gemini…"}</span>
          </div>
        )}

        {processState === "error" && processError && (
          <p className="text-sm text-orange-600 font-medium text-center">⚠️ {processError}</p>
        )}

        {/* Debug panel */}
        {processState === "done" && parsedResult && (
          <details className="w-full border border-gray-200 rounded-2xl overflow-hidden">
            <summary className="px-4 py-3 text-sm font-semibold text-gray-600 cursor-pointer hover:bg-gray-50 select-none">
              🔍 Debug: parsed result{" "}
              <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${
                parsedResult.intent === "entries"  ? "bg-green-100 text-green-700"  :
                parsedResult.intent === "query"    ? "bg-blue-100 text-blue-700"   :
                parsedResult.intent === "undo"     ? "bg-yellow-100 text-yellow-700" :
                                                     "bg-gray-100 text-gray-500"
              }`}>
                {parsedResult.intent}
              </span>
            </summary>
            <pre className="px-4 py-3 text-xs text-gray-700 bg-gray-50 overflow-x-auto leading-relaxed whitespace-pre-wrap">
              {JSON.stringify(parsedResult, null, 2)}
            </pre>
          </details>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-8 flex gap-6 text-sm text-gray-400">
        <Link href="/lang-test" className="hover:text-blue-600 transition-colors">Lang test</Link>
        <a href="/api/health" target="_blank" rel="noopener noreferrer"
          className="hover:text-blue-600 transition-colors">Health check</a>
      </footer>
    </main>
  );
}
