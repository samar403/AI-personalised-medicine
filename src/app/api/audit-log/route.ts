import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
import { withAuth } from "@/lib/api";

export const GET = withAuth("owner", async ({ user }) => {
  const items = await db
    .select({ entry: auditLog, actor: users.name, actorRole: users.role })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(eq(auditLog.vaultId, user.vaultId))
    .orderBy(desc(auditLog.createdAt))
    .limit(300);
  return Response.json({ items });
});
