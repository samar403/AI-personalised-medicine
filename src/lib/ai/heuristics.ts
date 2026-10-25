// Offline engine: used when there is no API key, or when the owner has not consented to AI
// processing. It assembles plans and explanations from the deterministic findings only, and says so.
import { PRIORITY_RANK, type Finding, type Snapshot } from "@/lib/clinical/findings";
import type { CarePlan } from "./plan";
import type { MedCheckExplanation } from "./medcheck";
import type { BriefNarrative } from "./brief";

const CATEGORY: Record<Finding["kind"], CarePlan["priorities"][number]["category"]> = {
  gene_drug: "medication",
  drug_drug: "medication",
  lab: "monitoring",
  vital: "heart",
};

function vitalCategory(f: Finding): CarePlan["priorities"][number]["category"] {
  if (f.ruleCode.includes("sleep")) return "sleep";
  if (f.ruleCode.includes("activity")) return "activity";
  if (f.ruleCode.includes("cgm")) return "metabolic";
  return "heart";
}

function labCategory(f: Finding): CarePlan["priorities"][number]["category"] {
  if (/hba1c|glucose|metformin/.test(f.ruleCode)) return "metabolic";
  if (/egfr|creatinine|potassium/.test(f.ruleCode)) return "kidney";
  if (/ldl|hdl|triglycerides|cholesterol|statin/.test(f.ruleCode)) return "heart";
  return "monitoring";
}

export function heuristicPlan(s: Snapshot, findings: Finding[]): CarePlan {
  const top = findings.filter((f) => !f.ruleCode.startsWith("pgx-future")).slice(0, 6);
  const future = findings.filter((f) => f.ruleCode.startsWith("pgx-future"));
  const priorities = [...top, ...future.slice(0, Math.max(0, 7 - top.length))].map((f) => ({
    title: f.title,
    category: f.kind === "vital" ? vitalCategory(f) : f.kind === "lab" ? labCategory(f) : f.ruleCode.startsWith("pgx-future") ? ("genetics" as const) : CATEGORY[f.kind],
    priority: f.priority,
    summary: f.summary,
    recommendation: f.recommendation,
    rationale: f.rationale,
    evidence: f.evidence.map((e) => `${e.label}: ${e.detail}`),
    questionsForClinician: f.questions,
    basedOnFindings: [f.ruleCode],
  }));

  const vital = (k: string) => s.vitals.find((v) => v.metric === k);
  const lifestyle: CarePlan["lifestyle"] = [];
  const sleep = vital("sleep_hours");
  if (sleep && sleep.recentMean < 7) lifestyle.push({ area: "Sleep", action: "Set a fixed wind-down time 30 minutes earlier than now, every night this week.", why: `You averaged ${sleep.recentMean} h; 7+ hours helps blood pressure, glucose and recovery.` });
  const steps = vital("steps");
  if (steps && steps.recentMean < 7500) lifestyle.push({ area: "Activity", action: "Take a 10-minute walk after your two largest meals.", why: `You average about ${Math.round(steps.recentMean).toLocaleString("en-US")} steps; post-meal walks lower glucose spikes and blood pressure.` });
  if (vital("systolic") && vital("systolic")!.recentMean >= 120) lifestyle.push({ area: "Nutrition", action: "Aim for under 2,300 mg of sodium a day; check labels on bread, soups and sauces.", why: "Cutting salt typically lowers systolic pressure by 5-6 mmHg." });
  if (s.profile.smoking === "current") lifestyle.push({ area: "Smoking", action: "Ask about stop-smoking support; medicines and counselling double quit rates.", why: "Stopping smoking is the single biggest change for heart and lung risk." });
  if (!lifestyle.length) lifestyle.push({ area: "Routine", action: "Keep doing what you're doing and keep your wearable on overnight.", why: "Continuous data makes changes easier to spot early." });

  const monitoring: CarePlan["monitoring"] = [];
  const has = (re: RegExp) => s.conditions.some((c) => re.test(c));
  if (has(/hypertension|blood pressure/i) || vital("systolic")) monitoring.push({ what: "Home blood pressure", frequency: "Twice daily for 7 days before each appointment", why: "Home averages are more reliable than single clinic readings." });
  if (s.meds.some((m) => /statin/.test(m.drug))) monitoring.push({ what: "Lipid panel", frequency: "4-12 weeks after any statin change, then every 3-12 months", why: "Confirms your LDL is responding." });
  if (has(/diabet|prediabet/i) || s.labs.some((l) => l.test === "hba1c" && l.value >= 5.7)) monitoring.push({ what: "HbA1c", frequency: "Every 3-6 months (yearly if in the prediabetes range)", why: "Tracks your average blood sugar." });
  if (s.meds.some((m) => ["warfarin"].includes(m.drug))) monitoring.push({ what: "INR", frequency: "As set by your anticoagulation clinic", why: "Keeps warfarin in a safe range." });
  if (s.meds.some((m) => ["lisinopril", "ramipril", "enalapril", "losartan", "valsartan", "spironolactone", "metformin"].includes(m.drug))) monitoring.push({ what: "Kidney function and potassium", frequency: "At least yearly", why: "Your medicines depend on healthy kidney function." });

  const dataGaps: string[] = [];
  if (!s.genes) dataGaps.push("No genetic data: upload a 23andMe, AncestryDNA or VCF file to check how your genes affect your medicines.");
  if (!s.vitals.length) dataGaps.push("No wearable data: connect an export to track heart rate, sleep and blood pressure trends.");
  if (!s.labs.length) dataGaps.push("No lab results: import a health record or add recent results.");
  const yearAgo = Date.now() - 365 * 86_400_000;
  if (s.labs.length && !s.labs.some((l) => ["ldl", "total_cholesterol"].includes(l.test) && l.takenAt.getTime() > yearAgo)) dataGaps.push("No cholesterol test in the last 12 months.");
  if (s.genes?.some((g) => g.gene === "CYP2D6")) dataGaps.push("CYP2D6 copy number isn't measured by consumer arrays; a clinical test is needed for a complete result.");

  const lead = priorities[0];
  return {
    headline: lead ? lead.title : "No urgent issues found in your data",
    overview: lead
      ? `Allele found ${findings.length} item${findings.length === 1 ? "" : "s"} across your ${[s.genes && "genetic", s.meds.length && "medication", s.labs.length && "lab", s.vitals.length && "wearable"].filter(Boolean).join(", ")} data. The most important is: ${lead.summary} This plan was assembled by the offline rules engine; enable Claude for a fuller, personalised narrative.`
      : "Your current data doesn't trigger any of Allele's guideline rules. Keep your records and wearable data up to date so changes are caught early.",
    priorities,
    lifestyle,
    monitoring,
    dataGaps,
    model: "offline-rules",
    generatedAt: new Date().toISOString(),
  };
}

