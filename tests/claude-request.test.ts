import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Snapshot } from "@/lib/clinical/findings";

// A fake Messages API that streams a canned structured answer, so we can check the exact request
// the app sends and that guardrails run on the parsed output.
let server: Server;
let lastBody: Record<string, unknown> = {};
let lastHeaders: Record<string, string | string[] | undefined> = {};

const answer = {
  headline: "Talk to your cardiologist about your antiplatelet",
  overview: "Your genes affect clopidogrel.",
  priorities: [{ title: "Sleep", category: "sleep", priority: "info", summary: "s", recommendation: "r", rationale: "x", evidence: [], questionsForClinician: [], basedOnFindings: [] }],
  lifestyle: [],
  monitoring: [],
  dataGaps: [],
};

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastBody = JSON.parse(raw);
      lastHeaders = req.headers;
      const ev = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      res.writeHead(200, { "content-type": "text/event-stream" });
      ev("message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
      ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: JSON.stringify(answer) } });
      ev("content_block_stop", { type: "content_block_stop", index: 0 });
      ev("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 50 } });
      ev("message_stop", { type: "message_stop" });
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.close();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
});

describe("care plan request", () => {
  it("sends a de-identified structured-output request to the latest Opus and applies guardrails", async () => {
    const { generateCarePlan } = await import("@/lib/ai/plan");
    const snapshot: Snapshot = {
      profile: { birthYear: 1968, sex: "male", heightCm: null, weightKg: null, ancestry: "", smoking: "never", pregnant: false, goals: [] },
      age: 58,
      meds: [{ name: "Clopidogrel 75 mg", drug: "clopidogrel", dose: "75 mg" }],
      conditions: ["Coronary artery disease"],
      allergies: [],
      genes: null,
      labs: [],
      vitals: [],
    };
    const finding = { ruleCode: "cyp2c19-clopidogrel:clopidogrel", kind: "gene_drug" as const, priority: "high" as const, title: "Clopidogrel may not protect you fully", summary: "s", recommendation: "r", rationale: "x", evidence: [], evidenceLevel: "CPIC level A", questions: [] };
    const plan = await generateCarePlan(snapshot, [finding], true);

    expect(lastBody).toMatchObject({ model: "claude-opus-5-5", stream: true, thinking: { type: "adaptive" }, fallbacks: "default" });
    expect((lastBody.output_config as { format: { type: string }; effort: string }).format.type).toBe("json_schema");
    expect(String(lastHeaders["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(JSON.stringify(lastBody.messages)).toContain("cyp2c19-clopidogrel:clopidogrel");
    expect(JSON.stringify(lastBody.messages)).not.toContain("1968");
    // The model omitted the high-priority finding, so the guard put it back on top.
    expect(plan.model).toBe("claude-opus-5-5");
    expect(plan.priorities[0].title).toBe("Clopidogrel may not protect you fully");
  });
});
