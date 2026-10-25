import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { insightNotes, insights } from "@/lib/db/schema";
import { HttpError, parseBody, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

const Body = z.object({ body: z.string().trim().min(1).max(4000) });

export const POST = withAuth<{ id: string }>("clinician", async ({ req, user, params }) => {
  const item = await db.query.insights.findFirst({ where: and(eq(insights.id, params.id), eq(insights.vaultId, user.vaultId)) });
  if (!item) throw new HttpError(404, "Insight not found.");
  const { body } = await parseBody(req, Body);
  const [note] = await db.insert(insightNotes).values({ insightId: item.id, userId: user.id, body }).returning();
  await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "insight.noted", entityType: "insight", entityId: item.id });
  return Response.json({ note }, { status: 201 });
});
