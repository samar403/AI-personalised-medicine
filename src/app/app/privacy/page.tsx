"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, History, KeyRound, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useCan, useSession } from "@/components/app/session";
import { apiSend, useApi } from "@/components/use-api";
import { Button, Card, CardHeader, cx, Disclaimer, ErrorNote, Field, Input, Loading, Notice, PageHeader, Select, Tag } from "@/components/ui";
import { CONSENT_ITEMS, type ConsentKey } from "@/lib/consent";
import type { Role } from "@/lib/db/schema";
import { fmtDateTime, ROLE_LABEL } from "@/lib/format";

type Member = { id: string; name: string; email: string; role: Role; createdAt: string };
type LogItem = { entry: { id: string; action: string; entityType: string; details: Record<string, unknown>; createdAt: string }; actor: string | null; actorRole: Role | null };

const ACTION_LABEL: Record<string, string> = {
  "vault.created": "Created the vault",
  "user.login": "Signed in",
  "genome.uploaded": "Uploaded genetic data",
  "genome.viewed": "Viewed genetic results",
  "genome.deleted": "Deleted genetic data",
  "records.viewed": "Viewed health records",
  "record.imported": "Imported a health record",
  "vitals.imported": "Imported wearable data",
  "consent.updated": "Changed consent",
  "access.granted": "Shared access",
  "access.revoked": "Revoked access",
  "care_plan.generated": "Generated a care plan",
  "brief.created": "Created a clinician brief",
  "brief.viewed": "Viewed a clinician brief",
  "medication.checked": "Checked a medicine",
  "medication.added": "Added a medicine",
  "insight.status_changed": "Updated an insight",
  "insights.synced": "Re-checked insights",
  "vault.exported": "Exported all data",
  "assistant.red_flag": "Emergency guidance shown",
};

