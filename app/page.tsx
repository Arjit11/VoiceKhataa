import VoiceCapture from "@/components/VoiceCapture";

/**
 * Home page — thin Server Component wrapper around the VoiceCapture screen.
 *
 * Phase 2: pass an onTranscript prop here to route the final transcript
 * to /api/process (will need to convert this to a client component or lift
 * the handler into VoiceCapture itself).
 */
export default function HomePage() {
  return <VoiceCapture />;
}
