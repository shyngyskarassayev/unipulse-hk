import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { MatchRefresher } from "@/components/match-refresher";
import { listEvents, parseCategory } from "@/lib/data/events";
import { personalFeed, type FeedItem } from "@/lib/data/matches";
import { getSession } from "@/lib/data/session";
import { isAiEnabled, isSupabaseConfigured } from "@/lib/env";
import { CATEGORIES, CATEGORY_LABELS, type Category, type EventRow } from "@/lib/types";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function feedHref(params: { tab: string; category?: Category; q?: string }): string {
  const search = new URLSearchParams();
  search.set("tab", params.tab);
  if (params.category) search.set("category", params.category);
  if (params.q) search.set("q", params.q);
  return `/?${search.toString()}`;
}

export default async function FeedPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const category = parseCategory(params.category);
  const q = first(params.q).trim().slice(0, 80);

  // Load the events once (then filter in memory so the category counts stay
  // correct), at the same time as the session.
  const [session, searched] = await Promise.all([getSession(), listEvents({ q })]);
  const canPersonalise = Boolean(session?.profile.onboarded);
  const tab = first(params.tab) === "all" || !canPersonalise ? "all" : "foryou";

  const counts = new Map<Category, number>();
  for (const event of searched) counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
  const events = category ? searched.filter((e) => e.category === category) : searched;

  let items: Array<{ event: EventRow; fit?: FeedItem }>;
  let hasReasons = false;
  if (tab === "foryou" && session) {
    const feed = await personalFeed(session.profile, events);
    hasReasons = feed.some((item) => item.reason);
    items = feed.map((item) => ({ event: item.event, fit: item }));
  } else {
    items = events.map((event) => ({ event }));
  }

  const organisers = new Set(searched.map((e) => e.organizer).filter(Boolean)).size;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 pt-4">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">
          Updated daily by an AI agent
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          Everything happening for students in Hong Kong, in one feed.
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted">
          Hackathons, seminars, workshops, volunteering, internships and student jobs, pulled from
          university e-mails and the web, then sorted by what you care about.
        </p>
        <div className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-sm">
          <span>
            <strong className="text-2xl font-semibold">{searched.length}</strong>{" "}
            <span className="text-muted">open activities</span>
          </span>
          <span>
            <strong className="text-2xl font-semibold">{organisers}</strong>{" "}
            <span className="text-muted">organisers</span>
          </span>
          <span>
            <strong className="text-2xl font-semibold">{counts.size}</strong>{" "}
            <span className="text-muted">kinds of activity</span>
          </span>
        </div>
      </section>

      {!isSupabaseConfigured ? (
        <p className="card border-dashed px-4 py-3 text-sm text-muted">
          Preview mode: the database is not connected yet, so this is the curated starter list and
          sign-in is switched off. Add the Supabase keys to <code>.env.local</code> to turn on
          accounts, the personal feed and the agent.
        </p>
      ) : null}

      {isSupabaseConfigured && !session ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-sm">
            <span className="font-semibold">Get a feed built around you.</span>{" "}
            <span className="text-muted">
              Answer a few questions and the best matches move to the top.
            </span>
          </p>
          <Link href="/login" className="btn btn-primary">
            Create a profile
          </Link>
        </div>
      ) : null}

      {session && !session.profile.onboarded ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-sm">
            <span className="font-semibold">One step left.</span>{" "}
            <span className="text-muted">Tell the guide what you are into to unlock your feed.</span>
          </p>
          <Link href="/onboarding" className="btn btn-primary">
            Finish setup
          </Link>
        </div>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full border border-line bg-surface p-1 text-sm">
            {canPersonalise ? (
              <Link
                href={feedHref({ tab: "foryou", category, q })}
                className={`rounded-full px-4 py-1.5 ${tab === "foryou" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
              >
                For you
              </Link>
            ) : null}
            <Link
              href={feedHref({ tab: "all", category, q })}
              className={`rounded-full px-4 py-1.5 ${tab === "all" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
            >
              All
            </Link>
          </div>

          <form action="/" className="flex min-w-48 flex-1 gap-2">
            <input type="hidden" name="tab" value={tab} />
            {category ? <input type="hidden" name="category" value={category} /> : null}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search titles, organisers, topics"
              aria-label="Search activities"
              className="input rounded-full"
            />
            <button type="submit" className="btn btn-ghost">
              Search
            </button>
          </form>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href={feedHref({ tab, q })}
            className={`rounded-full border px-3 py-1.5 ${!category ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-ink hover:text-ink"}`}
          >
            Everything <span className="font-mono text-xs opacity-70">{searched.length}</span>
          </Link>
          {CATEGORIES.filter((c) => counts.has(c)).map((c) => (
            <Link
              key={c}
              href={feedHref({ tab, category: c, q })}
              className={`rounded-full border px-3 py-1.5 ${category === c ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-ink hover:text-ink"}`}
            >
              {CATEGORY_LABELS[c]}{" "}
              <span className="font-mono text-xs opacity-70">{counts.get(c)}</span>
            </Link>
          ))}
        </div>

        {tab === "foryou" && isAiEnabled() ? (
          <MatchRefresher auto={first(params.fresh) === "1"} hasReasons={hasReasons} />
        ) : null}
      </section>

      {items.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-lg font-semibold">Nothing matches that yet.</p>
          <p className="mt-1 text-sm text-muted">
            Try another category or search, or{" "}
            <Link href="/import" className="underline">
              add an activity you know about
            </Link>
            .
          </p>
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {items.map(({ event, fit }) => (
            <EventCard
              key={event.id}
              event={event}
              fit={fit ? { score: fit.score, matched: fit.matched, reason: fit.reason } : undefined}
            />
          ))}
        </section>
      )}
    </div>
  );
}
