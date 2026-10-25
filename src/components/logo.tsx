export function Logo({ className = "", inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="10" fill="var(--helix)" />
        <path d="M11 6c0 6.5 10 7 10 13.5S11 26 11 26M21 6c0 6.5-10 7-10 13.5S21 26 21 26" fill="none" stroke="var(--helix-ink)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M12.5 10h7M13 16h6M12.5 22h7" stroke="var(--helix-ink)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      </svg>
      <span className={`font-display text-[21px] font-semibold tracking-tight ${inverted ? "text-white" : ""}`}>allele</span>
    </span>
  );
}
