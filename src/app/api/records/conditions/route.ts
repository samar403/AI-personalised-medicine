import { z } from "zod";
import { db } from "@/lib/db";
import { conditions } from "@/lib/db/schema";
import { parseBody, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { requireConsent } from "@/lib/services/ingest";
import { syncInsights } from "@/lib/services/insights";

const Body = z.object({ name: z.string().trim().min(2).max(160), status: z.enum(["active", "resolved"]).default("active") });

export const POST = withAuth("clinician", async ({ req, user }) => {
  await requireConsent(user.vaultId, "records");
  const body = await parseBody(req, Body);
  const [row] = await db.insert(conditions).values({ vaultId: user.vaultId, name: body.name, status: body.status }).returning();
  await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "condition.added", entityType: "condition", entityId: row.id });
  return Response.json({ condition: row, ...(await syncInsights(user.vaultId, user.id, "condition")) }, { status: 201 });
});
