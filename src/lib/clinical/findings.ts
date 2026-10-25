// The deterministic findings engine. Every medication-related flag comes from here, never from
// the language model, so each one is reproducible and traceable to a guideline.
import type { Evidence, HealthProfile, InsightKind, Priority } from "@/lib/db/schema";
import { allergyConflict, findInteractions } from "./drugs";
import { geneDrugHits, HIGH_STAKES_GENES, affectedDrugs, type GeneResult } from "./pgx";
import { interpretLab, labDef, type LabFlag } from "./labs";
import type { VitalSummary } from "./vitals";

export interface SnapshotMed {
  name: string;
  drug: string;
  dose: string;
}

export interface SnapshotLab {
  test: string;
  name: string;
  value: number;
  unit: string;
  takenAt: Date;
  flag: LabFlag | null;
  label: string | null;
}

export interface Snapshot {
  profile: HealthProfile;
  age: number | null;
  meds: SnapshotMed[];
  conditions: string[];
  allergies: { substance: string; reaction: string }[];
  genes: GeneResult[] | null;
  labs: SnapshotLab[];
  vitals: VitalSummary[];
}

export interface Finding {
  ruleCode: string;
  kind: InsightKind;
  priority: Priority;
  title: string;
  summary: string;
  recommendation: string;
  rationale: string;
  evidence: Evidence[];
  evidenceLevel: string;
  questions: string[];
}

export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, moderate: 2, info: 3 };

const hasCondition = (s: Snapshot, re: RegExp) => s.conditions.some((c) => re.test(c));
const onClass = (s: Snapshot, drugs: string[]) => s.meds.find((m) => drugs.includes(m.drug));
const lab = (s: Snapshot, key: string) => s.labs.find((l) => l.test === key);
const vital = (s: Snapshot, key: string) => s.vitals.find((v) => v.metric === key);
const fmtDay = (d: Date) => d.toISOString().slice(0, 10);