export function heuristicMedCheck(drug: string, findings: Finding[]): MedCheckExplanation {
  if (!findings.length) {
    return {
      verdict: "no_flags",
      plainLanguage: `Allele found no gene-drug, drug-drug or allergy flags for ${drug} in your data. That doesn't rule out every risk: your clinician and pharmacist will also consider your kidney and liver function, other conditions and the dose.`,
      keyPoints: ["No curated interactions matched.", "Arrays test common variants only."],
      questionsForClinician: [`What should I watch for when starting ${drug}?`],
      model: "offline-rules",
    };
  }
  const worst = findings[0];
  return {
    verdict: worst.priority === "urgent" || worst.priority === "high" ? "discuss_before_starting" : "use_with_care",
    plainLanguage: `${worst.summary} ${worst.recommendation}`,
    keyPoints: findings.map((f) => f.title),
    questionsForClinician: [...new Set(findings.flatMap((f) => f.questions))].slice(0, 4),
    model: "offline-rules",
  };
}

export function heuristicBrief(s: Snapshot, findings: Finding[]): BriefNarrative {
  const serious = findings.filter((f) => f.priority === "urgent" || f.priority === "high");
  return {
    summary: `${s.age ? `${s.age}-year-old` : "Adult"} ${s.profile.sex === "unspecified" ? "patient" : s.profile.sex} with ${s.conditions.join(", ") || "no recorded conditions"}, on ${s.meds.length} active medication${s.meds.length === 1 ? "" : "s"}. ${serious.length ? `${serious.length} high-priority finding${serious.length === 1 ? "" : "s"} for review, led by: ${serious[0].title.toLowerCase()}.` : "No high-priority findings."}`,
    discussionPoints: (serious.length ? serious : findings).slice(0, 5).map((f) => `${f.title}. ${f.recommendation}`),
    model: "offline-rules",
  };
}

