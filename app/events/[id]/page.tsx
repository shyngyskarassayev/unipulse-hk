import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTeam, setSavedStatus, setTeamMembership } from "@/app/actions";
import { CategoryBadge, DeadlineBadge } from "@/components/event-card";
import { QuickApply } from "@/components/quick-apply";
import { TeamForm } from "@/components/team-form";
import { getEvent } from "@/lib/data/events";
import { displayName, getPrivateProfile, getSession } from "@/lib/data/session";
import { getFriendsGoing, getSavedStatus, getTeams } from "@/lib/data/social";
import { calendarSlot, googleCalendarUrl } from "@/lib/events/ics";
import { isAiEnabled, isSupabaseConfigured } from "@/lib/env";
import { formatDate, formatWhen, hostOf } from "@/lib/format";
import { MODE_LABELS, SOURCE_LABELS, type SavedStatus } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/events/[id]">): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(decodeURIComponent(id));
  return event ? { title: event.title, description: event.summary } : { title: "Not found" };
}

const STATUS_LABELS: Record<SavedStatus, string> = {
  saved: "Saved",
  going: "Going",
  applied: "Applied",
};

export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  // Independent lookups go out together: each one is a round trip to the database.
  const [event, session] = await Promise.all([getEvent(decodeURIComponent(id)), getSession()]);
  if (!event) notFound();

  const [status, friends, teams, priv] = session
    ? await Promise.all([
        getSavedStatus(session.userId, event.id),
        getFriendsGoing(session.userId, event.id),
        event.category === "hackathon" ? getTeams(event.id) : Promise.resolve([]),
        getPrivateProfile(session.userId),
      ])
    : [null, [], [], null];

  const when = formatWhen(event);
  const canCalendar = calendarSlot(event) !== null;
  const google = googleCalendarUrl(event);
  const sourceHost = hostOf(event.url);
  const myTeam = session ? teams.find((t) => t.members.some((m) => m.id === session.userId)) : undefined;

  const facts: Array<[string, string | null]> = [
    ["When", when],
    ["Where", event.location],
    ["Format", event.mode ? MODE_LABELS[event.mode] : null],
    ["Organiser", event.organizer],
    ["Who can join", event.eligibility],
    ["Apply by", formatDate(event.deadline_at)],
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <article className="flex flex-col gap-6">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Back to the feed
        </Link>

        <header className="flex flex-col gap-3">
          <CategoryBadge category={event.category} />
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {event.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <DeadlineBadge iso={event.deadline_at} />
            {event.tags.map((tag) => (
              <span key={tag} className="chip">
                {tag}
              </span>
            ))}
          </div>
        </header>

        <section className="card p-5">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">In short</p>
          <p className="mt-2 text-lg leading-relaxed">{event.summary}</p>
        </section>

        <dl className="card grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
          {facts
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
                <dd className="mt-0.5 text-sm font-medium">{value}</dd>
              </div>
            ))}
        </dl>

        {event.description && event.description !== event.summary ? (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Details</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed">{event.description}</p>
          </section>
        ) : null}

        <p className="text-sm text-muted">
          {SOURCE_LABELS[event.source_type]}
          {event.url && sourceHost ? (
            <>
              {" · original listing on "}
              <a href={event.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                {sourceHost}
              </a>
            </>
          ) : null}
          . Check the original page before you go; details can change.
        </p>

        {event.category === "hackathon" && session ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold tracking-tight">Teams</h2>
            {teams.length === 0 ? (
              <p className="text-sm text-muted">No teams yet. Start one and let others find you.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {teams.map((team) => {
                  const isMember = team.members.some((m) => m.id === session.userId);
                  const isOwner = team.owner_id === session.userId;
                  return (
                    <li key={team.id} className="card flex flex-col gap-3 p-4">
                      <div>
                        <p className="font-semibold">{team.name}</p>
                        {team.description ? (
                          <p className="text-sm text-muted">{team.description}</p>
                        ) : null}
                      </div>
                      {team.looking_for.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-muted">Looking for</span>
                          {team.looking_for.map((role) => (
                            <span key={role} className="chip">
                              {role}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <p className="text-sm">
                        {team.members.map((m, i) => (
                          <span key={m.id}>
                            {i > 0 ? ", " : ""}
                            <Link href={`/profile/${m.id}`} className="underline-offset-2 hover:underline">
                              {displayName(m)}
                            </Link>
                          </span>
                        ))}
                      </p>
                      <div className="mt-auto flex gap-2">
                        {isOwner ? (
                          <form action={deleteTeam.bind(null, team.id, event.id)}>
                            <button type="submit" className="btn btn-ghost">
                              Delete team
                            </button>
                          </form>
                        ) : isMember ? (
                          <form action={setTeamMembership.bind(null, team.id, event.id, false)}>
                            <button type="submit" className="btn btn-ghost">
                              Leave
                            </button>
                          </form>
                        ) : !myTeam ? (
                          <form action={setTeamMembership.bind(null, team.id, event.id, true)}>
                            <button type="submit" className="btn btn-dark">
                              Join
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {!myTeam ? (
              <details className="card p-4">
                <summary className="cursor-pointer text-sm font-medium">Start a team</summary>
                <div className="mt-4">
                  <TeamForm eventId={event.id} />
                </div>
              </details>
            ) : null}
          </section>
        ) : null}
      </article>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Your plan</h2>
          {session ? (
            <>
              <div className="flex flex-wrap gap-2">
                {(["saved", "going", "applied"] as const).map((option) => (
                  <form
                    key={option}
                    action={setSavedStatus.bind(null, event.id, status === option ? null : option)}
                  >
                    <button
                      type="submit"
                      aria-pressed={status === option}
                      className={`btn ${status === option ? "btn-dark" : "btn-ghost"}`}
                    >
                      {status === option ? `✓ ${STATUS_LABELS[option]}` : STATUS_LABELS[option]}
                    </button>
                  </form>
                ))}
              </div>
              {friends.length > 0 ? (
                <p className="text-sm text-muted">
                  Going: {friends.map((f) => displayName(f)).join(", ")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted">
              {isSupabaseConfigured ? (
                <>
                  <Link href="/login" className="underline">
                    Sign in
                  </Link>{" "}
                  to save this, see which friends are going and find a team.
                </>
              ) : (
                "Saving is switched on once the database is connected."
              )}
            </p>
          )}
        </section>

        {canCalendar ? (
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Add to calendar
            </h2>
            <div className="flex flex-wrap gap-2">
              {google ? (
                <a href={google} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  Google Calendar
                </a>
              ) : null}
              <a href={`/events/${encodeURIComponent(event.id)}/ics`} className="btn btn-ghost">
                Apple / Outlook (.ics)
              </a>
            </div>
            {!event.start_at && event.deadline_at ? (
              <p className="text-xs text-muted">
                No event date listed, so this adds the application deadline.
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Quick apply</h2>
          {session ? (
            <QuickApply
              eventId={event.id}
              applyUrl={event.apply_url ?? event.url}
              aiEnabled={isAiEnabled()}
              fields={[
                { label: "Name", value: session.profile.full_name },
                { label: "E-mail", value: session.email },
                { label: "University", value: session.profile.university ?? "" },
                { label: "Major", value: session.profile.major ?? "" },
                { label: "Year", value: session.profile.year_of_study ?? "" },
                { label: "Phone", value: priv?.phone ?? "" },
                { label: "Student ID", value: priv?.student_id ?? "" },
                { label: "LinkedIn", value: priv?.linkedin ?? "" },
                { label: "GitHub", value: priv?.github ?? "" },
              ]}
            />
          ) : (
            <>
              <p className="text-sm text-muted">
                With a profile, your details and a drafted answer are ready to paste into the form.
              </p>
              {event.apply_url ?? event.url ? (
                <a
                  href={(event.apply_url ?? event.url) as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                >
                  Open the registration page
                </a>
              ) : null}
            </>
          )}
        </section>
      </aside>
    </div>
  );
}
