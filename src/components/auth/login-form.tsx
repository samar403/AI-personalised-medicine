"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiSend, useQueryParam } from "@/components/use-api";
import { Button, ErrorNote, Field, Input } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const demo = useQueryParam("demo") !== null;
  const next = useQueryParam("next");
  const [typedEmail, setEmail] = useState<string | null>(null);
  const [typedPassword, setPassword] = useState<string | null>(null);
  const email = typedEmail ?? (demo ? "demo@allele.example" : "");
  const password = typedPassword ?? (demo ? "demo-vault-2026" : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/auth/login", "POST", { email, password });
      router.push(next?.startsWith("/app") ? next : "/app");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <ErrorNote>{error}</ErrorNote>}
      <Field label="Email">
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button className="w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <button
        type="button"
        className="w-full text-center text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        onClick={() => {
          setEmail("demo@allele.example");
          setPassword("demo-vault-2026");
        }}
      >
        Use the demo account
      </button>
    </form>
  );
}
