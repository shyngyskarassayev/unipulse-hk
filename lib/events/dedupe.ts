import { HK_TIME_ZONE } from "@/lib/env";
import type { EventDraft } from "@/lib/types";

/** Lowercase, ASCII-only, dash-separated version of a title. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // combining accents left over after NFKD
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Calendar date (YYYY-MM-DD) of an instant, as seen in Hong Kong. */
export function hkDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Stable identity of an event: its title plus the day it starts. The same
 * hackathon found in an e-mail and on a website gets the same key.
 */
export function dedupeKey(draft: Pick<EventDraft, "title" | "start_at" | "deadline_at">): string {
  const anchor = draft.start_at ?? draft.deadline_at;
  const day = anchor ? hkDate(anchor) : null;
  const slug = slugify(draft.title) || "untitled";
  return `${slug}--${day ?? "undated"}`;
}

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_$|source$)/i;

/** Canonical form of a URL so that tracking links compare equal. */
export function normalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (!TRACKING_PARAMS.test(key)) kept.append(key, value);
  }
  kept.sort();

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  const query = kept.toString();
  return `${host}${path}${query ? `?${query}` : ""}`;
}

export interface ExistingEventIdentity {
  dedupe_key: string;
  url: string | null;
}

/**
 * Drops drafts that are already stored, and repeats inside the batch itself.
 * Two events are the same when their keys match or they point at the same page.
 */
export function filterNewDrafts<T extends EventDraft>(
  drafts: T[],
  existing: ExistingEventIdentity[],
): Array<T & { dedupe_key: string }> {
  const seenKeys = new Set(existing.map((e) => e.dedupe_key));
  const seenUrls = new Set<string>();
  for (const e of existing) {
    const normalized = e.url ? normalizeUrl(e.url) : null;
    if (normalized) seenUrls.add(normalized);
  }

  const fresh: Array<T & { dedupe_key: string }> = [];
  for (const draft of drafts) {
    const key = dedupeKey(draft);
    const url = draft.url ? normalizeUrl(draft.url) : null;
    if (seenKeys.has(key)) continue;
    if (url && seenUrls.has(url)) continue;
    seenKeys.add(key);
    if (url) seenUrls.add(url);
    fresh.push({ ...draft, dedupe_key: key });
  }
  return fresh;
}
