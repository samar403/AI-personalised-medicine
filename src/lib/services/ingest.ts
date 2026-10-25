import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { allergies, conditions, genomes, labResults, medications, vaults, vitals, type Consents } from "@/lib/db/schema";
import { encryptJson } from "@/lib/crypto";
import { normalizeDrug } from "@/lib/clinical/drugs";
import type { ImportedRecord } from "@/lib/clinical/fhir";
import { PANEL_RSIDS, type GenomeFormat } from "@/lib/clinical/pgx";
import type { VitalRow } from "@/lib/clinical/vitals";
import { recordAudit } from "@/lib/audit";
import { HttpError } from "@/lib/errors";
import { getVault } from "./snapshot";
import { syncInsights } from "./insights";

export async function requireConsent(vaultId: string, kind: keyof Pick<Consents, "genomics" | "wearables" | "records">) {
  const vault = await getVault(vaultId);
  if (!vault.consents[kind]) {
    const label = { genomics: "genetic data", wearables: "wearable data", records: "health records" }[kind];
    throw new HttpError(403, `The vault owner hasn't consented to storing ${label}. Turn it on under Privacy & consent first.`);
  }
  return vault;
}

export async function saveGenome(
  vaultId: string,
  userId: string,
  input: { filename: string; format: GenomeFormat; totalVariants: number; calls: Record<string, string> },
) {
  await requireConsent(vaultId, "genomics");
  // Defence in depth: even if a client sends more, only panel variants are stored.
  const calls = Object.fromEntries(Object.entries(input.calls).filter(([rsid, gt]) => PANEL_RSIDS.has(rsid) && /^[ACGT]{1,2}$/.test(gt)));
  if (!Object.keys(calls).length) throw new HttpError(422, "None of the pharmacogenomic panel variants were found in this file. Check that it's a raw-data export (23andMe, AncestryDNA, MyHeritage or VCF).");
  const values = {
    filename: input.filename.slice(0, 200),
    format: input.format,
    totalVariants: input.totalVariants,
    keptVariants: Object.keys(calls).length,
    callsEncrypted: encryptJson(calls),
    uploadedBy: userId,
  };
  await db
    .insert(genomes)
    .values({ vaultId, ...values })
    .onConflictDoUpdate({ target: genomes.vaultId, set: { ...values, createdAt: new Date() } });
  await recordAudit({ vaultId, userId, action: "genome.uploaded", entityType: "genome", details: { format: input.format, totalVariants: input.totalVariants, kept: values.keptVariants } });
  const sync = await syncInsights(vaultId, userId, "genome");
  return { kept: values.keptVariants, discarded: Math.max(0, input.totalVariants - values.keptVariants), ...sync };
}

export async function saveVitals(vaultId: string, userId: string, rows: VitalRow[], source: string) {
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += 200) {
    await db
      .insert(vitals)
      .values(rows.slice(i, i + 200).map((r) => ({ vaultId, metric: r.metric, day: r.day, value: r.value, source })))
      .onConflictDoUpdate({ target: [vitals.vaultId, vitals.metric, vitals.day], set: { value: sql`excluded.value`, source: sql`excluded.source` } });
  }
  await recordAudit({ vaultId, userId, action: "vitals.imported", entityType: "vitals", details: { rows: rows.length, source } });
  return rows.length;
}

/** Imports a parsed FHIR record. Re-importing the same export does not create duplicates. */
export async function importRecord(vaultId: string, userId: string, rec: ImportedRecord, filename: string) {
  const vault = await requireConsent(vaultId, "records");
  const [existingMeds, existingConds, existingAllergies, existingLabs] = await Promise.all([
    db.query.medications.findMany({ where: eq(medications.vaultId, vaultId) }),
    db.query.conditions.findMany({ where: eq(conditions.vaultId, vaultId) }),
    db.query.allergies.findMany({ where: eq(allergies.vaultId, vaultId) }),
    db.query.labResults.findMany({ where: eq(labResults.vaultId, vaultId) }),
  ]);
  const key = (s: string) => s.trim().toLowerCase();

  const medDrugs = new Set(existingMeds.map((m) => m.drug));
  const newMeds = rec.medications
    .map((m) => ({ ...m, drug: normalizeDrug(m.name) }))
    .filter((m) => !medDrugs.has(m.drug) && (medDrugs.add(m.drug), true));
  const condNames = new Set(existingConds.map((c) => key(c.name)));
  const newConds = rec.conditions.filter((c) => !condNames.has(key(c.name)) && (condNames.add(key(c.name)), true));
  const allergyNames = new Set(existingAllergies.map((a) => key(a.substance)));
  const newAllergies = rec.allergies.filter((a) => !allergyNames.has(key(a.substance)) && (allergyNames.add(key(a.substance)), true));
  const labKeys = new Set(existingLabs.map((l) => `${l.test}|${l.name}|${l.takenAt.getTime()}`));
  const newLabs = rec.labs.filter((l) => {
    const k = `${l.test}|${l.name}|${l.takenAt.getTime()}`;
    return !labKeys.has(k) && (labKeys.add(k), true);
  });

  if (newMeds.length) await db.insert(medications).values(newMeds.map((m) => ({ vaultId, name: m.name, drug: m.drug, dose: m.dose, active: m.active, startedAt: m.startedAt, source: "record" as const })));
  if (newConds.length) await db.insert(conditions).values(newConds.map((c) => ({ vaultId, name: c.name, code: c.code, status: c.status, onsetAt: c.onsetAt, source: "record" as const })));
  if (newAllergies.length) await db.insert(allergies).values(newAllergies.map((a) => ({ vaultId, ...a, source: "record" as const })));
  for (let i = 0; i < newLabs.length; i += 200) {
    await db.insert(labResults).values(newLabs.slice(i, i + 200).map((l) => ({ vaultId, ...l, source: "record" as const })));
  }
  if (rec.vitals.length) await saveVitals(vaultId, userId, rec.vitals, "record");

  // Fill profile gaps from the record without overwriting what the owner entered.
  const profile = { ...vault.profile };
  if (!profile.birthYear && rec.birthYear) profile.birthYear = rec.birthYear;
  if (profile.sex === "unspecified" && (rec.sex === "female" || rec.sex === "male")) profile.sex = rec.sex;
  await db.update(vaults).set({ profile }).where(eq(vaults.id, vaultId));

  const counts = { medications: newMeds.length, conditions: newConds.length, allergies: newAllergies.length, labs: newLabs.length, vitals: rec.vitals.length, skipped: rec.skipped };
  await recordAudit({ vaultId, userId, action: "record.imported", entityType: "record", details: { filename, ...counts } });
  const sync = await syncInsights(vaultId, userId, "record");
  return { ...counts, ...sync };
}

export async function addMedication(vaultId: string, userId: string, input: { name: string; dose: string; reason: string }) {
  await requireConsent(vaultId, "records");
  const drug = normalizeDrug(input.name);
  const dup = await db.query.medications.findFirst({ where: and(eq(medications.vaultId, vaultId), eq(medications.drug, drug), eq(medications.active, true)) });
  if (dup) throw new HttpError(409, `${dup.name} is already on your active list.`);
  const [med] = await db.insert(medications).values({ vaultId, name: input.name, drug, dose: input.dose, reason: input.reason, startedAt: new Date() }).returning();
  await recordAudit({ vaultId, userId, action: "medication.added", entityType: "medication", entityId: med.id, details: { drug } });
  const sync = await syncInsights(vaultId, userId, "medication");
  return { medication: med, ...sync };
}
