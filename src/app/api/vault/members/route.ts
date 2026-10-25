import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth";
import { HttpError, parseBody, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

export const GET = withAuth("caregiver", async ({ user }) => {
  const items = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.vaultId, user.vaultId))
    .orderBy(asc(users.createdAt));
  return Response.json({ items });
});

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().trim().toLowerCase(),
  role: z.enum(["clinician", "caregiver"]),
  password: z.string().min(10).max(200),
});

/** The owner shares the vault with a clinician or caregiver, using a temporary password shared out of band. */
export const POST = withAuth("owner", async ({ req, user }) => {
  const body = await parseBody(req, Body);
  if (await db.query.users.findFirst({ where: eq(users.email, body.email) })) throw new HttpError(409, "That email already has an account.");
  const [member] = await db
    .insert(users)
    .values({ vaultId: user.vaultId, name: body.name, email: body.email, role: body.role, passwordHash: await hashPassword(body.password) })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
  await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "access.granted", entityType: "user", entityId: member.id, details: { email: member.email, role: member.role } });
  return Response.json({ member }, { status: 201 });
});
