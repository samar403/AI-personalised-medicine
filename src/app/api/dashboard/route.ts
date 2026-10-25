import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { insights } from "@/lib/db/schema";
import { withAuth } from "@/lib/api";
import { PRIORITY_RANK } from "@/lib/clinical/findings";
import { affectedDrugs } from "@/lib/clinical/pgx";
import { latestCarePlan } from "@/lib/services/ai";
import { loadSnapshot } from "@/lib/services/snapshot";

export const GET = withAuth("caregiver", async ({ user }) => {
  const [snapshot, open, plan] = await Promise.all([
    loadSnapshot(user.vaultId),
    db.query.insights.findMany({ where: and(eq(insights.vaultId, user.vaultId), inArray(insights.status, ["new", "discussing"])), orderBy: desc(insights.updatedAt) }),
    latestCarePlan(user.vaultId),
  ]);
  open.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  const byPriority = { urgent: 0, high: 0, moderate: 0, info: 0 };
  for (const i of open) byPriority[i.priority]++;
  const p = snapshot.profile;
  return Response.json({
    insights: { open: open.length, byPriority, top: open.slice(0, 5) },
    genes: (snapshot.genes ?? []).map((g) => ({ gene: g.gene, diplotype: g.diplotype, phenotype: g.phenotype, code: g.code, actionable: g.actionable, confidence: g.confidence, drugs: affectedDrugs(g) })),
    vitals: snapshot.vitals.map((v) => ({ ...v, series: v.series.slice(-30) })),
    labs: snapshot.labs.filter((l) => l.test !== "other").sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime()),
    meds: snapshot.meds,
    conditions: snapshot.conditions,
    plan: plan ? { headline: plan.content.headline, overview: plan.content.overview, model: plan.model, createdAt: plan.createdAt } : null,
    completeness: {
      profile: Boolean(p.birthYear && p.sex !== "unspecified"),
      genome: Boolean(snapshot.genes),
      wearables: snapshot.vitals.reduce((m, v) => Math.max(m, v.days), 0),
      records: snapshot.labs.length + snapshot.conditions.length,
      medications: snapshot.meds.length,
    },
  });
});
