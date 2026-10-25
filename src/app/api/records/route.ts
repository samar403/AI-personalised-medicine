import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { allergies, conditions, labResults } from "@/lib/db/schema";
import { HttpError, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { parseFhir } from "@/lib/clinical/fhir";
import { interpretLab, LABS } from "@/lib/clinical/labs";
import { importRecord } from "@/lib/services/ingest";
import { getVault } from "@/lib/services/snapshot";

const MAX_BYTES = 5 * 1024 * 1024;

export const GET = withAuth("caregiver", async ({ user }) => {
  const [vault, conds, alls, labs] = await Promise.all([
    getVault(user.vaultId),
    db.query.conditions.findMany({ where: eq(conditions.vaultId, user.vaultId), orderBy: desc(conditions.createdAt) }),
    db.query.allergies.findMany({ where: eq(allergies.vaultId, user.vaultId) }),
    db.query.labResults.findMany({ where: eq(labResults.vaultId, user.vaultId), orderBy: desc(labResults.takenAt) }),
  ]);
  if (user.role !== "owner") await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "records.viewed", entityType: "record" });
  return Response.json({
    conditions: conds,
    allergies: alls,
    labs: labs.map((l) => ({ ...l, interpretation: l.test === "other" ? null : interpretLab(l.test, l.value, l.unit, vault.profile.sex) })),
    labTests: LABS.map((l) => ({ key: l.key, name: l.name, unit: l.unit })),
  });
});

/** Imports a FHIR R4 JSON export (multipart, field "file"). */
export const POST = withAuth("clinician", async ({ req, user }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a FHIR JSON file in the 'file' field.");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Files are limited to 5 MB.");
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new HttpError(400, "This file isn't valid JSON. Export your record as FHIR R4 JSON.");
  }
  let rec;
  try {
    rec = parseFhir(json);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  return Response.json(await importRecord(user.vaultId, user.id, rec, file.name), { status: 201 });
});
