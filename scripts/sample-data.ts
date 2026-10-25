// Generates the demo files in public/: a 23andMe-style raw genome, a wearable CSV and a FHIR R4 bundle.
// Run with: npm run sample:data   (output is deterministic; the files are committed)
import { writeFileSync } from "node:fs";
import { PANEL } from "../src/lib/clinical/pgx";

let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());

// --- Genome: planted pharmacogenomic variants among filler SNPs -----------------------------
const PLANTED: Record<string, string> = {
  rs4244285: "AG", // CYP2C19 *2 heterozygous -> intermediate metabolizer
  rs4986893: "GG",
  rs12248560: "CC",
  rs1799853: "CC",
  rs1057910: "AC", // CYP2C9 *3 heterozygous -> intermediate metabolizer (AS 1)
  rs3892097: "CT", // CYP2D6 *4 heterozygous
  rs776746: "CC", // CYP3A5 *3/*3 (non-expresser, the common genotype)
  rs4149056: "CT", // SLCO1B1 decreased function
  rs9923231: "CT", // VKORC1 -1639 G/A
  rs2108622: "CC",
  rs1142345: "TT",
  rs1800460: "CC",
  rs116855232: "CC",
  rs3918290: "CC",
  rs55886062: "AA",
  rs67376798: "TT",
  rs887829: "CC",
  rs2395029: "TT",
  rs6025: "CC",
  rs1799963: "GG",
};
const panelPos: Record<string, [string, number]> = {
  rs4244285: ["10", 96541616], rs4986893: ["10", 96540410], rs12248560: ["10", 96521657], rs1799853: ["10", 96702047], rs1057910: ["10", 96741053],
  rs3892097: ["22", 42524947], rs776746: ["7", 99270539], rs4149056: ["12", 21331549], rs9923231: ["16", 31107689], rs2108622: ["19", 15990431],
  rs1142345: ["6", 18130918], rs1800460: ["6", 18139228], rs116855232: ["13", 48619855], rs3918290: ["1", 97915614], rs55886062: ["1", 97981343],
  rs67376798: ["1", 97547947], rs887829: ["2", 234665782], rs2395029: ["6", 31431780], rs6025: ["1", 169519049], rs1799963: ["11", 46761055],
};
const bases = ["A", "C", "G", "T"];
const lines = [
  "# This data file is a SYNTHETIC sample generated for the Allele demo.",
  "# It mimics the 23andMe raw data format (build 37, plus strand). It is not a real person's genome.",
  "# rsid\tchromosome\tposition\tgenotype",
];
const filler: string[] = [];
for (let i = 0; i < 4000; i++) {
  const chr = String(1 + Math.floor(rand() * 22));
  const a = bases[Math.floor(rand() * 4)];
  const b = rand() < 0.7 ? a : bases[Math.floor(rand() * 4)];
  filler.push(`rs${100000 + Math.floor(rand() * 90000000)}\t${chr}\t${Math.floor(rand() * 2e8)}\t${rand() < 0.01 ? "--" : a + b}`);
}
for (const v of PANEL) filler.splice(Math.floor(rand() * filler.length), 0, `${v.rsid}\t${panelPos[v.rsid][0]}\t${panelPos[v.rsid][1]}\t${PLANTED[v.rsid]}`);
writeFileSync("public/sample-genome.txt", [...lines, ...filler].join("\n") + "\n");

// --- Wearables: 90 days, with a recent rise in resting HR and a dip in HRV and sleep ---------
const END = Date.UTC(2026, 9, 24);
const rows = ["date,steps,resting_hr,hrv_ms,sleep_hours,spo2,weight_kg,systolic,diastolic"];
for (let d = 89; d >= 0; d--) {
  const day = new Date(END - d * 86_400_000).toISOString().slice(0, 10);
  const recent = d < 7;
  const weekend = [0, 6].includes(new Date(END - d * 86_400_000).getUTCDay());
  const steps = Math.max(1200, Math.round(6400 + (weekend ? 1500 : 0) + gauss() * 1300 - (recent ? 1800 : 0)));
  const rhr = Math.round(62 + gauss() * 1.6 + (recent ? 8 : 0));
  const hrv = Math.round(41 + gauss() * 4 - (recent ? 10 : 0));
  const sleep = Math.round((6.7 + gauss() * 0.45 - (recent ? 0.7 : 0)) * 10) / 10;
  const spo2 = Math.round(96.5 + gauss() * 0.8);
  const weight = Math.round((84.2 - (89 - d) * 0.006 + gauss() * 0.3) * 10) / 10;
  const bp = d % 2 === 0 ? [Math.round(134 + gauss() * 4 + (recent ? 3 : 0)), Math.round(85 + gauss() * 3 + (recent ? 1 : 0))] : ["", ""];
  rows.push([day, steps, rhr, hrv, sleep, Math.min(100, spo2), d % 3 === 0 ? weight : "", ...bp].join(","));
}
writeFileSync("public/sample-wearables.csv", rows.join("\n") + "\n");

