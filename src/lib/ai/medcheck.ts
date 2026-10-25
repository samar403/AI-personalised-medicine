import "server-only";
import { z } from "zod";
import type { Finding, Snapshot } from "@/lib/clinical/findings";
import { AI_MODEL, generateStructured } from "./client";
import { describeSnapshot } from "./context";
import { heuristicMedCheck } from "./heuristics";

export const MedCheckSchema = z.object({
  verdict: z.enum(["no_flags", "use_with_care", "discuss_before_starting"]).describe("Must be at least as cautious as the most serious rule-based finding for this drug"),
  plainLanguage: z.string().describe("Three or four sentences explaining what the person's data means for this medicine"),
  keyPoints: z.array(z.string()).describe("2-5 short bullet points"),
  questionsForClinician: z.array(z.string()).describe("2-4 questions to ask the prescriber or pharmacist"),
});

export type MedCheckExplanation = z.infer<typeof MedCheckSchema> & { model: string };

const SYSTEM = `You are Allele's medication checker. A person is considering a medicine and wants to know what their own genes, current medicines, allergies, labs and vitals mean for it.

- The rule-based findings for this drug are authoritative. Explain them; never soften or contradict them, and never propose a specific dose that they do not state.
- If there are no findings, say so, and mention the ordinary things a prescriber also checks (kidney and liver function, pregnancy, other conditions).
- Never tell the person to take, avoid, start or stop a medicine on their own. The decision belongs to them and their prescriber.
- Plain language, warm and precise.`;

const RANK = { urgent: 0, high: 1, moderate: 2, info: 3 } as const;

export async function explainMedication(drug: string, s: Snapshot, all: Finding[], forDrug: Finding[], useAI: boolean): Promise<MedCheckExplanation> {
  if (!useAI) return heuristicMedCheck(drug, forDrug);
  const result = await generateStructured({
    schema: MedCheckSchema,
    system: SYSTEM,
    prompt: `${describeSnapshot(s, all)}

<drug_under_consideration>${drug}</drug_under_consideration>
<findings_for_this_drug>
${forDrug.map((f) => `- [${f.priority}] ${f.title}: ${f.summary} Recommendation: ${f.recommendation} (${f.evidenceLevel})`).join("\n") || "None."}
</findings_for_this_drug>

Explain what this person's data means for ${drug}.`,
    effort: "medium",
    maxTokens: 8000,
  });
  // Guardrail: the verdict can never be less cautious than the rules.
  const worst = forDrug.reduce<number>((m, f) => Math.min(m, RANK[f.priority]), 3);
  const floor = forDrug.length === 0 ? null : worst <= 1 ? "discuss_before_starting" : "use_with_care";
  const verdict = floor === "discuss_before_starting" || (floor === "use_with_care" && result.verdict === "no_flags") ? floor : result.verdict;
  return { ...result, verdict, model: AI_MODEL };
}
