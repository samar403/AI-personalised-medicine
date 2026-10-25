// Builds the de-identified snapshot that is sent to Claude. No names, emails, exact dates of birth,
// addresses or record identifiers are included: only age, sex and clinical content.
import type { Finding, Snapshot } from "@/lib/clinical/findings";

export function describeSnapshot(s: Snapshot, findings: Finding[]) {
  const p = s.profile;
  const genes = s.genes
    ? s.genes.map((g) => `- ${g.gene} ${g.diplotype}: ${g.phenotype} (${g.confidence} confidence${g.actionable ? ", actionable" : ""})`).join("\n")
    : "No genetic data uploaded.";
  const vitals = s.vitals.length
    ? s.vitals
        .map((v) => `- ${v.label}: 7-day mean ${v.recentMean} ${v.unit}${v.baselineMean !== null ? `, prior 30-day baseline ${v.baselineMean} ${v.unit}` : ""}, ${v.days} days of data, latest ${v.latestDay}`)
        .join("\n")
    : "No wearable or home-monitoring data.";
  const labs = s.labs.length
    ? s.labs.map((l) => `- ${l.name}: ${l.value} ${l.unit} on ${l.takenAt.toISOString().slice(0, 10)}${l.label ? ` (${l.label})` : ""}`).join("\n")
    : "No lab results.";
  return `<person>
Age: ${s.age ?? "unknown"}
Sex: ${p.sex}
Height: ${p.heightCm ? `${p.heightCm} cm` : "unknown"}; weight: ${p.weightKg ? `${p.weightKg} kg` : "unknown"}
Smoking: ${p.smoking}${p.pregnant ? "\nCurrently pregnant: yes" : ""}
Self-described ancestry: ${p.ancestry || "not given"}
Personal health goals: ${p.goals.join("; ") || "not given"}
</person>

<conditions>
${s.conditions.map((c) => `- ${c}`).join("\n") || "None recorded."}
</conditions>

<medications>
${s.meds.map((m) => `- ${m.name}${m.dose ? ` (${m.dose})` : ""} [generic: ${m.drug}]`).join("\n") || "None recorded."}
</medications>

<allergies>
${s.allergies.map((a) => `- ${a.substance}${a.reaction ? `: ${a.reaction}` : ""}`).join("\n") || "None recorded."}
</allergies>

<pharmacogenomics>
${genes}
</pharmacogenomics>

<labs>
${labs}
</labs>

<wearables>
${vitals}
</wearables>

<rule_based_findings>
These come from a curated, guideline-based engine (CPIC, FDA labels, ACC/AHA, ADA, KDIGO). Treat them as authoritative.
${findings.map((f) => `- [${f.priority}] (rule ${f.ruleCode}) ${f.title} | ${f.recommendation} | evidence: ${f.evidenceLevel}`).join("\n") || "None."}
</rule_based_findings>`;
}