export default function PrivacyPage() {
  const router = useRouter();
  const { me, refresh } = useSession();
  const isOwner = useCan("owner");
  const members = useApi<{ items: Member[] }>("/api/vault/members");
  const log = useApi<{ items: LogItem[] }>(isOwner ? "/api/audit-log" : null);
  const [consents, setConsents] = useState<Record<ConsentKey, boolean> | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [invite, setInvite] = useState({ name: "", email: "", role: "clinician" as "clinician" | "caregiver", password: "" });
  const [del, setDel] = useState({ confirm: "", password: "" });

  const current = consents ?? { genomics: me.vault.consents.genomics, wearables: me.vault.consents.wearables, records: me.vault.consents.records, ai: me.vault.consents.ai };
  const withdrawing = CONSENT_ITEMS.filter((c) => c.key !== "ai" && me.vault.consents[c.key] && !current[c.key]);

  async function saveConsents() {
    setMsg(null);
    try {
      const r = await apiSend<{ deleted: string[] }>("/api/vault/consents", "PATCH", current);
      setConsents(null);
      refresh();
      setMsg({ tone: "ok", text: r.deleted.length ? `Consent updated. Deleted: ${r.deleted.join(", ")}.` : "Consent updated." });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    }
  }

  async function share(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await apiSend("/api/vault/members", "POST", invite);
      setMsg({ tone: "ok", text: `${invite.name} can now sign in with ${invite.email} and the temporary password you set. Share it with them privately.` });
      setInvite({ name: "", email: "", role: "clinician", password: "" });
      members.reload();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    }
  }

  async function revoke(m: Member) {
    await apiSend(`/api/vault/members/${m.id}`, "DELETE");
    members.reload();
  }

  async function deleteVault(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/api/vault", "DELETE", del);
      router.push("/?deleted=1");
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    }
  }

  return (
    <>
      <PageHeader eyebrow="You're in control" title="Privacy & sharing" description="Choose what Allele may store, who can see it, and take it all with you or delete it at any time." />
      {msg && <div className="mb-4">{msg.tone === "ok" ? <Notice tone="ok">{msg.text}</Notice> : <ErrorNote>{msg.text}</ErrorNote>}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Consent" eyebrow={`Version ${me.vault.consents.version}`} icon={<ShieldCheck className="h-4 w-4" />} />
          <div className="space-y-1 border-t border-line px-3 py-3">
            {CONSENT_ITEMS.map((c) => (
              <label key={c.key} className={cx("flex gap-3 rounded-xl p-2", isOwner && "cursor-pointer hover:bg-surface-2")}>
                <input type="checkbox" disabled={!isOwner} className="mt-1 h-4 w-4 accent-[var(--helix)]" checked={current[c.key]} onChange={(e) => setConsents({ ...current, [c.key]: e.target.checked })} />
                <span>
                  <span className="block text-sm font-medium">{c.title}</span>
                  <span className="block text-xs text-ink-3">{c.body}</span>
                </span>
              </label>
            ))}
          </div>
          {isOwner && consents && (
            <div className="space-y-2 border-t border-line px-5 py-3">
              {withdrawing.length > 0 && <Notice tone="warn">Saving will permanently delete your {withdrawing.map((w) => w.title.toLowerCase()).join(" and ")}.</Notice>}
              <div className="flex gap-2">
                <Button onClick={saveConsents}>Save consent</Button>
                <Button variant="ghost" onClick={() => setConsents(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <div className="border-t border-line px-5 py-3 text-xs text-ink-3">Last changed {fmtDateTime(me.vault.consents.acceptedAt)}.</div>
        </Card>

        <Card>
          <CardHeader title="How your data is protected" eyebrow="Safeguards" icon={<KeyRound className="h-4 w-4" />} />
          <ul className="space-y-2.5 border-t border-line px-5 py-4 text-sm text-ink-2">
            <li><span className="font-medium text-ink">Data minimisation.</span> DNA files are parsed in your browser; only 20 panel genotypes reach the server. FHIR imports ignore names, addresses and identifiers.</li>
            <li><span className="font-medium text-ink">Encryption.</span> Genotypes are encrypted at rest with AES-256-GCM. Sessions use signed, HTTP-only cookies.</li>
            <li><span className="font-medium text-ink">De-identified AI.</span> Claude receives age, sex and clinical data only, never your name or email, and only if you opt in. Anthropic does not train on API data.</li>
            <li><span className="font-medium text-ink">Access control.</span> Only people you invite can see your vault, and every view of genetic data, records or briefs by someone else is logged below.</li>
            <li><span className="font-medium text-ink">Your rights.</span> Export everything as JSON, withdraw consent per data type, or delete the vault permanently.</li>
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Who can see this vault" eyebrow="Care team" icon={<Users className="h-4 w-4" />} />
        {!members.data ? (
          <Loading />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {members.data.items.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="text-sm font-medium">
                    {m.name} {m.id === me.user.id && <span className="text-ink-3">(you)</span>}
                  </div>
                  <div className="text-xs text-ink-3">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Tag tone={m.role === "owner" ? "helix" : m.role === "clinician" ? "seq" : "plain"}>{ROLE_LABEL[m.role]}</Tag>
                  {isOwner && m.role !== "owner" && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(m)}>
                      Revoke
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {isOwner && (
          <form onSubmit={share} className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.2fr_0.8fr_1fr_auto] lg:items-end">
            <Field label="Name">
              <Input required value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </Field>
            <Field label="Role">
              <Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as "clinician" | "caregiver" })}>
                <option value="clinician">Clinician</option>
                <option value="caregiver">Caregiver</option>
              </Select>
            </Field>
            <Field label="Temporary password">
              <Input type="text" required minLength={10} value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} />
            </Field>
            <Button>
              <UserPlus className="h-4 w-4" /> Share
            </Button>
            <p className="text-xs text-ink-3 sm:col-span-2 lg:col-span-5">Clinicians can add data, write notes and mark insights as reviewed. Caregivers can view only. Neither can change consent, share further or delete the vault.</p>
          </form>
        )}
      </Card>

      {isOwner && (
        <>
          <Card className="mt-4">
            <CardHeader title="Access log" eyebrow="Append-only" icon={<History className="h-4 w-4" />} />
            {!log.data ? (
              <Loading />
            ) : (
              <ul className="max-h-96 divide-y divide-line overflow-y-auto border-t border-line">
                {log.data.items.map(({ entry, actor, actorRole }) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span>
                      <span className={cx(actorRole && actorRole !== "owner" && "font-medium text-seq")}>{actor ?? "System"}</span> <span className="text-ink-2">{(ACTION_LABEL[entry.action] ?? entry.action).toLowerCase()}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-3">{fmtDateTime(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="px-5 py-5">
              <div className="flex items-center gap-2 font-semibold">
                <Download className="h-4 w-4 text-helix" /> Export everything
              </div>
              <p className="mt-1 text-sm text-ink-2">Download your profile, genotypes, medicines, records, wearable data, insights, plans, briefs and access log as one JSON file.</p>
              <a href="/api/vault/export" className="mt-3 inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-5 text-sm font-medium hover:border-helix hover:text-helix">
                <Download className="h-4 w-4" /> Download my data
              </a>
            </Card>
            <Card className="border-urgent/30 px-5 py-5">
              <div className="flex items-center gap-2 font-semibold text-urgent">
                <Trash2 className="h-4 w-4" /> Delete vault
              </div>
              <p className="mt-1 text-sm text-ink-2">Permanently deletes this vault, everything in it, and every account you shared it with. This can&apos;t be undone.</p>
              <form onSubmit={deleteVault} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input placeholder="Type DELETE" value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} aria-label="Type DELETE to confirm" />
                <Input type="password" placeholder="Your password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} aria-label="Password" />
                <Button variant="danger" disabled={del.confirm !== "DELETE" || !del.password}>
                  Delete
                </Button>
              </form>
            </Card>
          </div>
        </>
      )}
      <Disclaimer className="mt-6" />
    </>
  );
}
