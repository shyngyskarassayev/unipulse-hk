import { getEvent } from "@/lib/data/events";
import { buildIcs, calendarSlot } from "@/lib/events/ics";
import { slugify } from "@/lib/events/dedupe";

export async function GET(_request: Request, ctx: RouteContext<"/events/[id]/ics">) {
  const { id } = await ctx.params;
  const event = await getEvent(decodeURIComponent(id));
  if (!event || !calendarSlot(event)) {
    return new Response("This activity has no date to put in a calendar.", { status: 404 });
  }

  return new Response(buildIcs([event]), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(event.title) || "event"}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
