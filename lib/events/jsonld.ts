import * as cheerio from "cheerio";
import { guessCategory, guessTags } from "@/lib/events/classify";
import type { EventDraft, Mode } from "@/lib/types";

type Json = Record<string, unknown>;

/** schema.org types that describe something a student can attend. */
const EVENT_TYPE = /(^|:|\/)([A-Za-z]*Event|Hackathon|Course)$/;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.replace(/\s+/g, " ").trim();
    return trimmed || null;
  }
  if (isObject(value)) return text(value.name) ?? text(value["@value"]);
  return null;
}

function isEventNode(node: Json): boolean {
  return asArray(node["@type"]).some((t) => typeof t === "string" && EVENT_TYPE.test(t));
}

/** Walks any JSON-LD shape (arrays, @graph, nested itemListElement) for events. */
function collectEvents(node: unknown, out: Json[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectEvents(item, out);
    return;
  }
  if (!isObject(node)) return;
  if (isEventNode(node)) out.push(node);
  for (const key of ["@graph", "itemListElement", "item", "mainEntity", "subEvent"]) {
    if (key in node) collectEvents(node[key], out);
  }
}

function toIso(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  // A bare date has no zone; schema.org pages for Hong Kong events mean local time.
  const withZone = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T00:00:00+08:00`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)
      ? `${raw}+08:00`
      : raw;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function locationOf(node: Json): string | null {
  for (const place of asArray(node.location)) {
    if (typeof place === "string") return text(place);
    if (!isObject(place)) continue;
    const name = text(place.name);
    const address = isObject(place.address)
      ? [place.address.streetAddress, place.address.addressLocality]
          .map(text)
          .filter(Boolean)
          .join(", ")
      : text(place.address);
    const joined = [name, address].filter(Boolean).join(", ");
    if (joined) return joined;
  }
  return null;
}

function modeOf(node: Json): Mode | null {
  const attendance = text(node.eventAttendanceMode) ?? "";
  if (/Mixed/i.test(attendance)) return "hybrid";
  if (/Online/i.test(attendance)) return "online";
  if (/Offline/i.test(attendance)) return "in_person";
  const types = asArray(node.location)
    .filter(isObject)
    .flatMap((p) => asArray(p["@type"]));
  if (types.includes("VirtualLocation")) return types.length > 1 ? "hybrid" : "online";
  if (types.length > 0) return "in_person";
  return null;
}

function absoluteUrl(value: unknown, base: string): string | null {
  const raw = isObject(value) ? text(value.url) ?? text(value["@id"]) : text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Plain text from a description that may carry HTML or escaped Markdown. */
export function cleanDescription(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, "$1") // [label](url) -> label
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1") // a backslash before punctuation is a Markdown escape
    .replace(/(\*\*|__)/g, "")
    .replace(/\p{Cf}/gu, "") // zero-width and other invisible format characters
    .replace(/\s+/g, " ")
    .trim();
}

const HK_COUNTRY = /^(hk|hkg)$|hong\s*kong/i;
const HK_TEXT =
  /hong\s*kong|\bhk\b|香港|\bkowloon\b|new territories|\b(hku|hkust|cuhk|cityu|polyu|hkbu|cyberport|hkstp)\b/i;

/**
 * Whether a listed event is in Hong Kong. Search pages "near Hong Kong" also
 * return events elsewhere and online events from anywhere, so the address
 * decides when there is one; without an address the event has to name Hong
 * Kong somewhere in its own text.
 */
export function isHongKongEvent(node: Record<string, unknown>): boolean {
  const places = asArray(node.location).filter(isObject);
  const countries = places
    .map((place) => (isObject(place.address) ? text(place.address.addressCountry) : null))
    .filter((c): c is string => Boolean(c));
  if (countries.length > 0) return countries.some((c) => HK_COUNTRY.test(c));

  const haystack = [
    text(node.name),
    text(node.description)?.slice(0, 600),
    ...asArray(node.organizer).map(text),
    ...places.map((place) => text(place.name)),
    ...places.map((place) =>
      isObject(place.address)
        ? [place.address.streetAddress, place.address.addressLocality, place.address.addressRegion]
            .map(text)
            .filter(Boolean)
            .join(" ")
        : text(place.address),
    ),
  ]
    .filter(Boolean)
    .join(" ");
  return HK_TEXT.test(haystack);
}

function summarize(description: string | null, title: string): string {
  if (!description) return title;
  const plain = cleanDescription(description);
  if (!plain) return title;
  if (plain.length <= 220) return plain;
  const cut = plain.slice(0, 220);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/**
 * Reads the schema.org events a page publishes for search engines. This is
 * structured data, so no model call is needed to turn it into event cards.
 */
export function extractJsonLdEvents(
  html: string,
  pageUrl: string,
  options: { hongKongOnly?: boolean } = {},
): EventDraft[] {
  const $ = cheerio.load(html);
  const nodes: Json[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      collectEvents(JSON.parse(raw), nodes);
    } catch {
      // Pages often ship broken JSON-LD; one bad block should not hide the rest.
    }
  });

  const drafts: EventDraft[] = [];
  for (const node of nodes) {
    const title = text(node.name);
    if (!title) continue;
    if (options.hongKongOnly && !isHongKongEvent(node)) continue;

    const rawDescription = text(node.description);
    const description = rawDescription ? cleanDescription(rawDescription) || null : null;
    // Topics come from the title and the opening lines only: a long blurb
    // mentions too many things in passing to tag an event by.
    const opening = `${title} ${description?.slice(0, 240) ?? ""}`;
    const offerUrl = asArray(node.offers)
      .map((offer) => absoluteUrl(offer, pageUrl))
      .find(Boolean);

    drafts.push({
      title,
      category: guessCategory(title, description ?? ""),
      summary: summarize(description, title),
      description,
      start_at: toIso(node.startDate),
      end_at: toIso(node.endDate),
      deadline_at: null,
      location: locationOf(node),
      mode: modeOf(node),
      organizer: asArray(node.organizer).map(text).find(Boolean) ?? null,
      url: absoluteUrl(node.url, pageUrl) ?? pageUrl,
      apply_url: offerUrl ?? null,
      eligibility: null,
      tags: guessTags(opening),
    });
  }
  return drafts;
}
