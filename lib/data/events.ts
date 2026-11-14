import { cache } from "react";
import seedEvents from "@/data/seed-events.json";
import { dedupeKey } from "@/lib/events/dedupe";
import { sanitizeDraft } from "@/lib/events/sanitize";
import { isSupabaseConfigured } from "@/lib/env";
import { isUpcoming } from "@/lib/rank/score";
import { createClient } from "@/lib/supabase/server";
import { inclusiveEnd } from "@/lib/time";
import { CATEGORIES, type Category, type EventRow } from "@/lib/types";

export interface EventFilters {
  category?: Category;
  q?: string;
  includePast?: boolean;
}

/**
 * The curated starter list. It is what the database is seeded with, and what
 * the site shows on its own while no database is connected.
 */
export function seedRows(): EventRow[] {
  const rows: EventRow[] = [];
  for (const raw of seedEvents as Array<Record<string, unknown>>) {
    const draft = sanitizeDraft(raw);
    if (!draft) continue;
    const key = dedupeKey(draft);
    rows.push({
      ...draft,
      id: key,
      dedupe_key: key,
      source_type: "seed",
      source_ref: typeof raw.source_ref === "string" ? raw.source_ref : draft.url,
      created_at: "2026-11-13T00:00:00.000Z",
    });
  }
  return rows;
}

export function parseCategory(value: string | string[] | undefined): Category | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return CATEGORIES.includes(single as Category) ? (single as Category) : undefined;
}

function matchesQuery(event: EventRow, q: string): boolean {
  const needle = q.toLowerCase();
  return [event.title, event.summary, event.organizer, event.location, event.tags.join(" ")]
    .filter(Boolean)
    .some((field) => (field as string).toLowerCase().includes(needle));
}

/**
 * The next moment an event asks something of a student: its deadline, its
 * start, or (for something already running) its end. Null when undated.
 */
export function nextMoment(
  event: Pick<EventRow, "start_at" | "end_at" | "deadline_at">,
  now: Date = new Date(),
): number | null {
  const upcoming = [event.deadline_at, event.start_at, event.end_at]
    .filter((v): v is string => Boolean(v))
    .map((v) => inclusiveEnd(new Date(v)).getTime())
    .filter((t) => !Number.isNaN(t) && t >= now.getTime());
  return upcoming.length > 0 ? Math.min(...upcoming) : null;
}

/** Most pressing first; listings without any date go last. */
export function sortByNextMoment(rows: EventRow[], now: Date = new Date()): EventRow[] {
  return rows
    .map((row) => ({ row, at: nextMoment(row, now) }))
    .sort((a, b) => {
      if (a.at !== null && b.at !== null) return a.at - b.at || a.row.title.localeCompare(b.row.title);
      if (a.at !== null) return -1;
      if (b.at !== null) return 1;
      return a.row.title.localeCompare(b.row.title);
    })
    .map(({ row }) => row);
}

export async function listEvents(filters: EventFilters = {}): Promise<EventRow[]> {
  let rows: EventRow[];

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    let query = supabase.from("events").select("*").limit(500);
    if (filters.category) query = query.eq("category", filters.category);
    const { data, error } = await query;
    if (error) throw new Error(`Could not load events: ${error.message}`);
    rows = (data ?? []) as EventRow[];
  } else {
    rows = seedRows();
    if (filters.category) rows = rows.filter((e) => e.category === filters.category);
  }

  if (!filters.includePast) rows = rows.filter((e) => isUpcoming(e));
  const q = filters.q?.trim();
  if (q) rows = rows.filter((e) => matchesQuery(e, q));
  return sortByNextMoment(rows);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cached per request: the page and its metadata both need the same event. */
export const getEvent = cache(async (id: string): Promise<EventRow | null> => {
  if (!isSupabaseConfigured) {
    return seedRows().find((e) => e.id === id) ?? null;
  }
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load the event: ${error.message}`);
  return (data as EventRow | null) ?? null;
});

export async function getEventsByIds(ids: string[]): Promise<EventRow[]> {
  if (ids.length === 0 || !isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select("*").in("id", ids);
  if (error) throw new Error(`Could not load events: ${error.message}`);
  return sortByNextMoment((data ?? []) as EventRow[]);
}
