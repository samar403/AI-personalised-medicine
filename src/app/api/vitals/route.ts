import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { vitals } from "@/lib/db/schema";
import { HttpError, parseBody, withAuth } from "@/lib/api";
import { METRICS, parseVitalsCsv, summarizeVitals } from "@/lib/clinical/vitals";
import { requireConsent, saveVitals } from "@/lib/services/ingest";
import { syncInsights } from "@/lib/services/insights";

const MAX_BYTES = 5 * 1024 * 1024;

export const GET = withAuth("caregiver", async ({ user }) => {
  const rows = await db.select({ metric: vitals.metric, day: vitals.day, value: vitals.value }).from(vitals).where(eq(vitals.vaultId, user.vaultId));
  return Response.json({ summaries: summarizeVitals(rows), metrics: METRICS });
});

const Manual = z.object({
  metric: z.enum(METRICS.map((m) => m.key) as [string, ...string[]]),
  value: z.number(),
  day: z.iso.date(),
});

/** Accepts a CSV export (multipart, field "file") or a single manual reading (JSON). */
export const POST = withAuth("clinician", async ({ req, user }) => {
  await requireConsent(user.vaultId, "wearables");
  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await parseBody(req, Manual);
    const def = METRICS.find((m) => m.key === body.metric)!;
    if (body.value < def.min || body.value > def.max) throw new HttpError(400, `${def.label} must be between ${def.min} and ${def.max} ${def.unit}.`);
    await saveVitals(user.vaultId, user.id, [{ metric: body.metric, day: body.day, value: body.value }], "manual");
    return Response.json(await syncInsights(user.vaultId, user.id, "vitals"), { status: 201 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a CSV file in the 'file' field.");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Files are limited to 5 MB. Export daily summaries rather than raw samples.");
  let parsed;
  try {
    parsed = parseVitalsCsv(await file.text());
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  if (!parsed.rows.length) throw new HttpError(422, "No readings could be read from this file.");
  await saveVitals(user.vaultId, user.id, parsed.rows, "upload");
  const sync = await syncInsights(user.vaultId, user.id, "vitals");
  return Response.json({ rows: parsed.rows.length, metrics: parsed.metrics, skipped: parsed.skipped, ...sync }, { status: 201 });
});
