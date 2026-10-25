"use client";
import { Area, ComposedChart, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { fmtDate } from "@/lib/format";

type Point = { day: string; value: number };

const axis = { stroke: "var(--ink-3)", fontSize: 11, tickLine: false, axisLine: false } as const;

export function Sparkline({ data, label }: { data: Point[]; label: string }) {
  return (
    <div className="h-10 w-full" role="img" aria-label={`${label} over the last ${data.length} days`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Tip({ active, payload, label, unit }: { active?: boolean; payload?: { value: number }[]; label?: string; unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-card">
      <div className="font-semibold">{fmtDate(label, { day: "numeric", month: "short" })}</div>
      <div className="num text-ink-2">
        {payload[0].value} {unit}
      </div>
    </div>
  );
}

/** A metric's daily series with the personal baseline (mean ± 1 SD of the prior 30 days) shaded. */
export function VitalChart({ data, unit, baseline, sd, label }: { data: Point[]; unit: string; baseline: number | null; sd: number | null; label: string }) {
  return (
    <div className="h-48" role="img" aria-label={`${label}: ${data.length} days, latest ${data.at(-1)?.value} ${unit}${baseline !== null ? `, baseline ${baseline}` : ""}`}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id={`fill-${label.replace(/\W/g, "")}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="day" {...axis} tickFormatter={(v) => fmtDate(v, { day: "numeric", month: "short" })} minTickGap={28} />
          <YAxis {...axis} domain={["auto", "auto"]} width={48} />
          {baseline !== null && sd !== null && <ReferenceArea y1={baseline - sd} y2={baseline + sd} fill="var(--chart-band)" stroke="none" ifOverflow="extendDomain" />}
          <Tooltip content={<Tip unit={unit} />} cursor={{ stroke: "var(--line-strong)" }} />
          <Area type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} fill={`url(#fill-${label.replace(/\W/g, "")})`} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
