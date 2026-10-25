import { describe, expect, it } from "vitest";
import { detectRedFlag, emergencyReply } from "@/lib/safety";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { describeSnapshot } from "@/lib/ai/context";
import { guardPlan, type CarePlan } from "@/lib/ai/plan";
import type { Finding } from "@/lib/clinical/findings";

describe("red-flag detection", () => {
  it("catches emergencies before they reach the model", () => {
    expect(detectRedFlag("I have crushing chest pain and my arm hurts")).toBe("chest pain");
    expect(detectRedFlag("my face is drooping and speech is slurred")).toBe("stroke symptoms");
    expect(detectRedFlag("I want to kill myself")).toBe("self-harm");
    expect(emergencyReply("self-harm")).toContain("988");
  });
  it("leaves ordinary questions alone", () => {
    expect(detectRedFlag("What does CYP2C19 do?")).toBeNull();
    expect(detectRedFlag("Can I take ibuprofen with escitalopram?")).toBeNull();
  });
});

describe("encryption at rest", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptJson({ rs4244285: "AG" });
    const b = encryptJson({ rs4244285: "AG" });
    expect(a).not.toBe(b);
    expect(a).not.toContain("AG");
    expect(decryptJson(a)).toEqual({ rs4244285: "AG" });
  });
  it("rejects tampered ciphertext", () => {
    const parts = encryptJson({ x: 1 }).split(".");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptJson(parts.join("."))).toThrow();
  });
});

describe("AI context", () => {
  it("is de-identified", () => {
    const text = describeSnapshot(
      { profile: { birthYear: 1968, sex: "male", heightCm: null, weightKg: null, ancestry: "", smoking: "never", pregnant: false, goals: [] }, age: 58, meds: [], conditions: [], allergies: [], genes: null, labs: [], vitals: [] },
      [],
    );
    expect(text).toContain("Age: 58");
    expect(text).not.toContain("1968");
  });
});

describe("care plan guardrails", () => {
  const finding: Finding = { ruleCode: "cyp2c19-clopidogrel:clopidogrel", kind: "gene_drug", priority: "high", title: "Clopidogrel may not protect you fully", summary: "s", recommendation: "r", rationale: "x", evidence: [{ label: "a", detail: "b" }], evidenceLevel: "CPIC level A", questions: [] };
  const plan: CarePlan = {
    headline: "h",
    overview: "o",
    priorities: [{ title: "Sleep more", category: "sleep", priority: "info", summary: "", recommendation: "", rationale: "", evidence: [], questionsForClinician: [], basedOnFindings: [] }],
    lifestyle: [],
    monitoring: [],
    dataGaps: [],
    model: "claude-opus-5-5",
    generatedAt: "",
  };
  it("adds back any high-priority rule finding the model left out, first", () => {
    const out = guardPlan(plan, [finding]);
    expect(out.priorities[0].basedOnFindings).toEqual([finding.ruleCode]);
  });
  it("appends a prescriber reminder to unsupervised medication changes", () => {
    const out = guardPlan({ ...plan, priorities: [{ ...plan.priorities[0], category: "medication", recommendation: "Stop taking omeprazole." }] }, []);
    expect(out.priorities[0].recommendation).toMatch(/Talk to your prescriber/);
  });
});
