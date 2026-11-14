import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventCard } from "@/components/event-card";
import { FollowButton, VerifiedBadge } from "@/components/person-card";
import { PrivateProfileForm, ProfileForm } from "@/components/profile-form";
import { getEventsByIds } from "@/lib/data/events";
import { getPrivateProfile, getSession } from "@/lib/data/session";
import { getFollowerCount, getFollowingIds, getSavedEvents } from "@/lib/data/social";
import { isSupabaseConfigured } from "@/lib/env";
import { isUpcoming } from "@/lib/rank/score";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABELS, type Category, type Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Profile" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProfilePage({ params }: PageProps<"/profile/[id]">) {
  if (!isSupabaseConfigured) {
    return (
      <p className="card border-dashed p-5 text-sm text-muted">
        Profiles are switched on once the database is connected.
      </p>
    );
  }

  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const targetId = id === "me" ? session.userId : id;
  const isSelf = targetId === session.userId;
  if (!UUID.test(targetId)) notFound();

  let profile: Profile;
  if (isSelf) {
    profile = session.profile;
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("*").eq("id", targetId).maybeSingle();
    if (!data) notFound();
    profile = data as Profile;
  }

  const [followers, following, myFollowing, saved, priv] = await Promise.all([
    getFollowerCount(targetId),
    getFollowingIds(targetId),
    isSelf ? Promise.resolve([]) : getFollowingIds(session.userId),
    // For other people the database only returns the events they are going to.
    getSavedEvents(targetId),
    isSelf ? getPrivateProfile(session.userId) : Promise.resolve(null),
  ]);

  const going = (
    await getEventsByIds(saved.filter((s) => s.status === "going").map((s) => s.event_id))
  ).filter((event) => isUpcoming(event));

  const name = profile.full_name.trim() || "Student";
  const line = [profile.university, profile.major, profile.year_of_study].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-8 pt-4">
      <header className="flex flex-wrap items-start gap-5">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-ink text-2xl font-semibold text-white">
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
            {profile.verified ? <VerifiedBadge /> : null}
          </div>
          {line ? <p className="mt-1 text-muted">{line}</p> : null}
          <p className="mt-2 font-mono text-sm text-muted">
            {followers} {followers === 1 ? "follower" : "followers"} · following {following.length}
          </p>
        </div>
        {isSelf ? null : <FollowButton targetId={targetId} following={myFollowing.includes(targetId)} />}
      </header>

      {!isSelf ? (
        <section className="card flex flex-col gap-4 p-5">
          {profile.goals ? <p className="leading-relaxed">{profile.goals}</p> : null}
          <TagRow label="Interests" items={profile.interests} />
          <TagRow label="Skills" items={profile.skills} />
          <TagRow
            label="Looking for"
            items={profile.preferred_categories.map((c) => CATEGORY_LABELS[c as Category] ?? c)}
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          {isSelf ? "You are going to" : `${name} is going to`}
        </h2>
        {going.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing marked as going yet.{" "}
            {isSelf ? (
              <Link href="/" className="underline">
                Browse the feed
              </Link>
            ) : null}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {going.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      {isSelf ? (
        <>
          <section className="card flex flex-col gap-5 p-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Your profile</h2>
              <p className="mt-1 text-sm text-muted">
                Other students can see this. It also decides what your feed puts first.
              </p>
            </div>
            {!profile.onboarded ? (
              <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-dark">
                Your feed is not personalised yet.{" "}
                <Link href="/onboarding" className="font-semibold underline">
                  Chat with the guide
                </Link>{" "}
                or fill this in.
              </p>
            ) : null}
            <ProfileForm profile={profile} />
          </section>

          <section className="card flex flex-col gap-5 p-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Private details</h2>
              <p className="mt-1 text-sm text-muted">
                Only you can see these. They sit in the Quick apply panel on every event so you can
                copy them into a registration form.
              </p>
            </div>
            <PrivateProfileForm details={priv} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function TagRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-xs uppercase tracking-wide text-muted">{label}</span>
      {items.map((item) => (
        <span key={item} className="chip">
          {item}
        </span>
      ))}
    </div>
  );
}
