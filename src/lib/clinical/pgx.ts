// Pharmacogenomics: the variant panel, raw-file parsing, phenotype calling and gene-drug rules.
// Client-safe on purpose: the browser parses the raw DNA file and uploads only the panel below.
//
// Genotypes are on the GRCh37 plus strand, as reported by 23andMe, AncestryDNA, MyHeritage and
// most VCFs. Phenotype calls and recommendations follow CPIC guidelines (cpicpgx.org) in plain
// language. Consumer arrays cannot see gene deletions, duplications or rare alleles, so every call
// says so and asks for clinical-grade confirmation before a prescribing decision.
import type { Priority } from "@/lib/db/schema";

export interface PanelVariant {
  rsid: string;
  gene: string;
  allele: string;
  ref: string;
  alt: string;
  effect: string;
}

export const PANEL: PanelVariant[] = [
  { rsid: "rs4244285", gene: "CYP2C19", allele: "*2", ref: "G", alt: "A", effect: "no function" },
  { rsid: "rs4986893", gene: "CYP2C19", allele: "*3", ref: "G", alt: "A", effect: "no function" },
  { rsid: "rs12248560", gene: "CYP2C19", allele: "*17", ref: "C", alt: "T", effect: "increased function" },
  { rsid: "rs1799853", gene: "CYP2C9", allele: "*2", ref: "C", alt: "T", effect: "decreased function" },
  { rsid: "rs1057910", gene: "CYP2C9", allele: "*3", ref: "A", alt: "C", effect: "no function" },
  { rsid: "rs3892097", gene: "CYP2D6", allele: "*4", ref: "C", alt: "T", effect: "no function" },
  { rsid: "rs776746", gene: "CYP3A5", allele: "*3", ref: "T", alt: "C", effect: "no function" },
  { rsid: "rs4149056", gene: "SLCO1B1", allele: "c.521T>C", ref: "T", alt: "C", effect: "decreased function" },
  { rsid: "rs9923231", gene: "VKORC1", allele: "-1639G>A", ref: "C", alt: "T", effect: "increased warfarin sensitivity" },
  { rsid: "rs2108622", gene: "CYP4F2", allele: "*3", ref: "C", alt: "T", effect: "decreased function" },
  { rsid: "rs1142345", gene: "TPMT", allele: "*3C", ref: "T", alt: "C", effect: "no function" },
  { rsid: "rs1800460", gene: "TPMT", allele: "*3B", ref: "C", alt: "T", effect: "no function" },
  { rsid: "rs116855232", gene: "NUDT15", allele: "*3", ref: "C", alt: "T", effect: "no function" },
  { rsid: "rs3918290", gene: "DPYD", allele: "*2A", ref: "C", alt: "T", effect: "no function" },
  { rsid: "rs55886062", gene: "DPYD", allele: "*13", ref: "A", alt: "C", effect: "no function" },
  { rsid: "rs67376798", gene: "DPYD", allele: "c.2846A>T", ref: "T", alt: "A", effect: "decreased function" },
  { rsid: "rs887829", gene: "UGT1A1", allele: "*80 (tags *28)", ref: "C", alt: "T", effect: "decreased function" },
  { rsid: "rs2395029", gene: "HLA-B", allele: "*57:01 tag", ref: "T", alt: "G", effect: "abacavir hypersensitivity marker" },
  { rsid: "rs6025", gene: "F5", allele: "Factor V Leiden", ref: "C", alt: "T", effect: "inherited clotting risk" },
  { rsid: "rs1799963", gene: "F2", allele: "G20210A", ref: "G", alt: "A", effect: "inherited clotting risk" },
];

export const PANEL_RSIDS = new Set(PANEL.map((v) => v.rsid));

export type GenomeFormat = "23andme" | "ancestry" | "myheritage" | "vcf";

export interface ParsedGenome {
  format: GenomeFormat;
  totalVariants: number;
  calls: Record<string, string>;
}

