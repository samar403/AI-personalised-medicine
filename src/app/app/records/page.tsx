"use client";
import { useRef, useState } from "react";
import { FileHeart, FlaskConical, Plus, Trash2, Upload } from "lucide-react";
import { useCan, useSession } from "@/components/app/session";
import { apiSend, useApi } from "@/components/use-api";
import { Button, Card, CardHeader, cx, Disclaimer, Empty, ErrorNote, Field, Input, Loading, Notice, PageHeader, Select, Tag, Td, Th } from "@/components/ui";
import type { Allergy, Condition, LabResult } from "@/lib/db/schema";
import type { LabFlag } from "@/lib/clinical/labs";
import { fmtDate, fmtNum, toIsoDate } from "@/lib/format";

interface RecordsResponse {
  conditions: Condition[];
  allergies: Allergy[];
  labs: (LabResult & { interpretation: { flag: LabFlag; label: string } | null })[];
  labTests: { key: string; name: string; unit: string }[];
}

const FLAG_STYLE: Record<LabFlag, string> = {
  normal: "text-ok",
  borderline: "text-moderate",
  high: "text-high",
  low: "text-info",
  critical: "text-urgent font-semibold",
};

export default function RecordsPage() {
  const { me } = useSession();
  const canEdit = useCan("clinician");
  const { data, error, reload } = useApi<RecordsResponse>("/api/records");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [lab, setLab] = useState({ test: "ldl", value: "", unit: "", takenAt: toIsoDate(new Date()) });
  const [condition, setCondition] = useState("");
  const [allergy, setAllergy] = useState({ substance: "", reaction: "" });

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await apiSend<Record<string, number>>("/api/records", "POST", form);
      setMsg({ tone: "ok", text: `Imported ${r.medications} medicines, ${r.conditions} conditions, ${r.allergies} allergies, ${r.labs} lab results and ${r.vitals} vital signs. ${r.added} new insight${r.added === 1 ? "" : "s"}.` });
      reload();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setMsg(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    }
  }

  const consented = me.vault.consents.records;
  const unitFor = (key: string) => data?.labTests.find((t) => t.key === key)?.unit ?? "";
  return (
    <>
      <PageHeader
        eyebrow="FHIR R4 · LOINC"
        title="Health records"
        description="Conditions, allergies and lab results from your patient portal, interpreted against standard adult ranges and checked against your medicines."
        actions={
          canEdit && consented && (
            <>
              <input ref={input} type="file" accept=".json,application/json,application/fhir+json" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <Button onClick={() => input.current?.click()} disabled={busy}>
                <Upload className="h-4 w-4" /> {busy ? "Importing…" : "Import FHIR export"}
              </Button>
            </>
          )
        }
      />
      {!consented && <Notice tone="warn">Health records are switched off for this vault. The owner can enable them under Privacy &amp; sharing.</Notice>}
      {msg && <div className="mb-4">{msg.tone === "ok" ? <Notice tone="ok">{msg.text}</Notice> : <ErrorNote>{msg.text}</ErrorNote>}</div>}
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data ? (
        <Loading />
      ) : (
        <>
          <Card>
            <CardHeader title="Lab results" eyebrow={`${data.labs.length} results`} icon={<FlaskConical className="h-4 w-4" />} />
            {data.labs.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr>
                      <Th className="pl-5">Test</Th>
                      <Th className="text-right">Result</Th>
                      <Th>Interpretation</Th>
                      <Th>Date</Th>
                      {canEdit && <Th className="pr-5" />}
                    </tr>
                  </thead>
                  <tbody>
                    {data.labs.map((l) => (
                      <tr key={l.id}>
                        <Td className="pl-5">
                          <div className="font-medium">{l.name}</div>
                          {l.loinc && <div className="num text-[11px] text-ink-3">LOINC {l.loinc}</div>}
                        </Td>
                        <Td className="num text-right">
                          {fmtNum(l.value, 2)} <span className="text-xs text-ink-3">{l.unit}</span>
                        </Td>
                        <Td>{l.interpretation ? <span className={cx("text-sm", FLAG_STYLE[l.interpretation.flag])}>{l.interpretation.label}</span> : <span className="text-sm text-ink-3">Check the lab&apos;s own range</span>}</Td>
                        <Td className="text-ink-2">{fmtDate(l.takenAt)}</Td>
                        {canEdit && (
                          <Td className="pr-5 text-right">
                            <button className="text-ink-3 hover:text-urgent" aria-label={`Delete ${l.name}`} onClick={() => act(() => apiSend(`/api/records/labs/${l.id}`, "DELETE"))}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </Td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No lab results" icon={<FlaskConical className="h-5 w-5" />}>
                Import a FHIR export from your patient portal (Epic MyChart, Cerner, Apple Health Records, NHS App) or add results by hand.
              </Empty>
            )}
            {canEdit && consented && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act(async () => {
                    await apiSend("/api/records/labs", "POST", { test: lab.test, value: Number(lab.value), unit: lab.unit || unitFor(lab.test), takenAt: lab.takenAt });
                    setLab({ ...lab, value: "" });
                  });
                }}
                className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-[1.4fr_1fr_0.8fr_1fr_auto] sm:items-end"
              >
                <Field label="Test">
                  <Select value={lab.test} onChange={(e) => setLab({ ...lab, test: e.target.value, unit: "" })}>
                    {data.labTests.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Value">
                  <Input type="number" step="any" required value={lab.value} onChange={(e) => setLab({ ...lab, value: e.target.value })} />
                </Field>
                <Field label="Unit">
                  <Input value={lab.unit} placeholder={unitFor(lab.test)} onChange={(e) => setLab({ ...lab, unit: e.target.value })} />
                </Field>
                <Field label="Date">
                  <Input type="date" required value={lab.takenAt} onChange={(e) => setLab({ ...lab, takenAt: e.target.value })} />
                </Field>
                <Button>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </form>
            )}
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Conditions" eyebrow={`${data.conditions.length} recorded`} icon={<FileHeart className="h-4 w-4" />} />
              <ul className="divide-y divide-line border-t border-line">
                {data.conditions.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span>
                      {c.name} {c.onsetAt && <span className="text-xs text-ink-3">· since {fmtDate(c.onsetAt, { month: "short", year: "numeric" })}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <Tag tone={c.status === "active" ? "helix" : "plain"}>{c.status}</Tag>
                      {canEdit && (
                        <button className="text-ink-3 hover:text-urgent" aria-label={`Delete ${c.name}`} onClick={() => act(() => apiSend(`/api/records/conditions/${c.id}`, "DELETE"))}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
                {!data.conditions.length && <li className="px-5 py-3 text-sm text-ink-3">None recorded.</li>}
              </ul>
              {canEdit && consented && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(async () => {
                      await apiSend("/api/records/conditions", "POST", { name: condition });
                      setCondition("");
                    });
                  }}
                  className="flex gap-2 border-t border-line px-5 py-3"
                >
                  <Input required minLength={2} placeholder="Add a condition, e.g. Hypertension" value={condition} onChange={(e) => setCondition(e.target.value)} aria-label="Condition" />
                  <Button variant="secondary">Add</Button>
                </form>
              )}
            </Card>
            <Card>
              <CardHeader title="Allergies" eyebrow={`${data.allergies.length} recorded`} />
              <ul className="divide-y divide-line border-t border-line">
                {data.allergies.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span>
                      <span className="font-medium">{a.substance}</span> {a.reaction && <span className="text-ink-3">· {a.reaction}</span>}
                    </span>
                    {canEdit && (
                      <button className="text-ink-3 hover:text-urgent" aria-label={`Delete ${a.substance}`} onClick={() => act(() => apiSend(`/api/records/allergies/${a.id}`, "DELETE"))}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
                {!data.allergies.length && <li className="px-5 py-3 text-sm text-ink-3">No known allergies recorded.</li>}
              </ul>
              {canEdit && consented && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(async () => {
                      await apiSend("/api/records/allergies", "POST", allergy);
                      setAllergy({ substance: "", reaction: "" });
                    });
                  }}
                  className="grid gap-2 border-t border-line px-5 py-3 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <Input required minLength={2} placeholder="Substance, e.g. Penicillin" value={allergy.substance} onChange={(e) => setAllergy({ ...allergy, substance: e.target.value })} aria-label="Allergy substance" />
                  <Input placeholder="Reaction (optional)" value={allergy.reaction} onChange={(e) => setAllergy({ ...allergy, reaction: e.target.value })} aria-label="Reaction" />
                  <Button variant="secondary">Add</Button>
                </form>
              )}
            </Card>
          </div>
          <p className="mt-3 text-xs text-ink-3">A sample FHIR bundle is at <a className="text-helix underline" href="/sample-record.json">/sample-record.json</a>. Names, addresses and record numbers in an import are never read or stored.</p>
        </>
      )}
      <Disclaimer className="mt-6" />
    </>
  );
}
