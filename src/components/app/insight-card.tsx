import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Insight } from "@/lib/db/schema";
import { KIND_LABEL } from "@/lib/format";
import { cx, PriorityPill, StatusPill, Tag } from "@/components/ui";

const edge = { urgent: "before:bg-urgent", high: "before:bg-high", moderate: "before:bg-moderate", info: "before:bg-info" } as const;

export function InsightRow({ item, compact = false }: { item: Insight; compact?: boolean }) {
  return (
    <Link
      href={`/app/insights/${item.id}`}
      className={cx(
        "group relative flex items-start gap-4 overflow-hidden px-5 py-4 transition before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full hover:bg-surface-2",
        edge[item.priority],
        item.status === "dismissed" && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityPill priority={item.priority} />
          <Tag tone={item.kind === "gene_drug" ? "seq" : "plain"}>{KIND_LABEL[item.kind]}</Tag>
          {item.status !== "new" && <StatusPill status={item.status} />}
        </div>
        <div className="mt-1.5 font-medium">{item.title}</div>
        {!compact && <p className="mt-1 line-clamp-2 text-sm text-ink-2">{item.summary}</p>}
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-helix" />
    </Link>
  );
}
