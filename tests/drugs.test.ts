import { describe, expect, it } from "vitest";
import { allergyConflict, findInteractions, normalizeDrug } from "@/lib/clinical/drugs";

describe("drug normalisation", () => {
  it("maps brands and dosed names to generics", () => {
    expect(normalizeDrug("Plavix 75mg tablet")).toBe("clopidogrel");
    expect(normalizeDrug("Lexapro")).toBe("escitalopram");
    expect(normalizeDrug("Simvastatin 40 mg tablet")).toBe("simvastatin");
    expect(normalizeDrug("Tylenol with codeine #3")).toBe("codeine");
  });
  it("keeps unknown names recognisable", () => {
    expect(normalizeDrug("Semaglutide 1 mg")).toBe("semaglutide");
  });
});

describe("drug-drug interactions", () => {
  it("finds well-known pairs", () => {
    const codes = findInteractions(["clopidogrel", "omeprazole", "warfarin", "ibuprofen"]).map((h) => h.interaction.code);
    expect(codes).toContain("clopidogrel-ppi");
    expect(codes).toContain("anticoagulant-nsaid");
  });
  it("treats contraindicated combinations as urgent", () => {
    const hits = findInteractions(["sildenafil", "isosorbide mononitrate"]);
    expect(hits[0].interaction.priority).toBe("urgent");
  });
  it("does not flag pantoprazole with clopidogrel", () => {
    expect(findInteractions(["clopidogrel", "pantoprazole"])).toHaveLength(0);
  });
});

describe("allergy cross-checks", () => {
  it("matches drug classes", () => {
    expect(allergyConflict("amoxicillin", ["Penicillin"])?.substance).toBe("Penicillin");
    expect(allergyConflict("trimethoprim", ["Sulfa drugs"])).not.toBeNull();
    expect(allergyConflict("clopidogrel", ["Penicillin"])).toBeNull();
  });
});
