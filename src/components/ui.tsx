import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/format";
import { DISCLAIMER } from "@/lib/safety";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-helix text-helix-ink hover:brightness-110 shadow-[0_6px_16px_-8px_var(--helix)]",
  secondary: "bg-surface text-ink border border-line-strong hover:border-helix hover:text-helix",
  ghost: "text-ink-2 hover:text-ink hover:bg-mist-2",
  danger: "bg-urgent-soft text-urgent border border-urgent/30 hover:border-urgent",
};

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3.5 text-[13px]" : "h-10 px-5 text-sm",
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cx("inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition", buttonStyles[variant], className)} {...props} />;
}

export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cx("min-w-0 rounded-2xl border border-line bg-surface shadow-card", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({ title, eyebrow, action, icon }: { title: ReactNode; eyebrow?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-helix-soft text-helix">{icon}</span>}
        <div className="min-w-0">
          {eyebrow && <div className="text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase">{eyebrow}</div>}
          <h2 className="truncate font-display text-[17px] font-semibold">{title}</h2>
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="mb-1.5 inline-flex rounded-full bg-helix-soft px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-helix">{eyebrow}</div>}
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

const priorityStyles = {
  urgent: "text-urgent bg-urgent-soft",
  high: "text-high bg-high-soft",
  moderate: "text-moderate bg-moderate-soft",
  info: "text-info bg-info-soft",
} as const;

const priorityDot = { urgent: "bg-urgent animate-pulse", high: "bg-high", moderate: "bg-moderate", info: "bg-info" } as const;

/** Priority shown as a signal pill. */
export function PriorityPill({ priority }: { priority: keyof typeof priorityStyles }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", priorityStyles[priority])}>
      <span className={cx("h-1.5 w-1.5 rounded-full", priorityDot[priority])} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

const statusStyles = {
  new: "text-ink border-line-strong",
  discussing: "text-seq border-seq/40",
  reviewed: "text-ok border-ok/40",
  dismissed: "text-ink-3 border-line-strong border-dashed",
} as const;

export function StatusPill({ status }: { status: keyof typeof statusStyles }) {
  return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] whitespace-nowrap", statusStyles[status])}>{STATUS_LABEL[status]}</span>;
}

export function Tag({ children, tone = "plain", className }: { children: ReactNode; tone?: "plain" | "helix" | "seq"; className?: string }) {
  const tones = { plain: "bg-mist-2 text-ink-2", helix: "bg-helix-soft text-helix", seq: "bg-seq-soft text-seq" };
  return <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-[12px] whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

/** A genotype chip: gene name plus monospaced call. */
export function GeneChip({ gene, call, actionable }: { gene: string; call: string; actionable?: boolean }) {
  return (
    <span className={cx("inline-flex items-center overflow-hidden rounded-lg border text-[12px]", actionable ? "border-seq/40" : "border-line")}>
      <span className={cx("px-2 py-0.5 font-semibold", actionable ? "bg-seq text-surface" : "bg-mist-2 text-ink-2")}>{gene}</span>
      <span className="num px-2 py-0.5 text-ink">{call}</span>
    </span>
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-ink placeholder:text-ink-3 focus:border-helix focus:ring-2 focus:ring-helix/20 focus:outline-none";

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(inputClass, "pr-8", props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(inputClass, "h-auto min-h-24 py-2.5 leading-relaxed", props.className)} />;
}

export function Empty({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && <span className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-helix-soft text-helix">{icon}</span>}
      <div className="font-display text-lg font-semibold">{title}</div>
      {children && <div className="max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-10 text-sm text-ink-3" role="status">
      <span className="flex gap-1">
        <span className="h-2 w-2 animate-bounce rounded-full bg-helix [animation-delay:-0.2s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-seq [animation-delay:-0.1s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-helix" />
      </span>
      {label}…
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-urgent/30 bg-urgent-soft px-3.5 py-2.5 text-sm text-urgent">{children}</div>;
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "ok" }) {
  const tones = { info: "border-info/30 bg-info-soft text-info", warn: "border-high/30 bg-high-soft text-high", ok: "border-ok/30 bg-ok-soft text-ok" };
  return <div className={cx("rounded-xl border px-3.5 py-2.5 text-sm", tones[tone])}>{children}</div>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "urgent" | "ok" | "seq" }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[12px] font-medium text-ink-3">{label}</div>
      <div className={cx("mt-1 font-display text-3xl font-semibold tracking-tight", tone === "urgent" && "text-urgent", tone === "ok" && "text-ok", tone === "seq" && "text-seq")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx("border-b border-line px-3 py-2.5 text-left text-[12px] font-medium text-ink-3", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("border-b border-line px-3 py-3 align-top text-sm", className)}>{children}</td>;
}

/** The medical disclaimer shown wherever advice appears. */
export function Disclaimer({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cx("flex gap-2.5 rounded-xl border border-line bg-surface-2 text-ink-2", compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-[13px]", className)} role="note">
      <ShieldAlert className={cx("mt-0.5 shrink-0 text-helix", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      <p>{DISCLAIMER}</p>
    </div>
  );
}

/** A circular progress ring (0-1). */
export function Ring({ value, size = 56, label }: { value: number; size?: number; label?: ReactNode }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--helix)" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))} />
      </svg>
      <span className="num absolute text-xs font-semibold">{label ?? `${Math.round(value * 100)}%`}</span>
    </div>
  );
}
