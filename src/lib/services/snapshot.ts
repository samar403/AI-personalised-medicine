import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { allergies, conditions, genomes, labResults, medications, vaults, vitals } from "@/lib/db/schema";
import { decryptJson } from "@/lib/crypto";
import { callGenes } from "@/lib/clinical/pgx";
import { ageFrom, latestLabs, type Snapshot } from "@/lib/clinical/findings";
import { summarizeVitals } from "@/lib/clinical/vitals";
import { HttpError } from "@/lib/errors";

export async function getVault(vaultId: string) {
  const vault = await db.query.vaults.findFirst({ where: eq(vaults.id, vaultId) });
  if (!vault) throw new HttpError(404, "Health vault not found.");
  return vault;
}

export async function loadGenomeCalls(vaultId: string) {
  const g = await db.query.genomes.findFirst({ where: eq(genomes.vaultId, vaultId) });
  return g ? { genome: g, calls: decryptJson<Record<string, string>>(g.callsEncrypted) } : null;
}

/** Everything the findings engine and the AI need, assembled from one vault. */
export async function loadSnapshot(vaultId: string): Promise<Snapshot> {
  const [vault, meds, conds, alls, labs, vit, genome] = await Promise.all([
    getVault(vaultId),
    db.query.medications.findMany({ where: and(eq(medications.vaultId, vaultId), eq(medications.active, true)) }),
    db.query.conditions.findMany({ where: eq(conditions.vaultId, vaultId) }),
    db.query.allergies.findMany({ where: eq(allergies.vaultId, vaultId) }),
    db.query.labResults.findMany({ where: eq(labResults.vaultId, vaultId) }),
    db.select({ metric: vitals.metric, day: vitals.day, value: vitals.value }).from(vitals).where(eq(vitals.vaultId, vaultId)),
    loadGenomeCalls(vaultId),
  ]);
  return {
    profile: vault.profile,
    age: ageFrom(vault.profile.birthYear),
    meds: meds.map((m) => ({ name: m.name, drug: m.drug, dose: m.dose })),
    conditions: conds.filter((c) => !["resolved", "inactive", "remission"].includes(c.status)).map((c) => c.name),
    allergies: alls.map((a) => ({ substance: a.substance, reaction: a.reaction })),
    genes: genome ? callGenes(genome.calls) : null,
    labs: latestLabs(labs, vault.profile.sex),
    vitals: summarizeVitals(vit),
  };
}
