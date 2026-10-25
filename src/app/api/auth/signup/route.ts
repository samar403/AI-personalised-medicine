import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, vaults } from "@/lib/db/schema";
import { createSession, hashPassword } from "@/lib/auth";
import { errorResponse, HttpError, parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { CONSENT_VERSION } from "@/lib/consent";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
  consents: z.object({ genomics: z.boolean(), wearables: z.boolean(), records: z.boolean(), ai: z.boolean() }),
  acknowledged: z.literal(true, "Please confirm you understand Allele is not medical advice."),
});

export async function POST(req: Request) {
  try {
    if (!rateLimit(`signup:${clientKey(req)}`, 5, 60 * 60_000)) throw new HttpError(429, "Too many sign-ups from this address. Try again later.");
    const body = await parseBody(req, Body);
    if (await db.query.users.findFirst({ where: eq(users.email, body.email) })) throw new HttpError(409, "An account with this email already exists.");

    const [vault] = await db
      .insert(vaults)
      .values({
        name: `${body.name.split(" ")[0]}'s health vault`,
        profile: { birthYear: null, sex: "unspecified", heightCm: null, weightKg: null, ancestry: "", smoking: "unspecified", pregnant: false, goals: [] },
        consents: { ...body.consents, acceptedAt: new Date().toISOString(), version: CONSENT_VERSION },
      })
      .returning();
    const [user] = await db
      .insert(users)
      .values({ vaultId: vault.id, email: body.email, name: body.name, role: "owner", passwordHash: await hashPassword(body.password) })
      .returning();
    await recordAudit({ vaultId: vault.id, userId: user.id, action: "vault.created", entityType: "vault", entityId: vault.id, details: { consents: body.consents, version: CONSENT_VERSION } });
    await createSession(user);
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
