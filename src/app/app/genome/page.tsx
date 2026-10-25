"use client";
import { Fragment, useRef, useState } from "react";
import { Dna, EyeOff, Lock, Trash2, Upload } from "lucide-react";
import { useCan, useSession } from "@/components/app/session";
import { apiSend, useApi } from "@/components/use-api";
import { Button, Card, CardHeader, cx, Disclaimer, Empty, ErrorNote, GeneChip, Loading, Notice, PageHeader, Tag, Td, Th } from "@/components/ui";
import { parseGenome, type GeneResult, type PanelVariant, type ParsedGenome } from "@/lib/clinical/pgx";
import type { Genome } from "@/lib/db/schema";
import { capitalize, fmtDateTime, fmtNum } from "@/lib/format";

interface GenomeResponse {
  genome: Omit<Genome, "callsEncrypted"> | null;
  genes: (GeneResult & { drugs: string[] })[];
  panel: PanelVariant[];
}

const FORMAT_LABEL = { "23andme": "23andMe", ancestry: "AncestryDNA", myheritage: "MyHeritage / FTDNA", vcf: "VCF" } as const;

export default function GenomePage() {
  const { me } = useSession();
  const canUpload = useCan("clinician");
  const isOwner = useCan("owner");
  const { data, error, reload } = useApi<GenomeResponse>("/api/genome");
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<(ParsedGenome & { filename: string }) | null>(null);
  const [busy, setBusy] = useState<"reading" | "uploading" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function readFile(file: File) {
    setMsg(null);
    setBusy("reading");
    try {
      // Parsed here in the browser. Only panel genotypes are ever sent to the server.
      const result = parseGenome(await file.text());
      if (!Object.keys(result.calls).length) throw new Error("None of the panel variants were found. Make sure this is a raw-data download (not a PDF report).");
      setParsed({ ...result, filename: file.name });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function upload() {
    if (!parsed) return;
    setBusy("uploading");
    try {
      const res = await apiSend<{ kept: number; discarded: number; added: number }>("/api/genome", "POST", parsed);
      setMsg({ tone: "ok", text: `Saved ${res.kept} panel variants and discarded ${fmtNum(res.discarded)} others. ${res.added} new insight${res.added === 1 ? "" : "s"}.` });
      setParsed(null);
      reload();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    await apiSend("/api/genome", "DELETE");
    setMsg({ tone: "ok", text: "Genetic data deleted." });
    reload();
  }

  const consented = me.vault.consents.genomics;
  return (
    <>
      <PageHeader
        eyebrow="Pharmacogenomics"
        title="Genome"
        description="How your genes change the way your body handles medicines, from a 20-variant panel interpreted with CPIC guidelines."
        actions={
          canUpload && consented && (
            <>
              <input ref={input} type="file" accept=".txt,.csv,.tsv,.vcf" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
              <Button onClick={() => input.current?.click()} disabled={busy !== null}>
                <Upload className="h-4 w-4" /> {busy === "reading" ? "Reading on your device…" : data?.genome ? "Replace DNA file" : "Add DNA file"}
              </Button>
            </>
          )
        }
      />
      {!consented && <Notice tone="warn">Genetic data is switched off for this vault. The owner can enable it under Privacy &amp; sharing.</Notice>}
      {msg && <div className="mb-4">{msg.tone === "ok" ? <Notice tone="ok">{msg.text}</Notice> : <ErrorNote>{msg.text}</ErrorNote>}</div>}

      {parsed && (
        <Card className="mb-4 border-helix/40 px-5 py-5">
          <div className="flex items-start gap-3">
            <EyeOff className="mt-0.5 h-5 w-5 text-helix" />
            <div className="flex-1">
              <div className="font-semibold">Ready to upload {Object.keys(parsed.calls).length} of {fmtNum(parsed.totalVariants)} variants</div>
              <p className="mt-1 text-sm text-ink-2">
                Read {parsed.filename} ({FORMAT_LABEL[parsed.format]}) on this device. Only the medicine-related variants below will be sent and stored, encrypted. The other {fmtNum(parsed.totalVariants - Object.keys(parsed.calls).length)} stay on your computer.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(parsed.calls).map(([rsid, gt]) => (
                  <span key={rsid} className="num rounded-md bg-mist-2 px-2 py-0.5 text-[12px]">
                    {rsid} {gt}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={upload} disabled={busy !== null}>
                  <Lock className="h-4 w-4" /> {busy === "uploading" ? "Saving…" : "Upload panel"}
                </Button>
                <Button variant="ghost" onClick={() => setParsed(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      {!data ? (
        <Loading />
      ) : !data.genome ? (
        <Card>
          <Empty title="No DNA file yet" icon={<Dna className="h-5 w-5" />}>
            Download your raw data from 23andMe (Settings → 23andMe data), AncestryDNA (Settings → Download DNA data), MyHeritage, or use a VCF from clinical or whole-genome sequencing. Allele reads it in your browser.
          </Empty>
        </Card>
      ) : (
        <>
          <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
            <div className="text-ink-2">
              <span className="font-medium text-ink">{data.genome.filename}</span> · {FORMAT_LABEL[data.genome.format as keyof typeof FORMAT_LABEL] ?? data.genome.format} · {data.genome.keptVariants} panel variants kept of {fmtNum(data.genome.totalVariants)} · {fmtDateTime(data.genome.createdAt)}
            </div>
            {isOwner && (
              <Button size="sm" variant="danger" onClick={remove}>
                <Trash2 className="h-4 w-4" /> Delete genetic data
              </Button>
            )}
          </Card>
          <Card>
            <CardHeader title="Your results" eyebrow={`${data.genes.filter((g) => g.actionable).length} actionable`} icon={<Dna className="h-4 w-4" />} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr>
                    <Th className="pl-5">Gene</Th>
                    <Th>Result</Th>
                    <Th>Medicines affected</Th>
                    <Th className="pr-5">Confidence</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.genes.map((g) => (
                    <Fragment key={g.gene}>
                      <tr className="cursor-pointer hover:bg-surface-2" onClick={() => setOpen(open === g.gene ? null : g.gene)}>
                        <Td className="pl-5">
                          <GeneChip gene={g.gene} call={g.diplotype} actionable={g.actionable} />
                        </Td>
                        <Td>
                          <span className={cx(g.actionable && "font-medium")}>{g.phenotype}</span>
                          {g.activityScore !== null && <span className="num ml-2 text-xs text-ink-3">AS {g.activityScore}</span>}
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {g.drugs.length ? g.drugs.map((d) => <Tag key={d} tone="seq">{capitalize(d)}</Tag>) : <span className="text-sm text-ink-3">Standard response expected</span>}
                          </div>
                        </Td>
                        <Td className="pr-5">
                          <Tag tone={g.confidence === "high" ? "helix" : "plain"}>{capitalize(g.confidence)}</Tag>
                        </Td>
                      </tr>
                      {open === g.gene && (
                        <tr>
                          <td colSpan={4} className="border-b border-line bg-surface-2 px-5 py-3 text-sm">
                            <div className="flex flex-wrap gap-2">
                              {g.variants.map((v) => (
                                <span key={v.rsid} className="num rounded-md border border-line bg-surface px-2 py-0.5 text-[12px]">
                                  {v.rsid} {v.allele}: {v.genotype ?? "not in file"}
                                  {v.copies !== null && ` (${v.copies} cop${v.copies === 1 ? "y" : "ies"})`}
                                </span>
                              ))}
                            </div>
                            <p className="mt-2 text-xs text-ink-3">{g.note}</p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card className="mt-4">
        <CardHeader title="What Allele tests, and what it deliberately doesn't" eyebrow="The panel" />
        <div className="grid gap-4 border-t border-line px-5 py-4 text-sm md:grid-cols-2">
          <div>
            <div className="font-medium">20 variants in 14 genes</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data?.panel.map((v) => (
                <span key={v.rsid} className="num rounded-md bg-mist-2 px-2 py-0.5 text-[11.5px]" title={v.effect}>
                  {v.gene} {v.allele}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-2 text-ink-2">
            <p>
              <span className="font-medium text-ink">Not included on purpose:</span> APOE (Alzheimer&apos;s risk), BRCA and other disease-risk genes, ancestry and relative matching. Those results need genetic counselling, and consumer arrays are unreliable for rare variants.
            </p>
            <p>MTHFR is excluded because guidelines advise against testing it for treatment decisions.</p>
            <p>Arrays can&apos;t see CYP2D6 deletions or duplications, or rare alleles. Confirm results with a clinical pharmacogenomic test before a prescribing decision.</p>
          </div>
        </div>
      </Card>
      <Disclaimer className="mt-6" />
    </>
  );
}
