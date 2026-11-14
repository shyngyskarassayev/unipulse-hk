import { describe, expect, it } from "vitest";
import { buildIcs, calendarSlot, googleCalendarUrl } from "@/lib/events/ics";

const NOW = new Date("2026-11-13T04:00:00Z");

const base = {
  id: "abc",
  title: "HK AI Hackathon",
  summary: "Build something in 24 hours.",
  start_at: null as string | null,
  end_at: null as string | null,
  deadline_at: null as string | null,
  location: null as string | null,
  url: null as string | null,
};

function unfold(ics: string): string {
  return ics.replace(/\r\n /g, "");
}

describe("calendarSlot", () => {
  it("gives a timed event without an end one hour", () => {
    const slot = calendarSlot({ ...base, start_at: "2026-11-21T10:00:00+08:00" });
    expect(slot?.allDay).toBe(false);
    expect(slot?.end.toISOString()).toBe("2026-11-21T03:00:00.000Z");
  });

  it("treats a start at Hong Kong midnight as an all-day event", () => {
    const slot = calendarSlot({ ...base, start_at: "2026-11-21T00:00:00+08:00" });
    expect(slot?.allDay).toBe(true);
  });

  it("uses the deadline when there is no start date", () => {
    const slot = calendarSlot({ ...base, deadline_at: "2026-12-01T23:59:00+08:00" });
    expect(slot?.title).toBe("Deadline: HK AI Hackathon");
    expect(slot?.end.toISOString()).toBe("2026-12-01T15:59:00.000Z");
  });

  it("ignores an end that is before the start", () => {
    const slot = calendarSlot({
      ...base,
      start_at: "2026-11-21T10:00:00+08:00",
      end_at: "2026-11-20T10:00:00+08:00",
    });
    expect(slot?.end.toISOString()).toBe("2026-11-21T03:00:00.000Z");
  });

  it("returns null when the event has no dates at all", () => {
    expect(calendarSlot(base)).toBeNull();
    expect(calendarSlot({ ...base, start_at: "garbage" })).toBeNull();
  });
});

describe("buildIcs", () => {
  it("writes a timed event in UTC with CRLF line endings", () => {
    const ics = buildIcs(
      [{ ...base, start_at: "2026-11-21T10:00:00+08:00", end_at: "2026-11-21T18:00:00+08:00" }],
      NOW,
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261121T020000Z\r\n");
    expect(ics).toContain("DTEND:20261121T100000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261113T040000Z\r\n");
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("writes a multi-day all-day event so that the last day is included", () => {
    // Stored as 21 to 23 Nov inclusive; iCalendar's DTEND is the day after.
    const ics = buildIcs(
      [{ ...base, start_at: "2026-11-21T00:00:00+08:00", end_at: "2026-11-23T00:00:00+08:00" }],
      NOW,
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20261121\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261124\r\n");
  });

  it("writes a one-day all-day event as a single day", () => {
    const ics = buildIcs([{ ...base, start_at: "2026-11-21T00:00:00+08:00" }], NOW);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261121\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261122\r\n");
  });

  it("escapes commas, semicolons and line breaks in text", () => {
    const ics = unfold(
      buildIcs(
        [
          {
            ...base,
            title: "Talk: AI, Data; Ethics",
            summary: "Line one\nLine two",
            location: "Room 1, Tower A",
            start_at: "2026-11-21T10:00:00+08:00",
          },
        ],
        NOW,
      ),
    );
    expect(ics).toContain("SUMMARY:Talk: AI\\, Data\\; Ethics");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
    expect(ics).toContain("LOCATION:Room 1\\, Tower A");
  });

  it("folds long lines to at most 75 bytes, including multi-byte text", () => {
    const ics = buildIcs(
      [{ ...base, title: "香港".repeat(40), start_at: "2026-11-21T10:00:00+08:00" }],
      NOW,
    );
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(unfold(ics)).toContain(`SUMMARY:${"香港".repeat(40)}`);
  });

  it("skips events with no date and still returns a valid calendar", () => {
    const ics = buildIcs([base, { ...base, id: "x", start_at: "2026-11-21T10:00:00+08:00" }], NOW);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("gives different events different UIDs", () => {
    const ics = buildIcs(
      [
        { ...base, id: "one", start_at: "2026-11-21T10:00:00+08:00" },
        { ...base, id: "two", title: "Other", start_at: "2026-11-21T10:00:00+08:00" },
      ],
      NOW,
    );
    const uids = [...ics.matchAll(/UID:(.+)\r\n/g)].map((m) => m[1]);
    expect(new Set(uids).size).toBe(2);
  });
});

describe("googleCalendarUrl", () => {
  it("builds a template link with UTC times", () => {
    const url = new URL(
      googleCalendarUrl({
        ...base,
        start_at: "2026-11-21T10:00:00+08:00",
        end_at: "2026-11-21T18:00:00+08:00",
        location: "Cyberport",
      }) as string,
    );
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261121T020000Z/20261121T100000Z");
    expect(url.searchParams.get("text")).toBe("HK AI Hackathon");
    expect(url.searchParams.get("location")).toBe("Cyberport");
  });

  it("uses plain dates for all-day events", () => {
    const url = new URL(googleCalendarUrl({ ...base, start_at: "2026-11-21T00:00:00+08:00" }) as string);
    expect(url.searchParams.get("dates")).toBe("20261121/20261122");
  });

  it("returns null for an event without dates", () => {
    expect(googleCalendarUrl(base)).toBeNull();
  });
});
