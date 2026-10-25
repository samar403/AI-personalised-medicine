// Wearable and home-device data: CSV parsing (wide or long format), daily aggregation, personal
// baselines and simple, explainable trend checks. Client-safe.
import Papa from "papaparse";

export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  aliases: string[];
  min: number;
  max: number;
  /** How to roll up several readings on one day. */
  rollup: "sum" | "mean" | "min" | "max";
  decimals: number;
}

export const METRICS: MetricDef[] = [
  { key: "steps", label: "Steps", unit: "steps", aliases: ["steps", "step count", "stepcount", "daily steps"], min: 0, max: 100000, rollup: "sum", decimals: 0 },
  { key: "resting_hr", label: "Resting heart rate", unit: "bpm", aliases: ["resting heart rate", "resting_hr", "resting hr", "rhr", "restingheartrate"], min: 25, max: 200, rollup: "mean", decimals: 0 },
  { key: "hrv", label: "Heart rate variability", unit: "ms", aliases: ["hrv", "hrv_ms", "heart rate variability", "rmssd", "hrv rmssd", "heartratevariabilitysdnn", "sdnn"], min: 1, max: 300, rollup: "mean", decimals: 0 },
  { key: "sleep_hours", label: "Sleep", unit: "h", aliases: ["sleep", "sleep_hours", "sleep hours", "sleep duration", "hours asleep", "total sleep"], min: 0, max: 20, rollup: "sum", decimals: 1 },
  { key: "spo2", label: "Blood oxygen (SpO₂)", unit: "%", aliases: ["spo2", "oxygen saturation", "blood oxygen", "o2 saturation"], min: 50, max: 100, rollup: "min", decimals: 0 },
  { key: "weight", label: "Weight", unit: "kg", aliases: ["weight", "weight_kg", "body mass", "bodymass"], min: 20, max: 400, rollup: "mean", decimals: 1 },
  { key: "systolic", label: "Systolic blood pressure", unit: "mmHg", aliases: ["systolic", "sys", "bp systolic", "systolic bp", "bloodpressuresystolic"], min: 60, max: 260, rollup: "mean", decimals: 0 },
  { key: "diastolic", label: "Diastolic blood pressure", unit: "mmHg", aliases: ["diastolic", "dia", "bp diastolic", "diastolic bp", "bloodpressurediastolic"], min: 30, max: 160, rollup: "mean", decimals: 0 },
  { key: "glucose", label: "Glucose (CGM daily average)", unit: "mg/dL", aliases: ["glucose", "blood glucose", "cgm", "glucose_mgdl", "avg glucose"], min: 30, max: 600, rollup: "mean", decimals: 0 },
];

const metricByKey = new Map(METRICS.map((m) => [m.key, m]));
export const metricDef = (key: string) => metricByKey.get(key);

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/hkquantitytypeidentifier/g, "")
    .replace(/[_-]+/g, " ")
    .trim();

function metricFor(header: string) {
  const h = norm(header);
  const compact = h.replace(/\s+/g, "");
  return METRICS.find((m) => m.aliases.some((a) => norm(a) === h || norm(a).replace(/\s+/g, "") === compact));
}

const DATE_HEADERS = ["date", "day", "timestamp", "time", "start", "startdate", "start date", "datetime", "recorded at"];

