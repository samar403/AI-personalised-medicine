"use client";
import { Lightbulb, RefreshCw } from "lucide-react";
import { useState } from "react";
import { InsightRow } from "@/components/app/insight-card";
import { useCan } from "@/components/app/session";
import { apiSend, useApi } from "@/components/use-api";
import { Button, Card, cx, Disclaimer, Empty, ErrorNote, Loading, PageHeader } from "@/components/ui";
import type { Insight } from "@/lib/db/schema";
import { KIND_LABEL } from "@/lib/format";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "gene_drug", label: KIND_LABEL.gene_drug },
  { key: "drug_drug", label: KIND_LABEL.drug_drug },
  { key: "lab", label: KIND_LABEL.lab },
  { key: "vital", label: KIND_LABEL.vital },
  { key: "reviewed", label: "Reviewed" },
  { key: "all", label: "All" },
] as const;

export default function InsightsPage() {
  const canSync = useCan("clinician");
  const { data, error, reload } = useApi<{ items: Insight[] }>("/api/insights");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("open");
  const [busy, setBusy] = useState(false);

  const items = (data?.items ?? []).filter((i) =>
    filter === "all" ? true : filter === "open" ? i.status === "new" || i.status === "discussing" : filter === "reviewed" ? i.status === "reviewed" || i.status === "dismissed" : i.kind === filter && i.status !== "dismissed",
  );

  return (
    <>
      <PageHeader
        eyebrow="Guideline-based"
        title="Insights"
        description="Every insight comes from a curated rule (CPIC, FDA labels, ACC/AHA, ADA, KDIGO) applied to your own data, so you can see exactly why it fired."
        actions={
          canSync && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await apiSend("/api/insights/sync", "POST").catch(() => null);
                setBusy(false);
                reload();
              }}
            >
              <RefreshCw className={cx("h-4 w-4", busy && "animate-spin")} /> Re-check my data
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={cx("rounded-full px-3.5 py-1.5 text-sm transition", filter === f.key ? "bg-ink text-surface" : "bg-surface text-ink-2 hover:text-ink border border-line")}>
            {f.label}
          </button>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Card>
        {!data ? (
          <Loading />
        ) : items.length ? (
          <div className="divide-y divide-line">
            {items.map((i) => (
              <InsightRow key={i.id} item={i} />
            ))}
          </div>
        ) : (
          <Empty title="Nothing here" icon={<Lightbulb className="h-5 w-5" />}>
            {filter === "open" ? "No open insights. Add more data or re-check after a change in your medicines." : "No insights match this filter."}
          </Empty>
        )}
      </Card>
      <Disclaimer className="mt-6" />
    </>
  );
}
