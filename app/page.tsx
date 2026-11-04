"use client";

import { Suspense } from "react";
import VoiceCapture from "@/components/VoiceCapture";
import Ledger from "@/components/Ledger";

/**
 * Home page — VoiceCapture on top, live Ledger below.
 * VoiceCapture uses useSearchParams() so it must be wrapped in <Suspense>.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Voice input section */}
      <Suspense fallback={null}>
        <VoiceCapture />
      </Suspense>

      {/* Ledger section */}
      <section className="max-w-sm mx-auto px-4 pb-16">
        {/* Section label */}
        <div className="mb-4 text-center select-none">
          <p className="text-2xl font-bold text-gray-800">उधार</p>
          <p className="text-sm text-gray-400">Udhaar / Credit Ledger</p>
        </div>
        <Ledger />
      </section>
    </div>
  );
}
