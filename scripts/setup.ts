// Idempotent setup: applies migrations, then seeds a demo vault if the database is empty.
// Run with: npm run setup   (also runs automatically before `npm run dev`)
import { readFileSync, mkdirSync } from "node:fs";
import bcrypt from "bcryptjs";
import { migrate } from "drizzle-orm/libsql/migrator";
import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { insightNotes, insights, users, vaults } from "../src/lib/db/schema";
import { parseGenome } from "../src/lib/clinical/pgx";
import { parseFhir } from "../src/lib/clinical/fhir";
import { parseVitalsCsv } from "../src/lib/clinical/vitals";
import { importRecord, saveGenome, saveVitals } from "../src/lib/services/ingest";
import { syncInsights } from "../src/lib/services/insights";
import { createBrief, createCarePlan } from "../src/lib/services/ai";
import { recordAudit } from "../src/lib/audit";
import { CONSENT_VERSION } from "../src/lib/consent";

async function main() {
  if ((process.env.DATABASE_URL ?? "file:./data/").startsWith("file:")) mkdirSync("data", { recursive: true });
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("✓ migrations applied");

  if (process.env.SEED_DEMO === "false") return;
  if (await db.query.vaults.findFirst()) {
    console.log("✓ database already has data, skipping seed");
    return;
  }

  const [vault] = await db
    .insert(vaults)
    .values({
      name: "Jordan's health vault",
      profile: { birthYear: 1968, sex: "male", heightCm: 178, weightKg: 84, ancestry: "South Asian / European", smoking: "former", pregnant: false, goals: ["Stay well after my stent", "Bring my blood pressure down", "Sleep better"] },
      consents: { genomics: true, wearables: true, records: true, ai: true, acceptedAt: new Date().toISOString(), version: CONSENT_VERSION },
    })
    .returning();

  const hash = await bcrypt.hash("demo-vault-2026", 12);
  const [owner, clinician] = await db
    .insert(users)
    .values([
      { vaultId: vault.id, email: "demo@allele.example", name: "Jordan Sample", role: "owner", passwordHash: hash },
      { vaultId: vault.id, email: "clinician@allele.example", name: "Dr. Priya Okafor", role: "clinician", passwordHash: hash },
      { vaultId: vault.id, email: "caregiver@allele.example", name: "Alex Sample", role: "caregiver", passwordHash: hash },
    ])
    .returning();
  await recordAudit({ vaultId: vault.id, userId: owner.id, action: "vault.created", entityType: "vault", entityId: vault.id });

  // Feed the synthetic files through the same pipelines the app uses.
  const genome = parseGenome(readFileSync("public/sample-genome.txt", "utf8"));
  await saveGenome(vault.id, owner.id, { filename: "sample-genome.txt", ...genome });
  await importRecord(vault.id, owner.id, parseFhir(JSON.parse(readFileSync("public/sample-record.json", "utf8"))), "sample-record.json");
  await saveVitals(vault.id, owner.id, parseVitalsCsv(readFileSync("public/sample-wearables.csv", "utf8")).rows, "upload");
  const sync = await syncInsights(vault.id, owner.id, "seed");

  // A little care-team history: the clinician has reviewed the statin finding.
  const statin = await db.query.insights.findFirst({ where: and(eq(insights.vaultId, vault.id), eq(insights.ruleCode, "slco1b1-simvastatin:simvastatin")) });
  if (statin) {
    await db.update(insights).set({ status: "reviewed", reviewedBy: clinician.id, reviewNote: "Agree. Plan to switch to rosuvastatin 10 mg at the next visit and recheck lipids in 8 weeks." }).where(eq(insights.id, statin.id));
    await db.insert(insightNotes).values({ insightId: statin.id, userId: clinician.id, body: "SLCO1B1 decreased function plus simvastatin 40 mg. Rosuvastatin also gets LDL closer to target post-PCI." });
  }
  const clopidogrel = await db.query.insights.findFirst({ where: and(eq(insights.vaultId, vault.id), eq(insights.ruleCode, "cyp2c19-clopidogrel:clopidogrel")) });
  if (clopidogrel) await db.update(insights).set({ status: "discussing" }).where(eq(insights.id, clopidogrel.id));

  await createCarePlan(vault.id, owner.id, { offline: true });
  await createBrief(vault.id, owner.id, { offline: true });
  console.log(`✓ demo vault ready: ${sync.findings} insights. Sign in as demo@allele.example / demo-vault-2026 (also clinician@ and caregiver@)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
