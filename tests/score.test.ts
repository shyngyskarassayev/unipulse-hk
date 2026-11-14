import { describe, expect, it } from "vitest";
import { isUpcoming, rankEvents, scoreEvent } from "@/lib/rank/score";

const NOW = new Date("2026-11-13T04:00:00Z");

const profile = {
  interests: ["ai", "fintech"],
  skills: ["python", "c"],
  preferred_categories: ["hackathon"],
  university: "CityU",
};

function event(overrides: Record<string, unknown> = {}) {
  return {
    title: "Generic event",
    summary: "",
    category: "seminar" as const,
    tags: [] as string[],
    start_at: "2027-03-01T10:00:00+08:00" as string | null,
    deadline_at: null as string | null,
    eligibility: null as string | null,
    ...overrides,
  };
}

describe("scoreEvent", () => {
  it("scores zero when nothing overlaps", () => {
    const result = scoreEvent(profile, event({ tags: ["arts"] }), NOW);
    expect(result).toEqual({ score: 0, matched: [] });
  });

  it("rewards shared topics and reports which ones matched", () => {
    const one = scoreEvent(profile, event({ tags: ["ai"] }), NOW);
    const two = scoreEvent(profile, event({ tags: ["ai", "fintech"] }), NOW);
    expect(one.matched).toEqual(["ai"]);
    expect(two.matched).toEqual(["ai", "fintech"]);
    expect(two.score).toBeGreaterThan(one.score);
  });

  it("matches topics regardless of case", () => {
    expect(scoreEvent(profile, event({ tags: ["AI"] }), NOW).matched).toEqual(["ai"]);
  });

  it("finds a skill named in the text as a whole word only", () => {
    const hit = scoreEvent(profile, event({ summary: "Bring your Python skills." }), NOW);
    expect(hit.matched).toEqual(["python"]);

    // The one-letter skill "c" must not match inside other words.
    const miss = scoreEvent(profile, event({ summary: "A social concert on campus." }), NOW);
    expect(miss.matched).toEqual([]);
  });

  it("does not treat C++ or C# as the skill C", () => {
    const result = scoreEvent(profile, event({ summary: "Workshop on C++ and C# basics." }), NOW);
    expect(result.matched).toEqual([]);
  });

  it("adds points for the kind of activity the student asked for", () => {
    const preferred = scoreEvent(profile, event({ category: "hackathon" }), NOW);
    const other = scoreEvent(profile, event({ category: "seminar" }), NOW);
    expect(preferred.score).toBeGreaterThan(other.score);
  });

  it("nudges up activities with a deadline in the next week", () => {
    const soon = scoreEvent(profile, event({ tags: ["ai"], deadline_at: "2026-11-16T23:59:00+08:00" }), NOW);
    const later = scoreEvent(profile, event({ tags: ["ai"], deadline_at: "2027-02-01T23:59:00+08:00" }), NOW);
    expect(soon.score).toBeGreaterThan(later.score);
  });

  it("never goes above 100", () => {
    const stacked = scoreEvent(
      { ...profile, interests: ["ai", "fintech", "data", "software", "career"] },
      event({
        category: "hackathon",
        tags: ["ai", "fintech", "data", "software", "career"],
        summary: "python at CityU",
        deadline_at: "2026-11-14T23:59:00+08:00",
      }),
      NOW,
    );
    expect(stacked.score).toBe(100);
  });

  it("copes with a skill made of regex characters", () => {
    const result = scoreEvent(
      { ...profile, skills: ["c++", "(react)"] },
      event({ summary: "We use C++ every day." }),
      NOW,
    );
    expect(result.matched).toEqual(["c++"]);
  });
});

describe("rankEvents", () => {
  it("puts the best fit first and breaks ties by date", () => {
    const ranked = rankEvents(
      profile,
      [
        event({ title: "late tie", tags: ["arts"], start_at: "2027-05-01T10:00:00+08:00" }),
        event({ title: "best", tags: ["ai", "fintech"] }),
        event({ title: "early tie", tags: ["arts"], start_at: "2027-02-01T10:00:00+08:00" }),
        event({ title: "undated tie", tags: ["arts"], start_at: null }),
      ],
      NOW,
    );
    expect(ranked.map((r) => r.event.title)).toEqual(["best", "early tie", "late tie", "undated tie"]);
  });
});

describe("isUpcoming", () => {
  it("keeps an event that has started but not ended", () => {
    expect(
      isUpcoming(
        { start_at: "2026-11-12T10:00:00+08:00", end_at: "2026-11-14T18:00:00+08:00", deadline_at: null },
        NOW,
      ),
    ).toBe(true);
  });

  it("drops an event that is over", () => {
    expect(
      isUpcoming({ start_at: "2026-11-01T10:00:00+08:00", end_at: null, deadline_at: null }, NOW),
    ).toBe(false);
  });

  it("keeps an event whose deadline passed but which has not happened yet", () => {
    expect(
      isUpcoming(
        { start_at: "2026-12-01T10:00:00+08:00", end_at: null, deadline_at: "2026-11-10T23:59:00+08:00" },
        NOW,
      ),
    ).toBe(true);
  });

  it("keeps undated listings such as rolling internships", () => {
    expect(isUpcoming({ start_at: null, end_at: null, deadline_at: null }, NOW)).toBe(true);
  });
});
