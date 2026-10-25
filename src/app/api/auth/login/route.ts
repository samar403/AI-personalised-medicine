import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession, verifyPassword } from "@/lib/auth";
import { errorResponse, HttpError, parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const Body = z.object({ email: z.email().trim().toLowerCase(), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, Body);
    if (!rateLimit(`login:${clientKey(req)}:${body.email}`, 10, 15 * 60_000)) throw new HttpError(429, "Too many attempts. Wait 15 minutes and try again.");
    const user = await db.query.users.findFirst({ where: eq(users.email, body.email) });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) throw new HttpError(401, "Email or password is incorrect.");
    await createSession(user);
    await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "user.login", entityType: "user", entityId: user.id });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
