import "server-only";
import { z } from "zod";
import type { Finding, Snapshot } from "@/lib/clinical/findings";
import { AI_MODEL, generateStructured } from "./client";
import { describeSnapshot } from "./context";
import { heuristicPlan } from "./heuristics";

const Category = z.enum(["medication", "genetics", "heart", "metabolic", "kidney", "sleep", "activity", "nutrition", "mental_health", "screening", "monitoring", "other"]);

export const CarePlanSchema = z.object({
  headline: z.string().describe("One sentence, at most 16 words, naming the single most important thing for this person right now"),
  overview: z.string().describe("Three or four plain-English sentences tying genes, medications, labs and wearable trends together"),
  priorities: z
    .array(
      z.object({
        title: z.string().describe("Short, specific, starts with the thing to act on"),
        category: Category,
        priority: z.enum(["urgent", "high", "moderate", "info"]),
        summary: z.string().describe("What is going on, in plain language, citing the person's own numbers"),
        recommendation: z.string().describe("What to discuss or do next. Never instruct stopping or changing a medicine without the prescriber"),
        rationale: z.string().describe("Why this matters for this person specifically, linking the data sources"),
        evidence: z.array(z.string()).describe("The data points this relies on, e.g. 'CYP2C19 *1/*2', 'LDL 142 mg/dL (2026-08-02)'"),
        questionsForClinician: z.array(z.string()).describe("1-3 questions the person can take to their appointment"),
        basedOnFindings: z.array(z.string()).describe("The rule codes of the rule-based findings this priority covers; empty if none"),
      }),
    )
    .describe("3-7 priorities, most important first"),
  lifestyle: z.array(z.object({ area: z.string(), action: z.string().describe("Concrete and achievable this week"), why: z.string() })).describe("2-5 personalised lifestyle actions"),
  monitoring: z.array(z.object({ what: z.string(), frequency: z.string(), why: z.string() })).describe("Tests or measurements to track and how often"),
  dataGaps: z.array(z.string()).describe("Missing or stale data that would change the advice, e.g. no lipid panel in 12 months"),
});

export type CarePlan = z.infer<typeof CarePlanSchema> & { model: string; generatedAt: string };

const SYSTEM = `You are Allele, a careful clinical decision-support assistant for precision medicine. You turn one person's genomic, wearable and health-record data into a personalised care plan they can take to their clinician.

Rules you must follow:
- The rule-based findings are authoritative for medication safety. Include every urgent or high finding among the priorities. Never contradict them, never weaken them, and never add specific drug doses beyond what they state.
- Never tell the person to stop, start or change a medicine on their own. Frame medication points as things to discuss with their prescriber, and say so when stopping suddenly could be dangerous.
- Do not diagnose. Describe what results are consistent with and what a clinician would usually check next.
- Use only the data given. Cite the person's own numbers and genotypes. If data is missing, thin or old, say so in dataGaps rather than guessing.
- Consumer genotyping arrays miss many variants; recommend clinical confirmation before prescribing decisions.
- For red-flag values (crisis-range blood pressure, oxygen below 90%, critical labs) the first priority must tell them to seek prompt care.
- Write for an intelligent non-specialist: warm, specific, no jargon without a short explanation, no fear-mongering.`;

export async function generateCarePlan(s: Snapshot, findings: Finding[], useAI: boolean): Promise<CarePlan> {
  if (!useAI) return heuristicPlan(s, findings);
  const result = await generateStructured({
    schema: CarePlanSchema,
    system: SYSTEM,
    prompt: `${describeSnapshot(s, findings)}\n\nWrite this person's personalised care plan.`,
    effort: "high",
  });
  return guardPlan({ ...result, model: AI_MODEL, generatedAt: new Date().toISOString() }, findings);
}

const UNSUPERVISED_CHANGE = /\b(stop|discontinue|quit|cut out|double|halve)\b(?![^.]*\b(prescriber|clinician|doctor|pharmacist|care team)\b)/i;

/** Server-side guardrails applied to every model-written plan. */
export function guardPlan(plan: CarePlan, findings: Finding[]): CarePlan {
  const priorities = plan.priorities.map((p) =>
    p.category === "medication" && UNSUPERVISED_CHANGE.test(p.recommendation) ? { ...p, recommendation: `${p.recommendation} Talk to your prescriber before making any change.` } : p,
  );
  // Any urgent or high rule-based finding the model left out is added back verbatim.
  const covered = new Set(priorities.flatMap((p) => p.basedOnFindings));
  const missing = findings.filter((f) => (f.priority === "urgent" || f.priority === "high") && !covered.has(f.ruleCode));
  const added = missing.map((f) => ({
    title: f.title,
    category: (f.kind === "vital" ? "monitoring" : f.kind === "lab" ? "monitoring" : "medication") as CarePlan["priorities"][number]["category"],
    priority: f.priority,
    summary: f.summary,
    recommendation: f.recommendation,
    rationale: f.rationale,
    evidence: f.evidence.map((e) => `${e.label}: ${e.detail}`),
    questionsForClinician: f.questions,
    basedOnFindings: [f.ruleCode],
  }));
  const rank = { urgent: 0, high: 1, moderate: 2, info: 3 } as const;
  return { ...plan, priorities: [...added, ...priorities].sort((a, b) => rank[a.priority] - rank[b.priority]) };
}
