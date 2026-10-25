import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { briefs } from "@/lib/db/schema";
import { HttpError, withAuth } from "@/lib/api";
import { createBrief } from "@/lib/services/ai";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 300;

export const GET = withAuth("caregiver", async ({ user }) => {
  const items = await db.select({ id: briefs.id, title: briefs.title, createdAt: briefs.createdAt }).from(briefs).where(eq(briefs.vaultId, user.vaultId)).orderBy(desc(briefs.createdAt));
  return Response.json({ items });
});

export const POST = withAuth("clinician", async ({ req, user }) => {
  if (!rateLimit(`brief:${user.id}:${clientKey(req)}`, 10, 60 * 60_000)) throw new HttpError(429, "Hourly brief limit reached.");
  const brief = await createBrief(user.vaultId, user.id);
  return Response.json({ brief: { id: brief.id } }, { status: 201 });
});
