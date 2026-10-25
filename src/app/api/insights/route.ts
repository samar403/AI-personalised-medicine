import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { insights } from "@/lib/db/schema";
import { withAuth } from "@/lib/api";
import { PRIORITY_RANK } from "@/lib/clinical/findings";

export const GET = withAuth("caregiver", async ({ user }) => {
  const items = await db.query.insights.findMany({ where: eq(insights.vaultId, user.vaultId), orderBy: desc(insights.updatedAt) });
  items.sort((a, b) => Number(a.status === "dismissed") - Number(b.status === "dismissed") || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  return Response.json({ items });
});
