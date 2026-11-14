import type { SupabaseClient } from "@supabase/supabase-js";
import { SEARCH_TOPICS, type AgentStep, type SearchTopic } from "@/lib/agent/config";
import { runInboxStep } from "@/lib/agent/inbox";
import { runSearchStep } from "@/lib/agent/search";
import { runSourcesStep } from "@/lib/agent/sources";
import { describeAiError } from "@/lib/ai/client";
import type { AgentRun } from "@/lib/types";

export interface StepOutcome {
  status: "ok" | "error" | "skipped";
  found: number;
  added: number;
  log: string[];
}

export function isSearchTopic(value: string | null | undefined): value is SearchTopic {
  return Boolean(value) && Object.hasOwn(SEARCH_TOPICS, value as string);
}

/**
 * Runs one step of the agent and records it in agent_runs, so the /agent page
 * can show what the agent did and when. A failing step is logged, not thrown.
 */
export async function runAgentStep(
  admin: SupabaseClient,
  step: AgentStep,
  topic?: SearchTopic,
): Promise<AgentRun> {
  const label = step === "search" ? `search:${topic ?? "hackathons"}` : step;

  const { data: started, error: startError } = await admin
    .from("agent_runs")
    .insert({ step: label, status: "running" })
    .select()
    .single();
  if (startError || !started) {
    throw new Error(`Could not start the agent run: ${startError?.message ?? "no row returned"}`);
  }

  let outcome: StepOutcome;
  try {
    switch (step) {
      case "sources":
        outcome = await runSourcesStep(admin);
        break;
      case "inbox":
        outcome = await runInboxStep(admin);
        break;
      case "search":
        outcome = await runSearchStep(admin, topic ?? "hackathons");
        break;
    }
  } catch (error) {
    outcome = { status: "error", found: 0, added: 0, log: [describeAiError(error)] };
  }

  const { data: finished, error: finishError } = await admin
    .from("agent_runs")
    .update({
      status: outcome.status,
      finished_at: new Date().toISOString(),
      found: outcome.found,
      added: outcome.added,
      log: outcome.log.join("\n"),
    })
    .eq("id", started.id)
    .select()
    .single();
  if (finishError || !finished) {
    throw new Error(`Could not finish the agent run: ${finishError?.message ?? "no row returned"}`);
  }

  return finished as AgentRun;
}
