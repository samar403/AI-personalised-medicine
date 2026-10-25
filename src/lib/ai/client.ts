import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/** Primary model for every AI feature. Override with ANTHROPIC_MODEL if needed. */
export const AI_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

let client: Anthropic | null = null;

export function isAIEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function anthropic() {
  client ??= new Anthropic();
  return client;
}

export class AIRefusalError extends Error {}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * One structured-output call: Claude returns JSON validated against `schema`.
 * Uses adaptive thinking, streaming (so long analyses never hit HTTP timeouts),
 * and server-side refusal fallbacks.
 */
export async function generateStructured<T extends z.ZodType>(opts: {
  schema: T;
  system: string;
  prompt: string;
  effort?: Effort;
  maxTokens?: number;
}): Promise<z.infer<T>> {
  const stream = anthropic().beta.messages.stream({
    model: AI_MODEL,
    max_tokens: opts.maxTokens ?? 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "high", format: betaZodOutputFormat(opts.schema) },
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new AIRefusalError("The model declined this request.");
  }
  if (message.stop_reason === "max_tokens" || message.parsed_output == null) {
    throw new Error(`Structured output incomplete (stop_reason: ${message.stop_reason})`);
  }
  return message.parsed_output as z.infer<T>;
}
