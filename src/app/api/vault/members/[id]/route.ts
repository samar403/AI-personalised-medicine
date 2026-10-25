import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { HttpError, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

/** Revokes someone's access. Their account is removed, so their session stops working immediately. */
export const DELETE = withAuth<{ id: string }>("owner", async ({ user, params }) => {
  if (params.id === user.id) throw new HttpError(400, "You can't remove yourself. Delete the vault instead.");
  const [removed] = await db.delete(users).where(and(eq(users.id, params.id), eq(users.vaultId, user.vaultId))).returning({ email: users.email, role: users.role });
  if (!removed) throw new HttpError(404, "Member not found.");
  await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "access.revoked", entityType: "user", entityId: params.id, details: removed });
  return Response.json({ ok: true });
});
