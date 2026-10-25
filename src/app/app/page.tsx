"use client";
import Link from "next/link";
import { Activity, ArrowRight, Dna, FileHeart, Pill, Sparkles, UserRound } from "lucide-react";
import { Sparkline } from "@/components/app/charts";
import { InsightRow } from "@/components/app/insight-card";
import { useSession } from "@/components/app/session";
import { useApi } from "@/components/use-api";
import { ButtonLink, Card, CardHeader, cx, Disclaimer, Empty, ErrorNote, GeneChip, Loading, PageHeader, Ring, Stat } from "@/components/ui";
import type { Insight, Priority } from "@/lib/db/schema";
import type { VitalSummary } from "@/lib/clinical/vitals";
import { fmtDate, fmtNum } from "@/lib/format";

interface Dashboard {
  insights: { open: number; byPriority: Record<Priority, number>; top: Insight[] };
  genes: { gene: string; diplotype: string; phenotype: string; actionable: boolean; drugs: string[] }[];
  vitals: VitalSummary[];
  labs: { test: string; name: string; value: number; unit: string; takenAt: string; flag: string | null; label: string | null }[];
  meds: { name: string; drug: string; dose: string }[];
  conditions: string[];
  plan: { headline: string; overview: string; model: string; createdAt: string } | null;
  completeness: { profile: boolean; genome: boolean; wearables: number; records: number; medications: number };
}

const VITAL_ORDER = ["resting_hr", "hrv", "sleep_hours", "steps", "systolic", "spo2"];