const GENOTYPE = /^[ACGTDI]{1,2}$/;

/** Parses a consumer raw-data file or a single-sample VCF, keeping only panel variants. */
export function parseGenome(text: string): ParsedGenome {
  const lines = text.split(/\r?\n/);
  const isVcf = lines.some((l) => l.startsWith("##fileformat=VCF") || l.startsWith("#CHROM"));
  const calls: Record<string, string> = {};
  let total = 0;
  let format: GenomeFormat = "23andme";

  if (isVcf) {
    format = "vcf";
    for (const line of lines) {
      if (!line || line.startsWith("#")) continue;
      total++;
      const cols = line.split("\t");
      const ids = (cols[2] ?? "").split(";");
      const rsid = ids.find((i) => PANEL_RSIDS.has(i));
      if (!rsid) continue;
      const alleles = [cols[3], ...(cols[4] ?? "").split(",")];
      const fmt = (cols[8] ?? "GT").split(":");
      const gt = (cols[9] ?? "").split(":")[fmt.indexOf("GT")] ?? "";
      const idx = gt.split(/[/|]/);
      if (idx.length !== 2 || idx.some((i) => !/^\d+$/.test(i))) continue;
      const bases = idx.map((i) => alleles[Number(i)]);
      if (bases.every((b) => b && b.length === 1)) calls[rsid] = bases.join("").toUpperCase();
    }
    return { format, totalVariants: total, calls };
  }

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const cols = line.includes("\t") ? line.split("\t") : line.split(",").map((c) => c.replace(/^"|"$/g, ""));
    const first = cols[0]?.trim().toLowerCase();
    if (first === "rsid") {
      if (cols.length >= 5) format = "ancestry";
      else if (!line.includes("\t")) format = "myheritage";
      continue;
    }
    if (!first || !/^(rs|i)\d+$/.test(first)) continue;
    total++;
    if (!PANEL_RSIDS.has(first)) continue;
    const genotype = (cols.length >= 5 ? `${cols[3]}${cols[4]}` : cols[3] ?? "").trim().toUpperCase().replace(/[^ACGTDI-]/g, "");
    if (GENOTYPE.test(genotype)) calls[first] = genotype;
  }
  return { format, totalVariants: total, calls };
}

const COMPLEMENT: Record<string, string> = { A: "T", T: "A", C: "G", G: "C" };

/** Counts copies of the variant allele (0, 1 or 2), tolerating minus-strand reports. Null when not called. */
export function altCount(v: PanelVariant, genotype: string | undefined): number | null {
  if (!genotype || !GENOTYPE.test(genotype) || /[DI]/.test(genotype)) return null;
  const bases = genotype.length === 1 ? [genotype, genotype] : genotype.split("");
  const fits = (b: string[]) => b.every((x) => x === v.ref || x === v.alt);
  let use = bases;
  if (!fits(bases)) {
    const flipped = bases.map((b) => COMPLEMENT[b]);
    if (!fits(flipped)) return null;
    use = flipped;
  }
  return use.filter((b) => b === v.alt).length;
}

export type PhenotypeCode =
  | "NM" | "IM" | "PM" | "RM" | "UM"
  | "NF" | "DF" | "PF"
  | "NS" | "IS" | "HS"
  | "DEC"
  | "POS" | "NEG"
  | "HET" | "HOM";

export interface GeneResult {
  gene: string;
  diplotype: string;
  code: PhenotypeCode | null;
  phenotype: string;
  activityScore: number | null;
  actionable: boolean;
  confidence: "high" | "moderate" | "low";
  note: string;
  variants: { rsid: string; allele: string; genotype: string | null; copies: number | null }[];
}

const METABOLIZER: Record<string, string> = {
  NM: "Normal metabolizer",
  IM: "Intermediate metabolizer",
  PM: "Poor metabolizer",
  RM: "Rapid metabolizer",
  UM: "Ultrarapid metabolizer",
};

