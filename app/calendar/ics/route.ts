import { getEventsByIds } from "@/lib/data/events";
import { getSession } from "@/lib/data/session";
import { getSavedEvents } from "@/lib/data/social";
import { buildIcs } from "@/lib/events/ics";

/** All of the student's saved activities as one calendar file. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Sign in first.", { status: 401 });

  const saved = await getSavedEvents(session.userId);
  const events = await getEventsByIds(saved.map((s) => s.event_id));

  return new Response(buildIcs(events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="unipulse-hk.ics"',
      "Cache-Control": "no-store",
    },
  });
}
