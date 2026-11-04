"use client";

import VoiceCapture from "@/components/VoiceCapture";
import Ledger from "@/components/Ledger";

/**
 * Home page — VoiceCapture on top, live Ledger below.
 * Both are client components so this wrapper must be "use client" too.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Voice input section */}
      <VoiceCapture />

      {/* Ledger section */}
      <section className="max-w-sm mx-auto px-4 pb-16">
        <Ledger />
      </section>
    </div>
  );
}
