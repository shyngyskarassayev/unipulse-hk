import { describe, expect, it } from "vitest";
import { dedupeKey, filterNewDrafts, hkDate, normalizeUrl, slugify } from "@/lib/events/dedupe";
import type { EventDraft } from "@/lib/types";

function draft(overrides: Partial<EventDraft>): EventDraft {
  return {
    title: "Sample event",
    category: "seminar",
    summary: "",
    description: null,
    start_at: null,
    end_at: null,
    deadline_at: null,
    location: null,
    mode: null,
    organizer: null,
    url: null,
    apply_url: null,
    eligibility: null,
    tags: [],
    ...overrides,
  };
}

describe("slugify", () => {
  it("lowercases, strips accents and punctuation", () => {
    expect(slugify("  Café & AI: Hack-Day 2026!  ")).toBe("cafe-and-ai-hack-day-2026");
  });

  it("returns an empty string for text with no latin characters", () => {
    expect(slugify("黑客松")).toBe("");
  });

  it("never ends with a dash after truncation", () => {
    expect(slugify(`${"a".repeat(79)} b`).endsWith("-")).toBe(false);
  });
});

describe("hkDate", () => {
  it("uses the Hong Kong calendar day, not the UTC one", () => {
    // 20:00 UTC on the 20th is already 04:00 on the 21st in Hong Kong.
    expect(hkDate("2026-11-20T20:00:00Z")).toBe("2026-11-21");
  });

  it("returns null for an invalid date", () => {
    expect(hkDate("not a date")).toBeNull();
  });
});

describe("dedupeKey", () => {
  it("is the same for one event described with different time zones", () => {
    const a = draft({ title: "HK Fintech Hackathon", start_at: "2026-11-21T10:00:00+08:00" });
    const b = draft({ title: "HK FinTech Hackathon!", start_at: "2026-11-21T02:00:00Z" });
    expect(dedupeKey(a)).toBe(dedupeKey(b));
  });

  it("separates the same title on different days", () => {
    const a = draft({ title: "Career Talk", start_at: "2026-11-21T10:00:00+08:00" });
    const b = draft({ title: "Career Talk", start_at: "2026-11-28T10:00:00+08:00" });
    expect(dedupeKey(a)).not.toBe(dedupeKey(b));
  });

  it("falls back to the deadline, then to 'undated'", () => {
    expect(dedupeKey(draft({ title: "Internship", deadline_at: "2026-12-01T23:59:00+08:00" }))).toBe(
      "internship--2026-12-01",
    );
    expect(dedupeKey(draft({ title: "Internship" }))).toBe("internship--undated");
  });

  it("still produces a key for a title with no latin characters", () => {
    expect(dedupeKey(draft({ title: "黑客松" }))).toBe("untitled--undated");
  });
});

describe("normalizeUrl", () => {
  it("ignores www, trailing slashes, tracking parameters and fragments", () => {
    expect(normalizeUrl("https://www.Example.com/events/42/?utm_source=mail&fbclid=abc#top")).toBe(
      "example.com/events/42",
    );
  });

  it("keeps parameters that identify the page, in a stable order", () => {
    expect(normalizeUrl("https://example.com/e?b=2&a=1")).toBe("example.com/e?a=1&b=2");
  });

  it("rejects non-web and malformed links", () => {
    expect(normalizeUrl("mailto:someone@example.com")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
});

describe("filterNewDrafts", () => {
  it("drops events already stored under the same key", () => {
    const incoming = [draft({ title: "AI Talk", start_at: "2026-11-21T10:00:00+08:00" })];
    const existing = [{ dedupe_key: "ai-talk--2026-11-21", url: null }];
    expect(filterNewDrafts(incoming, existing)).toHaveLength(0);
  });

  it("drops events that point at a page that is already stored", () => {
    const incoming = [
      draft({ title: "A completely different title", url: "https://www.example.com/e/1?utm_source=tg" }),
    ];
    const existing = [{ dedupe_key: "other--undated", url: "https://example.com/e/1/" }];
    expect(filterNewDrafts(incoming, existing)).toHaveLength(0);
  });

  it("removes repeats inside one batch and keeps the first", () => {
    const incoming = [
      draft({ title: "Beach Cleanup", start_at: "2026-11-22T09:00:00+08:00", organizer: "first" }),
      draft({ title: "Beach cleanup", start_at: "2026-11-22T09:00:00+08:00", organizer: "second" }),
    ];
    const fresh = filterNewDrafts(incoming, []);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].organizer).toBe("first");
    expect(fresh[0].dedupe_key).toBe("beach-cleanup--2026-11-22");
  });

  it("keeps events that are new", () => {
    const incoming = [draft({ title: "New Workshop", url: "https://example.com/new" })];
    const existing = [{ dedupe_key: "old--undated", url: "https://example.com/old" }];
    expect(filterNewDrafts(incoming, existing)).toHaveLength(1);
  });
});
