// Client-safe lab dictionary: LOINC mapping, unit conversion to US conventional units, and
// interpretation bands from widely used guidelines (ADA, ACC/AHA, KDIGO, Endocrine Society).
// Bands are for adults and are a guide only; the lab's own reference range wins.

export type LabFlag = "normal" | "borderline" | "high" | "low" | "critical";

export interface LabDef {
  key: string;
  name: string;
  unit: string;
  loinc: string[];
  aliases: string[];
  /** Converts a value in another unit to `unit`; returns null when the unit is not recognised. */
  convert?: (value: number, unit: string) => number | null;
  interpret: (value: number, sex?: string) => { flag: LabFlag; label: string };
}

const u = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export const LABS: LabDef[] = [
  {
    key: "hba1c",
    name: "HbA1c",
    unit: "%",
    loinc: ["4548-4", "17856-6", "59261-8"],
    aliases: ["hba1c", "a1c", "hemoglobin a1c", "glycated hemoglobin", "glycosylated hemoglobin"],
    convert: (v, unit) => (u(unit).includes("mmol/mol") ? v / 10.929 + 2.15 : null),
    interpret: (v) =>
      v >= 6.5 ? { flag: "high", label: "In the diabetes range (6.5% or above)" } : v >= 5.7 ? { flag: "borderline", label: "In the prediabetes range (5.7-6.4%)" } : { flag: "normal", label: "Normal (below 5.7%)" },
  },
  {
    key: "glucose",
    name: "Fasting glucose",
    unit: "mg/dL",
    loinc: ["1558-6", "2345-7", "2339-0"],
    aliases: ["glucose", "fasting glucose", "blood glucose"],
    convert: (v, unit) => (u(unit).includes("mmol") ? v * 18.016 : null),
    interpret: (v) =>
      v < 54 ? { flag: "critical", label: "Very low" } : v < 70 ? { flag: "low", label: "Low" } : v >= 126 ? { flag: "high", label: "In the diabetes range if fasting (126+)" } : v >= 100 ? { flag: "borderline", label: "Impaired fasting glucose (100-125)" } : { flag: "normal", label: "Normal" },
  },
  {
    key: "ldl",
    name: "LDL cholesterol",
    unit: "mg/dL",
    loinc: ["13457-7", "18262-6", "2089-1"],
    aliases: ["ldl", "ldl cholesterol", "ldl-c", "low density lipoprotein"],
    convert: (v, unit) => (u(unit).includes("mmol") ? v * 38.67 : null),
    interpret: (v) =>
      v >= 190 ? { flag: "high", label: "Very high (190+)" } : v >= 160 ? { flag: "high", label: "High (160-189)" } : v >= 130 ? { flag: "borderline", label: "Borderline high (130-159)" } : { flag: "normal", label: v < 100 ? "Optimal" : "Near optimal" },
  },
  {
    key: "hdl",
    name: "HDL cholesterol",
    unit: "mg/dL",
    loinc: ["2085-9"],
    aliases: ["hdl", "hdl cholesterol", "hdl-c"],
    convert: (v, unit) => (u(unit).includes("mmol") ? v * 38.67 : null),
    interpret: (v, sex) => (v < (sex === "female" ? 50 : 40) ? { flag: "low", label: "Low" } : { flag: "normal", label: "Normal" }),
  },
  {
    key: "triglycerides",
    name: "Triglycerides",
    unit: "mg/dL",
    loinc: ["2571-8"],
    aliases: ["triglycerides", "trig", "tg"],
    convert: (v, unit) => (u(unit).includes("mmol") ? v * 88.57 : null),
    interpret: (v) => (v >= 500 ? { flag: "critical", label: "Very high (pancreatitis risk)" } : v >= 150 ? { flag: "high", label: "High" } : { flag: "normal", label: "Normal" }),
  },
  {
    key: "total_cholesterol",
    name: "Total cholesterol",
    unit: "mg/dL",
    loinc: ["2093-3"],
    aliases: ["total cholesterol", "cholesterol"],
    convert: (v, unit) => (u(unit).includes("mmol") ? v * 38.67 : null),
    interpret: (v) => (v >= 240 ? { flag: "high", label: "High" } : v >= 200 ? { flag: "borderline", label: "Borderline high" } : { flag: "normal", label: "Desirable" }),
  },
  {
    key: "egfr",
    name: "eGFR",
    unit: "mL/min/1.73m²",
    loinc: ["33914-3", "48642-3", "48643-1", "62238-1", "98979-8", "88293-6", "88294-4"],
    aliases: ["egfr", "estimated gfr", "gfr"],
    interpret: (v) =>
      v < 15
        ? { flag: "critical", label: "Kidney failure range (G5)" }
        : v < 30
          ? { flag: "high", label: "Severely reduced (G4)" }
          : v < 60
            ? { flag: "high", label: "Moderately reduced (G3)" }
            : v < 90
              ? { flag: "borderline", label: "Mildly reduced (G2)" }
              : { flag: "normal", label: "Normal (G1)" },
  },
  {
    key: "creatinine",
    name: "Creatinine",
    unit: "mg/dL",
    loinc: ["2160-0", "38483-4"],
    aliases: ["creatinine", "serum creatinine"],
    convert: (v, unit) => (u(unit).includes("umol") || u(unit).includes("µmol") ? v / 88.4 : null),
    interpret: (v, sex) => (v > (sex === "female" ? 1.1 : 1.3) ? { flag: "high", label: "Above typical range" } : { flag: "normal", label: "Typical" }),
  },
  {
    key: "potassium",
    name: "Potassium",
    unit: "mmol/L",
    loinc: ["2823-3", "6298-4"],
    aliases: ["potassium", "k"],
    interpret: (v) =>
      v >= 6 || v < 3 ? { flag: "critical", label: v >= 6 ? "Dangerously high" : "Dangerously low" } : v > 5.0 ? { flag: "high", label: "High" } : v < 3.5 ? { flag: "low", label: "Low" } : { flag: "normal", label: "Normal" },
  },
  {
    key: "sodium",
    name: "Sodium",
    unit: "mmol/L",
    loinc: ["2951-2", "2947-0"],
    aliases: ["sodium", "na"],
    interpret: (v) => (v < 125 || v > 155 ? { flag: "critical", label: "Dangerously abnormal" } : v < 135 ? { flag: "low", label: "Low" } : v > 145 ? { flag: "high", label: "High" } : { flag: "normal", label: "Normal" }),
  },
  {
    key: "alt",
    name: "ALT",
    unit: "U/L",
    loinc: ["1742-6", "1743-4"],
    aliases: ["alt", "alanine aminotransferase", "sgpt"],
    interpret: (v) => (v > 120 ? { flag: "high", label: "Over 3 times the upper limit" } : v > 40 ? { flag: "borderline", label: "Mildly raised" } : { flag: "normal", label: "Normal" }),
  },
  {
    key: "tsh",
    name: "TSH",
    unit: "mIU/L",
    loinc: ["3016-3", "11580-8"],
    aliases: ["tsh", "thyroid stimulating hormone", "thyrotropin"],
    interpret: (v) => (v > 10 ? { flag: "high", label: "Clearly raised" } : v > 4.5 ? { flag: "borderline", label: "Mildly raised" } : v < 0.4 ? { flag: "low", label: "Low" } : { flag: "normal", label: "Normal" }),
  },
  {
    key: "vitamin_d",
    name: "Vitamin D (25-OH)",
    unit: "ng/mL",
    loinc: ["1989-3", "62292-8", "14635-7"],
    aliases: ["vitamin d", "25-hydroxyvitamin d", "25-oh vitamin d", "25(oh)d"],
    convert: (v, unit) => (u(unit).includes("nmol") ? v / 2.496 : null),
    interpret: (v) => (v < 20 ? { flag: "low", label: "Deficient (below 20)" } : v < 30 ? { flag: "borderline", label: "Insufficient (20-29)" } : { flag: "normal", label: "Sufficient" }),
  },
  {
    key: "b12",
    name: "Vitamin B12",
    unit: "pg/mL",
    loinc: ["2132-9"],
    aliases: ["vitamin b12", "b12", "cobalamin"],
    convert: (v, unit) => (u(unit).includes("pmol") ? v * 1.355 : null),
    interpret: (v) => (v < 200 ? { flag: "low", label: "Low" } : v < 300 ? { flag: "borderline", label: "Borderline" } : { flag: "normal", label: "Normal" }),
  },
  {
    key: "hemoglobin",
    name: "Haemoglobin",
    unit: "g/dL",
    loinc: ["718-7"],
    aliases: ["hemoglobin", "haemoglobin", "hgb", "hb"],
    convert: (v, unit) => (u(unit) === "g/l" ? v / 10 : null),
    interpret: (v, sex) => (v < 8 ? { flag: "critical", label: "Severely low" } : v < (sex === "male" ? 13.5 : 12) ? { flag: "low", label: "Low (anaemia)" } : v > 17.5 ? { flag: "high", label: "High" } : { flag: "normal", label: "Normal" }),
  },
  {
    key: "inr",
    name: "INR",
    unit: "",
    loinc: ["6301-6", "34714-6"],
    aliases: ["inr", "pt/inr", "international normalized ratio"],
    interpret: (v) => (v >= 5 ? { flag: "critical", label: "Very high (bleeding risk)" } : v > 3.5 ? { flag: "high", label: "Above most warfarin targets" } : v < 2 ? { flag: "low", label: "Below most warfarin targets (2-3)" } : { flag: "normal", label: "In the usual 2-3 range" }),
  },
  {
    key: "crp",
    name: "hs-CRP",
    unit: "mg/L",
    loinc: ["30522-7", "1988-5"],
    aliases: ["crp", "hs-crp", "c-reactive protein"],
    interpret: (v) => (v > 10 ? { flag: "high", label: "Raised (likely acute inflammation)" } : v > 3 ? { flag: "borderline", label: "Higher cardiovascular risk band" } : { flag: "normal", label: "Low or average risk band" }),
  },
];

