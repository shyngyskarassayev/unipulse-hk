import { describe, expect, it } from "vitest";
import { nextMoment, seedRows, sortByNextMoment } from "@/lib/data/events";
import { deadlineInfo, formatWhen, hostOf } from "@/lib/format";
import { isUpcoming } from "@/lib/rank/score";
import { inclusiveEnd, isHkMidnight } from "@/lib/time";
import { CATEGORIES } from "@/lib/types";

describe("isHkMidnight", () => {
  it("recognises midnight in Hong Kong however it is written", () => {
    expect(isHkMidnight(new Date("2026-11-21T00:00:00+08:00"))).toBe(true);
    expect(isHkMidnight(new Date("2026-11-20T16:00:00Z"))).toBe(true);
  });

  it("is false for any other time, including UTC midnight", () => {
    expect(isHkMidnight(new Date("2026-11-21T00:00:00Z"))).toBe(false);
    expect(isHkMidnight(new Date("2026-11-21T00:00:01+08:00"))).toBe(false);
  });
});

describe("inclusiveEnd", () => {
  it("stretches a date-only value to the last second of its day", () => {
    expect(inclusiveEnd(new Date("2026-11-21T00:00:00+08:00")).toISOString()).toBe(
      "2026-11-21T15:59:59.000Z",
    );
  });

  it("leaves a value with a real time alone", () => {
    const date = new Date("2026-11-21T18:30:00+08:00");
    expect(inclusiveEnd(date)).toBe(date);
  });
});

describe("isUpcoming with date-only events", () => {
  const dayOnly = { start_at: "2026-11-21T00:00:00+08:00", end_at: null, deadline_at: null };

  it("keeps a date-only event visible throughout its day", () => {
    expect(isUpcoming(dayOnly, new Date("2026-11-21T09:00:00+08:00"))).toBe(true);
    expect(isUpcoming(dayOnly, new Date("2026-11-21T23:59:00+08:00"))).toBe(true);
  });

  it("drops it once the day is over", () => {
    expect(isUpcoming(dayOnly, new Date("2026-11-22T00:00:01+08:00"))).toBe(false);
  });

  it("keeps a multi-day date-only event through its last day", () => {
    const range = { ...dayOnly, end_at: "2026-11-23T00:00:00+08:00" };
    expect(isUpcoming(range, new Date("2026-11-23T20:00:00+08:00"))).toBe(true);
    expect(isUpcoming(range, new Date("2026-11-24T08:00:00+08:00"))).toBe(false);
  });
});

describe("deadlineInfo", () => {
  const now = new Date("2026-11-13T10:00:00+08:00");

  it("counts whole days left and flags close deadlines", () => {
    expect(deadlineInfo("2026-11-20T23:59:00+08:00", now)).toEqual({
      label: "Apply by Fri 20 Nov · 7 days left",
      urgent: false,
      passed: false,
    });
    expect(deadlineInfo("2026-11-16T23:59:00+08:00", now)?.urgent).toBe(true);
  });

  it("says today and tomorrow in words", () => {
    expect(deadlineInfo("2026-11-13T23:59:00+08:00", now)?.label).toBe("Apply today (Fri 13 Nov)");
    expect(deadlineInfo("2026-11-14T23:59:00+08:00", now)?.label).toBe(
      "Apply by tomorrow (Sat 14 Nov)",
    );
  });

  it("treats a date-only deadline as open until the end of that day", () => {
    expect(deadlineInfo("2026-11-13T00:00:00+08:00", now)?.label).toBe("Apply today (Fri 13 Nov)");
  });

  it("reports a deadline that has passed", () => {
    expect(deadlineInfo("2026-11-12T23:59:00+08:00", now)).toEqual({
      label: "Applications closed",
      urgent: false,
      passed: true,
    });
  });

  it("returns null without a usable date", () => {
    expect(deadlineInfo(null, now)).toBeNull();
    expect(deadlineInfo("soon", now)).toBeNull();
  });
});

