import type { Metadata } from "next";
import { AgentControls, type AgentJob } from "@/components/agent-controls";
import { SEARCH_TOPICS, sourceUrls, type SearchTopic } from "@/lib/agent/config";
import { getSession } from "@/lib/data/session";
import { HK_TIME_ZONE, isAiEnabled, isInboxConfigured, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { AgentRun } from "@/lib/types";

export const metadata: Metadata = { title: "Agent" };

const stampFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: HK_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const STEP_LABELS: Record<string, string> = {
  sources: "Source websites",
  inbox: "Project inbox",
  "search:hackathons": "Web search · hackathons",
  "search:talks": "Web search · talks and workshops",
  "search:volunteering": "Web search · volunteering",
  "search:jobs": "Web search · internships and jobs",
};

const STATUS_TONE: Record<AgentRun["status"], string> = {
  ok: "bg-ok-soft text-ok",
  error: "bg-accent-soft text-accent-dark",
  skipped: "bg-line text-muted",
  running: "bg-warn-soft text-warn",
};

function seconds(run: AgentRun): string | null {
  if (!run.finished_at) return null;
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

export default async function AgentPage() {
  const ai = isAiEnabled();
  const pages = sourceUrls();
  const inbox = isInboxConfigured();

  const sources: Array<{ name: string; detail: string; on: boolean }> = [
    {
      name: "Source websites",
      detail: pages.length > 0 ? `${pages.length} pages checked for new listings` : "No pages listed",
      on: pages.length > 0,
    },
    {
      name: "Project inbox",
      detail: inbox
        ? ai
          ? "Reads forwarded university e-mails"
          : "Connected, but reading needs a Gemini API key"
        : "Not connected",
      on: inbox && ai,
    },
    {
      name: "Gemini web search",
      detail: ai
        ? `Searches ${Object.keys(SEARCH_TOPICS).length} topics every day`
        : "Needs a Gemini API key",
      on: ai,
    },
  ];

  const jobs: AgentJob[] = [
    { query: "step=sources", label: "Websites", ready: pages.length > 0 },
    { query: "step=inbox", label: "Inbox", ready: inbox && ai },
    ...(Object.keys(SEARCH_TOPICS) as SearchTopic[]).map((topic) => ({
      query: `step=search&topic=${topic}`,
      label: `Search: ${topic}`,
      ready: ai,
    })),
  ];

  let runs: AgentRun[] = [];
  let isAdmin = false;
  if (isSupabaseConfigured) {
    const session = await getSession();
    isAdmin = Boolean(session?.isAgentAdmin);
    const supabase = await createClient();
    const { data } = await supabase
      .from("agent_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(40);
    runs = (data ?? []) as AgentRun[];
  }

  const addedTotal = runs.reduce((sum, run) => sum + run.added, 0);

  return (
    <div className="flex flex-col gap-8 pt-4">
      <div>
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-accent">
          <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-accent" aria-hidden />
          Runs every day at 07:00 Hong Kong time
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">The agent</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Each morning the agent reads forwarded e-mails, checks source
          websites and searches the web with Gemini. Everything it finds goes through the same
          reader, duplicates are dropped, and new activities land in the feed.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {sources.map((source) => (
          <div key={source.name} className="card flex flex-col gap-1 p-4">
            <span
              className={`self-start rounded-full px-2 py-0.5 text-xs font-medium ${source.on ? "bg-ok-soft text-ok" : "bg-line text-muted"}`}
            >
              {source.on ? "On" : "Off"}
            </span>
            <p className="mt-1 font-semibold">{source.name}</p>
            <p className="text-sm text-muted">{source.detail}</p>
          </div>
        ))}
      </section>

      {isAdmin ? (
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Run now</h2>
          <AgentControls jobs={jobs} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-tight">Activity log</h2>
          {runs.length > 0 ? (
            <p className="font-mono text-sm text-muted">
              {addedTotal} added in the last {runs.length} runs
            </p>
          ) : null}
        </div>

        {!isSupabaseConfigured ? (
          <p className="card border-dashed p-5 text-sm text-muted">
            The log appears once the database is connected.
          </p>
        ) : runs.length === 0 ? (
          <p className="card p-5 text-sm text-muted">The agent has not run yet.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-col gap-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[run.status]}`}>
                    {run.status}
                  </span>
                  <span className="font-semibold">{STEP_LABELS[run.step] ?? run.step}</span>
                  <span className="font-mono text-xs text-muted">
                    {stampFmt.format(new Date(run.started_at))}
                    {seconds(run) ? ` · ${seconds(run)}` : ""}
                  </span>
                  <span className="ml-auto font-mono text-sm">
                    {run.found} found · <strong>{run.added} added</strong>
                  </span>
                </div>
                {run.log ? (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{run.log}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
