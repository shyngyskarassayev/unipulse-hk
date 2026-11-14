import { createClient } from "@/lib/supabase/server";
import type { Profile, SavedStatus } from "@/lib/types";

export type PersonSummary = Pick<
  Profile,
  "id" | "full_name" | "university" | "major" | "year_of_study" | "interests" | "verified"
>;

const PERSON_COLUMNS = "id, full_name, university, major, year_of_study, interests, verified";

export async function getSavedStatus(userId: string, eventId: string): Promise<SavedStatus | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_events")
    .select("status")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle();
  return (data?.status as SavedStatus | undefined) ?? null;
}

export async function getSavedEvents(
  userId: string,
): Promise<Array<{ event_id: string; status: SavedStatus }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_events")
    .select("event_id, status")
    .eq("user_id", userId);
  return (data ?? []) as Array<{ event_id: string; status: SavedStatus }>;
}

export async function getFollowingIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("follows").select("following_id").eq("follower_id", userId);
  return (data ?? []).map((row) => row.following_id as string);
}

export async function getFollowerCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("follows")
    .select("follower_id", { count: "exact", head: true })
    .eq("following_id", userId);
  return count ?? 0;
}

export async function getPeople(ids: string[]): Promise<PersonSummary[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(PERSON_COLUMNS).in("id", ids);
  return (data ?? []) as PersonSummary[];
}

export async function listPeople(q: string): Promise<PersonSummary[]> {
  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select(PERSON_COLUMNS)
    .eq("onboarded", true)
    .order("created_at", { ascending: false })
    .limit(100);
  // Strip characters that have meaning in a filter expression.
  const safe = q.replace(/[%,()]/g, " ").trim();
  if (safe) {
    query = query.or(`full_name.ilike.%${safe}%,university.ilike.%${safe}%,major.ilike.%${safe}%`);
  }
  const { data } = await query;
  return (data ?? []) as PersonSummary[];
}

/** People the student follows who marked an event as "going". */
export async function getFriendsGoing(userId: string, eventId: string): Promise<PersonSummary[]> {
  const following = await getFollowingIds(userId);
  if (following.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_events")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("status", "going")
    .in("user_id", following);
  return getPeople((data ?? []).map((row) => row.user_id as string));
}

/** Event ids that followed people are going to, with who is going. */
export async function getFriendsPlans(userId: string): Promise<Map<string, PersonSummary[]>> {
  const following = await getFollowingIds(userId);
  const plans = new Map<string, PersonSummary[]>();
  if (following.length === 0) return plans;

  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_events")
    .select("user_id, event_id")
    .eq("status", "going")
    .in("user_id", following);

  const people = new Map((await getPeople(following)).map((p) => [p.id, p]));
  for (const row of data ?? []) {
    const person = people.get(row.user_id as string);
    if (!person) continue;
    const list = plans.get(row.event_id as string) ?? [];
    list.push(person);
    plans.set(row.event_id as string, list);
  }
  return plans;
}

export interface TeamView {
  id: string;
  name: string;
  description: string | null;
  looking_for: string[];
  owner_id: string;
  members: PersonSummary[];
}

export async function getTeams(eventId: string): Promise<TeamView[]> {
  const supabase = await createClient();
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, description, looking_for, owner_id")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (!teams || teams.length === 0) return [];

  const { data: memberships } = await supabase
    .from("team_members")
    .select("team_id, user_id")
    .in(
      "team_id",
      teams.map((t) => t.id as string),
    );

  const people = new Map(
    (await getPeople([...new Set((memberships ?? []).map((m) => m.user_id as string))])).map((p) => [p.id, p]),
  );

  return teams.map((team) => ({
    id: team.id as string,
    name: team.name as string,
    description: (team.description as string | null) ?? null,
    looking_for: (team.looking_for as string[]) ?? [],
    owner_id: team.owner_id as string,
    members: (memberships ?? [])
      .filter((m) => m.team_id === team.id)
      .map((m) => people.get(m.user_id as string))
      .filter((p): p is PersonSummary => Boolean(p)),
  }));
}
