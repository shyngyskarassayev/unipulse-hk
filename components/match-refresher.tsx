"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { refreshMatches } from "@/app/actions";

/**
 * Asks the model to explain the student's best matches. Runs by itself right
 * after onboarding, and on demand afterwards.
 */
export function MatchRefresher({ auto, hasReasons }: { auto: boolean; hasReasons: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ text: string; isError: boolean } | null>(null);
  const started = useRef(false);

  function run() {
    startTransition(async () => {
      const result = await refreshMatches();
      if (result.error) {
        setNote({ text: result.error, isError: true });
        return;
      }
      setNote(null);
      router.refresh();
    });
  }

  useEffect(() => {
    if (auto && !hasReasons && !started.current) {
      started.current = true;
      run();
    }
    // Run once on arrival from onboarding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={run} disabled={pending} className="btn btn-ghost">
        {pending
          ? "AI is reading your matches…"
          : hasReasons
            ? "Refresh AI explanations"
            : "Explain my matches with AI"}
      </button>
      {note ? (
        <p className={`text-sm ${note.isError ? "text-accent-dark" : "text-muted"}`}>{note.text}</p>
      ) : null}
    </div>
  );
}
