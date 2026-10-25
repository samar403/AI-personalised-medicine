"use client";
import { useState } from "react";
import { UserRound } from "lucide-react";
import { useCan, useSession } from "@/components/app/session";
import { useQueryParam, apiSend } from "@/components/use-api";
import { Button, Card, Disclaimer, ErrorNote, Field, Input, Notice, PageHeader, Select } from "@/components/ui";
import type { HealthProfile } from "@/lib/db/schema";

export default function ProfilePage() {
  const { me, refresh } = useSession();
  const isOwner = useCan("owner");
  const welcome = useQueryParam("welcome") !== null;
  const [name, setName] = useState(me.vault.name);
  const [profile, setProfile] = useState<HealthProfile>(me.vault.profile);
  const [goals, setGoals] = useState(me.vault.profile.goals.join("\n"));
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const num = (v: string) => (v === "" ? null : Number(v));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await apiSend("/api/vault/profile", "PATCH", { name, profile: { ...profile, goals: goals.split("\n").map((g) => g.trim()).filter(Boolean) } });
      refresh();
      setMsg({ tone: "ok", text: "Profile saved. Your insights were re-checked." });
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    }
  }

  return (
    <>
      <PageHeader eyebrow="About you" title="Profile" description="A few facts that change how results are read: lab ranges differ by sex, some guidance depends on age, pregnancy or ancestry." />
      {welcome && (
        <div className="mb-4">
          <Notice tone="ok">Your vault is ready. Fill in your profile, then add your genome, wearable data or health records in any order.</Notice>
        </div>
      )}
      {msg && <div className="mb-4">{msg.tone === "ok" ? <Notice tone="ok">{msg.text}</Notice> : <ErrorNote>{msg.text}</ErrorNote>}</div>}
      <Card className="px-5 py-5">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Vault name" className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} />
          </Field>
          <Field label="Year of birth" hint="We store the year only, never the full date.">
            <Input type="number" min={1900} max={new Date().getFullYear()} value={profile.birthYear ?? ""} onChange={(e) => setProfile({ ...profile, birthYear: num(e.target.value) })} disabled={!isOwner} />
          </Field>
          <Field label="Sex" hint="Used for lab reference ranges.">
            <Select value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value as HealthProfile["sex"] })} disabled={!isOwner}>
              <option value="unspecified">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="intersex">Intersex</option>
            </Select>
          </Field>
          <Field label="Height (cm)">
            <Input type="number" step="any" value={profile.heightCm ?? ""} onChange={(e) => setProfile({ ...profile, heightCm: num(e.target.value) })} disabled={!isOwner} />
          </Field>
          <Field label="Weight (kg)">
            <Input type="number" step="any" value={profile.weightKg ?? ""} onChange={(e) => setProfile({ ...profile, weightKg: num(e.target.value) })} disabled={!isOwner} />
          </Field>
          <Field label="Smoking">
            <Select value={profile.smoking} onChange={(e) => setProfile({ ...profile, smoking: e.target.value as HealthProfile["smoking"] })} disabled={!isOwner}>
              <option value="unspecified">Prefer not to say</option>
              <option value="never">Never</option>
              <option value="former">Former</option>
              <option value="current">Current</option>
            </Select>
          </Field>
          <Field label="Ancestry (optional)" hint="Some gene-drug guidance differs by ancestry, e.g. HLA and NUDT15.">
            <Input value={profile.ancestry} onChange={(e) => setProfile({ ...profile, ancestry: e.target.value })} disabled={!isOwner} />
          </Field>
          <label className="flex items-center gap-3 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--helix)]" checked={profile.pregnant} onChange={(e) => setProfile({ ...profile, pregnant: e.target.checked })} disabled={!isOwner} />
            Currently pregnant
          </label>
          <Field label="Health goals" hint="One per line, e.g. Lower my blood pressure without more pills." className="sm:col-span-2">
            <textarea className="min-h-24 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm focus:border-helix focus:outline-none" value={goals} onChange={(e) => setGoals(e.target.value)} disabled={!isOwner} />
          </Field>
          {isOwner && (
            <div className="sm:col-span-2">
              <Button>
                <UserRound className="h-4 w-4" /> Save profile
              </Button>
            </div>
          )}
        </form>
      </Card>
      <Disclaimer className="mt-6" />
    </>
  );
}
