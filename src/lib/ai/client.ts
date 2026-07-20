import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null | undefined;

/** Returns null when no API key is configured, so callers can fall back to demo mode instead of crashing. */
export function getAiClient(): GoogleGenAI | null {
  if (client !== undefined) return client;

  const apiKey = process.env.GEMINI_API_KEY;
  client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  return client;
}

// "gemini-flash-latest" is a Google-maintained alias that always points at
// their current recommended flash model, so this stays valid as specific
// model versions are deprecated. Override with GEMINI_MODEL if you want to
// pin a specific version.
export const AI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
