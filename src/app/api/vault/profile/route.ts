import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { vaults } from "@/lib/db/schema";
import { parseBody, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { syncInsights } from "@/lib/services/insights";

const thisYear = new Date().getUTCFullYear();

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  profile: z.object({
    birthYear: z.number().int().min(thisYear - 120).max(thisYear).nullable(),
    sex: z.enum(["female", "male", "intersex", "unspecified"]),
    heightCm: z.number().min(50).max(250).nullable(),
    weightKg: z.number().min(20).max(400).nullable(),
    ancestry: z.string().trim().max(120),
    smoking: z.enum(["never", "former", "current", "unspecified"]),
    pregnant: z.boolean(),
    goals: z.array(z.string().trim().min(1).max(120)).max(8),
  }),
});

export const PATCH = withAuth("owner", async ({ req, user }) => {
  const body = await parseBody(req, Body);
  const [vault] = await db.update(vaults).set(body).where(eq(vaults.id, user.vaultId)).returning();
  await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "profile.updated", entityType: "vault", entityId: vault.id });
  await syncInsights(user.vaultId, user.id, "profile");
  return Response.json({ vault });
});
