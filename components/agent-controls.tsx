"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface AgentJob {
  /** Query string for /api/agent/run, e.g. "step=search&topic=hackathons". */
  query: string;
  label: string;
  ready: boolean;
}

/** Runs the agent's steps one after another and refreshes the log as it goes. */
export function AgentControls({ jobs }: { jobs: AgentJob[] }) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runJobs(list: AgentJob[]) {
    setError(null);
    for (const job of list) {
      setRunning(job.label);
      try {
        const response = await fetch(`/api/agent/run?${job.query}`, { method: "POST" });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setError(`${job.label}: ${body.error ?? `failed with status ${response.status}`}`);
          break;
        }
      } catch {
        setError(`${job.label}: the request did not complete.`);
        break;
      }
      router.refresh();
    }
    setRunning(null);
    router.refresh();
  }

  const ready = jobs.filter((job) => job.ready);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => runJobs(ready)}
          disabled={running !== null || ready.length === 0}
          className="btn btn-primary"
        >
          {running ? `Running: ${running}…` : "Run everything now"}
        </button>
        {jobs.map((job) => (
          <button
            key={job.query}
            type="button"
            onClick={() => runJobs([job])}
            disabled={running !== null || !job.ready}
            title={job.ready ? undefined : "Not configured yet"}
            className="btn btn-ghost"
          >
            {job.label}
          </button>
        ))}
      </div>
      {running ? (
        <p className="text-sm text-muted">
          A web search can take a minute or two. The log below updates after each step.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-accent-dark">
          {error}
        </p>
      ) : null}
    </div>
  );
}
