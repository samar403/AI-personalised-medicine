import { z } from "zod";
import { HttpError, parseBody, withAuth } from "@/lib/api";
import { streamAssistant } from "@/lib/ai/assistant";
import { heuristicAnswer } from "@/lib/ai/heuristics";
import { describeSnapshot } from "@/lib/ai/context";
import { runFindings } from "@/lib/clinical/findings";
import { recordAudit } from "@/lib/audit";
import { detectRedFlag, emergencyReply } from "@/lib/safety";
import { aiAllowed } from "@/lib/services/ai";
import { getVault, loadSnapshot } from "@/lib/services/snapshot";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 300;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40)
    .refine((m) => m[m.length - 1].role === "user", "Last message must be from the user."),
});

const textResponse = (text: string) => new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** Streams plain text chunks of Claude's answer, or returns an offline rules-engine answer. Red-flag messages get a fixed safety reply without calling the model. */
export const POST = withAuth("caregiver", async ({ req, user }) => {
  const { messages } = await parseBody(req, Body);
  const flag = detectRedFlag(messages[messages.length - 1].content);
  if (flag) {
    await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "assistant.red_flag", entityType: "assistant", details: { topic: flag } });
    return textResponse(emergencyReply(flag));
  }
  if (!rateLimit(`assistant:${user.id}:${clientKey(req)}`, 30, 60 * 60_000)) throw new HttpError(429, "Hourly assistant limit reached.");
  const vault = await getVault(user.vaultId);
  const snapshot = await loadSnapshot(user.vaultId);
  const findings = runFindings(snapshot);
  // Without a key or without AI consent, answer from the rules engine; nothing leaves the server.
  if (!aiAllowed(vault)) return textResponse(heuristicAnswer(messages[messages.length - 1].content, snapshot, findings));

  const stream = streamAssistant(describeSnapshot(snapshot, findings), messages);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      stream.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
      try {
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(encoder.encode("\n\n_The model declined to answer this request. Please ask your clinician._"));
      } catch (err) {
        console.error(err);
        controller.enqueue(encoder.encode("\n\n_Something went wrong while answering. Please try again._"));
      }
      controller.close();
    },
    cancel() {
      stream.abort();
    },
  });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
});