const ARRAY_NOTE = "Consumer arrays test a few common variants only. Confirm with a clinical pharmacogenomic test before changing a prescription.";

function starDiplotype(allelesFound: string[]) {
  const a = [...allelesFound, "*1", "*1"].slice(0, 2);
  return a.sort((x, y) => (x === "*1" ? -1 : y === "*1" ? 1 : x.localeCompare(y, undefined, { numeric: true }))).join("/");
}

/** Calls the phenotype for every gene in the panel. Genes with no usable calls are omitted. */
export function callGenes(calls: Record<string, string>): GeneResult[] {
  const genes = [...new Set(PANEL.map((v) => v.gene))];
  const results: GeneResult[] = [];
  for (const gene of genes) {
    const vs = PANEL.filter((v) => v.gene === gene);
    const variants = vs.map((v) => ({ rsid: v.rsid, allele: v.allele, genotype: calls[v.rsid] ?? null, copies: altCount(v, calls[v.rsid]) }));
    const called = variants.filter((v) => v.copies !== null);
    if (called.length === 0) continue;
    const missing = variants.length - called.length;
    const copies = (allele: string) => variants.find((v) => v.allele === allele)?.copies ?? 0;
    const found = variants.flatMap((v) => Array<string>(v.copies ?? 0).fill(v.allele));
    const base = { gene, variants, confidence: (missing ? "low" : "high") as GeneResult["confidence"], note: missing ? `${missing} of ${variants.length} variants were not in your file. ${ARRAY_NOTE}` : ARRAY_NOTE };
    results.push({ ...base, ...phenotypeFor(gene, copies, found, base.confidence) });
  }
  return results;
}

