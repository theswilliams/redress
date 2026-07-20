import type { Part } from "@google/genai";
import type { z } from "zod";
import { getAiClient, AI_MODEL } from "@/lib/ai/client";

/**
 * Calls Gemini with a JSON schema constraint so the response is guaranteed
 * structured JSON (no prose to parse out), then validates it against the
 * given zod schema. Throws if no API key is configured — callers should
 * catch and fall back to demo mode via `isAiConfigured()`.
 */
export async function callStructuredAgent<T>({
  system,
  content,
  inputSchema,
  zodSchema,
}: {
  system: string;
  content: Part[];
  inputSchema: Record<string, unknown>;
  zodSchema: z.ZodType<T>;
}): Promise<T> {
  const client = getAiClient();
  if (!client) {
    throw new Error("AI_NOT_CONFIGURED");
  }

  const response = await client.models.generateContent({
    model: AI_MODEL,
    contents: [{ role: "user", parts: content }],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: inputSchema,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("AI_NO_RESPONSE");
  }

  return zodSchema.parse(JSON.parse(text));
}

export function isAiConfigured(): boolean {
  return getAiClient() !== null;
}