// --- FHIR R4 bundle --------------------------------------------------------------------------
const loinc = (code: string, display: string) => ({ coding: [{ system: "http://loinc.org", code, display }], text: display });
const obs = (code: string, display: string, value: number, unit: string, date: string) => ({
  resource: { resourceType: "Observation", status: "final", category: [{ coding: [{ code: "laboratory" }] }], code: loinc(code, display), valueQuantity: { value, unit }, effectiveDateTime: date },
});
const med = (text: string, dose: string, start: string) => ({ resource: { resourceType: "MedicationStatement", status: "active", medicationCodeableConcept: { text }, dosage: [{ text: dose }], effectiveDateTime: start } });
const cond = (text: string, snomed: string, onset: string) => ({
  resource: { resourceType: "Condition", clinicalStatus: { coding: [{ code: "active" }] }, code: { coding: [{ system: "http://snomed.info/sct", code: snomed, display: text }], text }, onsetDateTime: onset },
});
const bundle = {
  resourceType: "Bundle",
  type: "collection",
  meta: { tag: [{ display: "SYNTHETIC sample record for the Allele demo" }] },
  entry: [
    // Allele reads only birth year and sex from Patient. The name and address are here to show they are ignored.
    { resource: { resourceType: "Patient", name: [{ family: "Sample", given: ["Jordan"] }], gender: "male", birthDate: "1968-03-14", address: [{ city: "Springfield" }] } },
    cond("Coronary artery disease, status post drug-eluting stent", "53741008", "2025-11-02"),
    cond("Essential hypertension", "59621000", "2019-05-10"),
    cond("Hyperlipidemia", "55822004", "2018-09-01"),
    cond("Gastro-oesophageal reflux disease", "235595009", "2021-02-15"),
    cond("Depressive disorder", "35489007", "2023-06-20"),
    med("Clopidogrel 75 mg tablet", "75 mg once daily", "2025-11-03"),
    med("Aspirin 81 mg tablet", "81 mg once daily", "2025-11-03"),
    med("Simvastatin 40 mg tablet", "40 mg at night", "2018-10-01"),
    med("Omeprazole 20 mg capsule", "20 mg once daily", "2021-02-20"),
    med("Escitalopram 10 mg tablet", "10 mg once daily", "2023-07-01"),
    med("Lisinopril 10 mg tablet", "10 mg once daily", "2019-05-12"),
    { resource: { resourceType: "AllergyIntolerance", code: { text: "Penicillin" }, criticality: "high", reaction: [{ manifestation: [{ text: "Hives" }], severity: "moderate" }] } },
    obs("13457-7", "LDL cholesterol (calculated)", 142, "mg/dL", "2026-08-12"),
    obs("2085-9", "HDL cholesterol", 38, "mg/dL", "2026-08-12"),
    obs("2571-8", "Triglycerides", 188, "mg/dL", "2026-08-12"),
    obs("2093-3", "Total cholesterol", 212, "mg/dL", "2026-08-12"),
    obs("4548-4", "Hemoglobin A1c", 6.1, "%", "2026-08-12"),
    obs("33914-3", "eGFR", 74, "mL/min/1.73m2", "2026-08-12"),
    obs("2160-0", "Creatinine", 1.08, "mg/dL", "2026-08-12"),
    obs("2823-3", "Potassium", 4.7, "mmol/L", "2026-08-12"),
    obs("1742-6", "ALT", 32, "U/L", "2026-08-12"),
    obs("3016-3", "TSH", 2.1, "mIU/L", "2026-08-12"),
    obs("1989-3", "Vitamin D (25-OH)", 45, "nmol/L", "2026-08-12"),
    obs("718-7", "Hemoglobin", 14.6, "g/dL", "2026-08-12"),
    obs("13457-7", "LDL cholesterol (calculated)", 151, "mg/dL", "2025-12-04"),
    {
      resource: {
        resourceType: "Observation",
        status: "final",
        code: loinc("85354-9", "Blood pressure panel"),
        effectiveDateTime: "2026-08-12",
        component: [
          { code: loinc("8480-6", "Systolic blood pressure"), valueQuantity: { value: 138, unit: "mm[Hg]" } },
          { code: loinc("8462-4", "Diastolic blood pressure"), valueQuantity: { value: 86, unit: "mm[Hg]" } },
        ],
      },
    },
  ],
};
writeFileSync("public/sample-record.json", JSON.stringify(bundle, null, 2) + "\n");
console.log("✓ wrote public/sample-genome.txt, public/sample-wearables.csv, public/sample-record.json");
