import Link from "next/link";
import { setFollowing } from "@/app/actions";
import type { PersonSummary } from "@/lib/data/social";

export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">
      ✓ Verified student
    </span>
  );
}

export function FollowButton({ targetId, following }: { targetId: string; following: boolean }) {
  return (
    <form action={setFollowing.bind(null, targetId, !following)}>
      <button type="submit" className={`btn ${following ? "btn-ghost" : "btn-dark"}`}>
        {following ? "Following" : "Follow"}
      </button>
    </form>
  );
}

export function PersonCard({
  person,
  following,
  isSelf,
}: {
  person: PersonSummary;
  following: boolean;
  isSelf: boolean;
}) {
  const name = person.full_name.trim() || "Student";
  const line = [person.university, person.major, person.year_of_study].filter(Boolean).join(" · ");

  return (
    <li className="card flex items-start gap-4 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink font-semibold text-white">
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/profile/${person.id}`} className="font-semibold hover:underline">
            {name}
          </Link>
          {person.verified ? <VerifiedBadge /> : null}
        </div>
        {line ? <p className="truncate text-sm text-muted">{line}</p> : null}
        {person.interests.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {person.interests.slice(0, 5).map((interest) => (
              <span key={interest} className="chip">
                {interest}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {isSelf ? (
        <span className="chip shrink-0">You</span>
      ) : (
        <FollowButton targetId={person.id} following={following} />
      )}
    </li>
  );
}