const byKey = new Map(LABS.map((l) => [l.key, l]));

export function labDef(key: string) {
  return byKey.get(key);
}

/** Finds the lab by LOINC code first, then by name. */
export function matchLab(opts: { loinc?: string | null; name?: string | null }) {
  if (opts.loinc) {
    const hit = LABS.find((l) => l.loinc.includes(opts.loinc!));
    if (hit) return hit;
  }
  const n = (opts.name ?? "").toLowerCase().replace(/\[.*?\]|\(.*?\)/g, "").replace(/\s+in\s+(serum|plasma|blood).*$/, "").trim();
  if (!n) return undefined;
  return LABS.find((l) => l.aliases.includes(n)) ?? LABS.find((l) => l.aliases.some((a) => a.length > 3 && n.includes(a)));
}

/** Returns the value in the dictionary's unit, converting when the source unit differs. */
export function normalizeLabValue(def: LabDef, value: number, unit: string) {
  if (!unit || u(unit) === u(def.unit)) return { value, unit: def.unit };
  const converted = def.convert?.(value, unit);
  return converted != null ? { value: Math.round(converted * 100) / 100, unit: def.unit } : { value, unit };
}

export function interpretLab(key: string, value: number, unit: string, sex?: string) {
  const def = byKey.get(key);
  // Only interpret when we are sure the value is in the dictionary unit.
  if (!def || (unit && def.unit && u(unit) !== u(def.unit))) return null;
  return def.interpret(value, sex);
}
