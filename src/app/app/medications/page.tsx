"use client";
import Link from "next/link";
import { useState } from "react";
import { CircleCheck, HeartHandshake, Pill, Plus, Search, TriangleAlert } from "lucide-react";
import { useCan } from "@/components/app/session";
import { apiSend, useApi } from "@/components/use-api";
import { Button, Card, CardHeader, cx, Disclaimer, Empty, ErrorNote, Field, Input, Loading, Notice, PageHeader, PriorityPill, Tag, Td, Th } from "@/components/ui";
import type { Insight, Medication } from "@/lib/db/schema";
import type { Finding } from "@/lib/clinical/findings";
import { capitalize, fmtDate } from "@/lib/format";

interface CheckResult {
  drug: string;
  alreadyTaking: boolean;
  hasGenome: boolean;
  geneRelevant: boolean;
  findings: Finding[];
  explanation: { verdict: "no_flags" | "use_with_care" | "discuss_before_starting"; plainLanguage: string; keyPoints: string[]; questionsForClinician: string[]; model: string };
}

const VERDICT = {
  no_flags: { label: "No flags in your data", tone: "bg-ok-soft text-ok", icon: CircleCheck },
  use_with_care: { label: "Use with care", tone: "bg-moderate-soft text-moderate", icon: TriangleAlert },
  discuss_before_starting: { label: "Discuss with your prescriber first", tone: "bg-high-soft text-high", icon: TriangleAlert },
} as const;

