import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { medications } from "@/lib/db/schema";
import { HttpError, parseBody, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { syncInsights } from "@/lib/services/insights";

const Body = z.object({ active: z.boolean().optional(), dose: z.string().trim().max(120).optional() });

/** Marks a medicine as stopped (it stays in history) or updates the dose text. */
export const PATCH = withAuth<{ id: string }>("clinician", async ({ req, user, params }) => {
  const body = await parseBody(req, Body);
  const [med] = await db.update(medications).set(body).where(and(eq(medications.id, params.id), eq(medications.vaultId, user.vaultId))).returning();
  if (!med) throw new HttpError(404, "Medication not found.");
  await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "medication.updated", entityType: "medication", entityId: med.id, details: body });
  return Response.json({ medication: med, ...(await syncInsights(user.vaultId, user.id, "medication")) });
});

export const DELETE = withAuth<{ id: string }>("clinician", async ({ user, params }) => {
  const deleted = await db.delete(medications).where(and(eq(medications.id, params.id), eq(medications.vaultId, user.vaultId))).returning({ id: medications.id });
  if (!deleted.length) throw new HttpError(404, "Medication not found.");
  await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "medication.deleted", entityType: "medication", entityId: params.id });
  await syncInsights(user.vaultId, user.id, "medication");
  return Response.json({ ok: true });
});
