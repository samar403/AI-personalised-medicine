import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { genomes } from "@/lib/db/schema";
import { parseBody, withAuth } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { affectedDrugs, callGenes, PANEL } from "@/lib/clinical/pgx";
import { saveGenome } from "@/lib/services/ingest";
import { loadGenomeCalls } from "@/lib/services/snapshot";
import { syncInsights } from "@/lib/services/insights";

export const GET = withAuth("caregiver", async ({ user }) => {
  const g = await loadGenomeCalls(user.vaultId);
  if (user.role !== "owner") await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "genome.viewed", entityType: "genome" });
  if (!g) return Response.json({ genome: null, genes: [], panel: PANEL });
  const { callsEncrypted: _omit, ...meta } = g.genome;
  void _omit;
  const genes = callGenes(g.calls).map((r) => ({ ...r, drugs: affectedDrugs(r) }));
  return Response.json({ genome: meta, genes, panel: PANEL });
});

const Body = z.object({
  filename: z.string().trim().min(1).max(200),
  format: z.enum(["23andme", "ancestry", "myheritage", "vcf"]),
  totalVariants: z.number().int().min(0).max(50_000_000),
  calls: z.record(z.string().regex(/^rs\d+$/), z.string().max(4)).refine((c) => Object.keys(c).length <= PANEL.length, "Only panel variants may be uploaded."),
});

/** Receives only the panel variants. The browser parses the raw file and never uploads it. */
export const POST = withAuth("clinician", async ({ req, user }) => {
  const body = await parseBody(req, Body);
  return Response.json(await saveGenome(user.vaultId, user.id, body), { status: 201 });
});

export const DELETE = withAuth("owner", async ({ user }) => {
  await db.delete(genomes).where(eq(genomes.vaultId, user.vaultId));
  await recordAudit({ vaultId: user.vaultId, userId: user.id, action: "genome.deleted", entityType: "genome" });
  await syncInsights(user.vaultId, user.id, "genome deleted");
  return Response.json({ ok: true });
});
