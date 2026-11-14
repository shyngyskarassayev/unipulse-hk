import {
  ApiError,
  GoogleGenAI,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from "@google/genai";
import { z } from "zod";

/** Thrown when an AI feature is used without GEMINI_API_KEY. */
export class AiDisabledError extends Error {
  constructor() {
    super("AI key not configured: set GEMINI_API_KEY to switch this feature on.");
    this.name = "AiDisabledError";
  }
}

/** Thrown when the model answered, but not with something we can use. */
export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiResponseError";
  }
}

let cached: GoogleGenAI | null = null;

export function getAi(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiDisabledError();
  // Without a limit a busy model can leave a request hanging for minutes.
  cached ??= new GoogleGenAI({ apiKey, httpOptions: { timeout: 90_000 } });
  return cached;
}

/**
 * Models to try, in order. The newest Gemini models are often overloaded, so
 * the default is one that answers reliably, with a second one behind it.
 */
const DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"];

export function aiModels(): string[] {
  const chosen = process.env.GEMINI_MODEL?.trim();
  return [...new Set([...(chosen ? [chosen] : []), ...DEFAULT_MODELS])];
}

/** The first-choice model, for display. */
export function aiModel(): string {
  return aiModels()[0];
}

/** Failures that say "this model cannot answer right now", not "the request is wrong". */
function isModelUnavailable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 429 || error.status >= 500);
}

/**
 * Sends one request, moving on to the next model when the current one is
 * overloaded, retired or out of quota. Every AI call in the app goes through
 * here.
 */
export async function generate(
  request: Omit<GenerateContentParameters, "model">,
): Promise<GenerateContentResponse> {
  const ai = getAi();
  let lastError: unknown;
  // Overload usually clears within seconds, so the whole list gets a second
  // pass after a short pause before giving up.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 4000));
    for (const model of aiModels()) {
      try {
        return await ai.models.generateContent({ ...request, model });
      } catch (error) {
        if (!isModelUnavailable(error)) throw error;
        lastError = error;
      }
    }
    // Waiting does not bring back a quota; only overload is worth a second pass.
    if (lastError instanceof ApiError && lastError.status === 429) break;
  }
  throw lastError;
}

/**
 * Checks that a response was not cut short or blocked before its text is
 * used. `what` names the task for the error message.
 */
export function assertUsable(response: GenerateContentResponse, what: string): void {
  if (response.promptFeedback?.blockReason) {
    throw new AiResponseError(`The model declined ${what} (${response.promptFeedback.blockReason}).`);
  }
  const reason = response.candidates?.[0]?.finishReason;
  if (reason === "MAX_TOKENS") {
    throw new AiResponseError(`The answer for ${what} was cut off before it finished.`);
  }
  if (reason === "SAFETY" || reason === "PROHIBITED_CONTENT" || reason === "BLOCKLIST") {
    throw new AiResponseError(`The model declined ${what}.`);
  }
}

/**
 * Asks for an answer in a fixed JSON shape and validates it. The schema is
 * sent to the model, and the reply is checked against the same schema again
 * here, so callers get typed data or an error, never a half-right object.
 */
export async function generateJson<Schema extends z.ZodType>(options: {
  schema: Schema;
  system: string;
  user: string;
  what: string;
  maxOutputTokens?: number;
}): Promise<z.infer<Schema>> {
  const response = await generate({
    contents: options.user,
    config: {
      systemInstruction: options.system,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(options.schema),
      maxOutputTokens: options.maxOutputTokens ?? 16000,
    },
  });
  assertUsable(response, options.what);

  const text = response.text;
  if (!text) throw new AiResponseError(`The model returned nothing for ${options.what}.`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiResponseError(`The model's answer for ${options.what} was not valid JSON.`);
  }
  const result = options.schema.safeParse(parsed);
  if (!result.success) {
    throw new AiResponseError(`The model's answer for ${options.what} did not match the expected format.`);
  }
  return result.data;
}

/** Turns any failure of an AI call into one sentence that is safe to show. */
export function describeAiError(error: unknown): string {
  if (error instanceof AiDisabledError || error instanceof AiResponseError) {
    return error.message;
  }
  if (error instanceof ApiError) {
    if (error.status === 400 && /api key/i.test(error.message)) {
      return "The Gemini API key was rejected. Check GEMINI_API_KEY.";
    }
    if (error.status === 401 || error.status === 403) {
      return "The Gemini API key was rejected or is not allowed to use this model.";
    }
    if (error.status === 404) {
      return "The selected Gemini model was not found. Check GEMINI_MODEL.";
    }
    if (error.status === 429) {
      return "The AI quota is used up for now. Try again in a minute.";
    }
    if (error.status >= 500) {
      return "The AI service is busy right now. Try again in a moment.";
    }
    return `AI request failed (${error.status}).`;
  }
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return "Could not reach the AI service. Check the network connection.";
  }
  return error instanceof Error ? error.message : "Unknown error";
}
