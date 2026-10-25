import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

/** owner = the patient; clinician = can review and annotate; caregiver = read-only. */
export type Role = "owner" | "clinician" | "caregiver";
export type Priority = "urgent" | "high" | "moderate" | "info";
export type InsightStatus = "new" | "discussing" | "reviewed" | "dismissed";
export type InsightKind = "gene_drug" | "drug_drug" | "lab" | "vital";
export type DataSource = "manual" | "record" | "wearable" | "genome";

export interface HealthProfile {
  birthYear: number | null;
  sex: "female" | "male" | "intersex" | "unspecified";
  heightCm: number | null;
  weightKg: number | null;
  /** Optional, self-described. Only used where guidelines differ by ancestry. */
  ancestry: string;
  smoking: "never" | "former" | "current" | "unspecified";
  pregnant: boolean;
  goals: string[];
}

/** What the vault owner has agreed to. Each data type is opt-in, and AI processing is separate. */
export interface Consents {
  genomics: boolean;
  wearables: boolean;
  records: boolean;
  ai: boolean;
  acceptedAt: string | null;
  version: string;
}

export interface Evidence {
  label: string;
  detail: string;
}

/** A health vault belongs to one person. Everyone else gets in only by the owner's invitation. */
export const vaults = sqliteTable("vaults", {
  id: id(),
  name: text("name").notNull(),
  profile: text("profile", { mode: "json" }).$type<HealthProfile>().notNull(),
  consents: text("consents", { mode: "json" }).$type<Consents>().notNull(),
  createdAt: createdAt(),
});

export const users = sqliteTable(
  "users",
  {
    id: id(),
    vaultId: text("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<Role>().notNull().default("owner"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/**
 * Only the panel of clinically actionable variants is kept, encrypted at rest. The rest of the
 * uploaded file is discarded during parsing and never written anywhere.
 */
export const genomes = sqliteTable(
  "genomes",
  {
    id: id(),
    vaultId: text("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    format: text("format").notNull(),
    build: text("build").notNull().default("GRCh37"),
    totalVariants: integer("total_variants").notNull(),
    keptVariants: integer("kept_variants").notNull(),
    callsEncrypted: text("calls_encrypted").notNull(),
    uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("genomes_vault_idx").on(t.vaultId)],
);

export const medications = sqliteTable(
  "medications",
  {
    id: id(),
    vaultId: text("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Normalised generic name from the drug dictionary, or the lower-cased name if unknown. */
    drug: text("drug").notNull(),
    dose: text("dose").notNull().default(""),
    reason: text("reason").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("medications_vault_idx").on(t.vaultId)],
);

export const conditions = sqliteTable("conditions", {
  id: id(),
  vaultId: text("vault_id")
    .notNull()
    .references(() => vaults.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code"),
  status: text("status").notNull().default("active"),
  onsetAt: integer("onset_at", { mode: "timestamp_ms" }),
  source: text("source").$type<DataSource>().notNull().default("manual"),
  createdAt: createdAt(),
});

export const allergies = sqliteTable("allergies", {
  id: id(),
  vaultId: text("vault_id")
    .notNull()
    .references(() => vaults.id, { onDelete: "cascade" }),
  substance: text("substance").notNull(),
  reaction: text("reaction").notNull().default(""),
  severity: text("severity").notNull().default("unknown"),
  source: text("source").$type<DataSource>().notNull().default("manual"),
  createdAt: createdAt(),
});

export const labResults = sqliteTable(
  "lab_results",
  {
    id: id(),
    vaultId: text("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    /** Key in the lab dictionary (e.g. "ldl"), or "other". */
    test: text("test").notNull(),
    name: text("name").notNull(),
    loinc: text("loinc"),
    value: real("value").notNull(),
    unit: text("unit").notNull().default(""),
    takenAt: integer("taken_at", { mode: "timestamp_ms" }).notNull(),
    source: text("source").$type<DataSource>().notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [index("labs_vault_test_idx").on(t.vaultId, t.test, t.takenAt)],
);

/** One value per metric per day. Re-uploading the same export replaces rather than duplicates. */
export const vitals = sqliteTable(
  "vitals",
  {
    id: id(),
    vaultId: text("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    value: real("value").notNull(),
    day: text("day").notNull(),
    source: text("source").notNull().default("upload"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("vitals_vault_metric_day_idx").on(t.vaultId, t.metric, t.day)],
);

export const insights = sqliteTable(
  "insights",
  {
    id: id(),
    vaultId: text("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    kind: text("kind").$type<InsightKind>().notNull(),
    priority: text("priority").$type<Priority>().notNull(),
    status: text("status").$type<InsightStatus>().notNull().default("new"),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    recommendation: text("recommendation").notNull(),
    rationale: text("rationale").notNull().default(""),
    evidence: text("evidence", { mode: "json" }).$type<Evidence[]>().notNull().default([]),
    evidenceLevel: text("evidence_level").notNull().default(""),
    questions: text("questions", { mode: "json" }).$type<string[]>().notNull().default([]),
    /** Stable key for rule-based findings so re-running the engine never duplicates them. */
    ruleCode: text("rule_code"),
    model: text("model").notNull().default("rules"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewNote: text("review_note").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("insights_vault_status_idx").on(t.vaultId, t.status), index("insights_vault_rule_idx").on(t.vaultId, t.ruleCode)],
);

export const insightNotes = sqliteTable("insight_notes", {
  id: id(),
  insightId: text("insight_id")
    .notNull()
    .references(() => insights.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const carePlans = sqliteTable(
  "care_plans",
  {
    id: id(),
    vaultId: text("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    content: text("content", { mode: "json" }).$type<import("@/lib/ai/plan").CarePlan>().notNull(),
    model: text("model").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("care_plans_vault_idx").on(t.vaultId, t.createdAt)],
);

export const briefs = sqliteTable("briefs", {
  id: id(),
  vaultId: text("vault_id")
    .notNull()
    .references(() => vaults.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content", { mode: "json" }).$type<import("@/lib/brief").BriefContent>().notNull(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// Append-only access and change log: who saw or changed what, and when.
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    vaultId: text("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    details: text("details", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_vault_created_idx").on(t.vaultId, t.createdAt)],
);

export type Vault = typeof vaults.$inferSelect;
export type User = typeof users.$inferSelect;
export type Genome = typeof genomes.$inferSelect;
export type Medication = typeof medications.$inferSelect;
export type Condition = typeof conditions.$inferSelect;
export type Allergy = typeof allergies.$inferSelect;
export type LabResult = typeof labResults.$inferSelect;
export type Vital = typeof vitals.$inferSelect;
export type Insight = typeof insights.$inferSelect;
export type Brief = typeof briefs.$inferSelect;
export type CarePlanRow = typeof carePlans.$inferSelect;
