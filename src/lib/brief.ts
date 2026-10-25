import type { Evidence, Priority } from "@/lib/db/schema";

/** A frozen, point-in-time pre-visit brief. Stored as JSON so later data changes don't alter it. */
export interface BriefContent {
  generatedAt: string;
  patient: { age: number | null; sex: string; heightCm: number | null; weightKg: number | null; smoking: string };
  conditions: string[];
  medications: { name: string; dose: string; flags: string[] }[];
  allergies: { substance: string; reaction: string }[];
  pharmacogenomics: { gene: string; diplotype: string; phenotype: string; confidence: string; actionable: boolean }[];
  labs: { name: string; value: number; unit: string; takenAt: string; label: string | null; flag: string | null }[];
  vitals: { label: string; recent: number; baseline: number | null; unit: string; days: number }[];
  findings: { title: string; priority: Priority; recommendation: string; evidenceLevel: string; evidence: Evidence[]; status: string }[];
  narrative: { summary: string; discussionPoints: string[]; model: string };
}
