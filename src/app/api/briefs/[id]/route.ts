import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { briefs } from "@/lib/db/schema";
import { HttpError, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

export const GET = withAuth<{ id: string }>("caregiver", async ({ user, params }) => {
  const brief = await db.query.briefs.findFirst({ where: and(eq(briefs.id, params.id), eq(briefs.vaultId, user.vaultId)) });
  if (!brief) throw new HttpError(404, "Brief not found.");
  if (user.role !== "owner") await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "brief.viewed", entityType: "brief", entityId: brief.id });
  return Response.json({ brief });
});

export const DELETE = withAuth<{ id: string }>("owner", async ({ user, params }) => {
  const deleted = await db.delete(briefs).where(and(eq(briefs.id, params.id), eq(briefs.vaultId, user.vaultId))).returning({ id: briefs.id });
  if (!deleted.length) throw new HttpError(404, "Brief not found.");
  await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "brief.deleted", entityType: "brief", entityId: params.id });
  return Response.json({ ok: true });
});
