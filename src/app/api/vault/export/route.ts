import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { allergies, auditLog, briefs, carePlans, conditions, insightNotes, insights, labResults, medications, users, vitals } from "@/lib/db/schema";
import { withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { callGenes } from "@/lib/clinical/pgx";
import { getVault, loadGenomeCalls } from "@/lib/services/snapshot";

/** Data portability: everything in the vault as one JSON file, genotype calls decrypted. */
export const GET = withAuth("owner", async ({ user }) => {
  const v = user.vaultId;
  const [vault, genome, meds, conds, alls, labs, vit, ins, plans, brs, members, log] = await Promise.all([
    getVault(v),
    loadGenomeCalls(v),
    db.query.medications.findMany({ where: eq(medications.vaultId, v) }),
    db.query.conditions.findMany({ where: eq(conditions.vaultId, v) }),
    db.query.allergies.findMany({ where: eq(allergies.vaultId, v) }),
    db.query.labResults.findMany({ where: eq(labResults.vaultId, v) }),
    db.query.vitals.findMany({ where: eq(vitals.vaultId, v) }),
    db.query.insights.findMany({ where: eq(insights.vaultId, v) }),
    db.query.carePlans.findMany({ where: eq(carePlans.vaultId, v) }),
    db.query.briefs.findMany({ where: eq(briefs.vaultId, v) }),
    db.select({ name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.vaultId, v)),
    db.query.auditLog.findMany({ where: eq(auditLog.vaultId, v) }),
  ]);
  const notes = ins.length ? await db.query.insightNotes.findMany({ where: inArray(insightNotes.insightId, ins.map((i) => i.id)) }) : [];
  await recordAudit({ vaultId: v, userId: user.id, action: "vault.exported", entityType: "vault", entityId: v });
  const payload = {
    exportedAt: new Date().toISOString(),
    format: "allele-export/v1",
    vault: { name: vault.name, profile: vault.profile, consents: vault.consents },
    members,
    genome: genome ? { ...genome.genome, callsEncrypted: undefined, calls: genome.calls, interpretation: callGenes(genome.calls) } : null,
    medications: meds,
    conditions: conds,
    allergies: alls,
    labs,
    vitals: vit,
    insights: ins,
    insightNotes: notes,
    carePlans: plans,
    briefs: brs,
    accessLog: log,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="allele-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
});
