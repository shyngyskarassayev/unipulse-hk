import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PersonCard } from "@/components/person-card";
import { getSession } from "@/lib/data/session";
import { getFollowingIds, listPeople } from "@/lib/data/social";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: PageProps<"/people">) {
  if (!isSupabaseConfigured) {
    return (
      <p className="card border-dashed p-5 text-sm text-muted">
        Profiles are switched on once the database is connected.
      </p>
    );
  }

  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 60) ?? "";

  const [people, following] = await Promise.all([listPeople(q), getFollowingIds(session.userId)]);
  const followingSet = new Set(following);

  return (
    <div className="flex flex-col gap-6 pt-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">People</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Follow classmates to see what they are going to. Their plans show up on event pages and in
          your calendar.
        </p>
      </div>

      <form action="/people" className="flex max-w-md gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name, university or major"
          aria-label="Search people"
          className="input rounded-full"
        />
        <button type="submit" className="btn btn-ghost">
          Search
        </button>
      </form>

      {people.length === 0 ? (
        <p className="card p-6 text-sm text-muted">
          {q ? "Nobody matches that search." : "No profiles yet. Invite a classmate."}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {people.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              following={followingSet.has(person.id)}
              isSelf={person.id === session.userId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
