import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { allergies, conditions, genomes, labResults, medications, vaults, vitals } from "@/lib/db/schema";
import { parseBody, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { CONSENT_VERSION } from "@/lib/consent";
import { getVault } from "@/lib/services/snapshot";
import { syncInsights } from "@/lib/services/insights";

const Body = z.object({ genomics: z.boolean(), wearables: z.boolean(), records: z.boolean(), ai: z.boolean() });

/** Updates consent. Withdrawing consent for a data type deletes that data straight away. */
export const PATCH = withAuth("owner", async ({ req, user }) => {
  const next = await parseBody(req, Body);
  const prev = (await getVault(user.vaultId)).consents;
  const v = user.vaultId;
  const deleted: string[] = [];
  if (prev.genomics && !next.genomics) {
    await db.delete(genomes).where(eq(genomes.vaultId, v));
    deleted.push("genetic data");
  }
  if (prev.wearables && !next.wearables) {
    await db.delete(vitals).where(and(eq(vitals.vaultId, v), ne(vitals.source, "record")));
    deleted.push("wearable data");
  }
  if (prev.records && !next.records) {
    await Promise.all([
      db.delete(medications).where(eq(medications.vaultId, v)),
      db.delete(conditions).where(eq(conditions.vaultId, v)),
      db.delete(allergies).where(eq(allergies.vaultId, v)),
      db.delete(labResults).where(eq(labResults.vaultId, v)),
      db.delete(vitals).where(and(eq(vitals.vaultId, v), eq(vitals.source, "record"))),
    ]);
    deleted.push("health records");
  }
  const consents = { ...next, acceptedAt: new Date().toISOString(), version: CONSENT_VERSION };
  const [vault] = await db.update(vaults).set({ consents }).where(eq(vaults.id, v)).returning();
  await recordAudit({ vaultId: v, userId: user.id, action: "consent.updated", entityType: "vault", entityId: v, details: { from: prev, to: next, deleted } });
  if (deleted.length) await syncInsights(v, user.id, "consent withdrawn");
  return Response.json({ vault, deleted });
});
