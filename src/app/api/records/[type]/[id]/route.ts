import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { allergies, conditions, labResults } from "@/lib/db/schema";
import { HttpError, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { syncInsights } from "@/lib/services/insights";

const TABLES = { labs: labResults, conditions, allergies } as const;

export const DELETE = withAuth<{ type: string; id: string }>("clinician", async ({ user, params }) => {
  const table = TABLES[params.type as keyof typeof TABLES];
  if (!table) throw new HttpError(404, "Unknown record type.");
  const deleted = await db.delete(table).where(and(eq(table.id, params.id), eq(table.vaultId, user.vaultId))).returning({ id: table.id });
  if (!deleted.length) throw new HttpError(404, "Record not found.");
  await recordAudit({ vaultId: user.vaultId, userId: user.id, action: `${params.type}.deleted`, entityType: params.type, entityId: params.id });
  await syncInsights(user.vaultId, user.id, `${params.type} deleted`);
  return Response.json({ ok: true });
});