export default function Overview() {
  const { me } = useSession();
  const { data, error } = useApi<Dashboard>("/api/dashboard");
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading label="Reading your vault" />;

  const c = data.completeness;
  const steps = [
    { done: c.profile, label: "Profile", href: "/app/profile", icon: UserRound },
    { done: c.genome, label: "Genome", href: "/app/genome", icon: Dna },
    { done: c.wearables >= 14, label: "Wearables", href: "/app/vitals", icon: Activity },
    { done: c.records > 0, label: "Records", href: "/app/records", icon: FileHeart },
    { done: c.medications > 0, label: "Medicines", href: "/app/medications", icon: Pill },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const actionable = data.genes.filter((g) => g.actionable);
  const vitals = VITAL_ORDER.map((k) => data.vitals.find((v) => v.metric === k)).filter((v): v is VitalSummary => Boolean(v));
  const flaggedLabs = data.labs.filter((l) => l.flag && l.flag !== "normal");
  const firstName = me.user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow={me.user.role === "owner" ? "Your health vault" : `Shared vault · ${me.vault.name}`}
        title={me.user.role === "owner" ? `Hello, ${firstName}` : me.vault.name}
        description="Everything Allele knows about how medicines, genes and daily signals fit together for you, in one place."
        actions={
          <ButtonLink href="/app/plan">
            <Sparkles className="h-4 w-4" /> {data.plan ? "Open care plan" : "Build care plan"}
          </ButtonLink>
        }
      />

      {data.plan && (
        <Card className="mb-6 overflow-hidden">
          <div className="helix-glow px-6 py-5">
            <div className="text-[12px] font-medium text-ink-3">
              Care plan · {fmtDate(data.plan.createdAt)} · {data.plan.model}
            </div>
            <div className="mt-1 font-display text-xl font-semibold sm:text-2xl">{data.plan.headline}</div>
            <p className="mt-2 max-w-3xl text-sm text-ink-2">{data.plan.overview}</p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
            <Stat label="Open insights" value={data.insights.open} sub="to review" />
            <Stat label="Act now / high" value={data.insights.byPriority.urgent + data.insights.byPriority.high} tone={data.insights.byPriority.urgent + data.insights.byPriority.high ? "urgent" : "ok"} sub="priority items" />
            <Stat label="Actionable genes" value={data.genes.length ? actionable.length : "—"} tone="seq" sub={data.genes.length ? `of ${data.genes.length} tested` : "no genome yet"} />
            <Stat label="Active medicines" value={data.meds.length} sub="checked against your genes" />
          </div>
        </Card>
        <Card className="flex items-center gap-4 px-5 py-4">
          <Ring value={doneCount / steps.length} label={`${doneCount}/${steps.length}`} />
          <div className="min-w-0">
            <div className="font-medium">Data completeness</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {steps.map((s) => (
                <Link key={s.label} href={s.href} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px]", s.done ? "bg-helix-soft text-helix" : "bg-mist-2 text-ink-3 hover:text-ink")}>
                  <s.icon className="h-3 w-3" /> {s.label}
                </Link>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="What to look at first" eyebrow="Insights" action={<Link href="/app/insights" className="text-sm text-helix hover:underline">All insights</Link>} />
          {data.insights.top.length ? (
            <div className="divide-y divide-line border-t border-line">
              {data.insights.top.map((i) => (
                <InsightRow key={i.id} item={i} />
              ))}
            </div>
          ) : (
            <Empty title="Nothing needs attention">Add your genome, medicines and records to get personalised insights.</Empty>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Pharmacogenomics" eyebrow="Genome" icon={<Dna className="h-4 w-4" />} action={<Link href="/app/genome" className="text-sm text-helix hover:underline">Details</Link>} />
            <div className="px-5 pb-5">
              {data.genes.length ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {(actionable.length ? actionable : data.genes.slice(0, 6)).map((g) => (
                      <GeneChip key={g.gene} gene={g.gene} call={g.diplotype} actionable={g.actionable} />
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-ink-3">{actionable.length ? `${actionable.length} result${actionable.length === 1 ? "" : "s"} change how ${actionable.flatMap((g) => g.drugs).length} medicines work for you.` : "No actionable results in the tested panel."}</p>
                </>
              ) : (
                <div className="text-sm text-ink-2">
                  No genome uploaded. <Link className="text-helix underline" href="/app/genome">Add your DNA file</Link> to check how your genes affect your medicines.
                </div>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Labs to note" eyebrow="Records" icon={<FileHeart className="h-4 w-4" />} action={<Link href="/app/records" className="text-sm text-helix hover:underline">All labs</Link>} />
            <div className="px-5 pb-5">
              {flaggedLabs.length ? (
                <ul className="space-y-2">
                  {flaggedLabs.slice(0, 5).map((l) => (
                    <li key={l.test} className="flex items-baseline justify-between gap-3 text-sm">
                      <span>
                        {l.name} <span className="text-xs text-ink-3">· {l.label}</span>
                      </span>
                      <span className="num shrink-0 font-medium">
                        {fmtNum(l.value, 1)} <span className="text-xs text-ink-3">{l.unit}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-ink-2">{data.labs.length ? "All recent lab results are in the usual range." : "No lab results yet."}</div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="Your signals vs your baseline" eyebrow="Wearables · last 30 days" icon={<Activity className="h-4 w-4" />} action={<Link href="/app/vitals" className="text-sm text-helix hover:underline">Trends</Link>} />
        {vitals.length ? (
          <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {vitals.map((v) => (
              <div key={v.metric} className="bg-surface px-5 py-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] text-ink-2">{v.label}</span>
                  {v.delta !== null && (
                    <span className={cx("num text-xs", Math.abs(v.delta) < (v.baselineSd ?? 0) ? "text-ink-3" : "text-high")}>
                      {v.delta > 0 ? "+" : ""}
                      {fmtNum(v.delta, 1)} vs baseline
                    </span>
                  )}
                </div>
                <div className="num mt-1 text-2xl font-semibold">
                  {fmtNum(v.recentMean, v.metric === "sleep_hours" ? 1 : 0)} <span className="text-sm font-normal text-ink-3">{v.unit}</span>
                </div>
                <Sparkline data={v.series} label={v.label} />
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No wearable data yet" action={<ButtonLink href="/app/vitals" variant="secondary">Import wearable data <ArrowRight className="h-4 w-4" /></ButtonLink>}>
            Upload a CSV export from Apple Health, Fitbit, Garmin, Oura, Withings or a home blood-pressure cuff.
          </Empty>
        )}
      </Card>

      <Disclaimer className="mt-6" />
    </>
  );
}
