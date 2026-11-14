/**
 * Runs the agent from the terminal, the same way the daily schedule does.
 *
 *   npm run agent                    every step
 *   npm run agent -- sources         one step: sources | inbox | search
 *   npm run agent -- search jobs     one search topic
 */
import "./env";
import { requireEnv } from "./env";

async function main() {
  requireEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

  const { AGENT_STEPS, SEARCH_TOPICS } = await import("@/lib/agent/config");
  const { isSearchTopic, runAgentStep } = await import("@/lib/agent/run");
  const { createAdminClient } = await import("@/lib/supabase/server");

  type Step = (typeof AGENT_STEPS)[number];
  type Topic = keyof typeof SEARCH_TOPICS;

  const [stepArg, topicArg] = process.argv.slice(2);
  if (stepArg && !AGENT_STEPS.includes(stepArg as Step)) {
    console.error(`Unknown step "${stepArg}". Use one of: ${AGENT_STEPS.join(", ")}.`);
    process.exit(1);
  }
  if (topicArg && !isSearchTopic(topicArg)) {
    console.error(`Unknown topic "${topicArg}". Use one of: ${Object.keys(SEARCH_TOPICS).join(", ")}.`);
    process.exit(1);
  }

  const jobs: Array<{ step: Step; topic?: Topic }> = [];
  for (const step of stepArg ? [stepArg as Step] : AGENT_STEPS) {
    if (step !== "search") {
      jobs.push({ step });
    } else if (isSearchTopic(topicArg)) {
      jobs.push({ step, topic: topicArg });
    } else {
      for (const topic of Object.keys(SEARCH_TOPICS) as Topic[]) jobs.push({ step, topic });
    }
  }

  const admin = createAdminClient();
  let failed = false;
  for (const job of jobs) {
    const label = job.topic ? `${job.step}:${job.topic}` : job.step;
    process.stdout.write(`${label} ... `);
    const run = await runAgentStep(admin, job.step, job.topic);
    console.log(`${run.status} (${run.found} found, ${run.added} added)`);
    if (run.log) console.log(run.log.replace(/^/gm, "    "));
    if (run.status === "error") failed = true;
  }
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
