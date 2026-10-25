import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { insightNotes, insights, users } from "@/lib/db/schema";
import { HttpError, parseBody, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

async function find(vaultId: string, id: string) {
  const item = await db.query.insights.findFirst({ where: and(eq(insights.id, id), eq(insights.vaultId, vaultId)) });
  if (!item) throw new HttpError(404, "Insight not found.");
  return item;
}

export const GET = withAuth<{ id: string }>("caregiver", async ({ user, params }) => {
  const item = await find(user.vaultId, params.id);
  const notes = await db
    .select({ id: insightNotes.id, body: insightNotes.body, createdAt: insightNotes.createdAt, author: users.name, role: users.role })
    .from(insightNotes)
    .leftJoin(users, eq(users.id, insightNotes.userId))
    .where(eq(insightNotes.insightId, item.id))
    .orderBy(asc(insightNotes.createdAt));
  const reviewer = item.reviewedBy ? await db.query.users.findFirst({ where: eq(users.id, item.reviewedBy), columns: { name: true, role: true } }) : null;
  return Response.json({ item, notes, reviewer });
});

const Body = z
  .object({ status: z.enum(["new", "discussing", "reviewed", "dismissed"]), reviewNote: z.string().trim().max(2000).default("") })
  .refine((b) => b.status !== "dismissed" || b.reviewNote.length >= 5, { message: "Say briefly why you're dismissing this.", path: ["reviewNote"] });

/** Owners and clinicians move an insight through its workflow. Only a clinician can mark it clinician-reviewed. */
export const PATCH = withAuth<{ id: string }>("clinician", async ({ req, user, params }) => {
  const prev = await find(user.vaultId, params.id);
  const body = await parseBody(req, Body);
  if (body.status === "reviewed" && user.role !== "clinician") throw new HttpError(403, "Only a clinician on your care team can mark an insight as clinician-reviewed.");
  const [item] = await db
    .update(insights)
    .set({ status: body.status, reviewNote: body.reviewNote, reviewedBy: body.status === "reviewed" ? user.id : prev.reviewedBy, updatedAt: new Date() })
    .where(eq(insights.id, prev.id))
    .returning();
  await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "insight.status_changed", entityType: "insight", entityId: item.id, details: { from: prev.status, to: item.status } });
  return Response.json({ item });
});
