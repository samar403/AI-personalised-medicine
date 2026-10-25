import { z } from "zod";
import { db } from "@/lib/db";
import { allergies } from "@/lib/db/schema";
import { parseBody, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { requireConsent } from "@/lib/services/ingest";
import { syncInsights } from "@/lib/services/insights";

const Body = z.object({ substance: z.string().trim().min(2).max(120), reaction: z.string().trim().max(200).default(""), severity: z.enum(["mild", "moderate", "severe", "unknown"]).default("unknown") });

export const POST = withAuth("clinician", async ({ req, user }) => {
  await requireConsent(user.vaultId, "records");
  const body = await parseBody(req, Body);
  const [row] = await db.insert(allergies).values({ vaultId: user.vaultId, ...body }).returning();
  await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "allergy.added", entityType: "allergy", entityId: row.id });
  return Response.json({ allergy: row, ...(await syncInsights(user.vaultId, user.id, "allergy")) }, { status: 201 });
});
