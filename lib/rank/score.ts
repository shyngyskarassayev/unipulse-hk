import { inclusiveEnd } from "@/lib/time";
import type { EventRow, Profile } from "@/lib/types";

export interface ScoredEvent<E> {
  event: E;
  /** 0-100. Higher means a better fit for this student. */
  score: number;
  /** Interests and skills that the event and the student share. */
  matched: string[];
}

type RankableEvent = Pick<
  EventRow,
  "title" | "summary" | "category" | "tags" | "start_at" | "deadline_at" | "eligibility"
>;

type RankableProfile = Pick<
  Profile,
  "interests" | "skills" | "preferred_categories" | "university"
>;

const DAY = 24 * 60 * 60 * 1000;

function norm(value: string): string {
  return value.trim().toLowerCase();
}

/** The moment after which an event is no longer worth showing. */
export function expiresAt(event: Pick<EventRow, "start_at" | "end_at" | "deadline_at">): Date | null {
  const candidates = [event.end_at, event.start_at, event.deadline_at]
    .filter((v): v is string => Boolean(v))
    .map((v) => new Date(v))
    .filter((d) => !Number.isNaN(d.getTime()))
    // A date without a time covers its whole day.
    .map(inclusiveEnd);
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates.map((d) => d.getTime())));
}

export function isUpcoming(
  event: Pick<EventRow, "start_at" | "end_at" | "deadline_at">,
  now: Date = new Date(),
): boolean {
  const expiry = expiresAt(event);
  // Undated listings (rolling internships, standing volunteer roles) stay visible.
  return expiry === null || expiry.getTime() >= now.getTime();
}

/**
 * Fast, explainable fit score with no model call: shared topics count most,
 * then skills mentioned in the text, then the kinds of activity the student
 * asked for, with a small push for deadlines that are close.
 */
export function scoreEvent(
  profile: RankableProfile,
  event: RankableEvent,
  now: Date = new Date(),
): { score: number; matched: string[] } {
  const interests = new Set(profile.interests.map(norm));
  const tags = event.tags.map(norm);
  const haystack = `${event.title} ${event.summary} ${event.eligibility ?? ""}`.toLowerCase();

  const matched: string[] = [];
  let points = 0;

  for (const tag of tags) {
    if (interests.has(tag)) {
      points += 22;
      matched.push(tag);
    }
  }

  for (const skill of profile.skills.map(norm)) {
    if (skill.length < 2 || matched.includes(skill)) continue;
    // Whole-word match so that "r" or "c" do not match everything.
    const pattern = new RegExp(`(^|[^a-z0-9+#])${escapeRegExp(skill)}($|[^a-z0-9+#])`);
    if (pattern.test(haystack) || tags.includes(skill)) {
      points += 12;
      matched.push(skill);
    }
  }

  if (profile.preferred_categories.map(norm).includes(event.category)) {
    points += 18;
  }

  if (profile.university && haystack.includes(profile.university.toLowerCase())) {
    points += 8;
  }

  const deadline = event.deadline_at ?? event.start_at;
  if (deadline) {
    const daysLeft = (new Date(deadline).getTime() - now.getTime()) / DAY;
    if (daysLeft >= 0 && daysLeft <= 7) points += 8;
    else if (daysLeft > 7 && daysLeft <= 21) points += 4;
  }

  return { score: Math.max(0, Math.min(100, points)), matched };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Best fit first; ties go to whatever happens sooner. */
export function rankEvents<E extends RankableEvent>(
  profile: RankableProfile,
  events: E[],
  now: Date = new Date(),
): ScoredEvent<E>[] {
  return events
    .map((event) => ({ event, ...scoreEvent(profile, event, now) }))
    .sort((a, b) => b.score - a.score || soonest(a.event) - soonest(b.event));
}

function soonest(event: RankableEvent): number {
  const anchor = event.start_at ?? event.deadline_at;
  return anchor ? new Date(anchor).getTime() : Number.MAX_SAFE_INTEGER;
}
