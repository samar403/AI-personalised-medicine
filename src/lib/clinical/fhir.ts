// FHIR R4 import: Bundles (or single resources) exported from patient portals, Apple Health
// Records, Epic MyChart, Cerner and similar. Only clinical content is kept; names, addresses,
// identifiers and contact details are never read.
import { matchLab, normalizeLabValue } from "./labs";

type Json = Record<string, unknown>;

export interface ImportedRecord {
  birthYear: number | null;
  sex: string | null;
  conditions: { name: string; code: string | null; status: string; onsetAt: Date | null }[];
  medications: { name: string; dose: string; active: boolean; startedAt: Date | null }[];
  allergies: { substance: string; reaction: string; severity: string }[];
  labs: { test: string; name: string; loinc: string | null; value: number; unit: string; takenAt: Date }[];
  vitals: { metric: string; day: string; value: number }[];
  skipped: number;
}

const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");

function conceptText(c: unknown) {
  const cc = obj(c);
  return str(cc.text) || str(obj(arr(cc.coding)[0]).display) || str(obj(arr(cc.coding)[0]).code);
}

function codeFrom(c: unknown, system?: string) {
  const coding = arr(obj(c).coding).map(obj);
  const hit = system ? coding.find((x) => str(x.system).includes(system)) : coding[0];
  return hit ? str(hit.code) || null : null;
}

function date(v: unknown) {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const VITAL_LOINC: Record<string, string> = {
  "8480-6": "systolic",
  "8462-4": "diastolic",
  "8867-4": "resting_hr",
  "40443-4": "resting_hr",
  "29463-7": "weight",
  "3141-9": "weight",
  "59408-5": "spo2",
  "2708-6": "spo2",
};

export function parseFhir(input: unknown): ImportedRecord {
  const root = obj(input);
  const resources: Json[] =
    str(root.resourceType) === "Bundle" ? arr(root.entry).map((e) => obj(obj(e).resource)) : Array.isArray(input) ? (input as unknown[]).map(obj) : [root];
  if (!resources.some((r) => str(r.resourceType))) throw new Error("This doesn't look like a FHIR export. Upload a FHIR R4 Bundle in JSON.");

  const out: ImportedRecord = { birthYear: null, sex: null, conditions: [], medications: [], allergies: [], labs: [], vitals: [], skipped: 0 };
  const seenMeds = new Set<string>();

  for (const r of resources) {
    switch (str(r.resourceType)) {
      case "Patient": {
        // Data minimisation: birth year and administrative sex only.
        const by = Number(str(r.birthDate).slice(0, 4));
        out.birthYear = Number.isFinite(by) && by > 1900 ? by : null;
        out.sex = str(r.gender) || null;
        break;
      }
      case "Condition": {
        const name = conceptText(r.code);
        if (!name) {
          out.skipped++;
          break;
        }
        const status = str(obj(arr(obj(r.clinicalStatus).coding)[0]).code) || "active";
        out.conditions.push({ name, code: codeFrom(r.code, "snomed") ?? codeFrom(r.code, "icd") ?? codeFrom(r.code), status, onsetAt: date(r.onsetDateTime) ?? date(r.recordedDate) });
        break;
      }
      case "MedicationStatement":
      case "MedicationRequest": {
        const name = conceptText(r.medicationCodeableConcept) || str(obj(r.medicationReference).display);
        if (!name || seenMeds.has(name.toLowerCase())) {
          if (!name) out.skipped++;
          break;
        }
        seenMeds.add(name.toLowerCase());
        const dosage = obj(arr(r.dosage ?? r.dosageInstruction)[0]);
        const status = str(r.status) || "active";
        out.medications.push({ name, dose: str(dosage.text), active: ["active", "intended", "on-hold"].includes(status), startedAt: date(r.authoredOn) ?? date(r.effectiveDateTime) ?? date(obj(r.effectivePeriod).start) });
        break;
      }
      case "AllergyIntolerance": {
        const substance = conceptText(r.code);
        if (!substance) {
          out.skipped++;
          break;
        }
        const reaction = obj(arr(r.reaction)[0]);
        out.allergies.push({ substance, reaction: conceptText(arr(reaction.manifestation)[0]), severity: str(reaction.severity) || str(r.criticality) || "unknown" });
        break;
      }
      case "Observation": {
        const loinc = codeFrom(r.code, "loinc");
        const when = date(r.effectiveDateTime) ?? date(r.issued) ?? date(obj(r.effectivePeriod).start);
        if (!when) {
          out.skipped++;
          break;
        }
        const day = when.toISOString().slice(0, 10);
        const components = arr(r.component).map(obj);
        if (components.length) {
          for (const c of components) {
            const metric = VITAL_LOINC[codeFrom(c.code, "loinc") ?? ""];
            const v = Number(obj(c.valueQuantity).value);
            if (metric && Number.isFinite(v)) out.vitals.push({ metric, day, value: v });
          }
          break;
        }
        const q = obj(r.valueQuantity);
        const value = Number(q.value);
        if (!Number.isFinite(value) || q.value === undefined) {
          out.skipped++;
          break;
        }
        const unit = str(q.unit) || str(q.code);
        if (loinc && VITAL_LOINC[loinc]) {
          out.vitals.push({ metric: VITAL_LOINC[loinc], day, value: VITAL_LOINC[loinc] === "weight" && /lb/i.test(unit) ? Math.round(value * 0.4536 * 10) / 10 : value });
          break;
        }
        const name = conceptText(r.code);
        const def = matchLab({ loinc, name });
        if (def) {
          const n = normalizeLabValue(def, value, unit);
          out.labs.push({ test: def.key, name: def.name, loinc, value: n.value, unit: n.unit, takenAt: when });
        } else if (name) {
          out.labs.push({ test: "other", name, loinc, value, unit, takenAt: when });
        } else out.skipped++;
        break;
      }
      default:
        break;
    }
  }
  return out;
}
