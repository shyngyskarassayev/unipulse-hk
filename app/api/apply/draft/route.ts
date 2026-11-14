import { z } from "zod";
import { describeAiError } from "@/lib/ai/client";
import { draftMotivation } from "@/lib/ai/rank";
import { getEvent } from "@/lib/data/events";
import { getPrivateProfile, getSession } from "@/lib/data/session";
import { isAiEnabled } from "@/lib/env";

export const maxDuration = 60;

const Body = z.object({ eventId: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!isAiEnabled()) return Response.json({ error: "AI drafting is off." }, { status: 503 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Missing event." }, { status: 400 });

  const event = await getEvent(parsed.data.eventId);
  if (!event) return Response.json({ error: "Event not found." }, { status: 404 });

  try {
    const priv = await getPrivateProfile(session.userId);
    const { full_name, university, major, year_of_study, interests, skills, goals } = session.profile;
    const text = await draftMotivation(
      { full_name, university, major, year_of_study, interests, skills, goals, pitch: priv?.pitch ?? null },
      {
        title: event.title,
        summary: event.summary,
        category: event.category,
        organizer: event.organizer,
        eligibility: event.eligibility,
      },
    );
    return Response.json({ text });
  } catch (error) {
    return Response.json({ error: describeAiError(error) }, { status: 502 });
  }
}
