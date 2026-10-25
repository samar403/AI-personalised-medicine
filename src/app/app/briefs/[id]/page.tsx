"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Logo } from "@/components/logo";
import { useApi } from "@/components/use-api";
import { Button, cx, ErrorNote, Loading, PriorityPill } from "@/components/ui";
import type { Brief } from "@/lib/db/schema";
import { capitalize, fmtDate, fmtDateTime, fmtNum, SEX_LABEL, STATUS_LABEL } from "@/lib/format";
import { DISCLAIMER } from "@/lib/safety";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-line pt-4">
      <h2 className="mb-2 text-[12px] font-semibold tracking-[0.12em] text-ink-3 uppercase">{title}</h2>
      {children}
    </section>
  );
}

export default function BriefPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useApi<{ brief: Brief }>(`/api/briefs/${id}`);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const { brief } = data;
  const c = brief.content;
  const p = c.patient;

  return (
    <>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/app/briefs" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Briefs
        </Link>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print or save as PDF
        </Button>
      </div>
      <article className="mx-auto max-w-4xl space-y-4 rounded-2xl border border-line bg-surface px-6 py-6 shadow-card sm:px-10 sm:py-8 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Logo />
            <h1 className="mt-3 font-display text-2xl font-semibold">Pre-visit pharmacogenomic & health brief</h1>
            <p className="text-sm text-ink-3">Generated {fmtDateTime(c.generatedAt)} · narrative: {c.narrative.model}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-ink-3">Age</dt>
            <dd>{p.age ?? "—"}</dd>
            <dt className="text-ink-3">Sex</dt>
            <dd>{SEX_LABEL[p.sex as keyof typeof SEX_LABEL] ?? p.sex}</dd>
            <dt className="text-ink-3">Height / weight</dt>
            <dd>
              {p.heightCm ?? "—"} cm / {p.weightKg ?? "—"} kg
            </dd>
            <dt className="text-ink-3">Smoking</dt>
            <dd>{capitalize(p.smoking)}</dd>
          </dl>
        </header>

        <Section title="Summary">
          <p className="text-[15px] leading-relaxed">{c.narrative.summary}</p>
          {c.narrative.discussionPoints.length > 0 && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
              {c.narrative.discussionPoints.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ol>
          )}
        </Section>

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Active medications">
            <ul className="space-y-1.5 text-sm">
              {c.medications.map((m) => (
                <li key={m.name}>
                  <span className="font-medium">{m.name}</span> {m.dose && <span className="text-ink-3">· {m.dose}</span>}
                  {m.flags.length > 0 && <div className="text-xs text-high">⚑ {m.flags.join("; ")}</div>}
                </li>
              ))}
              {!c.medications.length && <li className="text-ink-3">None recorded</li>}
            </ul>
          </Section>
          <Section title="Conditions and allergies">
            <p className="text-sm">{c.conditions.join(", ") || "No conditions recorded"}</p>
            <p className="mt-2 text-sm">
              <span className="text-ink-3">Allergies: </span>
              {c.allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`).join(", ") || "None recorded"}
            </p>
          </Section>
        </div>

        <Section title="Pharmacogenomics (consumer array, confirm clinically before prescribing)">
          {c.pharmacogenomics.length ? (
            <table className="w-full text-sm">
              <tbody>
                {c.pharmacogenomics.map((g) => (
                  <tr key={g.gene} className={cx("border-b border-line", g.actionable && "font-medium")}>
                    <td className="py-1.5 pr-3">{g.gene}</td>
                    <td className="num py-1.5 pr-3">{g.diplotype}</td>
                    <td className="py-1.5 pr-3">{g.phenotype}</td>
                    <td className="py-1.5 text-xs text-ink-3">{g.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink-3">No genotype data.</p>
          )}
        </Section>

        <Section title="Findings for review">
          <ul className="space-y-2.5">
            {c.findings.map((f) => (
              <li key={f.title} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityPill priority={f.priority} />
                  <span className="font-medium">{f.title}</span>
                  <span className="text-xs text-ink-3">{STATUS_LABEL[f.status as keyof typeof STATUS_LABEL] ?? f.status}</span>
                </div>
                <div className="mt-0.5 text-ink-2">{f.recommendation}</div>
                <div className="text-xs text-ink-3">
                  {f.evidence.map((e) => `${e.label}: ${e.detail}`).join(" · ")} · {f.evidenceLevel}
                </div>
              </li>
            ))}
            {!c.findings.length && <li className="text-sm text-ink-3">No rule-based findings.</li>}
          </ul>
        </Section>

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Recent labs">
            <table className="w-full text-sm">
              <tbody>
                {c.labs.slice(0, 12).map((l) => (
                  <tr key={l.name} className="border-b border-line">
                    <td className="py-1 pr-2">{l.name}</td>
                    <td className="num py-1 pr-2 text-right">
                      {fmtNum(l.value, 1)} {l.unit}
                    </td>
                    <td className={cx("py-1 text-xs", l.flag && l.flag !== "normal" ? "text-high" : "text-ink-3")}>{fmtDate(l.takenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!c.labs.length && <p className="text-sm text-ink-3">No labs.</p>}
          </Section>
          <Section title="Wearable trends (7-day mean vs prior 30 days)">
            <table className="w-full text-sm">
              <tbody>
                {c.vitals.map((v) => (
                  <tr key={v.label} className="border-b border-line">
                    <td className="py-1 pr-2">{v.label}</td>
                    <td className="num py-1 text-right">
                      {fmtNum(v.recent, 1)} {v.baseline !== null && <span className="text-ink-3">vs {fmtNum(v.baseline, 1)}</span>} {v.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!c.vitals.length && <p className="text-sm text-ink-3">No wearable data.</p>}
          </Section>
        </div>

        <footer className="border-t border-line pt-4 text-xs text-ink-3">{DISCLAIMER} Gene-drug guidance follows CPIC guidelines; findings are generated by Allele&apos;s rules engine.</footer>
      </article>
    </>
  );
}
