"use client";
import { useRef, useState } from "react";
import { Activity, Plus, Upload } from "lucide-react";
import { VitalChart } from "@/components/app/charts";
import { useCan, useSession } from "@/components/app/session";
import { apiSend, useApi } from "@/components/use-api";
import { Button, Card, cx, Disclaimer, Empty, ErrorNote, Field, Input, Loading, Notice, PageHeader, Select } from "@/components/ui";
import type { MetricDef, VitalSummary } from "@/lib/clinical/vitals";
import { fmtDate, fmtNum, toIsoDate } from "@/lib/format";

export default function VitalsPage() {
  const { me } = useSession();
  const canEdit = useCan("clinician");
  const { data, error, reload } = useApi<{ summaries: VitalSummary[]; metrics: MetricDef[] }>("/api/vitals");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [manual, setManual] = useState({ metric: "systolic", value: "", day: toIsoDate(new Date()) });

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await apiSend<{ rows: number; metrics: string[]; skipped: number; added: number }>("/api/vitals", "POST", form);
      setMsg({ tone: "ok", text: `Imported ${fmtNum(r.rows)} daily values across ${r.metrics.length} metrics${r.skipped ? ` (${r.skipped} out-of-range or unreadable rows skipped)` : ""}. ${r.added} new insight${r.added === 1 ? "" : "s"}.` });
      reload();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await apiSend("/api/vitals", "POST", { metric: manual.metric, value: Number(manual.value), day: manual.day });
      setManual({ ...manual, value: "" });
      setMsg({ tone: "ok", text: "Reading saved." });
      reload();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    }
  }

  const consented = me.vault.consents.wearables;
  return (
    <>
      <PageHeader
        eyebrow="Your baseline, not the average"
        title="Wearables"
        description="Daily signals from your watch, ring, scale, cuff or CGM. Allele compares each week with your own prior 30 days, shown as the shaded band."
        actions={
          canEdit && consented && (
            <>
              <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <Button onClick={() => input.current?.click()} disabled={busy}>
                <Upload className="h-4 w-4" /> {busy ? "Importing…" : "Import CSV"}
              </Button>
            </>
          )
        }
      />
      {!consented && <Notice tone="warn">Wearable data is switched off for this vault. The owner can enable it under Privacy &amp; sharing.</Notice>}
      {msg && <div className="mb-4">{msg.tone === "ok" ? <Notice tone="ok">{msg.text}</Notice> : <ErrorNote>{msg.text}</ErrorNote>}</div>}
      {error && <ErrorNote>{error}</ErrorNote>}

      {!data ? (
        <Loading />
      ) : data.summaries.length === 0 ? (
        <Card>
          <Empty title="No wearable data yet" icon={<Activity className="h-5 w-5" />}>
            Import a CSV with a <code>date</code> column plus any of: steps, resting_hr, hrv, sleep_hours, spo2, weight, systolic, diastolic, glucose. Long format (date, type, value, unit) works too. A sample file is at <a className="text-helix underline" href="/sample-wearables.csv">/sample-wearables.csv</a>.
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.summaries.map((s) => {
            const shifted = s.delta !== null && s.baselineSd !== null && Math.abs(s.delta) > s.baselineSd;
            return (
              <Card key={s.metric} className="px-5 pt-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-ink-2">{s.label}</div>
                    <div className="num text-2xl font-semibold">
                      {fmtNum(s.recentMean, s.metric === "sleep_hours" || s.metric === "weight" ? 1 : 0)} <span className="text-sm font-normal text-ink-3">{s.unit} · 7-day avg</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-ink-3">
                    {s.baselineMean !== null ? (
                      <>
                        <div>
                          Baseline <span className="num text-ink-2">{fmtNum(s.baselineMean, 1)}</span>
                        </div>
                        <div className={cx("num", shifted ? "font-semibold text-high" : "")}>
                          {s.delta! > 0 ? "+" : ""}
                          {fmtNum(s.delta!, 1)} {shifted ? "· outside your usual range" : ""}
                        </div>
                      </>
                    ) : (
                      <div>Baseline after 17+ days</div>
                    )}
                    <div className="mt-0.5">
                      {s.days} days · latest {fmtDate(s.latestDay, { day: "numeric", month: "short" })}
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <VitalChart data={s.series} unit={s.unit} baseline={s.baselineMean} sd={s.baselineSd} label={s.label} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {canEdit && consented && data && (
        <Card className="mt-4 px-5 py-4">
          <div className="mb-3 text-sm font-semibold">Add a reading by hand</div>
          <form onSubmit={addManual} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
            <Field label="Measurement">
              <Select value={manual.metric} onChange={(e) => setManual({ ...manual, metric: e.target.value })}>
                {data.metrics.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label} ({m.unit})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Value">
              <Input type="number" step="any" required value={manual.value} onChange={(e) => setManual({ ...manual, value: e.target.value })} />
            </Field>
            <Field label="Date">
              <Input type="date" required value={manual.day} onChange={(e) => setManual({ ...manual, day: e.target.value })} />
            </Field>
            <Button>
              <Plus className="h-4 w-4" /> Save
            </Button>
          </form>
          <p className="mt-3 text-xs text-ink-3">Consumer wearables are not medical devices. Optical SpO₂ and heart-rate readings can be less accurate with movement, cold hands, tattoos or darker skin.</p>
        </Card>
      )}
      <Disclaimer className="mt-6" />
    </>
  );
}
