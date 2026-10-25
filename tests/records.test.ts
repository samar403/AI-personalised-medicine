import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFhir } from "@/lib/clinical/fhir";
import { interpretLab, matchLab, normalizeLabValue } from "@/lib/clinical/labs";
import { parseVitalsCsv, summarizeVitals } from "@/lib/clinical/vitals";

describe("labs", () => {
  it("matches by LOINC first, then by name", () => {
    expect(matchLab({ loinc: "4548-4" })?.key).toBe("hba1c");
    expect(matchLab({ name: "LDL Cholesterol [Mass/volume] in Serum" })?.key).toBe("ldl");
  });
  it("converts SI units", () => {
    expect(normalizeLabValue(matchLab({ loinc: "1989-3" })!, 45, "nmol/L").value).toBeCloseTo(18.03, 1);
    expect(normalizeLabValue(matchLab({ loinc: "13457-7" })!, 3.0, "mmol/L").value).toBeCloseTo(116, 0);
    expect(normalizeLabValue(matchLab({ loinc: "4548-4" })!, 48, "mmol/mol").value).toBeCloseTo(6.54, 1);
  });
  it("interprets with guideline bands, and refuses unknown units", () => {
    expect(interpretLab("hba1c", 6.1, "%")?.flag).toBe("borderline");
    expect(interpretLab("egfr", 42, "mL/min/1.73m²")?.label).toMatch(/G3/);
    expect(interpretLab("potassium", 6.2, "mmol/L")?.flag).toBe("critical");
    expect(interpretLab("ldl", 3.5, "mmol/L")).toBeNull();
  });
});

describe("FHIR import", () => {
  const rec = parseFhir(JSON.parse(readFileSync("public/sample-record.json", "utf8")));
  it("keeps clinical content and only birth year and sex from Patient", () => {
    expect(rec.birthYear).toBe(1968);
    expect(rec.sex).toBe("male");
    expect(JSON.stringify(rec)).not.toContain("Springfield");
    expect(JSON.stringify(rec)).not.toContain("Jordan");
  });
  it("reads conditions, medications, allergies, labs and BP components", () => {
    expect(rec.conditions.map((c) => c.name)).toContain("Essential hypertension");
    expect(rec.medications.find((m) => m.name.startsWith("Clopidogrel"))?.dose).toBe("75 mg once daily");
    expect(rec.allergies[0]).toMatchObject({ substance: "Penicillin", reaction: "Hives" });
    expect(rec.labs.find((l) => l.test === "vitamin_d")?.unit).toBe("ng/mL");
    expect(rec.vitals).toEqual(expect.arrayContaining([{ metric: "systolic", day: "2026-08-12", value: 138 }]));
  });
  it("rejects files that are not FHIR", () => {
    expect(() => parseFhir({ hello: "world" })).toThrow(/FHIR/);
  });
});

describe("wearables", () => {
  it("parses wide CSVs and computes a personal baseline", () => {
    const { rows, metrics } = parseVitalsCsv(readFileSync("public/sample-wearables.csv", "utf8"));
    expect(metrics).toEqual(expect.arrayContaining(["steps", "resting_hr", "hrv", "sleep_hours", "systolic"]));
    const rhr = summarizeVitals(rows).find((s) => s.metric === "resting_hr")!;
    expect(rhr.baselineMean).toBeGreaterThan(58);
    expect(rhr.delta).toBeGreaterThanOrEqual(7);
  });
  it("parses long CSVs, converts units, rolls up per day and drops impossible values", () => {
    const csv = "date,type,value,unit\n2026-10-01T07:00:00Z,steps,3000,count\n2026-10-01T19:00:00Z,steps,2500,count\n2026-10-01,weight,180,lb\n2026-10-01,resting heart rate,400,bpm\n2026-10-02,sleep,420,min\n";
    const { rows, skipped } = parseVitalsCsv(csv);
    expect(rows).toEqual(
      expect.arrayContaining([
        { metric: "steps", day: "2026-10-01", value: 5500 },
        { metric: "weight", day: "2026-10-01", value: 81.6 },
        { metric: "sleep_hours", day: "2026-10-02", value: 7 },
      ]),
    );
    expect(skipped).toBe(1);
  });
  it("explains a missing date column", () => {
    expect(() => parseVitalsCsv("steps\n100\n")).toThrow(/date column/);
  });
});
