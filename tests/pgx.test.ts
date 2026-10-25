import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { altCount, callGenes, geneDrugHits, PANEL, parseGenome } from "@/lib/clinical/pgx";

const gene = (calls: Record<string, string>, name: string) => callGenes(calls).find((g) => g.gene === name)!;

describe("genome parsing", () => {
  it("reads a 23andMe file and keeps only panel variants", () => {
    const parsed = parseGenome(readFileSync("public/sample-genome.txt", "utf8"));
    expect(parsed.format).toBe("23andme");
    expect(parsed.totalVariants).toBeGreaterThan(4000);
    expect(Object.keys(parsed.calls)).toHaveLength(PANEL.length);
    expect(parsed.calls.rs4244285).toBe("AG");
  });

  it("reads AncestryDNA two-column alleles", () => {
    const text = "#AncestryDNA\nrsid\tchromosome\tposition\tallele1\tallele2\nrs4244285\t10\t96541616\tA\tA\nrs999\t1\t1\tC\tC\n";
    const parsed = parseGenome(text);
    expect(parsed.format).toBe("ancestry");
    expect(parsed.calls).toEqual({ rs4244285: "AA" });
    expect(parsed.totalVariants).toBe(2);
  });

  it("reads VCF genotypes and multi-allelic sites", () => {
    const text = "##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tS1\n10\t96741053\trs1057910\tA\tC\t.\tPASS\t.\tGT:DP\t0/1:30\n12\t21331549\trs4149056\tT\tC,G\t.\tPASS\t.\tGT\t1|1\n";
    expect(parseGenome(text).calls).toEqual({ rs1057910: "AC", rs4149056: "CC" });
  });

  it("reads MyHeritage CSV with quotes and skips no-calls", () => {
    const text = 'RSID,CHROMOSOME,POSITION,RESULT\n"rs4244285","10","96541616","GG"\n"rs4986893","10","96540410","--"\n';
    const parsed = parseGenome(text);
    expect(parsed.format).toBe("myheritage");
    expect(parsed.calls).toEqual({ rs4244285: "GG" });
  });
});

describe("allele counting", () => {
  const cyp2c19star2 = PANEL.find((v) => v.rsid === "rs4244285")!;
  it("counts variant copies and tolerates minus-strand reports", () => {
    expect(altCount(cyp2c19star2, "GG")).toBe(0);
    expect(altCount(cyp2c19star2, "GA")).toBe(1);
    expect(altCount(cyp2c19star2, "TT")).toBe(2); // complement of AA
    expect(altCount(cyp2c19star2, "--")).toBeNull();
    expect(altCount(cyp2c19star2, "GC")).toBeNull();
  });
});

describe("phenotype calling (CPIC)", () => {
  it("CYP2C19 diplotypes", () => {
    expect(gene({ rs4244285: "GG", rs4986893: "GG", rs12248560: "CC" }, "CYP2C19")).toMatchObject({ code: "NM", diplotype: "*1/*1", confidence: "high" });
    expect(gene({ rs4244285: "GA", rs4986893: "GG", rs12248560: "CC" }, "CYP2C19")).toMatchObject({ code: "IM", diplotype: "*1/*2" });
    expect(gene({ rs4244285: "AA", rs4986893: "GG", rs12248560: "CC" }, "CYP2C19")).toMatchObject({ code: "PM", diplotype: "*2/*2" });
    expect(gene({ rs4244285: "GA", rs4986893: "GG", rs12248560: "CT" }, "CYP2C19")).toMatchObject({ code: "IM", diplotype: "*2/*17" });
    expect(gene({ rs4244285: "GG", rs4986893: "GG", rs12248560: "CT" }, "CYP2C19").code).toBe("RM");
    expect(gene({ rs4244285: "GG", rs4986893: "GG", rs12248560: "TT" }, "CYP2C19").code).toBe("UM");
  });

  it("CYP2C9 activity scores", () => {
    expect(gene({ rs1799853: "CT", rs1057910: "AA" }, "CYP2C9")).toMatchObject({ code: "IM", activityScore: 1.5 });
    expect(gene({ rs1799853: "CC", rs1057910: "AC" }, "CYP2C9")).toMatchObject({ code: "IM", activityScore: 1 });
    expect(gene({ rs1799853: "CT", rs1057910: "AC" }, "CYP2C9")).toMatchObject({ code: "PM", activityScore: 0.5 });
  });

  it("marks partial data as low confidence", () => {
    expect(gene({ rs4244285: "GA" }, "CYP2C19")).toMatchObject({ code: "IM", confidence: "low" });
  });

  it("TPMT *3A counts once, not twice", () => {
    expect(gene({ rs1142345: "TC", rs1800460: "CT" }, "TPMT")).toMatchObject({ code: "IM", diplotype: "*1/*3A" });
  });

  it("DPYD, SLCO1B1, VKORC1, HLA-B and F5", () => {
    expect(gene({ rs3918290: "CT", rs55886062: "AA", rs67376798: "TT" }, "DPYD")).toMatchObject({ code: "IM", activityScore: 1 });
    expect(gene({ rs4149056: "CC" }, "SLCO1B1").code).toBe("PF");
    expect(gene({ rs9923231: "TT" }, "VKORC1").code).toBe("HS");
    expect(gene({ rs2395029: "TG" }, "HLA-B")).toMatchObject({ code: "POS", actionable: true });
    expect(gene({ rs6025: "CT" }, "F5").code).toBe("HET");
  });
});

describe("gene-drug rules", () => {
  const genes = callGenes({ rs4244285: "GA", rs4986893: "GG", rs12248560: "CC", rs4149056: "CT", rs2395029: "TG" });
  it("flags clopidogrel for CYP2C19 intermediate metabolizers", () => {
    expect(geneDrugHits("clopidogrel", genes).map((h) => h.rule.code)).toEqual(["cyp2c19-clopidogrel"]);
  });
  it("flags simvastatin for SLCO1B1 decreased function and abacavir for HLA-B*57:01", () => {
    expect(geneDrugHits("simvastatin", genes)[0].rule.priority).toBe("high");
    expect(geneDrugHits("abacavir", genes)[0].rule.priority).toBe("urgent");
  });
  it("stays quiet for normal results", () => {
    expect(geneDrugHits("clopidogrel", callGenes({ rs4244285: "GG", rs4986893: "GG", rs12248560: "CC" }))).toHaveLength(0);
  });
});
