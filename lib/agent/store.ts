import type { SupabaseClient } from "@supabase/supabase-js";
import { filterNewDrafts } from "@/lib/events/dedupe";
import { isUpcoming } from "@/lib/rank/score";
import type { EventDraft, SourceType } from "@/lib/types";

export interface SaveResult {
  found: number;
  added: number;
  titles: string[];
}

/**
 * Stores the drafts that are new and still upcoming. `found` counts what the
 * source produced, `added` what actually went into the feed.
 */
export async function saveDrafts(
  admin: SupabaseClient,
  drafts: EventDraft[],
  source: { type: SourceType; ref: string | null; submittedBy?: string | null },
  now: Date = new Date(),
): Promise<SaveResult> {
  const upcoming = drafts.filter((d) => isUpcoming(d, now));
  if (upcoming.length === 0) return { found: drafts.length, added: 0, titles: [] };

  const { data: existing, error: readError } = await admin
    .from("events")
    .select("dedupe_key, url");
  if (readError) throw new Error(`Could not read existing events: ${readError.message}`);

  const fresh = filterNewDrafts(upcoming, existing ?? []);
  if (fresh.length === 0) return { found: drafts.length, added: 0, titles: [] };

  const rows = fresh.map((draft) => ({
    ...draft,
    source_type: source.type,
    source_ref: source.ref,
    submitted_by: source.submittedBy ?? null,
  }));

  // ignoreDuplicates covers the race where two steps find the same event at once.
  const { data: inserted, error: writeError } = await admin
    .from("events")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("title");
  if (writeError) throw new Error(`Could not save events: ${writeError.message}`);

  const titles = (inserted ?? []).map((row) => row.title as string);
  return { found: drafts.length, added: titles.length, titles };
}

/** Returns the refs the agent has not processed yet, in their original order. */
export async function filterUnseen(admin: SupabaseClient, refs: string[]): Promise<string[]> {
  if (refs.length === 0) return [];
  const { data, error } = await admin.from("agent_seen").select("ref").in("ref", refs);
  if (error) throw new Error(`Could not read processed items: ${error.message}`);
  const seen = new Set((data ?? []).map((row) => row.ref as string));
  return refs.filter((ref) => !seen.has(ref));
}

export async function markSeen(admin: SupabaseClient, refs: string[]): Promise<void> {
  if (refs.length === 0) return;
  const { error } = await admin
    .from("agent_seen")
    .upsert(
      refs.map((ref) => ({ ref })),
      { onConflict: "ref", ignoreDuplicates: true },
    );
  if (error) throw new Error(`Could not record processed items: ${error.message}`);
}
