"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiSend } from "@/components/use-api";
import { Button, cx, ErrorNote, Field, Input } from "@/components/ui";
import { CONSENT_ITEMS, type ConsentKey } from "@/lib/consent";
import { DISCLAIMER } from "@/lib/safety";

export function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({ genomics: true, wearables: true, records: true, ai: false });
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/auth/signup", "POST", { ...form, consents, acknowledged });
      router.push("/app/profile?welcome=1");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <ErrorNote>{error}</ErrorNote>}
      <Field label="Your name">
        <Input required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Email">
        <Input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label="Password" hint="At least 10 characters. Health data deserves a strong one.">
        <Input type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>

      <fieldset className="space-y-2 rounded-2xl border border-line bg-surface-2 p-4">
        <legend className="px-1 text-[13px] font-medium text-ink-2">What may Allele store and process?</legend>
        {CONSENT_ITEMS.map((c) => (
          <label key={c.key} className="flex cursor-pointer gap-3 rounded-xl p-2 hover:bg-surface">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--helix)]" checked={consents[c.key]} onChange={(e) => setConsents({ ...consents, [c.key]: e.target.checked })} />
            <span>
              <span className="block text-sm font-medium">{c.title}</span>
              <span className="block text-xs text-ink-3">{c.body}</span>
            </span>
          </label>
        ))}
        <p className="px-2 text-xs text-ink-3">You can change any of these later. Withdrawing consent deletes that data.</p>
      </fieldset>

      <label className={cx("flex cursor-pointer gap-3 rounded-xl border p-3 text-xs", acknowledged ? "border-helix/40 bg-helix-soft/50" : "border-line")}>
        <input type="checkbox" required className="mt-0.5 h-4 w-4 accent-[var(--helix)]" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
        <span className="text-ink-2">I understand: {DISCLAIMER}</span>
      </label>

      <Button className="w-full" disabled={busy || !acknowledged}>
        {busy ? "Creating your vault…" : "Create vault"}
      </Button>
    </form>
  );
}