export default function MedicationsPage() {
  const canEdit = useCan("clinician");
  const { data, error, reload } = useApi<{ items: Medication[]; dictionary: string[] }>("/api/medications");
  const insights = useApi<{ items: Insight[] }>("/api/insights");
  const [form, setForm] = useState({ name: "", dose: "", reason: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const active = data?.items.filter((m) => m.active) ?? [];
  const past = data?.items.filter((m) => !m.active) ?? [];
  const openInsights = (insights.data?.items ?? []).filter((i) => i.status !== "dismissed");
  const flagsFor = (m: Medication) => openInsights.filter((i) => i.evidence.some((e) => e.detail.toLowerCase().includes(m.name.toLowerCase())) || i.ruleCode?.endsWith(`:${m.drug}`));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await apiSend("/api/medications", "POST", form);
      setForm({ name: "", dose: "", reason: "" });
      reload();
      insights.reload();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  async function runCheck(name: string) {
    if (!name.trim()) return;
    setChecking(true);
    setCheckError(null);
    try {
      setCheck(await apiSend<CheckResult>("/api/medications/check", "POST", { name }));
    } catch (err) {
      setCheckError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function setActive(m: Medication, value: boolean) {
    await apiSend(`/api/medications/${m.id}`, "PATCH", { active: value });
    reload();
    insights.reload();
  }

  async function remove(m: Medication) {
    await apiSend(`/api/medications/${m.id}`, "DELETE");
    reload();
    insights.reload();
  }

  return (
    <>
      <PageHeader eyebrow="Gene × drug × drug" title="Medications" description="Every medicine is checked against your genotype, your other medicines and your allergies. Check one you're considering before it's prescribed." />
      <datalist id="drug-names">
        {data?.dictionary.map((d) => <option key={d} value={d} />)}
      </datalist>

      <Card className="mb-4 overflow-hidden">
        <div className="helix-glow px-5 py-5">
          <div className="font-display text-lg font-semibold">Check a medicine</div>
          <p className="text-sm text-ink-2">Thinking about a new prescription? See what your genes and current medicines mean for it.</p>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              runCheck(query);
            }}
          >
            <Input list="drug-names" placeholder="e.g. clopidogrel, Zoloft, codeine" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Medicine name" className="sm:max-w-sm" />
            <Button disabled={checking || query.trim().length < 2}>
              <Search className="h-4 w-4" /> {checking ? "Checking…" : "Check"}
            </Button>
          </form>
        </div>
        {checkError && <div className="px-5 py-3"><ErrorNote>{checkError}</ErrorNote></div>}
        {check && <CheckPanel result={check} />}
      </Card>

      {error && <ErrorNote>{error}</ErrorNote>}
      <Card>
        <CardHeader title="Current medicines" eyebrow={`${active.length} active`} icon={<Pill className="h-4 w-4" />} />
        {!data ? (
          <Loading />
        ) : active.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <Th className="pl-5">Medicine</Th>
                  <Th>Dose</Th>
                  <Th>Flags</Th>
                  <Th>Source</Th>
                  {canEdit && <Th className="pr-5 text-right">Actions</Th>}
                </tr>
              </thead>
              <tbody>
                {active.map((m) => {
                  const flags = flagsFor(m);
                  return (
                    <tr key={m.id}>
                      <Td className="pl-5">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-ink-3">
                          {!m.name.toLowerCase().includes(m.drug) && `${capitalize(m.drug)} · `}
                          {m.reason || (m.startedAt ? `since ${fmtDate(m.startedAt)}` : "")}
                        </div>
                      </Td>
                      <Td className="text-ink-2">{m.dose || "—"}</Td>
                      <Td>
                        {flags.length ? (
                          <div className="flex flex-col gap-1">
                            {flags.slice(0, 3).map((f) => (
                              <Link key={f.id} href={`/app/insights/${f.id}`} className="flex items-center gap-2 text-sm hover:underline">
                                <PriorityPill priority={f.priority} />
                                <span className="line-clamp-1">{f.title}</span>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-sm text-ok">
                            <CircleCheck className="h-4 w-4" /> None
                          </span>
                        )}
                      </Td>
                      <Td>
                        <Tag>{m.source === "record" ? "Health record" : "Added by hand"}</Tag>
                      </Td>
                      {canEdit && (
                        <Td className="pr-5 text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => setActive(m, false)} title="Move to past medicines">
                            Mark stopped
                          </Button>
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No medicines yet" icon={<Pill className="h-5 w-5" />}>
            Add them below, or import a health record to bring them in automatically.
          </Empty>
        )}
        {canEdit && (
          <form onSubmit={add} className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-[1.3fr_1fr_1fr_auto] sm:items-end">
            <Field label="Medicine">
              <Input list="drug-names" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name or brand" />
            </Field>
            <Field label="Dose">
              <Input value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} placeholder="e.g. 20 mg daily" />
            </Field>
            <Field label="What it's for">
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Optional" />
            </Field>
            <Button>
              <Plus className="h-4 w-4" /> Add
            </Button>
            {formError && (
              <div className="sm:col-span-4">
                <ErrorNote>{formError}</ErrorNote>
              </div>
            )}
          </form>
        )}
        <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Marking a medicine as stopped only updates Allele. Don&apos;t stop a prescribed medicine without talking to your prescriber.</p>
      </Card>

      {past.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Past medicines" eyebrow="History" />
          <ul className="divide-y divide-line border-t border-line">
            {past.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="text-ink-2">
                  {m.name} {m.dose && <span className="text-ink-3">· {m.dose}</span>}
                </span>
                {canEdit && (
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setActive(m, true)}>
                      Restart
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(m)}>
                      Remove
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Disclaimer className="mt-6" />
    </>
  );
}

function CheckPanel({ result }: { result: CheckResult }) {
  const v = VERDICT[result.explanation.verdict];
  return (
    <div className="border-t border-line px-5 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-xl font-semibold">{capitalize(result.drug)}</span>
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium", v.tone)}>
          <v.icon className="h-4 w-4" /> {v.label}
        </span>
        {result.alreadyTaking && <Tag>Already on your list</Tag>}
      </div>
      {!result.hasGenome && (
        <div className="mt-3">
          <Notice>
            No genome in your vault, so gene-drug checks were skipped. <Link href="/app/genome" className="underline">Add your DNA file</Link>.
          </Notice>
        </div>
      )}
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed">{result.explanation.plainLanguage}</p>
      {result.findings.length > 0 && (
        <div className="mt-4 space-y-2">
          {result.findings.map((f) => (
            <div key={f.ruleCode} className="rounded-xl border border-line px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <PriorityPill priority={f.priority} />
                <span className="font-medium">{f.title}</span>
              </div>
              <p className="mt-1 text-sm text-ink-2">{f.recommendation}</p>
              <div className="mt-1 text-xs text-ink-3">{f.evidenceLevel}</div>
            </div>
          ))}
        </div>
      )}
      {result.explanation.questionsForClinician.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {result.explanation.questionsForClinician.map((q) => (
            <li key={q} className="flex gap-2">
              <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-seq" /> {q}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 text-xs text-ink-3">Explanation: {result.explanation.model}. Flags: rules engine.</div>
    </div>
  );
}
