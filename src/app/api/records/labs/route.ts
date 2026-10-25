import { z } from "zod";
import { db } from "@/lib/db";
import { labResults } from "@/lib/db/schema";
import { parseBody, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { labDef, normalizeLabValue } from "@/lib/clinical/labs";
import { requireConsent } from "@/lib/services/ingest";
import { syncInsights } from "@/lib/services/insights";

const Body = z.object({
  test: z.string().min(1).max(40),
  name: z.string().trim().max(120).optional(),
  value: z.number().finite(),
  unit: z.string().trim().max(30).default(""),
  takenAt: z.iso.date(),
});

export const POST = withAuth("clinician", async ({ req, user }) => {
  await requireConsent(user.vaultId, "records");
  const body = await parseBody(req, Body);
  const def = labDef(body.test);
  const n = def ? normalizeLabValue(def, body.value, body.unit || def.unit) : { value: body.value, unit: body.unit };
  const [row] = await db
    .insert(labResults)
    .values({ vaultId: user.vaultId, test: def ? def.key : "other", name: def?.name ?? body.name ?? body.test, value: n.value, unit: n.unit, takenAt: new Date(body.takenAt), source: "manual" })
    .returning();
  await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "lab.added", entityType: "lab", entityId: row.id, details: { test: row.test } });
  return Response.json({ lab: row, ...(await syncInsights(user.vaultId, user.id, "lab")) }, { status: 201 });
});
