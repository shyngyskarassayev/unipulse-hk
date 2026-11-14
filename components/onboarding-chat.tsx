"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

/** The AI onboarding interview. The transcript lives only in this tab. */
export function OnboardingChat({ greeting }: { greeting: string }) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy || done) return;

    const history: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(history);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history }),
      });
      const body = (await response.json()) as { reply?: string; saved?: boolean; error?: string };
      if (!response.ok || !body.reply) throw new Error(body.error ?? "The guide did not answer.");

      setTurns([...history, { role: "assistant", content: body.reply }]);
      if (body.saved) {
        setDone(true);
        router.refresh();
      }
    } catch (e) {
      // Put the message back so nothing the student typed is lost.
      setTurns(turns);
      setInput(text);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col">
      <div className="flex max-h-[26rem] min-h-64 flex-col gap-3 overflow-y-auto p-5" aria-live="polite">
        <Bubble role="assistant">{greeting}</Bubble>
        {turns.map((turn, index) => (
          <Bubble key={index} role={turn.role}>
            {turn.content}
          </Bubble>
        ))}
        {busy ? <Bubble role="assistant">…</Bubble> : null}
        <div ref={endRef} />
      </div>

      {done ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
          <p className="text-sm text-ok">Profile saved. Your feed is ready.</p>
          <button
            type="button"
            onClick={() => router.push("/?tab=foryou&fresh=1")}
            className="btn btn-primary"
          >
            Show my feed
          </button>
        </div>
      ) : (
        <form onSubmit={send} className="flex gap-2 border-t border-line p-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your answer"
            aria-label="Your answer"
            maxLength={600}
            autoFocus
            className="input rounded-full"
          />
          <button type="submit" disabled={busy || !input.trim()} className="btn btn-dark">
            Send
          </button>
        </form>
      )}

      {error ? (
        <p role="alert" className="px-4 pb-4 text-sm text-accent-dark">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Bubble({ role, children }: { role: Turn["role"]; children: React.ReactNode }) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <p
        className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-paper"
        }`}
      >
        {children}
      </p>
    </div>
  );
}
