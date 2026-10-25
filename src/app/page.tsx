import Link from "next/link";
import { Activity, ArrowRight, Dna, EyeOff, FileHeart, Lock, MessageCircleHeart, Pill, ShieldCheck, Sparkles, Stethoscope } from "lucide-react";
import { Logo } from "@/components/logo";
import { ButtonLink, Disclaimer } from "@/components/ui";
import { EMERGENCY_NOTE } from "@/lib/safety";

const SOURCES = [
  { icon: Dna, title: "Your genome", body: "Upload a 23andMe, AncestryDNA, MyHeritage or VCF file. It's read in your browser; only 20 medicine-related variants are kept." },
  { icon: Activity, title: "Your wearables", body: "Resting heart rate, HRV, sleep, steps, SpO₂, blood pressure and glucose, compared with your own baseline rather than a population average." },
  { icon: FileHeart, title: "Your records", body: "Import a FHIR export from your patient portal: conditions, medicines, allergies and lab results, mapped to LOINC and interpreted." },
];

const FEATURES = [
  { icon: Pill, title: "Gene × drug checks", body: "29 CPIC guideline rules across CYP2C19, CYP2C9, CYP2D6, SLCO1B1, VKORC1, TPMT, DPYD, HLA-B and more, checked against every medicine you take." },
  { icon: Sparkles, title: "A care plan that's actually yours", body: "Claude reads all three data sources together and writes a prioritised plan with the questions to take to your next appointment." },
  { icon: MessageCircleHeart, title: "Ask Allele", body: "A grounded assistant that answers from your own results, flags emergencies before anything else, and never tells you to change a medicine on your own." },
  { icon: Stethoscope, title: "Clinician-ready briefs", body: "One printable page your doctor or pharmacist can read in a minute, and a care-team view where clinicians can review each insight." },
];

const PRIVACY = [
  { icon: EyeOff, title: "Raw DNA never leaves your device", body: "Parsing happens in the browser. The server only ever receives the panel genotypes." },
  { icon: Lock, title: "Encrypted, minimal, yours", body: "Genotypes are AES-256-GCM encrypted at rest. No names or emails go to the AI. Export or delete everything at any time." },
  { icon: ShieldCheck, title: "Consent per data type", body: "Genetics, wearables, records and AI processing are separate opt-ins. Withdraw one and that data is deleted immediately." },
];

export default function Landing() {
  return (
    <div className="min-h-dvh">
      <div className="helix-glow">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            <Link href="/login" className="px-3 py-2 text-sm text-ink-2 hover:text-ink">
              Sign in
            </Link>
            <ButtonLink href="/signup">Create your vault</ButtonLink>
          </nav>
        </header>

        <section className="mx-auto grid max-w-6xl gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-16">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-ink-2 shadow-card">
              <span className="h-1.5 w-1.5 rounded-full bg-helix" /> Precision medicine for one: you
            </p>
            <h1 className="font-display text-[44px] leading-[1.02] font-semibold tracking-tight sm:text-[64px]">
              Medicine that fits your <span className="bg-gradient-to-r from-helix to-seq bg-clip-text text-transparent">genes, body and history.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-2">
              Allele brings your DNA, your wearable data and your health records together, checks every medicine against clinical guidelines, and turns it into a personal care plan you can take to your doctor.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/signup">
                Create your vault <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/login?demo=1" variant="secondary">
                Explore the demo
              </ButtonLink>
            </div>
            <p className="mt-3 text-xs text-ink-3">Demo login: demo@allele.example / demo-vault-2026</p>
          </div>

          <div className="relative">
            <div className="rounded-3xl border border-line bg-surface p-5 shadow-card">
              <div className="flex items-center justify-between text-[12px] text-ink-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-high-soft px-2.5 py-0.5 font-semibold text-high">
                  <span className="h-1.5 w-1.5 rounded-full bg-high" /> High
                </span>
                <span>Gene × drug · CPIC level A</span>
              </div>
              <h3 className="mt-3 font-display text-xl leading-snug font-semibold">Clopidogrel may not protect you fully</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex overflow-hidden rounded-lg border border-seq/40 text-[12px]">
                  <span className="bg-seq px-2 py-0.5 font-semibold text-surface">CYP2C19</span>
                  <span className="num px-2 py-0.5">*1/*2</span>
                </span>
                <span className="rounded-md bg-mist-2 px-2 py-0.5 text-[12px] text-ink-2">Intermediate metabolizer</span>
                <span className="rounded-md bg-mist-2 px-2 py-0.5 text-[12px] text-ink-2">Clopidogrel 75 mg</span>
              </div>
              <p className="mt-4 text-sm text-ink-2">
                Your CYP2C19 result means less clopidogrel is converted to its active form. Guidelines suggest asking your cardiologist about prasugrel or ticagrelor. Don&apos;t stop it on your own.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
                {[
                  ["Resting HR", "+8 bpm", "vs baseline"],
                  ["Home BP", "136/86", "7-day avg"],
                  ["LDL", "142", "mg/dL"],
                ].map(([k, v, s]) => (
                  <div key={k} className="rounded-xl bg-surface-2 px-2 py-2.5">
                    <div className="text-[11px] text-ink-3">{k}</div>
                    <div className="num text-[15px] font-semibold">{v}</div>
                    <div className="text-[10.5px] text-ink-3">{s}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -right-4 -bottom-14 hidden rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-card sm:block">
              <div className="text-[11px] text-ink-3">Question for your clinician</div>
              <div className="font-medium">&ldquo;Is ticagrelor an option for me?&rdquo;</div>
            </div>
          </div>
        </section>
      </div>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 md:grid-cols-3">
          {SOURCES.map((s) => (
            <div key={s.title}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-helix-soft text-helix">
                <s.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-2">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">More than 9 in 10 people carry at least one gene variant that changes how a common medicine works.</h2>
        <p className="mt-3 max-w-2xl text-ink-2">
          Most never find out. Allele makes that knowledge, plus what your body and records are already saying, usable at the moment a prescription is written.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
              <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-seq" />
              <div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-ink-2">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-rail text-rail-ink">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-white">Private by design, not by policy.</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {PRIVACY.map((p) => (
              <div key={p.title} className="rounded-2xl border border-rail-hover p-5">
                <p.icon className="h-5 w-5 text-helix" />
                <h3 className="mt-3 font-semibold text-white">{p.title}</h3>
                <p className="mt-1 text-sm">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6">
        <Disclaimer />
        <div className="flex flex-col gap-2 text-xs text-ink-3 sm:flex-row sm:justify-between">
          <span>{EMERGENCY_NOTE}</span>
          <span>Guidelines: CPIC, FDA labels, ACC/AHA, ADA, KDIGO. Analysis by Claude.</span>
        </div>
      </footer>
    </div>
  );
}