function phenotypeFor(
  gene: string,
  copies: (allele: string) => number,
  found: string[],
  confidence: GeneResult["confidence"],
): Omit<GeneResult, "gene" | "variants" | "note"> & { note?: string } {
  const metab = (code: PhenotypeCode, diplotype: string, activityScore: number | null = null) => ({
    code,
    diplotype,
    phenotype: METABOLIZER[code],
    activityScore,
    actionable: code !== "NM",
    confidence,
  });
  switch (gene) {
    case "CYP2C19": {
      const lof = Math.min(2, copies("*2") + copies("*3"));
      const inc = Math.min(2 - lof, copies("*17"));
      const diplotype = starDiplotype([...Array(lof).fill(found.find((a) => a === "*2" || a === "*3") ?? "*2"), ...Array(inc).fill("*17")]);
      if (lof === 2) return metab("PM", diplotype);
      if (lof === 1) return metab("IM", diplotype);
      if (inc === 2) return metab("UM", diplotype);
      if (inc === 1) return metab("RM", diplotype);
      return metab("NM", diplotype);
    }
    case "CYP2C9": {
      const s2 = copies("*2");
      const s3 = copies("*3");
      const score = Math.max(0, 2 - s2 * 0.5 - s3 * 1);
      const diplotype = starDiplotype([...Array(s2).fill("*2"), ...Array(s3).fill("*3")]);
      return metab(score >= 2 ? "NM" : score >= 1 ? "IM" : "PM", diplotype, score);
    }
    case "CYP2D6": {
      const n = copies("*4");
      const r = metab(n === 0 ? "NM" : n === 1 ? "IM" : "PM", starDiplotype(Array(n).fill("*4")), 2 - n);
      return { ...r, confidence: n === 0 ? "low" : confidence, note: `Only *4 is tested. Arrays cannot see CYP2D6 deletions (*5) or extra copies (ultrarapid), so a "normal" result is uncertain. ${ARRAY_NOTE}` };
    }
    case "CYP3A5": {
      const n = copies("*3");
      // *3/*3 (non-expresser) is the most common genotype in many ancestries and is the CPIC reference for tacrolimus.
      return { ...metab(n === 2 ? "PM" : n === 1 ? "IM" : "NM", starDiplotype(Array(n).fill("*3"))), actionable: n < 2 };
    }
    case "TPMT": {
      const n = Math.min(2, Math.max(copies("*3C"), copies("*3B")));
      const both = copies("*3C") > 0 && copies("*3B") > 0;
      const allele = both ? "*3A" : copies("*3C") ? "*3C" : "*3B";
      return metab(n === 2 ? "PM" : n === 1 ? "IM" : "NM", starDiplotype(Array(n).fill(allele)));
    }
    case "NUDT15": {
      const n = copies("*3");
      return metab(n === 2 ? "PM" : n === 1 ? "IM" : "NM", starDiplotype(Array(n).fill("*3")));
    }
    case "DPYD": {
      const score = Math.max(0, 2 - copies("*2A") - copies("*13") - copies("c.2846A>T") * 0.5);
      const diplotype = found.length ? found.join(" + ") : "No tested variants";
      return metab(score >= 2 ? "NM" : score >= 1 ? "IM" : "PM", diplotype, score);
    }
    case "UGT1A1": {
      const n = copies("*80 (tags *28)");
      return { ...metab(n === 2 ? "PM" : n === 1 ? "IM" : "NM", starDiplotype(Array(n).fill("*80"))), confidence: "moderate" };
    }
    case "SLCO1B1": {
      const n = copies("c.521T>C");
      const code: PhenotypeCode = n === 2 ? "PF" : n === 1 ? "DF" : "NF";
      const label = { NF: "Normal function", DF: "Decreased function", PF: "Poor function" }[code];
      return { code, diplotype: ["T/T", "T/C", "C/C"][n], phenotype: label, activityScore: null, actionable: n > 0, confidence };
    }
    case "VKORC1": {
      const n = copies("-1639G>A");
      const code: PhenotypeCode = n === 2 ? "HS" : n === 1 ? "IS" : "NS";
      const label = { NS: "Typical warfarin sensitivity", IS: "Increased warfarin sensitivity", HS: "High warfarin sensitivity" }[code];
      return { code, diplotype: ["-1639 G/G", "-1639 G/A", "-1639 A/A"][n], phenotype: label, activityScore: null, actionable: n > 0, confidence };
    }
    case "CYP4F2": {
      const n = copies("*3");
      return { code: n ? "DEC" : "NM", diplotype: starDiplotype(Array(n).fill("*3")), phenotype: n ? "Decreased function (may need slightly more warfarin)" : "Normal function", activityScore: null, actionable: n > 0, confidence };
    }
    case "HLA-B": {
      const n = copies("*57:01 tag");
      return {
        code: n ? "POS" : "NEG",
        diplotype: n ? "*57:01 tag present" : "*57:01 tag absent",
        phenotype: n ? "HLA-B*57:01 likely positive" : "HLA-B*57:01 likely negative",
        activityScore: null,
        actionable: n > 0,
        confidence: "moderate",
        note: "rs2395029 is a tag for HLA-B*57:01 and is less reliable outside European ancestry. Clinical HLA typing is required before abacavir.",
      };
    }
    case "F5":
    case "F2": {
      const n = copies(gene === "F5" ? "Factor V Leiden" : "G20210A");
      const name = gene === "F5" ? "Factor V Leiden" : "Prothrombin G20210A";
      return {
        code: n === 2 ? "HOM" : n === 1 ? "HET" : "NEG",
        diplotype: ["Not detected", "Heterozygous", "Homozygous"][n],
        phenotype: n ? `${name} ${n === 2 ? "homozygous" : "heterozygous"}` : `${name} not detected`,
        activityScore: null,
        actionable: n > 0,
        confidence,
      };
    }
  }
  return { code: null, diplotype: "", phenotype: "Not interpreted", activityScore: null, actionable: false, confidence: "low" };
}

export interface GeneDrugRule {
  code: string;
  gene: string;
  drugs: string[];
  when: (g: GeneResult) => boolean;
  priority: Priority;
  title: string;
  summary: string;
  recommendation: string;
  evidenceLevel: string;
}

