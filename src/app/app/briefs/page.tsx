"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Stethoscope } from "lucide-react";
import { useCan } from "@/components/app/session";
import { apiSend, useApi } from "@/components/use-api";
import { Button, Card, Disclaimer, Empty, ErrorNote, Loading, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export default function BriefsPage() {
  const router = useRouter();
  const canCreate = useCan("clinician");
  const { data, error } = useApi<{ items: { id: string; title: string; createdAt: string }[] }>("/api/briefs");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setCreateError(null);
    try {
      const { brief } = await apiSend<{ brief: { id: string } }>("/api/briefs", "POST");
      router.push(`/app/briefs/${brief.id}`);
    } catch (e) {
      setCreateError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="For your appointment"
        title="Clinician briefs"
        description="A one-page, point-in-time summary for your doctor or pharmacist: pharmacogenomics, medicines with flags, key labs, wearable trends and what to discuss."
        actions={
          canCreate && (
            <Button onClick={create} disabled={busy}>
              <Stethoscope className="h-4 w-4" /> {busy ? "Preparing…" : "New brief"}
            </Button>
          )
        }
      />
      {createError && <div className="mb-4"><ErrorNote>{createError}</ErrorNote></div>}
      {error && <ErrorNote>{error}</ErrorNote>}
      <Card>
        {!data ? (
          <Loading />
        ) : data.items.length ? (
          <ul className="divide-y divide-line">
            {data.items.map((b) => (
              <li key={b.id}>
                <Link href={`/app/briefs/${b.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-surface-2">
                  <span>
                    <span className="font-medium">{b.title}</span>
                    <span className="ml-2 text-xs text-ink-3">{fmtDateTime(b.createdAt)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No briefs yet" icon={<Stethoscope className="h-5 w-5" />}>
            Create one before your next appointment. It&apos;s frozen at the time it&apos;s made, so you can show exactly what you discussed.
          </Empty>
        )}
      </Card>
      <Disclaimer className="mt-6" />
    </>
  );
}
