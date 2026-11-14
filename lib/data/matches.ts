import { explainMatches } from "@/lib/ai/rank";
import { listEvents } from "@/lib/data/events";
import { isAiEnabled } from "@/lib/env";
import { rankEvents } from "@/lib/rank/score";
import { createAdminClient, createClient, isAdminConfigured } from "@/lib/supabase/server";
import type { EventRow, Profile } from "@/lib/types";

export interface FeedItem {
  event: EventRow;
  score: number;
  matched: string[];
  /** The model's one-line explanation, when it has been generated. */
  reason: string | null;
}

const SHORTLIST_SIZE = 16;

/**
 * The personal feed: every upcoming event scored against the profile, with
 * the model's cached explanations merged in where they exist.
 */
export async function personalFeed(profile: Profile, events: EventRow[]): Promise<FeedItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("event_id, score, reason")
    .eq("user_id", profile.id);

  const cached = new Map(
    (data ?? []).map((row) => [row.event_id as string, row as { score: number; reason: string | null }]),
  );

  return rankEvents(profile, events)
    .map(({ event, score, matched }) => {
      const match = cached.get(event.id);
      return {
        event,
        matched,
        // The model's judgement wins over the tag score once it exists.
        score: match ? match.score : score,
        reason: match?.reason ?? null,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Asks the model to re-rank the best tag matches for one student and stores the
 * result. Returns how many events were explained.
 */
export async function refreshMatchesFor(profile: Profile): Promise<number> {
  if (!isAiEnabled() || !isAdminConfigured()) return 0;

  const events = await listEvents();
  const shortlist = rankEvents(profile, events)
    .slice(0, SHORTLIST_SIZE)
    .map(({ event }) => event);
  if (shortlist.length === 0) return 0;

  const matches = await explainMatches(
    profile,
    shortlist.map(({ id, title, summary, category, tags, eligibility }) => ({
      id,
      title,
      summary,
      category,
      tags,
      eligibility,
    })),
  );
  if (matches.length === 0) return 0;

  const admin = createAdminClient();
  const { error: clearError } = await admin.from("matches").delete().eq("user_id", profile.id);
  if (clearError) throw new Error(`Could not clear old matches: ${clearError.message}`);

  const { error } = await admin.from("matches").insert(
    matches.map((m) => ({
      user_id: profile.id,
      event_id: m.id,
      score: m.score,
      reason: m.reason,
      updated_at: new Date().toISOString(),
    })),
  );
  if (error) throw new Error(`Could not save matches: ${error.message}`);
  return matches.length;
}