const is = (...codes: PhenotypeCode[]) => (g: GeneResult) => g.code !== null && codes.includes(g.code);

export const GENE_DRUG_RULES: GeneDrugRule[] = [
  {
    code: "cyp2c19-clopidogrel",
    gene: "CYP2C19",
    drugs: ["clopidogrel"],
    when: is("IM", "PM"),
    priority: "high",
    title: "Clopidogrel may not protect you fully",
    summary: "Clopidogrel is a prodrug that CYP2C19 activates. With reduced CYP2C19 activity, less active drug is made and the risk of stent clots and heart attack is higher.",
    recommendation:
      "CPIC recommends an alternative antiplatelet such as prasugrel or ticagrelor for heart and stent indications, if there is no reason to avoid them. Do not stop clopidogrel on your own: stopping an antiplatelet suddenly, especially after a stent, can be dangerous.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2c19-ssri-pm",
    gene: "CYP2C19",
    drugs: ["citalopram", "escitalopram"],
    when: is("PM"),
    priority: "moderate",
    title: "Higher antidepressant levels likely",
    summary: "Poor CYP2C19 metabolizers clear citalopram and escitalopram slowly, which raises blood levels and side effects (including QT prolongation with citalopram).",
    recommendation: "CPIC suggests a 50% lower starting dose with slower titration, or an antidepressant not mainly cleared by CYP2C19.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2c19-ssri-im",
    gene: "CYP2C19",
    drugs: ["citalopram", "escitalopram", "sertraline"],
    when: is("IM"),
    priority: "info",
    title: "Slower antidepressant titration may help",
    summary: "Intermediate CYP2C19 metabolizers can have somewhat higher levels of this antidepressant.",
    recommendation: "CPIC supports the usual starting dose, with slower increases and a possibly lower maintenance dose if side effects appear.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2c19-ssri-um",
    gene: "CYP2C19",
    drugs: ["citalopram", "escitalopram"],
    when: is("RM", "UM"),
    priority: "moderate",
    title: "This antidepressant may clear too fast",
    summary: "Rapid and ultrarapid CYP2C19 metabolizers break citalopram and escitalopram down quickly, which can mean lower levels and less benefit.",
    recommendation: "CPIC suggests considering an antidepressant that is not mainly cleared by CYP2C19.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2c19-ppi-fast",
    gene: "CYP2C19",
    drugs: ["omeprazole", "lansoprazole", "pantoprazole", "dexlansoprazole"],
    when: is("RM", "UM"),
    priority: "moderate",
    title: "Your acid reducer may be cleared quickly",
    summary: "Fast CYP2C19 metabolizers have lower PPI levels, which raises the chance of treatment failure (for example H. pylori eradication or erosive oesophagitis).",
    recommendation: "CPIC suggests a 50-100% higher starting dose for these indications, or ask about esomeprazole or rabeprazole, which depend less on CYP2C19.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2c19-ppi-slow",
    gene: "CYP2C19",
    drugs: ["omeprazole", "lansoprazole", "pantoprazole", "dexlansoprazole"],
    when: is("IM", "PM"),
    priority: "info",
    title: "A lower long-term PPI dose may be enough",
    summary: "With reduced CYP2C19 activity, PPIs stay in the body longer.",
    recommendation: "For long-term use (over 12 weeks), CPIC suggests considering a 50% dose reduction once symptoms are controlled.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2c19-voriconazole",
    gene: "CYP2C19",
    drugs: ["voriconazole"],
    when: is("RM", "UM", "PM"),
    priority: "high",
    title: "Voriconazole levels may be off target",
    summary: "Fast metabolizers often have too little voriconazole to work; poor metabolizers can reach toxic levels.",
    recommendation: "CPIC recommends an alternative antifungal not dependent on CYP2C19, or careful drug-level monitoring.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2c9-warfarin",
    gene: "CYP2C9",
    drugs: ["warfarin"],
    when: is("IM", "PM"),
    priority: "high",
    title: "You may need less warfarin",
    summary: "Reduced CYP2C9 activity slows warfarin clearance, so standard doses can over-thin the blood.",
    recommendation: "CPIC recommends a genotype-guided dosing algorithm (for example warfarindosing.org) that combines CYP2C9, VKORC1 and CYP4F2 with clinical factors, plus closer INR checks.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "vkorc1-warfarin",
    gene: "VKORC1",
    drugs: ["warfarin"],
    when: is("IS", "HS"),
    priority: "moderate",
    title: "You are more sensitive to warfarin",
    summary: "The VKORC1 -1639A variant lowers the amount of warfarin's target, so smaller doses have a bigger effect.",
    recommendation: "Make sure your dose was set with a pharmacogenomic algorithm, and keep INR monitoring on schedule.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp4f2-warfarin",
    gene: "CYP4F2",
    drugs: ["warfarin"],
    when: is("DEC"),
    priority: "info",
    title: "Slightly higher warfarin needs possible",
    summary: "CYP4F2*3 is linked to needing about 5-10% more warfarin.",
    recommendation: "Dosing algorithms can include this; no action needed beyond normal INR monitoring.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2c9-nsaid",
    gene: "CYP2C9",
    drugs: ["celecoxib", "ibuprofen", "flurbiprofen", "meloxicam"],
    when: (g) => g.activityScore !== null && g.activityScore <= 1,
    priority: "moderate",
    title: "Anti-inflammatory levels may run high",
    summary: "With low CYP2C9 activity, some NSAIDs stay in the body much longer, raising the risk of stomach bleeding, kidney and heart side effects.",
    recommendation: "CPIC suggests starting at the lowest dose (or 25-50% of it for poor metabolizers) or choosing an NSAID not cleared by CYP2C9. Meloxicam needs a larger reduction.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2c9-phenytoin",
    gene: "CYP2C9",
    drugs: ["phenytoin"],
    when: (g) => g.activityScore !== null && g.activityScore <= 1,
    priority: "high",
    title: "Phenytoin can build up",
    summary: "Reduced CYP2C9 activity slows phenytoin clearance and raises the risk of toxicity such as unsteadiness and confusion.",
    recommendation: "CPIC suggests a lower maintenance dose (about 25% lower for intermediate, 50% for poor metabolizers) guided by drug levels.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2d6-opioid",
    gene: "CYP2D6",
    drugs: ["codeine", "tramadol"],
    when: is("PM"),
    priority: "high",
    title: "Codeine and tramadol may not relieve pain",
    summary: "These painkillers must be converted by CYP2D6. Poor metabolizers make little of the active form.",
    recommendation: "CPIC recommends avoiding codeine and tramadol and using a painkiller that does not depend on CYP2D6.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2d6-opioid-im",
    gene: "CYP2D6",
    drugs: ["codeine", "tramadol"],
    when: is("IM"),
    priority: "info",
    title: "Pain relief may be weaker than expected",
    summary: "Intermediate CYP2D6 metabolizers convert less codeine or tramadol into the active form.",
    recommendation: "Standard dosing is reasonable; if it doesn't work, ask about an alternative rather than a higher dose.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2d6-tamoxifen",
    gene: "CYP2D6",
    drugs: ["tamoxifen"],
    when: is("IM", "PM"),
    priority: "high",
    title: "Tamoxifen may be less effective",
    summary: "CYP2D6 turns tamoxifen into endoxifen. Reduced activity lowers endoxifen and may raise recurrence risk.",
    recommendation: "CPIC suggests discussing an aromatase inhibitor (if post-menopausal) or a higher tamoxifen dose, and avoiding strong CYP2D6 inhibitors.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2d6-paroxetine",
    gene: "CYP2D6",
    drugs: ["paroxetine"],
    when: is("PM"),
    priority: "moderate",
    title: "Paroxetine levels may run high",
    summary: "Poor CYP2D6 metabolizers clear paroxetine slowly.",
    recommendation: "CPIC suggests a 50% lower starting dose with slower titration, or an alternative antidepressant.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp2d6-metoprolol",
    gene: "CYP2D6",
    drugs: ["metoprolol"],
    when: is("PM"),
    priority: "info",
    title: "Metoprolol may slow your heart more",
    summary: "Poor CYP2D6 metabolizers have higher metoprolol levels and more slowing of heart rate.",
    recommendation: "Guidance suggests a lower starting dose with gradual increases, or a beta blocker not cleared by CYP2D6 (such as bisoprolol).",
    evidenceLevel: "DPWG / CPIC 2024",
  },
  {
    code: "slco1b1-simvastatin",
    gene: "SLCO1B1",
    drugs: ["simvastatin", "lovastatin"],
    when: is("DF", "PF"),
    priority: "high",
    title: "Higher statin muscle-pain risk",
    summary: "SLCO1B1 moves statins into the liver. Reduced function leaves more simvastatin in the blood, which raises the risk of muscle pain and, rarely, muscle damage.",
    recommendation: "CPIC suggests simvastatin 20 mg a day or less, or another statin such as rosuvastatin or pravastatin (an alternative statin for poor function, and for lovastatin).",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "slco1b1-atorvastatin",
    gene: "SLCO1B1",
    drugs: ["atorvastatin"],
    when: is("DF", "PF"),
    priority: "info",
    title: "A dose cap on atorvastatin may apply",
    summary: "Reduced SLCO1B1 function raises atorvastatin levels somewhat.",
    recommendation: "CPIC suggests starting at 40 mg or less (20 mg or less with poor function) and adjusting to your cholesterol targets.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "slco1b1-rosuvastatin",
    gene: "SLCO1B1",
    drugs: ["rosuvastatin"],
    when: is("DF", "PF"),
    priority: "info",
    title: "A dose cap on rosuvastatin may apply",
    summary: "Reduced SLCO1B1 function raises rosuvastatin levels.",
    recommendation: "CPIC suggests starting at 20 mg or less (10 mg or less with poor function).",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "thiopurine-tpmt",
    gene: "TPMT",
    drugs: ["azathioprine", "mercaptopurine", "thioguanine"],
    when: is("IM", "PM"),
    priority: "high",
    title: "Thiopurines can dangerously lower blood counts",
    summary: "TPMT breaks down thiopurines. Reduced activity lets toxic metabolites build up in the bone marrow.",
    recommendation:
      "CPIC suggests starting at 30-80% of the usual dose for intermediate metabolizers. For poor metabolizers, an alternative for non-cancer conditions, or a drastically reduced dose (about 10-fold lower, three times a week) for cancer.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "thiopurine-nudt15",
    gene: "NUDT15",
    drugs: ["azathioprine", "mercaptopurine", "thioguanine"],
    when: is("IM", "PM"),
    priority: "high",
    title: "Thiopurines can dangerously lower blood counts",
    summary: "NUDT15 variants (more common in East Asian and Hispanic ancestry) raise the risk of severe bone-marrow suppression.",
    recommendation: "CPIC suggests a reduced starting dose for intermediate metabolizers and an alternative or drastic reduction for poor metabolizers.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "dpyd-fluoropyrimidine",
    gene: "DPYD",
    drugs: ["fluorouracil", "capecitabine"],
    when: is("IM", "PM"),
    priority: "urgent",
    title: "Severe chemotherapy toxicity risk",
    summary: "DPD breaks down 5-FU and capecitabine. Reduced DPD activity can cause life-threatening toxicity at standard doses.",
    recommendation: "CPIC recommends a 50% starting dose for intermediate metabolizers and avoiding these drugs for poor metabolizers. Tell your oncology team before treatment starts.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "cyp3a5-tacrolimus",
    gene: "CYP3A5",
    drugs: ["tacrolimus"],
    when: is("NM", "IM"),
    priority: "moderate",
    title: "You may need more tacrolimus",
    summary: "You carry at least one working CYP3A5 copy (an 'expresser'), so you clear tacrolimus faster than most.",
    recommendation: "CPIC suggests 1.5-2 times the usual starting dose (no more than 0.3 mg/kg/day), guided by drug levels.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "ugt1a1-atazanavir",
    gene: "UGT1A1",
    drugs: ["atazanavir"],
    when: is("PM"),
    priority: "moderate",
    title: "Atazanavir may cause jaundice",
    summary: "Reduced UGT1A1 activity (Gilbert syndrome pattern) raises bilirubin on atazanavir, which often leads people to stop it.",
    recommendation: "CPIC suggests considering an alternative antiretroviral.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "ugt1a1-irinotecan",
    gene: "UGT1A1",
    drugs: ["irinotecan"],
    when: is("PM"),
    priority: "high",
    title: "Irinotecan toxicity risk",
    summary: "Reduced UGT1A1 activity slows clearance of irinotecan's active metabolite, raising the risk of severe diarrhoea and low white cells.",
    recommendation: "Guidelines (DPWG) suggest a reduced starting dose. Tell your oncology team.",
    evidenceLevel: "DPWG / FDA label",
  },
  {
    code: "hlab5701-abacavir",
    gene: "HLA-B",
    drugs: ["abacavir"],
    when: is("POS"),
    priority: "urgent",
    title: "Abacavir hypersensitivity risk",
    summary: "HLA-B*57:01 carriers have a high risk of a severe, potentially fatal reaction to abacavir.",
    recommendation: "CPIC: abacavir should not be used in HLA-B*57:01 carriers. Ask for confirmatory HLA typing and contact your HIV clinician promptly.",
    evidenceLevel: "CPIC level A",
  },
  {
    code: "thrombophilia-estrogen",
    gene: "F5",
    drugs: ["ethinylestradiol", "estradiol"],
    when: is("HET", "HOM"),
    priority: "high",
    title: "Estrogen raises your clot risk further",
    summary: "Factor V Leiden already raises the risk of blood clots in the veins. Estrogen-containing contraception and HRT add to it.",
    recommendation: "US MEC rates combined hormonal contraception category 4 (unacceptable risk) with known thrombogenic mutations. Ask about progestin-only or non-hormonal options.",
    evidenceLevel: "CDC US MEC 2024",
  },
  {
    code: "prothrombin-estrogen",
    gene: "F2",
    drugs: ["ethinylestradiol", "estradiol"],
    when: is("HET", "HOM"),
    priority: "high",
    title: "Estrogen raises your clot risk further",
    summary: "The prothrombin G20210A variant raises the risk of blood clots; estrogen-containing contraception and HRT add to it.",
    recommendation: "US MEC rates combined hormonal contraception category 4 with known thrombogenic mutations. Ask about progestin-only or non-hormonal options.",
    evidenceLevel: "CDC US MEC 2024",
  },
];

/** Gene-drug rules that fire for one drug given the called genes. */
export function geneDrugHits(drug: string, genes: GeneResult[]) {
  return GENE_DRUG_RULES.filter((r) => r.drugs.includes(drug)).flatMap((rule) => {
    const g = genes.find((x) => x.gene === rule.gene);
    return g && rule.when(g) ? [{ rule, gene: g }] : [];
  });
}

/** Drugs a gene result is relevant to, for "keep in mind for future prescriptions". */
export function affectedDrugs(g: GeneResult) {
  return [...new Set(GENE_DRUG_RULES.filter((r) => r.gene === g.gene && r.when(g)).flatMap((r) => r.drugs))];
}

/** Phenotypes that matter even before any related drug is prescribed. */
export const HIGH_STAKES_GENES = new Set(["DPYD", "TPMT", "NUDT15", "HLA-B", "F5", "F2", "CYP2C19", "CYP2C9", "SLCO1B1", "CYP2D6"]);
