"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecogLang = "hi-IN" | "pa-IN" | "en-IN";

interface AttemptRow {
  id: number;
  lang: RecogLang;
  transcript: string;
  confidence: string;
  error: string;
}

// ---------------------------------------------------------------------------
// SpeechRecognition shim – browsers vendor-prefix this API.
// We define a minimal interface ourselves so we don't depend on the lib.dom
// SpeechRecognition global being visible during the Next.js build.
// ---------------------------------------------------------------------------

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: {
      readonly isFinal: boolean;
      readonly length: number;
      [index: number]: { readonly transcript: string; readonly confidence: number };
    };
  };
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => ISpeechRecognition;

// Window.SpeechRecognition / webkitSpeechRecognition are declared globally
// by lib/speech-types.ts — no need to redeclare here.

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGS: { code: RecogLang; label: string }[] = [
  { code: "hi-IN", label: "Hindi (hi-IN)" },
  { code: "pa-IN", label: "Punjabi (pa-IN)" },
  { code: "en-IN", label: "English India (en-IN)" },
];

const TEST_SENTENCES = [
  "Sharma ji ne 450 ka saaman liya, 200 abhi diye, baaki udhaar",
  "Gurpreet ne purana 300 clear kar diya",
  "Sabse zyada udhaar kiska hai",
];

