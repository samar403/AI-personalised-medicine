"use client";
import { CalendarClock, HeartHandshake, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useCan, useSession } from "@/components/app/session";
import { apiSend, useApi } from "@/components/use-api";
import { Button, Card, CardHeader, Disclaimer, Empty, ErrorNote, Loading, Notice, PageHeader, PriorityPill, Tag } from "@/components/ui";
import type { CarePlanRow } from "@/lib/db/schema";
import { fmtDateTime } from "@/lib/format";

const CATEGORY_LABEL: Record<string, string> = {
  medication: "Medication",
  genetics: "Genetics",
  heart: "Heart & circulation",
  metabolic: "Metabolic",
  kidney: "Kidney",
  sleep: "Sleep",
  activity: "Activity",
  nutrition: "Nutrition",
  mental_health: "Mental health",
  screening: "Screening",
  monitoring: "Monitoring",
  other: "Other",
};

export default function PlanPage() {
  const { me } = useSession();
  const canRun = useCan("clinician");
  const { data, error, reload } = useApi<{ plan: CarePlanRow | null }>("/api/plan");
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setRunError(null);
    try {
      await apiSend("/api/plan", "POST");
      reload();
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const plan = data?.plan?.content;
  const usingAI = me.ai.enabled && me.ai.allowed;
  return (
    <>
      <PageHeader
        eyebrow="Personalised"
        title="Your care plan"
        description="Genes, medicines, labs and wearable trends read together, prioritised, with the questions to bring to your next appointment."
        actions={
          canRun && (
            <Button onClick={generate} disabled={busy}>
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? (usingAI ? "Claude is reading your data…" : "Building…") : plan ? "Refresh plan" : "Build my plan"}
            </Button>
          )
        }
      />
      {!usingAI && (
        <Notice>
          {me.ai.enabled ? "AI analysis is turned off for this vault, so plans come from the offline rules engine. The owner can enable Claude under Privacy & sharing." : "No Anthropic API key is configured, so plans come from the offline rules engine."}
        </Notice>
      )}
      {runError && <div className="mt-3"><ErrorNote>{runError}</ErrorNote></div>}
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <Loading label="Loading your plan" />}
      {data && !plan && (
        <Card className="mt-4">
          <Empty title="No care plan yet" icon={<Sparkles className="h-5 w-5" />}>
            Build one once you&apos;ve added at least one data source. It takes about a minute with Claude, and a second offline.
          </Empty>
        </Card>
      )}
      {plan && (
        <div className="mt-4 space-y-4">
          <Card className="overflow-hidden">
            <div className="helix-glow px-6 py-6">
              <div className="text-[12px] text-ink-3">
                {fmtDateTime(data!.plan!.createdAt)} · {plan.model}
              </div>
              <h2 className="mt-1 font-display text-2xl font-semibold sm:text-[28px]">{plan.headline}</h2>
              <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">{plan.overview}</p>
            </div>
          </Card>

          <div className="space-y-3">
            {plan.priorities.map((p, i) => (
              <Card key={i} className="px-5 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num grid h-7 w-7 place-items-center rounded-full bg-mist-2 text-xs font-semibold">{i + 1}</span>
                  <PriorityPill priority={p.priority} />
                  <Tag>{CATEGORY_LABEL[p.category] ?? p.category}</Tag>
                </div>
                <h3 className="mt-2 font-display text-lg font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-ink-2">{p.summary}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-helix-soft/60 px-4 py-3">
                    <div className="text-[12px] font-semibold text-helix">What to do</div>
                    <p className="mt-0.5 text-sm">{p.recommendation}</p>
                  </div>
                  <div className="rounded-xl bg-surface-2 px-4 py-3">
                    <div className="text-[12px] font-semibold text-ink-3">Why this applies to you</div>
                    <p className="mt-0.5 text-sm text-ink-2">{p.rationale}</p>
                  </div>
                </div>
                {p.evidence.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.evidence.map((e) => (
                      <Tag key={e} tone="seq">
                        {e}
                      </Tag>
                    ))}
                  </div>
                )}
                {p.questionsForClinician.length > 0 && (
                  <div className="mt-3 border-t border-line pt-3">
                    <div className="text-[12px] font-semibold text-ink-3">Ask your clinician</div>
                    <ul className="mt-1 space-y-1 text-sm">
                      {p.questionsForClinician.map((q) => (
                        <li key={q} className="flex gap-2">
                          <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-seq" /> {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="This week" eyebrow="Lifestyle" icon={<HeartHandshake className="h-4 w-4" />} />
              <ul className="divide-y divide-line border-t border-line">
                {plan.lifestyle.map((l) => (
                  <li key={l.action} className="px-5 py-3">
                    <div className="text-[12px] font-semibold text-helix">{l.area}</div>
                    <div className="text-sm font-medium">{l.action}</div>
                    <div className="text-xs text-ink-3">{l.why}</div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Keep an eye on" eyebrow="Monitoring" icon={<CalendarClock className="h-4 w-4" />} />
              <ul className="divide-y divide-line border-t border-line">
                {plan.monitoring.length ? (
                  plan.monitoring.map((m) => (
                    <li key={m.what} className="px-5 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium">{m.what}</span>
                        <span className="text-xs text-ink-3">{m.frequency}</span>
                      </div>
                      <div className="text-xs text-ink-3">{m.why}</div>
                    </li>
                  ))
                ) : (
                  <li className="px-5 py-3 text-sm text-ink-3">No routine monitoring suggested from current data.</li>
                )}
              </ul>
            </Card>
          </div>

          {plan.dataGaps.length > 0 && (
            <Card className="px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <TriangleAlert className="h-4 w-4 text-moderate" /> What would make this plan better
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-ink-2">
                {plan.dataGaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
      <Disclaimer className="mt-6" />
    </>
  );
}
