import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { AGENT_STEPS, SEARCH_TOPICS, type AgentStep, type SearchTopic } from "@/lib/agent/config";
import { isSearchTopic, runAgentStep } from "@/lib/agent/run";
import { getSession } from "@/lib/data/session";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/server";

// Web search and e-mail reading can take a couple of minutes.
export const maxDuration = 300;

function hasCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function run(request: Request): Promise<Response> {
  if (!isAdminConfigured()) {
    return Response.json({ error: "The database is not connected." }, { status: 503 });
  }

  const url = new URL(request.url);

  // "others" is for the scheduler: everything except the website step in one
  // call, so the whole daily run needs only two scheduled jobs.
  if (url.searchParams.get("step") === "others") {
    const admin = createAdminClient();
    const deadline = Date.now() + 240_000; // leave room inside maxDuration
    const results = [];
    const jobs: Array<{ step: AgentStep; topic?: SearchTopic }> = [
      { step: "inbox" },
      ...(Object.keys(SEARCH_TOPICS) as SearchTopic[]).map((topic) => ({ step: "search" as const, topic })),
    ];
    try {
      for (const job of jobs) {
        if (Date.now() > deadline) break;
        results.push(await runAgentStep(admin, job.step, job.topic));
      }
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "The agent failed to start.", results },
        { status: 500 },
      );
    }
    revalidatePath("/");
    revalidatePath("/agent");
    return Response.json({ results });
  }

  const step = url.searchParams.get("step") as AgentStep | null;
  if (!step || !AGENT_STEPS.includes(step)) {
    return Response.json({ error: `Unknown step. Use one of: ${AGENT_STEPS.join(", ")}, others.` }, { status: 400 });
  }
  const topic = url.searchParams.get("topic");
  if (step === "search" && topic && !isSearchTopic(topic)) {
    return Response.json({ error: "Unknown search topic." }, { status: 400 });
  }

  try {
    const result = await runAgentStep(
      createAdminClient(),
      step,
      isSearchTopic(topic) ? topic : undefined,
    );
    revalidatePath("/");
    revalidatePath("/agent");
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The agent failed to start." },
      { status: 500 },
    );
  }
}

/** Called by the scheduler (Vercel Cron sends the secret as a bearer token). */
export async function GET(request: Request) {
  if (!hasCronSecret(request)) return Response.json({ error: "Not allowed." }, { status: 401 });
  return run(request);
}

/** Called by the "Run now" buttons on the /agent page. */
export async function POST(request: Request) {
  if (!hasCronSecret(request)) {
    const session = await getSession();
    if (!session?.isAgentAdmin) {
      return Response.json(
        { error: "Only the e-mails listed in AGENT_ADMIN_EMAILS can run the agent." },
        { status: 403 },
      );
    }
  }
  return run(request);
}
