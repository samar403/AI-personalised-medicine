"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, BadgeCheck, BookOpen, HeartHandshake } from "lucide-react";
import { useCan, useSession } from "@/components/app/session";
import { apiSend, useApi } from "@/components/use-api";
import { Button, Card, CardHeader, Disclaimer, ErrorNote, Field, Loading, PriorityPill, Select, StatusPill, Tag, Textarea } from "@/components/ui";
import type { Insight, InsightStatus, Role } from "@/lib/db/schema";
import { fmtDateTime, KIND_LABEL, ROLE_LABEL, STATUS_LABEL } from "@/lib/format";

interface Detail {
  item: Insight;
  notes: { id: string; body: string; createdAt: string; author: string | null; role: Role | null }[];
  reviewer: { name: string; role: Role } | null;
}

export default function InsightDetail() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const canEdit = useCan("clinician");
  const { data, error, reload } = useApi<Detail>(`/api/insights/${id}`);
  const [status, setStatus] = useState<InsightStatus | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [note, setNote] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const { item } = data;
  const nextStatus = status ?? item.status;
  const statuses = (["new", "discussing", "reviewed", "dismissed"] as InsightStatus[]).filter((s) => s !== "reviewed" || me.user.role === "clinician" || item.status === "reviewed");

  async function save() {
    setSaveError(null);
    try {
      await apiSend(`/api/insights/${id}`, "PATCH", { status: nextStatus, reviewNote });
      setStatus(null);
      setReviewNote("");
      reload();
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    await apiSend(`/api/insights/${id}/notes`, "POST", { body: note });
    setNote("");
    reload();
  }

  return (
    <>
      <Link href="/app/insights" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Insights
      </Link>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="px-6 py-6">
            <div className="flex flex-wrap items-center gap-2">
              <PriorityPill priority={item.priority} />
              <Tag tone={item.kind === "gene_drug" ? "seq" : "plain"}>{KIND_LABEL[item.kind]}</Tag>
              <StatusPill status={item.status} />
            </div>
            <h1 className="mt-3 font-display text-2xl font-semibold sm:text-3xl">{item.title}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{item.summary}</p>
            <div className="mt-5 rounded-2xl bg-helix-soft/60 px-5 py-4">
              <div className="text-[12px] font-semibold text-helix">What to do</div>
              <p className="mt-1 text-[15px]">{item.recommendation}</p>
            </div>
            {item.rationale && (
              <p className="mt-4 text-sm text-ink-2">
                <span className="font-medium text-ink">Why this applies to you: </span>
                {item.rationale}
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="The evidence" eyebrow="Your data" icon={<BookOpen className="h-4 w-4" />} />
            <dl className="divide-y divide-line border-t border-line">
              {item.evidence.map((e) => (
                <div key={e.label} className="grid gap-1 px-5 py-3 sm:grid-cols-[180px_1fr]">
                  <dt className="text-sm text-ink-3">{e.label}</dt>
                  <dd className="num text-sm">{e.detail}</dd>
                </div>
              ))}
              <div className="grid gap-1 px-5 py-3 sm:grid-cols-[180px_1fr]">
                <dt className="text-sm text-ink-3">Guideline</dt>
                <dd className="text-sm">{item.evidenceLevel}</dd>
              </div>
            </dl>
          </Card>

          {item.questions.length > 0 && (
            <Card className="px-5 py-4">
              <div className="text-sm font-semibold">Questions to ask</div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {item.questions.map((q) => (
                  <li key={q} className="flex gap-2">
                    <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-seq" /> {q}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Care-team notes" eyebrow="Discussion" />
            <div className="space-y-3 border-t border-line px-5 py-4">
              {data.notes.length === 0 && <p className="text-sm text-ink-3">No notes yet.</p>}
              {data.notes.map((n) => (
                <div key={n.id} className="rounded-xl bg-surface-2 px-4 py-3">
                  <div className="text-xs text-ink-3">
                    {n.author ?? "Former member"}
                    {n.role && ` · ${ROLE_LABEL[n.role]}`} · {fmtDateTime(n.createdAt)}
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-line">{n.body}</p>
                </div>
              ))}
              {canEdit && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Textarea className="min-h-16 flex-1" placeholder="Add a note for your care team" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
                  <Button variant="secondary" onClick={addNote} disabled={!note.trim()}>
                    Add note
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="px-5 py-5">
            <div className="text-sm font-semibold">Status</div>
            {data.reviewer && item.status === "reviewed" && (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok">
                <BadgeCheck className="h-4 w-4" /> Reviewed by {data.reviewer.name}
              </div>
            )}
            {item.reviewNote && <p className="mt-2 text-sm text-ink-2">&ldquo;{item.reviewNote}&rdquo;</p>}
            {canEdit ? (
              <div className="mt-3 space-y-3">
                <Field label="Move to">
                  <Select value={nextStatus} onChange={(e) => setStatus(e.target.value as InsightStatus)}>
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                {(nextStatus === "dismissed" || nextStatus === "reviewed") && (
                  <Field label={nextStatus === "dismissed" ? "Why dismiss it?" : "Review note (optional)"}>
                    <Textarea className="min-h-16" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
                  </Field>
                )}
                {saveError && <ErrorNote>{saveError}</ErrorNote>}
                <Button className="w-full" onClick={save} disabled={nextStatus === item.status && !reviewNote}>
                  Save
                </Button>
                {me.user.role !== "clinician" && <p className="text-xs text-ink-3">Only a clinician you&apos;ve shared your vault with can mark an insight as clinician-reviewed.</p>}
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-3">You have view-only access.</p>
            )}
          </Card>
          <Card className="px-5 py-4 text-xs text-ink-3">
            Raised {fmtDateTime(item.createdAt)} · updated {fmtDateTime(item.updatedAt)} · source: {item.model === "rules" ? "rules engine" : item.model}
          </Card>
          <Disclaimer compact />
        </div>
      </div>
    </>
  );
}
