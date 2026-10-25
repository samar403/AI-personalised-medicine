"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Activity, Dna, FileHeart, LayoutDashboard, Lightbulb, LogOut, Menu, MessageCircleHeart, Moon, Pill, ShieldCheck, Sparkles, Stethoscope, Sun, UserRound, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { apiSend, useApi } from "@/components/use-api";
import { cx, Loading } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/format";
import { EMERGENCY_NOTE } from "@/lib/safety";
import { SessionContext, type Me } from "./session";

const NAV = [
  { group: "Your health", items: [
    { href: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/app/plan", label: "Care plan", icon: Sparkles },
    { href: "/app/insights", label: "Insights", icon: Lightbulb },
    { href: "/app/medications", label: "Medications", icon: Pill },
  ] },
  { group: "Your data", items: [
    { href: "/app/genome", label: "Genome", icon: Dna },
    { href: "/app/vitals", label: "Wearables", icon: Activity },
    { href: "/app/records", label: "Health records", icon: FileHeart },
  ] },
  { group: "Care team", items: [
    { href: "/app/assistant", label: "Ask Allele", icon: MessageCircleHeart },
    { href: "/app/briefs", label: "Clinician briefs", icon: Stethoscope },
    { href: "/app/privacy", label: "Privacy & sharing", icon: ShieldCheck },
    { href: "/app/profile", label: "Profile", icon: UserRound },
  ] },
];

const THEME_EVENT = "al-theme-change";

function currentTheme(): "light" | "dark" {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeTheme(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
}

function ThemeToggle({ className }: { className?: string }) {
  // The saved theme is applied before paint by the inline script in the root layout.
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => null);
  const toggle = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("al-theme", next);
    } catch {}
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  return (
    <button onClick={toggle} className={cx("rounded-full p-2 transition", className)} aria-label="Toggle dark mode">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data, error, reload } = useApi<Me>("/api/auth/me");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (error) return <div className="p-8 text-sm text-urgent">{error}</div>;
  if (!data) return <Loading label="Opening your health vault" />;

  const visible = (href: string) => data.user.role === "owner" || href !== "/app/profile";
  const nav = (
    <nav className="flex flex-col gap-5 px-3">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="mb-1.5 px-3 text-[10.5px] font-semibold tracking-[0.14em] text-rail-ink/60 uppercase">{g.group}</div>
          <div className="flex flex-col gap-0.5">
            {g.items.filter((i) => visible(i.href)).map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition", active ? "bg-helix font-medium text-helix-ink" : "text-rail-ink hover:bg-rail-hover hover:text-white")}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const signOut = async () => {
    await apiSend("/api/auth/logout", "POST");
    router.push("/login");
  };

  return (
    <SessionContext value={{ me: data, refresh: reload }}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
        <aside className="no-print sticky top-0 hidden h-dvh flex-col overflow-y-auto bg-rail text-rail-ink lg:flex">
          <Link href="/app" className="px-6 pt-6 pb-5">
            <Logo inverted />
          </Link>
          <div className="mx-4 mb-5 rounded-xl bg-rail-hover px-3 py-2.5">
            <div className="truncate text-sm font-semibold text-white">{data.vault.name}</div>
            <div className="text-xs text-rail-ink/80">
              {data.user.name} · {ROLE_LABEL[data.user.role]}
            </div>
          </div>
          {nav}
          <div className="mt-auto px-4 pt-6 pb-4">
            <AiBadge ai={data.ai} />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-rail-ink/60">Not medical advice</span>
              <div className="flex">
                <ThemeToggle className="text-rail-ink hover:bg-rail-hover hover:text-white" />
                <button onClick={signOut} className="rounded-full p-2 text-rail-ink hover:bg-rail-hover hover:text-white" aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="no-print sticky top-0 z-30 flex items-center justify-between bg-rail px-4 py-3 text-rail-ink lg:hidden">
          <Link href="/app">
            <Logo inverted />
          </Link>
          <div className="flex items-center">
            <ThemeToggle className="hover:bg-rail-hover" />
            <button onClick={() => setOpen(true)} className="p-2" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 right-0 flex w-72 flex-col overflow-y-auto bg-rail py-4 text-rail-ink">
              <button onClick={() => setOpen(false)} className="mr-3 mb-2 self-end p-2" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
              {nav}
              <div className="mt-auto px-4 pt-6">
                <AiBadge ai={data.ai} />
                <button onClick={signOut} className="mt-3 text-sm underline">
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
          <footer className="no-print mx-auto mt-12 max-w-6xl border-t border-line pt-4 pb-2 text-xs text-ink-3">{EMERGENCY_NOTE} Allele provides information, not a diagnosis or prescription.</footer>
        </main>
      </div>
    </SessionContext>
  );
}

function AiBadge({ ai }: { ai: Me["ai"] }) {
  const on = ai.enabled && ai.allowed;
  return (
    <div className={cx("flex items-center gap-2 rounded-xl border px-3 py-2 text-[11.5px]", on ? "border-helix/40 text-helix" : "border-rail-hover text-rail-ink/80")}>
      <span className={cx("h-1.5 w-1.5 rounded-full", on ? "bg-helix" : "bg-rail-ink/50")} />
      {on ? <span className="truncate">Claude · {ai.model}</span> : ai.enabled ? <span>AI off by consent · rules only</span> : <span>Offline rules engine</span>}
    </div>
  );
}
