import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CategoryBadge, DeadlineBadge } from "@/components/event-card";
import { getEventsByIds } from "@/lib/data/events";
import { displayName, getSession } from "@/lib/data/session";
import { getFriendsPlans, getSavedEvents, type PersonSummary } from "@/lib/data/social";
import { HK_TIME_ZONE, isSupabaseConfigured } from "@/lib/env";
import { formatWhen } from "@/lib/format";
import { isUpcoming } from "@/lib/rank/score";
import type { EventRow, SavedStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Calendar" };

const monthFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: HK_TIME_ZONE,
  month: "long",
  year: "numeric",
});

const STATUS_TONE: Record<SavedStatus, string> = {
  saved: "bg-line text-ink",
  going: "bg-ok-soft text-ok",
  applied: "bg-warn-soft text-warn",
};

function monthOf(event: EventRow): string {
  const anchor = event.start_at ?? event.deadline_at;
  return anchor ? monthFmt.format(new Date(anchor)) : "No date yet";
}

function groupByMonth<T extends { event: EventRow }>(rows: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = monthOf(row.event);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()];
}

export default async function CalendarPage() {
  if (!isSupabaseConfigured) {
    return (
      <p className="card border-dashed p-5 text-sm text-muted">
        Your calendar is switched on once the database is connected.
      </p>
    );
  }

  const session = await getSession();
  if (!session) redirect("/login");

  const [saved, friendsPlans] = await Promise.all([
    getSavedEvents(session.userId),
    getFriendsPlans(session.userId),
  ]);
  const statusById = new Map(saved.map((s) => [s.event_id, s.status]));

  const mine = (await getEventsByIds([...statusById.keys()]))
    .filter((event) => isUpcoming(event))
    .map((event) => ({ event, status: statusById.get(event.id) as SavedStatus }));

  const friendOnlyIds = [...friendsPlans.keys()].filter((id) => !statusById.has(id));
  const friends = (await getEventsByIds(friendOnlyIds))
    .filter((event) => isUpcoming(event))
    .map((event) => ({ event, people: friendsPlans.get(event.id) ?? [] }));

  return (
    <div className="flex flex-col gap-8 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your calendar</h1>
          <p className="mt-2 text-sm text-muted">
            Everything you saved, are going to or applied for, in Hong Kong time.
          </p>
        </div>
        {mine.length > 0 ? (
          <a href="/calendar/ics" className="btn btn-dark">
            Export all (.ics)
          </a>
        ) : null}
      </div>

      {mine.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-lg font-semibold">Nothing saved yet.</p>
          <p className="mt-1 text-sm text-muted">
            Open an activity in the{" "}
            <Link href="/" className="underline">
              feed
            </Link>{" "}
            and tap Saved, Going or Applied.
          </p>
        </div>
      ) : (
        groupByMonth(mine).map(([month, rows]) => (
          <section key={month} className="flex flex-col gap-3">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted">{month}</h2>
            <ul className="card divide-y divide-line">
              {rows.map(({ event, status }) => (
                <AgendaRow key={event.id} event={event}>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_TONE[status]}`}>
                    {status}
                  </span>
                </AgendaRow>
              ))}
            </ul>
          </section>
        ))
      )}

      {friends.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">People you follow are going to</h2>
          <ul className="card divide-y divide-line">
            {friends.map(({ event, people }) => (
              <AgendaRow key={event.id} event={event}>
                <span className="text-xs text-muted">{names(people)}</span>
              </AgendaRow>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function names(people: PersonSummary[]): string {
  const list = people.slice(0, 3).map((p) => displayName(p));
  const extra = people.length - list.length;
  return extra > 0 ? `${list.join(", ")} +${extra}` : list.join(", ");
}

function AgendaRow({ event, children }: { event: EventRow; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
      <div className="min-w-0 flex-1">
        <CategoryBadge category={event.category} />
        <p className="mt-1 font-semibold">
          <Link href={`/events/${event.id}`} className="hover:underline">
            {event.title}
          </Link>
        </p>
        <p className="text-sm text-muted">
          {[formatWhen(event), event.location].filter(Boolean).join(" · ") || "Date to be announced"}
        </p>
      </div>
      <DeadlineBadge iso={event.deadline_at} />
      {children}
    </li>
  );
}
