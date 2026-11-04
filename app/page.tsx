"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import VoiceCapture from "@/components/VoiceCapture";
import Ledger from "@/components/Ledger";

/**
 * Home page — VoiceCapture on top, live Ledger below.
 * VoiceCapture uses useSearchParams() so it must be wrapped in <Suspense>.
 * AdminPanel also uses useSearchParams() so it is wrapped in its own <Suspense>.
 */

// ---------------------------------------------------------------------------
// Admin panel — Reset Demo button, shown only with ?admin=1
// ---------------------------------------------------------------------------

function AdminPanelInner() {
  const searchParams = useSearchParams();
  const isAdmin = searchParams.get("admin") === "1";
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleReset = useCallback(async () => {
    if (!window.confirm("Reset all demo data? This will delete all transactions and customers and restore the seed data.")) return;
    setStatus("loading");
    setMessage("");
    try {
      const token = window.prompt("Enter the demo reset token:");
      if (!token) { setStatus("idle"); return; }
      const res = await fetch("/api/demo/reset", {
        method: "POST",
        headers: { "x-demo-token": token },
      });
      const data = await res.json() as { ok: boolean; message?: string; error?: string };
      if (data.ok) {
        setStatus("done");
        setMessage(data.message ?? "Reset successful.");
      } else {
        setStatus("error");
        setMessage(data.error ?? "Reset failed.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Could not reach /api/demo/reset.");
    }
  }, []);

  if (!isAdmin) return null;

  return (
    <div className="max-w-sm mx-auto px-4 mb-6">
      <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 flex flex-col gap-3">
        <p className="text-xs font-bold text-orange-600 uppercase tracking-wide">🛠 Admin — Demo Tools</p>
        <button
          onClick={handleReset}
          disabled={status === "loading"}
          className="w-full px-4 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white
                     font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "loading" ? "Resetting…" : "🔄 Reset Demo Data"}
        </button>
        {status === "done" && (
          <p className="text-sm text-green-700 font-medium">✅ {message}</p>
        )}
        {status === "error" && (
          <p className="text-sm text-red-600 font-medium">⚠️ {message}</p>
        )}
        <p className="text-xs text-orange-500">
          Deletes all transactions &amp; customers, then restores seed data.
          Only visible with <code className="bg-orange-100 px-1 rounded">?admin=1</code>.
        </p>
      </div>
    </div>
  );
}

function AdminPanel() {
  return (
    <Suspense fallback={null}>
      <AdminPanelInner />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Voice input section */}
      <Suspense fallback={null}>
        <VoiceCapture />
      </Suspense>

      {/* Admin panel — only with ?admin=1 */}
      <AdminPanel />

      {/* Ledger section */}
      <section className="max-w-sm mx-auto px-4 pb-8">
        {/* Section label */}
        <div className="mb-4 text-center select-none">
          <p className="text-2xl font-bold text-gray-800">उधार</p>
          <p className="text-sm text-gray-400">Udhaar / Credit Ledger</p>
        </div>
        <Ledger />
      </section>

      {/* About footer */}
      <footer className="max-w-sm mx-auto px-4 pb-10 text-center">
        <p className="text-xs text-gray-400 leading-relaxed">
          Voice Khata · Built solo during the Voice AI Hackathon
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Next.js · Gemini AI · Supabase · Web Speech API · Tailwind CSS
        </p>
      </footer>
    </div>
  );
}
