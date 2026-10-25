// Client-safe formatting helpers and labels.
export const PRIORITY_LABEL = { urgent: "Act now", high: "High", moderate: "Moderate", info: "For your info" } as const;
export const STATUS_LABEL = { new: "New", discussing: "To discuss", reviewed: "Clinician reviewed", dismissed: "Dismissed" } as const;
export const KIND_LABEL = { gene_drug: "Gene × drug", drug_drug: "Drug safety", lab: "Lab result", vital: "Wearable trend" } as const;
export const ROLE_LABEL = { owner: "Owner", clinician: "Clinician", caregiver: "Caregiver" } as const;
export const SEX_LABEL = { female: "Female", male: "Male", intersex: "Intersex", unspecified: "Not specified" } as const;

export function fmtDate(v: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
}

export function fmtDateTime(v: string | number | Date | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function relDays(v: string | number | Date | null | undefined) {
  if (!v) return "";
  const days = Math.round((new Date(v).getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "today";
  if (days > 0) return `in ${days}d`;
  return `${-days}d ago`;
}

export function fmtNum(n: number, decimals = 0) {
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

export function toIsoDate(v: string | number | Date | null | undefined) {
  return v ? new Date(v).toISOString().slice(0, 10) : "";
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