describe("formatWhen", () => {
  const now = new Date("2026-11-13T10:00:00+08:00");

  it("shows a time range on one day in Hong Kong time", () => {
    expect(
      formatWhen({ start_at: "2026-11-19T07:30:00Z", end_at: "2026-11-19T15:30:00Z" }, now),
    ).toBe("Thu 19 Nov, 15:30–23:30");
  });

  it("shows only the date when no time is known", () => {
    expect(formatWhen({ start_at: "2026-11-16T00:00:00+08:00", end_at: null }, now)).toBe(
      "Mon 16 Nov",
    );
  });

  it("shows a date range for multi-day events and adds the year when it differs", () => {
    expect(
      formatWhen({ start_at: "2026-11-18T00:00:00+08:00", end_at: "2026-11-20T00:00:00+08:00" }, now),
    ).toBe("Wed 18 Nov – Fri 20 Nov");
    expect(
      formatWhen({ start_at: "2027-03-20T00:00:00+08:00", end_at: "2027-03-21T00:00:00+08:00" }, now),
    ).toBe("Sat 20 Mar 2027 – Sun 21 Mar 2027");
  });

  it("returns null when there is no start", () => {
    expect(formatWhen({ start_at: null, end_at: null }, now)).toBeNull();
  });
});

describe("hostOf", () => {
  it("returns the site name without www", () => {
    expect(hostOf("https://www.hkcert.org/event/x")).toBe("hkcert.org");
    expect(hostOf("nonsense")).toBeNull();
    expect(hostOf(null)).toBeNull();
  });
});

describe("feed order", () => {
  const now = new Date("2026-11-13T10:00:00+08:00");
  const row = (title: string, dates: Partial<Record<"start_at" | "end_at" | "deadline_at", string>>) =>
    ({ title, start_at: null, end_at: null, deadline_at: null, ...dates }) as never;

  it("ranks by the next thing a student has to act on", () => {
    const sorted = sortByNextMoment(
      [
        row("undated listing", {}),
        row("long contest ending in January", {
          start_at: "2026-08-27T00:00:00+08:00",
          end_at: "2027-01-08T00:00:00+08:00",
        }),
        row("seminar next week", { start_at: "2026-11-16T00:00:00+08:00" }),
        row("hackathon in March, apply in December", {
          start_at: "2027-03-20T00:00:00+08:00",
          deadline_at: "2026-12-20T23:59:00+08:00",
        }),
        row("internship closing soon", { deadline_at: "2026-11-20T23:59:00+08:00" }),
      ],
      now,
    );
    expect(sorted.map((r) => r.title)).toEqual([
      "seminar next week",
      "internship closing soon",
      "hackathon in March, apply in December",
      "long contest ending in January",
      "undated listing",
    ]);
  });

  it("ignores a deadline that has already passed", () => {
    expect(
      nextMoment(
        { start_at: "2026-12-01T10:00:00+08:00", end_at: null, deadline_at: "2026-11-01T23:59:00+08:00" },
        now,
      ),
    ).toBe(new Date("2026-12-01T10:00:00+08:00").getTime());
  });

  it("returns null for an undated listing", () => {
    expect(nextMoment({ start_at: null, end_at: null, deadline_at: null }, now)).toBeNull();
  });
});

describe("seed data", () => {
  const rows = seedRows();

  it("loads every curated entry", () => {
    expect(rows.length).toBeGreaterThanOrEqual(40);
  });

  it("gives every entry a unique id, a valid category and a source link", () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const row of rows) {
      expect(CATEGORIES).toContain(row.category);
      expect(row.url, row.title).toMatch(/^https:\/\//);
      expect(row.summary.length, row.title).toBeGreaterThan(20);
      expect(row.tags.length, row.title).toBeGreaterThan(0);
    }
  });

  it("uses ids that are safe to put in a URL", () => {
    for (const row of rows) expect(row.id).toMatch(/^[a-z0-9-]+$/);
  });

  it("covers every kind of activity the site promises", () => {
    const present = new Set(rows.map((r) => r.category));
    for (const category of CATEGORIES) expect(present, category).toContain(category);
  });
});
