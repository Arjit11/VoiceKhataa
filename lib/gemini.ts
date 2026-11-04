import { GoogleGenAI } from "@google/genai";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

/**
 * Returns an initialised GoogleGenAI client.
 * This must NEVER be called from client components.
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = requireEnv("GEMINI_API_KEY");
  return new GoogleGenAI({ apiKey });
}

/**
 * The Gemini model to use for all requests.
 * Defaults to gemini-2.0-flash if GEMINI_MODEL is not set.
 */
export const GEMINI_MODEL =
  process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";