export function runFindings(s: Snapshot): Finding[] {
  const out: Finding[] = [];
  const drugs = s.meds.map((m) => m.drug);

  // 1. Gene-drug interactions for current medications.
  if (s.genes) {
    for (const med of s.meds) {
      for (const { rule, gene } of geneDrugHits(med.drug, s.genes)) {
        out.push({
          ruleCode: `${rule.code}:${med.drug}`,
          kind: "gene_drug",
          priority: rule.priority,
          title: rule.title.toLowerCase().includes(med.drug) ? rule.title : `${capital(med.drug)}: ${rule.title.charAt(0).toLowerCase()}${rule.title.slice(1)}`,
          summary: rule.summary,
          recommendation: rule.recommendation,
          rationale: `You take ${med.name}${med.dose ? ` (${med.dose})` : ""}, and your ${gene.gene} result is ${gene.diplotype}: ${gene.phenotype.toLowerCase()}.`,
          evidence: [
            { label: "Medication", detail: `${med.name}${med.dose ? `, ${med.dose}` : ""}` },
            { label: `${gene.gene} genotype`, detail: `${gene.diplotype} (${gene.variants.filter((v) => v.genotype).map((v) => `${v.rsid} ${v.genotype}`).join(", ")})` },
            { label: "Phenotype", detail: `${gene.phenotype}${gene.confidence !== "high" ? ` · ${gene.confidence} confidence` : ""}` },
          ],
          evidenceLevel: rule.evidenceLevel,
          questions: [`Given my ${gene.gene} result, is ${med.drug} still the best choice for me, or should we consider an alternative or a different dose?`, "Should we confirm this result with a clinical pharmacogenomic test?"],
        });
      }
    }

    // 2. High-stakes genotypes worth knowing before a future prescription.
    for (const g of s.genes) {
      if (!g.actionable || !HIGH_STAKES_GENES.has(g.gene)) continue;
      const affected = affectedDrugs(g).filter((d) => !drugs.includes(d));
      if (!affected.length) continue;
      const serious = ["DPYD", "HLA-B", "TPMT", "NUDT15"].includes(g.gene) || g.code === "PM";
      out.push({
        ruleCode: `pgx-future:${g.gene}:${g.code}`,
        kind: "gene_drug",
        priority: serious ? "moderate" : "info",
        title: `${g.gene} ${g.phenotype.toLowerCase()}: keep this on your record`,
        summary: `Your ${g.gene} result affects how you would respond to ${listOf(affected)} if any were prescribed in future.`,
        recommendation: "Share this result with your doctors and pharmacist and ask for it to be added to your medical record, so it is checked before any of these drugs is prescribed.",
        rationale: `${g.gene} ${g.diplotype}. ${g.note}`,
        evidence: [{ label: `${g.gene} genotype`, detail: `${g.diplotype} · ${g.confidence} confidence` }],
        evidenceLevel: "CPIC",
        questions: [`Can my ${g.gene} result be added to my chart as a pharmacogenomic alert?`],
      });
    }
  }

  // 3. Drug-drug interactions.
  for (const { interaction: ix, pair } of findInteractions(drugs)) {
    const [a, b] = pair.map((d) => s.meds.find((m) => m.drug === d)!);
    out.push({
      ruleCode: `ddi:${ix.code}`,
      kind: "drug_drug",
      priority: ix.priority,
      title: ix.title,
      summary: ix.summary,
      recommendation: ix.recommendation,
      rationale: `You take both ${a.name} and ${b.name}.`,
      evidence: [
        { label: "Medication 1", detail: a.name },
        { label: "Medication 2", detail: b.name },
      ],
      evidenceLevel: ix.source,
      questions: [`Is it safe for me to take ${a.drug} and ${b.drug} together, or is there an alternative?`],
    });
  }

  // 4. Drug-allergy conflicts.
  for (const med of s.meds) {
    const hit = allergyConflict(med.drug, s.allergies.map((a) => a.substance));
    if (!hit) continue;
    out.push({
      ruleCode: `allergy:${med.drug}`,
      kind: "drug_drug",
      priority: "urgent",
      title: `${capital(med.drug)} conflicts with a recorded allergy`,
      summary: `${med.name} ${hit.reason} (${hit.substance}).`,
      recommendation: "Contact your prescriber or pharmacist before the next dose. If you have swelling, wheeze or trouble breathing, call emergency services.",
      rationale: `Allergy list includes ${hit.substance}.`,
      evidence: [
        { label: "Medication", detail: med.name },
        { label: "Allergy", detail: hit.substance },
      ],
      evidenceLevel: "Allergy record",
      questions: ["Is this allergy record accurate, and should this medication be changed?"],
    });
  }

  // 5. Medication-lab safety checks.
  const egfr = lab(s, "egfr");
  const metformin = onClass(s, ["metformin"]);
  if (metformin && egfr && egfr.value < 45) {
    const severe = egfr.value < 30;
    out.push({
      ruleCode: `med-lab:metformin-egfr:${severe ? "lt30" : "lt45"}`,
      kind: "lab",
      priority: severe ? "urgent" : "high",
      title: severe ? "Metformin with eGFR below 30" : "Metformin dose review for kidney function",
      summary: severe ? "The FDA label contraindicates metformin when eGFR is below 30 because of lactic acidosis risk." : "Starting metformin is not recommended with eGFR 30-45, and an existing dose should be reviewed.",
      recommendation: "Ask your prescriber to review your metformin dose against your kidney function.",
      rationale: `eGFR ${egfr.value} on ${fmtDay(egfr.takenAt)} while taking ${metformin.name}.`,
      evidence: [
        { label: "eGFR", detail: `${egfr.value} ${egfr.unit} (${fmtDay(egfr.takenAt)})` },
        { label: "Medication", detail: metformin.name },
      ],
      evidenceLevel: "FDA metformin label",
      questions: ["Does my metformin dose need to change because of my kidney function?"],
    });
  }
  const b12 = lab(s, "b12");
  if (metformin && b12 && b12.value < 300) {
    out.push({
      ruleCode: "med-lab:metformin-b12",
      kind: "lab",
      priority: "moderate",
      title: "Low B12 on metformin",
      summary: "Long-term metformin can lower vitamin B12, which can cause tiredness, anaemia and nerve symptoms.",
      recommendation: "Ask whether you should take a B12 supplement and have levels rechecked.",
      rationale: `B12 ${b12.value} ${b12.unit} while taking ${metformin.name}.`,
      evidence: [{ label: "Vitamin B12", detail: `${b12.value} ${b12.unit} (${fmtDay(b12.takenAt)})` }],
      evidenceLevel: "ADA Standards of Care",
      questions: ["Should I start B12 supplementation?"],
    });
  }
  const k = lab(s, "potassium");
  const raas = s.meds.find((m) => ["lisinopril", "ramipril", "enalapril", "losartan", "valsartan", "spironolactone"].includes(m.drug));
  if (raas && k && k.value > 5.0) {
    out.push({
      ruleCode: "med-lab:raas-potassium",
      kind: "lab",
      priority: k.value >= 6 ? "urgent" : "high",
      title: "High potassium on a blood-pressure medicine",
      summary: `${raas.name} can raise potassium. Your latest potassium is ${k.value} mmol/L.`,
      recommendation: k.value >= 6 ? "Contact your clinician today; very high potassium can affect heart rhythm." : "Ask for a repeat potassium test and a medication review.",
      rationale: `Potassium ${k.value} on ${fmtDay(k.takenAt)}.`,
      evidence: [{ label: "Potassium", detail: `${k.value} mmol/L (${fmtDay(k.takenAt)})` }],
      evidenceLevel: "KDIGO; drug labels",
      questions: ["Do I need a repeat potassium test or a change in medication?"],
    });
  }
  const inr = lab(s, "inr");
  if (onClass(s, ["warfarin"]) && inr && inr.value > 3.5) {
    out.push({
      ruleCode: "med-lab:warfarin-inr",
      kind: "lab",
      priority: inr.value >= 5 ? "urgent" : "high",
      title: "INR above target on warfarin",
      summary: "A high INR means your blood is thinner than intended, which raises bleeding risk.",
      recommendation: "Contact your anticoagulation clinic for dosing advice. Seek urgent care for any significant bleeding.",
      rationale: `INR ${inr.value} on ${fmtDay(inr.takenAt)}.`,
      evidence: [{ label: "INR", detail: `${inr.value} (${fmtDay(inr.takenAt)})` }],
      evidenceLevel: "ACCP antithrombotic guidance",
      questions: ["What should my warfarin dose be now?"],
    });
  }
  const statin = s.meds.find((m) => ["simvastatin", "atorvastatin", "rosuvastatin", "lovastatin", "pravastatin"].includes(m.drug));
  const alt = lab(s, "alt");
  if (statin && alt && alt.value > 120) {
    out.push({
      ruleCode: "med-lab:statin-alt",
      kind: "lab",
      priority: "high",
      title: "Liver enzyme raised on a statin",
      summary: "ALT more than three times the upper limit on a statin should be reviewed.",
      recommendation: "Ask your prescriber to review your statin and repeat liver tests.",
      rationale: `ALT ${alt.value} U/L while taking ${statin.name}.`,
      evidence: [{ label: "ALT", detail: `${alt.value} U/L (${fmtDay(alt.takenAt)})` }],
      evidenceLevel: "ACC/AHA cholesterol guideline",
      questions: ["Is my statin safe for my liver?"],
    });
  }
  const ldl = lab(s, "ldl");
  if (ldl && ldl.value >= 160 && !statin) {
    out.push({
      ruleCode: "lab:ldl-untreated",
      kind: "lab",
      priority: ldl.value >= 190 ? "high" : "moderate",
      title: ldl.value >= 190 ? "Very high LDL cholesterol" : "High LDL cholesterol",
      summary: ldl.value >= 190 ? "LDL of 190 or more usually warrants statin therapy regardless of other risk factors, and screening for familial hypercholesterolaemia." : "High LDL raises long-term heart and stroke risk.",
      recommendation: "Ask for a cardiovascular risk assessment and whether cholesterol-lowering treatment is right for you.",
      rationale: `LDL ${ldl.value} mg/dL on ${fmtDay(ldl.takenAt)}, not on a statin.`,
      evidence: [{ label: "LDL", detail: `${ldl.value} mg/dL (${fmtDay(ldl.takenAt)})` }],
      evidenceLevel: "ACC/AHA 2018 cholesterol guideline",
      questions: ["What is my 10-year cardiovascular risk, and would treatment help?"],
    });
  }
  if (statin && ldl && ldl.value >= 100 && hasCondition(s, /coronary|stent|myocardial|heart attack|angina|stroke|cad\b|ascvd/i)) {
    out.push({
      ruleCode: "lab:ldl-above-secondary-target",
      kind: "lab",
      priority: "moderate",
      title: "LDL above target for heart disease",
      summary: "With established heart disease, guidelines aim for at least a 50% LDL reduction and often LDL below 70 mg/dL (or 55 in very high risk).",
      recommendation: "Ask whether your statin dose is optimal, or whether ezetimibe or another option should be added.",
      rationale: `LDL ${ldl.value} mg/dL on ${statin.name} with a history of heart disease.`,
      evidence: [
        { label: "LDL", detail: `${ldl.value} mg/dL (${fmtDay(ldl.takenAt)})` },
        { label: "Statin", detail: statin.name },
      ],
      evidenceLevel: "ACC/AHA 2018; ESC 2019",
      questions: ["What LDL target should I aim for, and how do we get there?"],
    });
  }

  // 6. Lab results outside range (not already covered by a medication-lab rule).
  const covered = new Set(out.filter((f) => f.kind === "lab").flatMap((f) => f.evidence.map((e) => e.label)));
  for (const l of s.labs) {
    if (!l.flag || l.flag === "normal" || covered.has(labDef(l.test)?.name ?? l.name) || covered.has(l.name)) continue;
    if (l.test === "ldl" && (statin || l.value >= 160)) continue;
    if (Date.now() - l.takenAt.getTime() > 2 * 365 * 86_400_000) continue;
    const priority: Priority = l.flag === "critical" ? "urgent" : l.flag === "high" || l.flag === "low" ? "moderate" : "info";
    out.push({
      ruleCode: `lab:${l.test}:${l.flag}`,
      kind: "lab",
      priority,
      title: `${l.name}: ${l.label?.toLowerCase()}`,
      summary: labExplainer(l.test, l.flag) ?? `Your latest ${l.name} result is outside the usual range.`,
      recommendation: l.flag === "critical" ? "Contact your clinician promptly about this result." : "Discuss this result at your next appointment, including whether to repeat it.",
      rationale: `${l.name} ${l.value} ${l.unit} on ${fmtDay(l.takenAt)}.`,
      evidence: [{ label: l.name, detail: `${l.value} ${l.unit} (${fmtDay(l.takenAt)})` }],
      evidenceLevel: labSource(l.test),
      questions: [`What does my ${l.name} result mean for me, and when should it be rechecked?`],
    });
  }

  // 7. Wearable and home-monitoring trends.
  out.push(...vitalFindings(s));

  // De-duplicate by rule code and sort by priority.
  const seen = new Set<string>();
  return out.filter((f) => (seen.has(f.ruleCode) ? false : (seen.add(f.ruleCode), true))).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

function vitalFindings(s: Snapshot): Finding[] {
  const out: Finding[] = [];
  const sys = vital(s, "systolic");
  const dia = vital(s, "diastolic");
  if (sys && dia) {
    const crisis = sys.maxRecent >= 180 || dia.maxRecent >= 120;
    const avgS = sys.recentMean;
    const avgD = dia.recentMean;
    const stage = crisis ? "crisis" : avgS >= 140 || avgD >= 90 ? "stage2" : avgS >= 130 || avgD >= 80 ? "stage1" : avgS >= 120 ? "elevated" : null;
    if (stage) {
      const onBp = s.meds.some((m) => ["lisinopril", "ramipril", "enalapril", "losartan", "valsartan", "amlodipine", "metoprolol", "spironolactone"].includes(m.drug));
      const copy = {
        crisis: { p: "urgent" as Priority, t: "Blood pressure reading in the crisis range", r: "A reading of 180/120 or higher needs prompt attention. Re-measure after 5 minutes of rest. If it stays this high, or you have chest pain, shortness of breath, weakness, vision change or severe headache, call emergency services." },
        stage2: { p: "high" as Priority, t: "Home blood pressure in the stage 2 range", r: onBp ? "Your treatment may need adjusting. Share these readings with your clinician soon." : "Share these readings with your clinician soon; stage 2 usually warrants treatment as well as lifestyle change." },
        stage1: { p: "moderate" as Priority, t: "Home blood pressure in the stage 1 range", r: onBp ? "Ask whether your target is being met and whether treatment needs adjusting." : "Discuss your cardiovascular risk and lifestyle steps (salt, activity, alcohol, weight) with your clinician." },
        elevated: { p: "info" as Priority, t: "Blood pressure slightly elevated", r: "Lifestyle steps such as less salt, more activity and limiting alcohol help keep it from rising." },
      }[stage];
      out.push({
        ruleCode: `vital:bp:${stage}`,
        kind: "vital",
        priority: copy.p,
        title: copy.t,
        summary: `Your 7-day average is ${avgS}/${avgD} mmHg (ACC/AHA: normal is below 120/80; stage 1 is 130-139 or 80-89; stage 2 is 140/90 or higher).`,
        recommendation: copy.r,
        rationale: `Highest recent reading ${sys.maxRecent}/${dia.maxRecent} mmHg.`,
        evidence: [
          { label: "Systolic (7-day mean)", detail: `${avgS} mmHg` },
          { label: "Diastolic (7-day mean)", detail: `${avgD} mmHg` },
        ],
        evidenceLevel: "ACC/AHA 2017 hypertension guideline",
        questions: ["What blood pressure target should I aim for?", "Should we change my treatment?"],
      });
    }
  }

  const spo2 = vital(s, "spo2");
  if (spo2 && (spo2.minRecent < 90 || spo2.recentMean < 94)) {
    const low = spo2.minRecent < 90;
    out.push({
      ruleCode: `vital:spo2:${low ? "lt90" : "lt94"}`,
      kind: "vital",
      priority: low ? "urgent" : "high",
      title: low ? "Blood oxygen dipped below 90%" : "Blood oxygen running low",
      summary: `Your lowest reading this week was ${spo2.minRecent}% (7-day average ${spo2.recentMean}%). Wrist sensors can misread, especially with cold hands, movement or darker skin tones, but persistently low readings need checking.`,
      recommendation: low ? "Re-check at rest. If it stays below 90%, or you are short of breath, confused or have blue lips, seek urgent care." : "Mention this to your clinician, particularly if you snore, wake unrefreshed or feel breathless.",
      rationale: `${spo2.days} days of SpO₂ data.`,
      evidence: [{ label: "SpO₂ (lowest, 7 days)", detail: `${spo2.minRecent}%` }],
      evidenceLevel: "BTS oxygen guideline; FDA pulse oximeter safety communication",
      questions: ["Should I have a sleep study or a clinical oxygen test?"],
    });
  }

  const rhr = vital(s, "resting_hr");
  if (rhr && rhr.delta !== null && rhr.delta >= 7) {
    out.push({
      ruleCode: "vital:rhr-rise",
      kind: "vital",
      priority: rhr.recentMean > 100 ? "high" : "moderate",
      title: `Resting heart rate up ${rhr.delta} bpm from your baseline`,
      summary: `Your 7-day average is ${rhr.recentMean} bpm against a 30-day baseline of ${rhr.baselineMean} bpm. Sustained rises often come with illness, poor sleep, stress, dehydration, alcohol, over-training or a medication change.`,
      recommendation: "Prioritise rest and fluids. If it persists beyond a week, or comes with fever, palpitations, chest pain or breathlessness, contact your clinician.",
      rationale: `Change computed from ${rhr.days} days of wearable data.`,
      evidence: [
        { label: "Resting HR (7-day mean)", detail: `${rhr.recentMean} bpm` },
        { label: "Baseline (prior 30 days)", detail: `${rhr.baselineMean} ± ${rhr.baselineSd} bpm` },
      ],
      evidenceLevel: "Personal baseline (wearable)",
      questions: ["Could any of my medications or conditions explain a higher resting heart rate?"],
    });
  }

  const hrv = vital(s, "hrv");
  if (hrv && hrv.baselineMean && hrv.recentMean < hrv.baselineMean * 0.8) {
    out.push({
      ruleCode: "vital:hrv-drop",
      kind: "vital",
      priority: "info",
      title: "Heart rate variability below your normal",
      summary: `HRV averaged ${hrv.recentMean} ms this week against your ${hrv.baselineMean} ms baseline. Lower HRV often reflects stress, short sleep, illness or hard training.`,
      recommendation: "Treat it as a recovery signal: protect sleep and ease off intense training for a few days.",
      rationale: `${Math.round((1 - hrv.recentMean / hrv.baselineMean) * 100)}% below baseline.`,
      evidence: [{ label: "HRV (7-day mean)", detail: `${hrv.recentMean} ms vs ${hrv.baselineMean} ms` }],
      evidenceLevel: "Personal baseline (wearable)",
      questions: [],
    });
  }

  const sleep = vital(s, "sleep_hours");
  if (sleep && sleep.recentMean < 6.5) {
    out.push({
      ruleCode: "vital:short-sleep",
      kind: "vital",
      priority: sleep.recentMean < 5.5 ? "moderate" : "info",
      title: `Averaging ${sleep.recentMean} hours of sleep`,
      summary: "Adults need 7 or more hours. Short sleep raises blood pressure, blood sugar and resting heart rate over time.",
      recommendation: "Aim for a consistent sleep window, limit caffeine after midday and screens before bed. Ask about sleep apnoea if you snore or wake unrefreshed.",
      rationale: `7-day average from your wearable${sleep.baselineMean ? `; baseline ${sleep.baselineMean} h` : ""}.`,
      evidence: [{ label: "Sleep (7-day mean)", detail: `${sleep.recentMean} h` }],
      evidenceLevel: "AASM/SRS consensus",
      questions: ["Could my sleep be affecting my other results?"],
    });
  }

  const steps = vital(s, "steps");
  if (steps && steps.recentMean < 5000) {
    out.push({
      ruleCode: "vital:low-activity",
      kind: "vital",
      priority: "info",
      title: `About ${Math.round(steps.recentMean).toLocaleString("en-US")} steps a day`,
      summary: "Moving more is one of the most effective ways to lower blood pressure, blood sugar and cardiovascular risk. Benefits appear well before 10,000 steps.",
      recommendation: "Add a 10-minute walk after meals, and work toward 150 minutes of moderate activity a week if your clinician agrees.",
      rationale: "7-day average from your wearable.",
      evidence: [{ label: "Steps (7-day mean)", detail: Math.round(steps.recentMean).toLocaleString("en-US") }],
      evidenceLevel: "WHO 2020 physical activity guideline",
      questions: [],
    });
  }

  const glucose = vital(s, "glucose");
  if (glucose && glucose.recentMean > 154) {
    out.push({
      ruleCode: "vital:cgm-high",
      kind: "vital",
      priority: "moderate",
      title: "Average glucose above target",
      summary: `Your CGM average is ${glucose.recentMean} mg/dL this week, roughly a glucose management indicator above 7%.`,
      recommendation: "Share your CGM report with your diabetes team.",
      rationale: "7-day CGM average.",
      evidence: [{ label: "Glucose (7-day mean)", detail: `${glucose.recentMean} mg/dL` }],
      evidenceLevel: "ADA Standards of Care (time in range)",
      questions: ["Do my glucose patterns suggest a change in treatment?"],
    });
  }

  const weight = vital(s, "weight");
  if (weight && weight.series.length >= 14) {
    const first = weight.series[0].value;
    const change = (weight.latest - first) / first;
    if (change <= -0.05) {
      out.push({
        ruleCode: "vital:weight-loss",
        kind: "vital",
        priority: "moderate",
        title: `Weight down ${Math.round(-change * 100)}% over your tracked period`,
        summary: "Unplanned weight loss of 5% or more over a few months is worth discussing with a clinician.",
        recommendation: "If you have not been trying to lose weight, raise this at your next appointment.",
        rationale: `${first} kg → ${weight.latest} kg.`,
        evidence: [{ label: "Weight", detail: `${first} → ${weight.latest} kg` }],
        evidenceLevel: "NICE / AAFP unintentional weight loss guidance",
        questions: ["Is my weight change expected?"],
      });
    }
  }
  return out;
}

function labExplainer(test: string, flag: LabFlag): string | null {
  const m: Record<string, string> = {
    hba1c: "HbA1c reflects your average blood sugar over about three months.",
    glucose: "Fasting glucose is one way to screen for diabetes and prediabetes.",
    hdl: "Low HDL is linked to higher cardiovascular risk; activity and not smoking help raise it.",
    triglycerides: "High triglycerides are linked to diet, alcohol, blood sugar and some medications.",
    egfr: "eGFR estimates how well your kidneys filter. Many medicines need dose changes when it is low.",
    vitamin_d: "Low vitamin D is common, especially in winter or with darker skin, and is easy to treat.",
    tsh: "TSH is the main screening test for an under- or over-active thyroid.",
    hemoglobin: "Low haemoglobin (anaemia) can cause tiredness and breathlessness and has many causes.",
    crp: "CRP is a marker of inflammation.",
  };
  return m[test] ?? (flag === "critical" ? "This result is well outside the usual range." : null);
}

function labSource(test: string) {
  return (
    {
      hba1c: "ADA Standards of Care 2025",
      glucose: "ADA Standards of Care 2025",
      egfr: "KDIGO 2024 CKD guideline",
      vitamin_d: "Endocrine Society",
      hdl: "ACC/AHA 2018 cholesterol guideline",
      triglycerides: "ACC/AHA 2018 cholesterol guideline",
      total_cholesterol: "ACC/AHA 2018 cholesterol guideline",
    }[test] ?? "Standard adult reference range"
  );
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function listOf(items: string[]) {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Builds snapshot labs: the latest value per test with its interpretation. */
export function latestLabs(rows: { test: string; name: string; value: number; unit: string; takenAt: Date }[], sex?: string): SnapshotLab[] {
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = r.test === "other" ? `other:${r.name}` : r.test;
    const prev = latest.get(key);
    if (!prev || prev.takenAt < r.takenAt) latest.set(key, r);
  }
  return [...latest.values()].map((r) => {
    const i = r.test === "other" ? null : interpretLab(r.test, r.value, r.unit, sex);
    return { ...r, flag: i?.flag ?? null, label: i?.label ?? null };
  });
}

export function ageFrom(birthYear: number | null, now = new Date()) {
  return birthYear ? now.getUTCFullYear() - birthYear : null;
}
