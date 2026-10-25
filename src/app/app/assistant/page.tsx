"use client";
import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/app/markdown";
import { useSession } from "@/components/app/session";
import { Button, Card, cx, Disclaimer, PageHeader } from "@/components/ui";
import { detectRedFlag, emergencyReply } from "@/lib/safety";

type Turn = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Explain my CYP2C19 result in plain English.",
  "Which of my medicines are affected by my genes?",
  "Why has my resting heart rate gone up this week?",
  "What should I ask my cardiologist at my next visit?",
];

export default function AssistantPage() {
  const { me } = useSession();
  const aiOn = me.ai.enabled && me.ai.allowed;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [turns]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || streaming) return;
    const history: Turn[] = [...turns, { role: "user", content: question }];
    // Red flags get an immediate fixed answer, even when AI is unavailable.
    const flag = detectRedFlag(question);
    if (flag) {
      setTurns([...history, { role: "assistant", content: emergencyReply(flag) }]);
      setInput("");
      return;
    }
    setTurns([...history, { role: "assistant", content: "" }]);
    setInput("");
    setError(null);
    setStreaming(true);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-20) }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setTurns([...history, { role: "assistant", content: acc }]);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
        setTurns(history.slice(0, -1));
        setInput(question);
      }
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Grounded in your vault" title="Ask Allele" description="Answers come from your own genotype, medicines, labs and wearable trends. Allele never tells you to change a medicine on your own." />
      {!aiOn && (
        <div className="mb-4 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink-2">
          Offline mode: answers come from Allele&apos;s rules engine and nothing is sent to an AI model.{" "}
          {me.ai.enabled ? "The owner can turn on AI analysis under Privacy & sharing for conversational answers." : <>Add <code>ANTHROPIC_API_KEY</code> and restart the server for conversational answers.</>}
        </div>
      )}
      <Card className="flex min-h-[60vh] flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {turns.length === 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-left text-sm text-ink-2 hover:border-helix hover:text-ink disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          )}
          {turns.map((t, k) => (
            <div key={k} className={cx("flex", t.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cx("max-w-[85%] rounded-2xl px-4 py-3", t.role === "user" ? "bg-helix text-helix-ink" : "border border-line bg-surface-2")}>
                {t.role === "assistant" ? t.content ? <Markdown text={t.content} /> : <span className="text-sm text-ink-3">Reading your vault…</span> : <p className="text-sm whitespace-pre-line">{t.content}</p>}
              </div>
            </div>
          ))}
          {error && <div className="text-sm text-critical">{error}</div>}
          <div ref={end} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 border-t border-line p-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder="Ask about a gene, a medicine, a lab result or a trend"
            aria-label="Message"
            className="max-h-40 min-h-10 flex-1 resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm focus:border-helix focus:outline-none"
          />
          {streaming ? (
            <Button type="button" variant="secondary" onClick={() => abort.current?.abort()} aria-label="Stop">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button disabled={!input.trim()} aria-label="Send">
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </form>
      </Card>
      <Disclaimer className="mt-4" compact />
    </>
  );
}