function toDay(raw: string) {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export interface VitalRow {
  metric: string;
  day: string;
  value: number;
}

/**
 * Accepts wide CSVs (date,steps,resting_hr,...) and long CSVs (date,type,value[,unit]).
 * Readings are rolled up to one value per metric per day and range-checked.
 */
export function parseVitalsCsv(text: string): { rows: VitalRow[]; skipped: number; metrics: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  const headers = parsed.meta.fields ?? [];
  const dateCol = headers.find((h) => DATE_HEADERS.includes(norm(h)));
  if (!dateCol) throw new Error("Add a date column (named date, day or timestamp).");

  const typeCol = headers.find((h) => ["type", "metric", "data type", "measure", "name"].includes(norm(h)));
  const valueCol = headers.find((h) => ["value", "qty", "quantity", "amount", "reading"].includes(norm(h)));
  const unitCol = headers.find((h) => norm(h) === "unit" || norm(h) === "units");
  const wide = headers.map((h) => ({ h, m: metricFor(h) })).filter((x): x is { h: string; m: MetricDef } => Boolean(x.m));
  if (!wide.length && !(typeCol && valueCol)) throw new Error("No recognised metric columns. Use columns like steps, resting_hr, hrv, sleep_hours, spo2, weight, systolic, diastolic or glucose.");

  const buckets = new Map<string, { m: MetricDef; day: string; values: number[] }>();
  let skipped = 0;
  const add = (m: MetricDef, day: string, raw: string, unit = "") => {
    let v = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(v) || raw === "") return;
    if (m.key === "weight" && /lb/i.test(unit)) v *= 0.4536;
    if (m.key === "spo2" && v <= 1) v *= 100;
    if (m.key === "sleep_hours" && /min/i.test(unit)) v /= 60;
    if (m.key === "glucose" && /mmol/i.test(unit)) v *= 18.016;
    if (v < m.min || v > m.max) {
      skipped++;
      return;
    }
    const k = `${m.key}|${day}`;
    const b = buckets.get(k) ?? { m, day, values: [] };
    b.values.push(v);
    buckets.set(k, b);
  };

  for (const row of parsed.data) {
    const day = toDay(row[dateCol] ?? "");
    if (!day) {
      skipped++;
      continue;
    }
    if (wide.length) for (const { h, m } of wide) add(m, day, row[h] ?? "");
    else if (typeCol && valueCol) {
      const m = metricFor(row[typeCol] ?? "");
      if (m) add(m, day, row[valueCol] ?? "", unitCol ? row[unitCol] : "");
      else skipped++;
    }
  }

  const rows: VitalRow[] = [];
  for (const { m, day, values } of buckets.values()) {
    const value =
      m.rollup === "sum" ? values.reduce((a, b) => a + b, 0) : m.rollup === "min" ? Math.min(...values) : m.rollup === "max" ? Math.max(...values) : values.reduce((a, b) => a + b, 0) / values.length;
    const p = 10 ** m.decimals;
    rows.push({ metric: m.key, day, value: Math.round(value * p) / p });
  }
  rows.sort((a, b) => a.day.localeCompare(b.day));
  return { rows, skipped, metrics: [...new Set(rows.map((r) => r.metric))] };
}

export interface VitalSummary {
  metric: string;
  label: string;
  unit: string;
  days: number;
  latest: number;
  latestDay: string;
  recentMean: number;
  baselineMean: number | null;
  baselineSd: number | null;
  delta: number | null;
  minRecent: number;
  maxRecent: number;
  series: { day: string; value: number }[];
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Recent = last 7 days of data; baseline = the 30 days before that (needs at least 10 readings). */
export function summarizeVitals(rows: { metric: string; day: string; value: number }[]): VitalSummary[] {
  const out: VitalSummary[] = [];
  for (const m of METRICS) {
    const series = rows
      .filter((r) => r.metric === m.key)
      .map((r) => ({ day: r.day, value: r.value }))
      .sort((a, b) => a.day.localeCompare(b.day));
    if (!series.length) continue;
    const last = series.at(-1)!;
    const lastT = Date.parse(last.day);
    const ago = (d: string) => (lastT - Date.parse(d)) / 86_400_000;
    const recent = series.filter((p) => ago(p.day) < 7).map((p) => p.value);
    const base = series.filter((p) => ago(p.day) >= 7 && ago(p.day) < 37).map((p) => p.value);
    const p = 10 ** m.decimals;
    const r = (x: number) => Math.round(x * p) / p;
    const recentMean = r(mean(recent));
    const baselineMean = base.length >= 10 ? r(mean(base)) : null;
    out.push({
      metric: m.key,
      label: m.label,
      unit: m.unit,
      days: series.length,
      latest: last.value,
      latestDay: last.day,
      recentMean,
      baselineMean,
      baselineSd: base.length >= 10 ? Math.round(sd(base) * 10) / 10 : null,
      delta: baselineMean === null ? null : r(recentMean - baselineMean),
      minRecent: Math.min(...recent),
      maxRecent: Math.max(...recent),
      series: series.slice(-90),
    });
  }
  return out;
}
