import { CATEGORIES, MODES, type Category, type EventDraft, type Mode } from "@/lib/types";

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function cleanDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  // Anything far outside the present is a parsing accident, not an event.
  if (year < 2020 || year > 2100) return null;
  return date.toISOString();
}

function cleanUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Normalises an event that came from outside (a model, a web page, a form)
 * before it is stored. Returns null when it has no usable title.
 */
export function sanitizeDraft(input: Partial<Record<keyof EventDraft, unknown>>): EventDraft | null {
  const title = cleanText(input.title, 160);
  if (!title) return null;

  const category: Category = CATEGORIES.includes(input.category as Category)
    ? (input.category as Category)
    : "seminar";
  const mode: Mode | null = MODES.includes(input.mode as Mode) ? (input.mode as Mode) : null;

  let start = cleanDate(input.start_at);
  let end = cleanDate(input.end_at);
  if (start && end && new Date(end) < new Date(start)) end = null;
  if (!start && end) {
    start = end;
    end = null;
  }

  const tags = Array.isArray(input.tags)
    ? [
        ...new Set(
          input.tags
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
            .filter((t) => t.length > 0 && t.length <= 30),
        ),
      ].slice(0, 6)
    : [];

  return {
    title,
    category,
    summary: cleanText(input.summary, 320) ?? title,
    description: cleanText(input.description, 2000),
    start_at: start,
    end_at: end,
    deadline_at: cleanDate(input.deadline_at),
    location: cleanText(input.location, 200),
    mode,
    organizer: cleanText(input.organizer, 160),
    url: cleanUrl(input.url),
    apply_url: cleanUrl(input.apply_url),
    eligibility: cleanText(input.eligibility, 300),
    tags,
  };
}
