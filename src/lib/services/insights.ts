import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { insights } from "@/lib/db/schema";
import { runFindings } from "@/lib/clinical/findings";
import { recordAudit } from "@/lib/audit";
import { loadSnapshot } from "./snapshot";

/**
 * Re-runs the rules engine and reconciles the vault's insights:
 * new findings are added, still-true ones are refreshed in place (keeping status and notes),
 * and open findings whose cause has gone (for example a medicine was stopped) are dismissed.
 */
export async function syncInsights(vaultId: string, userId: string | null, reason: string) {
  const findings = runFindings(await loadSnapshot(vaultId));
  const existing = await db.query.insights.findMany({ where: and(eq(insights.vaultId, vaultId), isNotNull(insights.ruleCode)) });
  const byCode = new Map(existing.map((i) => [i.ruleCode!, i]));
  let added = 0;

  for (const f of findings) {
    const prev = byCode.get(f.ruleCode);
    const values = { kind: f.kind, priority: f.priority, title: f.title, summary: f.summary, recommendation: f.recommendation, rationale: f.rationale, evidence: f.evidence, evidenceLevel: f.evidenceLevel, questions: f.questions, updatedAt: new Date() };
    if (prev) {
      // A resolved-by-system finding that comes back is reopened.
      const reopen = prev.status === "dismissed" && prev.reviewNote === "Resolved automatically: the underlying data changed.";
      await db.update(insights).set({ ...values, ...(reopen ? { status: "new" as const, reviewNote: "" } : {}) }).where(eq(insights.id, prev.id));
    } else {
      await db.insert(insights).values({ ...values, vaultId, ruleCode: f.ruleCode, model: "rules" });
      added++;
    }
  }

  const live = new Set(findings.map((f) => f.ruleCode));
  const stale = existing.filter((i) => !live.has(i.ruleCode!) && (i.status === "new" || i.status === "discussing")).map((i) => i.id);
  if (stale.length) {
    await db.update(insights).set({ status: "dismissed", reviewNote: "Resolved automatically: the underlying data changed.", updatedAt: new Date() }).where(inArray(insights.id, stale));
  }
  await recordAudit({ vaultId, userId, action: "insights.synced", entityType: "insight", details: { reason, findings: findings.length, added, resolved: stale.length } });
  return { findings: findings.length, added, resolved: stale.length };
}
