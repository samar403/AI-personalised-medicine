import "server-only";
import { z } from "zod";
import type { Finding, Snapshot } from "@/lib/clinical/findings";
import { AI_MODEL, generateStructured } from "./client";
import { describeSnapshot } from "./context";
import { heuristicBrief } from "./heuristics";

export const BriefNarrativeSchema = z.object({
  summary: z.string().describe("A 2-3 sentence clinical summary written for a physician: age, sex, key conditions, key pharmacogenomic results, main concerns"),
  discussionPoints: z.array(z.string()).describe("3-6 concise, prioritised points for the appointment, each with the supporting data"),
});

export type BriefNarrative = z.infer<typeof BriefNarrativeSchema> & { model: string };

const SYSTEM = `You write a one-page pre-visit brief that a patient hands to their physician or pharmacist. Write in concise clinical language, lead with what needs a decision, cite values and genotypes, and reflect the rule-based findings faithfully. Do not invent data or recommend doses beyond the findings. Note that consumer-array genotypes need clinical confirmation.`;

export async function writeBriefNarrative(s: Snapshot, findings: Finding[], useAI: boolean): Promise<BriefNarrative> {
  if (!useAI) return heuristicBrief(s, findings);
  const result = await generateStructured({
    schema: BriefNarrativeSchema,
    system: SYSTEM,
    prompt: `${describeSnapshot(s, findings)}\n\nWrite the pre-visit brief narrative.`,
    effort: "medium",
    maxTokens: 8000,
  });
  return { ...result, model: AI_MODEL };
}
