import { z } from "zod";
import { describeAiError } from "@/lib/ai/client";
import { extractEvents } from "@/lib/ai/extract";
import { getSession } from "@/lib/data/session";
import { isAiEnabled } from "@/lib/env";

export const maxDuration = 120;

const Body = z.object({ text: z.string().min(20).max(60_000) });

/** Turns pasted e-mail or post text into event drafts for the student to review. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!isAiEnabled()) {
    return Response.json({ error: "AI reading is off. Add the activity by hand below." }, { status: 503 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Paste the text of the invitation (at least a sentence, at most about 60,000 characters)." },
      { status: 400 },
    );
  }

  try {
    const drafts = await extractEvents(parsed.data.text, {
      sourceHint: "an invitation pasted by a student (an e-mail, a chat message or a web page)",
    });
    return Response.json({ drafts });
  } catch (error) {
    return Response.json({ error: describeAiError(error) }, { status: 502 });
  }
}
