import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { vaults } from "@/lib/db/schema";
import { destroySession, verifyPassword } from "@/lib/auth";
import { HttpError, parseBody, withAuth } from "@/lib/api";

const Body = z.object({ confirm: z.literal("DELETE", "Type DELETE to confirm."), password: z.string().min(1) });

/** Right to erasure: permanently deletes the vault and every row that belongs to it (cascade), including the access log. */
export const DELETE = withAuth("owner", async ({ req, user }) => {
  const body = await parseBody(req, Body);
  const me = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, user.id) });
  if (!me || !(await verifyPassword(body.password, me.passwordHash))) throw new HttpError(401, "Password is incorrect.");
  await db.delete(vaults).where(eq(vaults.id, user.vaultId));
  await destroySession();
  return Response.json({ ok: true });
});