const DEFAULT_SPEAK_TEXT =
  "Sharma ji ke 250 rupaye baaki hain. Gurpreet ka hisaab clear.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Badge({
  ok,
  label,
}: {
  ok: boolean | null;
  label: string;
}) {
  if (ok === null)
    return (
      <span className="text-sm text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
        {label}: checking…
      </span>
    );
  return (
    <span
      className={`text-sm font-semibold px-2 py-0.5 rounded-full ${
        ok
          ? "bg-green-100 text-green-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      {label}: {ok ? "yes ✓" : "no ✗"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function LangTestPage() {
  // -------- Section A state ------------------------------------------------
  const SR = getSpeechRecognition();
  const hasSR = SR !== null;

  const [recogLang, setRecogLang] = useState<RecogLang>("hi-IN");
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const attemptIdRef = useRef(0);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  // -------- Section B state ------------------------------------------------
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("");
  const [speakText, setSpeakText] = useState(DEFAULT_SPEAK_TEXT);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // -------- Section C state ------------------------------------------------
  const [verdict, setVerdict] = useState<{
    recognitionLang: string;
    replyVoice: string;
  } | null>(null);

  // --------  Load voices ---------------------------------------------------
  const loadVoices = useCallback(() => {
    const v = window.speechSynthesis.getVoices();
    if (v.length > 0) {
      setVoices(v);
      // Default: first hi-IN voice, else first voice
      const hiVoice = v.find((voice) => voice.lang.startsWith("hi"));
      setSelectedVoiceURI(hiVoice?.voiceURI ?? v[0]?.voiceURI ?? "");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [loadVoices]);

  // -------- Start / stop recognition ---------------------------------------
  const startListening = useCallback(() => {
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = recogLang;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let interimText = "";
      let finalText = "";
      let confidence = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText = result[0].transcript;
          confidence =
            result[0].confidence != null
              ? (result[0].confidence * 100).toFixed(0) + "%"
              : "n/a";
        } else {
          interimText += result[0].transcript;
        }
      }

      setInterim(interimText);

      if (finalText) {
        const id = ++attemptIdRef.current;
        setAttempts((prev) => [
          { id, lang: recogLang, transcript: finalText, confidence, error: "" },
          ...prev,
        ]);
        setInterim("");
      }
    };

    recognition.onerror = (event) => {
      const id = ++attemptIdRef.current;
      setAttempts((prev) => [
        {
          id,
          lang: recogLang,
          transcript: "",
          confidence: "",
          error: event.error,
        },
        ...prev,
      ]);
      setIsListening(false);
      setInterim("");
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterim("");
    };

    recognition.start();
    setIsListening(true);
  }, [SR, recogLang]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggleMic = () => {
    if (isListening) stopListening();
    else startListening();
  };

  // -------- Speech synthesis -----------------------------------------------
  const handleSpeak = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(speakText);
    const voice = voices.find((v) => v.voiceURI === selectedVoiceURI);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "hi-IN";
    utterance.rate = 0.9;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // -------- Build verdict --------------------------------------------------
  useEffect(() => {
    // Determine best recognition language from successful attempts
    const successCount: Record<string, number> = {};
    for (const a of attempts) {
      if (a.transcript && !a.error) {
        successCount[a.lang] = (successCount[a.lang] ?? 0) + 1;
      }
    }

    const bestLang =
      Object.entries(successCount).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      (attempts.length === 0 ? "not tested yet" : "none succeeded");

    // Best reply voice
    const hiVoice = voices.find((v) => v.lang.startsWith("hi"));
    const paVoice = voices.find((v) => v.lang.startsWith("pa"));
    const replyVoice = hiVoice
      ? `${hiVoice.name} (${hiVoice.lang})`
      : paVoice
      ? `${paVoice.name} (${paVoice.lang})`
      : voices[0]
      ? `${voices[0].name} (${voices[0].lang}) — no Indic voice found`
      : "no voices available";

    setVerdict({ recognitionLang: bestLang, replyVoice });
  }, [attempts, voices]);

  // -------- Voice grouping for display ------------------------------------
  const groupedVoices = voices.reduce<Record<string, SpeechSynthesisVoice[]>>(
    (acc, v) => {
      const lang = v.lang || "unknown";
      if (!acc[lang]) acc[lang] = [];
      acc[lang].push(v);
      return acc;
    },
    {}
  );

  const hasHindi = voices.some((v) => v.lang.startsWith("hi"));
  const hasPunjabi = voices.some((v) => v.lang.startsWith("pa"));

  // --------  Render -------------------------------------------------------
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
      {/* Page header */}
      <div>
        <Link href="/" className="text-blue-600 text-sm hover:underline">
          ← Home
        </Link>
        <h1 className="text-3xl font-bold mt-2">🧪 Language &amp; Voice Test</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Run this page in Chrome. Use it to verify speech recognition and
          synthesis work for Hindi, Punjabi, and English.
        </p>
      </div>

      {/* ================================================================
          SECTION A — Speech Recognition
          ================================================================ */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b pb-2">
          A · Speech Recognition
        </h2>

        {!hasSR && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-xl px-4 py-3 font-medium">
            ⚠️ SpeechRecognition is not supported in this browser.
            Please open this page in <strong>Chrome</strong>.
          </div>
        )}

        {hasSR && (
          <>
            {/* Language selector */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="font-medium text-sm w-28 shrink-0">
                Language
              </label>
              <select
                value={recogLang}
                onChange={(e) => setRecogLang(e.target.value as RecogLang)}
                disabled={isListening}
                className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Mic button */}
            <button
              onClick={toggleMic}
              className={`w-full py-4 rounded-2xl text-white text-xl font-bold transition ${
                isListening
                  ? "bg-red-500 hover:bg-red-600 animate-pulse"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isListening ? "🛑 Tap to Stop" : "🎙️ Tap to Start"}
            </button>

            {/* Live interim transcript */}
            {interim && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-blue-800 italic text-sm min-h-10">
                {interim}
              </div>
            )}

            {/* Test sentences */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Suggested test sentences (read aloud)
              </p>
              <div className="space-y-2">
                {TEST_SENTENCES.map((s) => (
                  <div
                    key={s}
                    className="bg-gray-50 border rounded-lg px-3 py-2 text-sm font-medium text-gray-700 cursor-pointer select-all hover:bg-gray-100"
                    title="Click to select"
                  >
                    {s}
                  </div>
                ))}
              </div>
            </div>

            {/* Results table */}
            {attempts.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Results
                </p>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-left text-xs text-gray-500 uppercase">
                      <th className="px-2 py-1 border">#</th>
                      <th className="px-2 py-1 border">Lang</th>
                      <th className="px-2 py-1 border">Transcript</th>
                      <th className="px-2 py-1 border">Confidence</th>
                      <th className="px-2 py-1 border">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((a) => (
                      <tr key={a.id} className="even:bg-gray-50">
                        <td className="px-2 py-1 border text-gray-400">
                          {a.id}
                        </td>
                        <td className="px-2 py-1 border font-mono text-xs">
                          {a.lang}
                        </td>
                        <td className="px-2 py-1 border">
                          {a.transcript || <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-2 py-1 border text-center">
                          {a.confidence || <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-2 py-1 border text-red-600 text-xs">
                          {a.error || <span className="text-gray-400">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {/* ================================================================
          SECTION B — Speech Synthesis
          ================================================================ */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b pb-2">
          B · Speech Synthesis
        </h2>

        {/* Voice availability badges */}
        <div className="flex flex-wrap gap-2">
          <Badge ok={voices.length === 0 ? null : hasHindi} label="Hindi voice" />
          <Badge
            ok={voices.length === 0 ? null : hasPunjabi}
            label="Punjabi voice"
          />
        </div>

        {/* Voice dropdown */}
        <div className="flex flex-wrap items-start gap-3">
          <label className="font-medium text-sm w-28 shrink-0 pt-2">
            Voice
          </label>
          <div className="flex-1 min-w-0">
            <select
              value={selectedVoiceURI}
              onChange={(e) => setSelectedVoiceURI(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {Object.entries(groupedVoices)
                .sort(([a], [b]) => {
                  // Sort Indic languages first
                  const isIndicA = /^(hi|pa|en-IN)/.test(a);
                  const isIndicB = /^(hi|pa|en-IN)/.test(b);
                  if (isIndicA && !isIndicB) return -1;
                  if (!isIndicA && isIndicB) return 1;
                  return a.localeCompare(b);
                })
                .map(([lang, langVoices]) => (
                  <optgroup
                    key={lang}
                    label={`${lang}${/^(hi|pa)/.test(lang) ? " ⭐" : ""}`}
                  >
                    {langVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name}
                        {v.localService ? " (local)" : " (remote)"}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
            {voices.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                No voices loaded yet. Try refreshing or waiting a moment.
              </p>
            )}
          </div>
        </div>

        {/* Text box */}
        <div>
          <label className="block font-medium text-sm mb-1">
            Text to speak
          </label>
          <textarea
            value={speakText}
            onChange={(e) => setSpeakText(e.target.value)}
            rows={3}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </div>

        {/* Speak button */}
        <button
          onClick={handleSpeak}
          disabled={!speakText || voices.length === 0}
          className="w-full py-3 rounded-2xl bg-purple-600 text-white font-bold text-lg hover:bg-purple-700 disabled:opacity-40 transition"
        >
          {isSpeaking ? "🔊 Speaking…" : "🔊 Speak"}
        </button>

        {/* All voices grouped */}
        <details className="border rounded-xl p-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray-600">
            All voices ({voices.length} total — click to expand)
          </summary>
          <div className="mt-3 space-y-3 text-xs">
            {Object.entries(groupedVoices)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([lang, langVoices]) => (
                <div key={lang}>
                  <p
                    className={`font-semibold mb-1 ${
                      /^(hi|pa|en-IN)/.test(lang)
                        ? "text-green-700"
                        : "text-gray-500"
                    }`}
                  >
                    {lang}
                    {/^(hi|pa)/.test(lang) ? " ⭐" : ""}
                  </p>
                  <ul className="space-y-0.5 ml-3">
                    {langVoices.map((v) => (
                      <li key={v.voiceURI} className="text-gray-700">
                        {v.name}{" "}
                        <span className="text-gray-400">
                          ({v.localService ? "local" : "remote"})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </details>
      </section>

      {/* ================================================================
          SECTION C — Verdict
          ================================================================ */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b pb-2">C · Verdict</h2>
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 space-y-2">
          <p className="text-sm text-amber-700 font-semibold uppercase tracking-wide">
            Based on this browser session:
          </p>
          <p className="text-base">
            <span className="font-semibold">Recommended recognition language:</span>{" "}
            <span className="text-blue-700 font-mono">
              {verdict?.recognitionLang ?? "—"}
            </span>
          </p>
          <p className="text-base">
            <span className="font-semibold">Reply voice:</span>{" "}
            <span className="text-purple-700">
              {verdict?.replyVoice ?? "—"}
            </span>
          </p>
          {attempts.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">
              👆 Try recording something in Section A first to get a recognition
              recommendation.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