const STOP = new Set(["what", "does", "mean", "my", "the", "and", "for", "with", "this", "that", "should", "about", "which", "are", "is", "of", "to", "in", "me", "i", "a", "an", "it", "do", "how", "why", "has", "have", "gone", "up", "at", "next", "ask", "result", "plain", "english", "explain", "week"]);

/** Offline assistant: answers from the vault by matching the question to genes, medicines, labs, vitals and findings. */
export function heuristicAnswer(question: string, s: Snapshot, findings: Finding[]): string {
  const words = question.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 1 && !STOP.has(w)) ?? [];
  const hits = (text: string) => words.filter((w) => text.toLowerCase().includes(w)).length;
  const wantsMeds = /\b(medicine|medication|drug|pill|prescription)s?\b/i.test(question);
  const wantsVisit = /\b(visit|appointment|doctor|cardiologist|clinician|gp|ask)\b/i.test(question);

  const genes = (s.genes ?? []).filter((g) => hits(g.gene) > 0 || (wantsMeds && /gene/i.test(question) && g.actionable));
  const meds = s.meds.filter((m) => hits(`${m.name} ${m.drug}`) > 0);
  const labs = s.labs.filter((l) => l.test !== "other" && hits(`${l.name} ${l.test}`) > 0);
  const vitals = s.vitals.filter((v) => hits(`${v.label} ${v.metric}`) > 0 || (/heart rate|hrv|sleep|steps/i.test(question) && hits(v.label) > 0));
  const scored = findings
    .map((f) => ({ f, score: hits(`${f.title} ${f.summary} ${f.ruleCode} ${f.evidence.map((e) => e.detail).join(" ")}`) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || PRIORITY_RANK[a.f.priority] - PRIORITY_RANK[b.f.priority]);
  // Keep only findings that match about as well as the best one, so a stray shared word doesn't pull in noise.
  let matched = scored.filter((x) => x.score >= scored[0].score / 2).map((x) => x.f);
  if (wantsMeds && !matched.length) matched = findings.filter((f) => f.kind === "gene_drug" || f.kind === "drug_drug");
  if (wantsVisit && !matched.length) matched = [...findings].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  matched = matched.slice(0, 4);

  const out: string[] = [];
  for (const g of genes.slice(0, 3)) out.push(`**${g.gene} ${g.diplotype}**: ${g.phenotype}. ${g.note}`.trim());
  for (const m of meds.slice(0, 3)) if (!matched.some((f) => f.evidence.some((e) => e.detail.toLowerCase().includes(m.drug)))) out.push(`**${m.name}**${m.dose ? ` (${m.dose})` : ""}: no rule-based flags in your data.`);
  for (const l of labs.slice(0, 3)) out.push(`**${l.name}**: ${l.value} ${l.unit} on ${l.takenAt.toISOString().slice(0, 10)}${l.label ? ` (${l.label})` : ""}.`);
  for (const v of vitals.slice(0, 3)) out.push(`**${v.label}**: ${v.recentMean ?? "n/a"} ${v.unit} over the last 7 days${v.baselineMean != null ? `, against a baseline of ${v.baselineMean} ${v.unit}` : ""}.`);
  if (matched.length) {
    out.push("", "**Related findings**");
    for (const f of matched) out.push(`- **${f.title}** (${f.priority}). ${f.recommendation}`);
  }
  const questions = [...new Set(matched.flatMap((f) => f.questions))].slice(0, 4);
  if (questions.length) out.push("", "**Questions to bring to your clinician**", ...questions.map((q) => `- ${q}`));

  if (!out.length) {
    out.push(
      "I couldn't match that question to anything in your vault. Try naming a gene (e.g. CYP2C19), a medicine, a lab test or a wearable metric.",
      findings.length ? `Your highest-priority finding right now is **${[...findings].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])[0].title}**.` : "",
    );
  }
  out.push("", "_Offline answer from Allele's rules engine. Connect Claude for conversational answers. Check any medicine change with your clinician._");
  return out.filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== "")).join("\n");
}
