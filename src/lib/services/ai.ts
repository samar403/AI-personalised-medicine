import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { briefs, carePlans, insights, type Vault } from "@/lib/db/schema";
import { isAIEnabled } from "@/lib/ai/client";
import { generateCarePlan } from "@/lib/ai/plan";
import { explainMedication } from "@/lib/ai/medcheck";
import { writeBriefNarrative } from "@/lib/ai/brief";
import { heuristicBrief, heuristicMedCheck, heuristicPlan } from "@/lib/ai/heuristics";
import { normalizeDrug } from "@/lib/clinical/drugs";
import { runFindings } from "@/lib/clinical/findings";
import { callGenes, geneDrugHits } from "@/lib/clinical/pgx";
import type { BriefContent } from "@/lib/brief";
import { recordAudit } from "@/lib/audit";
import { getVault, loadGenomeCalls, loadSnapshot } from "./snapshot";

/** Claude is used only when a key is configured AND the vault owner has opted in. */
export function aiAllowed(vault: Vault) {
  return isAIEnabled() && vault.consents.ai;
}

async function withFallback<T extends { model: string }>(run: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error("AI call failed, using the offline engine", err);
    const r = fallback();
    return { ...r, model: `${r.model} (Claude unavailable)` };
  }
}

export async function createCarePlan(vaultId: string, userId: string) {
  const vault = await getVault(vaultId);
  const snapshot = await loadSnapshot(vaultId);
  const findings = runFindings(snapshot);
  const useAI = aiAllowed(vault);
  const plan = await withFallback(
    () => generateCarePlan(snapshot, findings, useAI),
    () => heuristicPlan(snapshot, findings),
  );
  const [row] = await db.insert(carePlans).values({ vaultId, content: plan, model: plan.model, createdBy: userId }).returning();
  await recordAudit({ vaultId, userId, action: "care_plan.generated", entityType: "care_plan", entityId: row.id, details: { model: plan.model, sentToAI: useAI } });
  return row;
}

export async function latestCarePlan(vaultId: string) {
  return db.query.carePlans.findFirst({ where: eq(carePlans.vaultId, vaultId), orderBy: desc(carePlans.createdAt) });
}

/** Checks a medicine the person is considering against their genes, current medicines and allergies. */
export async function checkMedication(vaultId: string, userId: string, name: string) {
  const vault = await getVault(vaultId);
  const drug = normalizeDrug(name);
  const snapshot = await loadSnapshot(vaultId);
  const already = snapshot.meds.some((m) => m.drug === drug);
  const base = runFindings(snapshot);
  const withDrug = already ? base : runFindings({ ...snapshot, meds: [...snapshot.meds, { name, drug, dose: "" }] });
  const baseCodes = new Set(already ? [] : base.map((f) => f.ruleCode));
  const forDrug = withDrug.filter((f) => !baseCodes.has(f.ruleCode) && (!already || f.evidence.some((e) => e.detail.toLowerCase().includes(drug)) || f.ruleCode.endsWith(`:${drug}`)));

  const genome = await loadGenomeCalls(vaultId);
  const genes = genome ? callGenes(genome.calls) : null;
  const geneRelevant = genes ? geneDrugHits(drug, genes).length > 0 : false;
  const useAI = aiAllowed(vault);
  const explanation = await withFallback(
    () => explainMedication(drug, { ...snapshot, meds: withDrug === base ? snapshot.meds : [...snapshot.meds, { name, drug, dose: "" }] }, withDrug, forDrug, useAI),
    () => heuristicMedCheck(drug, forDrug),
  );
  await recordAudit({ vaultId, userId, action: "medication.checked", entityType: "medication", details: { drug, findings: forDrug.length, sentToAI: useAI } });
  return { drug, alreadyTaking: already, hasGenome: Boolean(genes), geneRelevant, findings: forDrug, explanation };
}

export async function createBrief(vaultId: string, userId: string) {
  const vault = await getVault(vaultId);
  const snapshot = await loadSnapshot(vaultId);
  const findings = runFindings(snapshot);
  const useAI = aiAllowed(vault);
  const narrative = await withFallback(
    () => writeBriefNarrative(snapshot, findings, useAI),
    () => heuristicBrief(snapshot, findings),
  );
  const open = await db.query.insights.findMany({ where: and(eq(insights.vaultId, vaultId), inArray(insights.status, ["new", "discussing", "reviewed"])) });
  const statusByCode = new Map(open.map((i) => [i.ruleCode, i.status]));
  const content: BriefContent = {
    generatedAt: new Date().toISOString(),
    patient: { age: snapshot.age, sex: snapshot.profile.sex, heightCm: snapshot.profile.heightCm, weightKg: snapshot.profile.weightKg, smoking: snapshot.profile.smoking },
    conditions: snapshot.conditions,
    medications: snapshot.meds.map((m) => ({
      name: m.name,
      dose: m.dose,
      flags: findings.filter((f) => f.evidence.some((e) => e.detail.toLowerCase().includes(m.name.toLowerCase()))).map((f) => f.title),
    })),
    allergies: snapshot.allergies,
    pharmacogenomics: (snapshot.genes ?? []).map((g) => ({ gene: g.gene, diplotype: g.diplotype, phenotype: g.phenotype, confidence: g.confidence, actionable: g.actionable })),
    labs: snapshot.labs
      .filter((l) => l.test !== "other")
      .sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime())
      .map((l) => ({ name: l.name, value: l.value, unit: l.unit, takenAt: l.takenAt.toISOString(), label: l.label, flag: l.flag })),
    vitals: snapshot.vitals.map((v) => ({ label: v.label, recent: v.recentMean, baseline: v.baselineMean, unit: v.unit, days: v.days })),
    findings: findings
      .filter((f) => statusByCode.get(f.ruleCode) !== undefined || !statusByCode.size)
      .map((f) => ({ title: f.title, priority: f.priority, recommendation: f.recommendation, evidenceLevel: f.evidenceLevel, evidence: f.evidence, status: statusByCode.get(f.ruleCode) ?? "new" })),
    narrative,
  };
  const title = `Pre-visit brief · ${new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`;
  const [row] = await db.insert(briefs).values({ vaultId, title, content, createdBy: userId }).returning();
  await recordAudit({ vaultId, userId, action: "brief.created", entityType: "brief", entityId: row.id, details: { model: narrative.model, sentToAI: useAI } });
  return row;
}
