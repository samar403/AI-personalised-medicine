import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { medications } from "@/lib/db/schema";
import { parseBody, withAuth } from "@/lib/api";
import { DRUGS } from "@/lib/clinical/drugs";
import { addMedication } from "@/lib/services/ingest";

export const GET = withAuth("caregiver", async ({ user }) => {
  const items = await db.query.medications.findMany({ where: eq(medications.vaultId, user.vaultId), orderBy: desc(medications.createdAt) });
  return Response.json({ items, dictionary: DRUGS.map((d) => d.name) });
});

const Body = z.object({ name: z.string().trim().min(2).max(120), dose: z.string().trim().max(120).default(""), reason: z.string().trim().max(200).default("") });

export const POST = withAuth("clinician", async ({ req, user }) => {
  const body = await parseBody(req, Body);
  return Response.json(await addMedication(user.vaultId, user.id, body), { status: 201 });
});
