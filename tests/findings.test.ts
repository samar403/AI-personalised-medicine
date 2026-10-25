import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestLabs, runFindings, type Snapshot } from "@/lib/clinical/findings";
import { parseFhir } from "@/lib/clinical/fhir";
import { normalizeDrug } from "@/lib/clinical/drugs";
import { callGenes, parseGenome } from "@/lib/clinical/pgx";
import { parseVitalsCsv, summarizeVitals } from "@/lib/clinical/vitals";
import { heuristicAnswer, heuristicPlan } from "@/lib/ai/heuristics";

function sampleSnapshot(): Snapshot {
  const rec = parseFhir(JSON.parse(readFileSync("public/sample-record.json", "utf8")));
  const vit = parseVitalsCsv(readFileSync("public/sample-wearables.csv", "utf8")).rows;
  return {
    profile: { birthYear: 1968, sex: "male", heightCm: 178, weightKg: 84, ancestry: "", smoking: "former", pregnant: false, goals: [] },
    age: 58,
    meds: rec.medications.map((m) => ({ name: m.name, drug: normalizeDrug(m.name), dose: m.dose })),
    conditions: rec.conditions.map((c) => c.name),
    allergies: rec.allergies,
    genes: callGenes(parseGenome(readFileSync("public/sample-genome.txt", "utf8")).calls),
    labs: latestLabs(rec.labs, "male"),
    vitals: summarizeVitals([...vit, ...rec.vitals]),
  };
}

describe("findings engine on the demo data", () => {
  const findings = runFindings(sampleSnapshot());
  const codes = findings.map((f) => f.ruleCode);

  it("connects genes to the medicines actually taken", () => {
    expect(codes).toContain("cyp2c19-clopidogrel:clopidogrel");
    expect(codes).toContain("slco1b1-simvastatin:simvastatin");
    expect(codes).toContain("cyp2c19-ssri-im:escitalopram");
  });
  it("catches the drug-drug interaction and the lab, wearable and secondary-prevention findings", () => {
    expect(codes).toEqual(expect.arrayContaining(["ddi:clopidogrel-ppi", "lab:ldl-above-secondary-target", "lab:vitamin_d:low", "vital:bp:stage1", "vital:rhr-rise"]));
  });
  it("uses the latest lab value, not an older one", () => {
    expect(findings.find((f) => f.ruleCode === "lab:ldl-above-secondary-target")?.rationale).toContain("142");
  });
  it("sorts by priority and never duplicates", () => {
    expect(new Set(codes).size).toBe(codes.length);
    expect(findings[0].priority).toBe("high");
  });
  it("evidence cites the genotype", () => {
    const f = findings.find((x) => x.ruleCode === "cyp2c19-clopidogrel:clopidogrel")!;
    expect(f.evidence.map((e) => e.detail).join(" ")).toContain("rs4244285 AG");
  });
});

describe("safety rules", () => {
  const base = sampleSnapshot();
  it("treats a crisis-range BP reading as urgent", () => {
    const vitals = summarizeVitals([
      ...Array.from({ length: 7 }, (_, i) => ({ metric: "systolic", day: `2026-10-0${i + 1}`, value: i === 6 ? 186 : 150 })),
      ...Array.from({ length: 7 }, (_, i) => ({ metric: "diastolic", day: `2026-10-0${i + 1}`, value: 95 })),
    ]);
    expect(runFindings({ ...base, vitals }).find((f) => f.ruleCode.startsWith("vital:bp"))?.priority).toBe("urgent");
  });
  it("flags a drug that conflicts with an allergy", () => {
    const s = { ...base, meds: [...base.meds, { name: "Amoxicillin 500 mg", drug: "amoxicillin", dose: "" }] };
    expect(runFindings(s).find((f) => f.ruleCode === "allergy:amoxicillin")?.priority).toBe("urgent");
  });
  it("flags metformin with severely reduced kidney function", () => {
    const s = { ...base, meds: [{ name: "Metformin", drug: "metformin", dose: "" }], labs: latestLabs([{ test: "egfr", name: "eGFR", value: 25, unit: "mL/min/1.73m²", takenAt: new Date() }]) };
    expect(runFindings(s).find((f) => f.ruleCode.startsWith("med-lab:metformin-egfr"))?.priority).toBe("urgent");
  });
});

describe("offline care plan", () => {
  it("builds a plan from findings and lists data gaps honestly", () => {
    const s = sampleSnapshot();
    const plan = heuristicPlan(s, runFindings(s));
    expect(plan.model).toBe("offline-rules");
    expect(plan.priorities[0].priority).toBe("high");
    expect(plan.lifestyle.length).toBeGreaterThan(0);
    expect(plan.dataGaps.join(" ")).toMatch(/CYP2D6/);
    const empty = heuristicPlan({ ...s, genes: null, vitals: [], labs: [] }, []);
    expect(empty.dataGaps).toHaveLength(3);
  });
});

describe("offline assistant", () => {
  const snap = sampleSnapshot();
  const findings = runFindings(snap);
  it("answers a gene question from the vault", () => {
    const a = heuristicAnswer("Explain my CYP2C19 result in plain English.", snap, findings);
    expect(a).toContain("CYP2C19 *1/*2");
    expect(a).toMatch(/clopidogrel/i);
  });
  it("points somewhere useful when nothing matches", () => {
    expect(heuristicAnswer("tell me a joke", snap, findings)).toMatch(/couldn't match/);
  });
});
