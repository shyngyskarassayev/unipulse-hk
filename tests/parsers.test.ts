import { describe, expect, it } from "vitest";
import { pageToText } from "@/lib/agent/sources";
import { chunkText } from "@/lib/ai/extract";
import { guessCategory, guessTags } from "@/lib/events/classify";
import { cleanDescription, extractJsonLdEvents, isHongKongEvent } from "@/lib/events/jsonld";
import { sanitizeDraft } from "@/lib/events/sanitize";
import { isHkUniEmail, universityForEmail } from "@/lib/hk-universities";

function page(...blocks: unknown[]): string {
  const scripts = blocks
    .map((b) => `<script type="application/ld+json">${typeof b === "string" ? b : JSON.stringify(b)}</script>`)
    .join("");
  return `<html><head>${scripts}</head><body></body></html>`;
}

describe("extractJsonLdEvents", () => {
  it("reads a plain schema.org Event", () => {
    const [event] = extractJsonLdEvents(
      page({
        "@context": "https://schema.org",
        "@type": "Event",
        name: "Fintech Hackathon 2026",
        description: "A 24-hour hackathon on blockchain payments.",
        startDate: "2026-11-21T10:00:00+08:00",
        endDate: "2026-11-22T10:00:00+08:00",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: {
          "@type": "Place",
          name: "Cyberport 3",
          address: { streetAddress: "100 Cyberport Road", addressLocality: "Hong Kong" },
        },
        organizer: { "@type": "Organization", name: "Cyberport" },
        url: "/events/fintech-hack",
        offers: { "@type": "Offer", url: "https://tickets.example.com/fh" },
      }),
      "https://example.com/listing",
    );

    expect(event.title).toBe("Fintech Hackathon 2026");
    expect(event.category).toBe("hackathon");
    expect(event.start_at).toBe("2026-11-21T02:00:00.000Z");
    expect(event.end_at).toBe("2026-11-22T02:00:00.000Z");
    expect(event.mode).toBe("in_person");
    expect(event.location).toBe("Cyberport 3, 100 Cyberport Road, Hong Kong");
    expect(event.organizer).toBe("Cyberport");
    expect(event.url).toBe("https://example.com/events/fintech-hack");
    expect(event.apply_url).toBe("https://tickets.example.com/fh");
    expect(event.tags).toContain("fintech");
  });

  it("finds events nested in @graph and ItemList, and event subtypes", () => {
    const events = extractJsonLdEvents(
      page({
        "@graph": [
          { "@type": "WebSite", name: "ignore me" },
          { "@type": "EducationEvent", name: "Python Workshop", startDate: "2026-12-01" },
          {
            "@type": "ItemList",
            itemListElement: [
              { "@type": "ListItem", item: { "@type": ["Event", "BusinessEvent"], name: "Career Fair" } },
            ],
          },
        ],
      }),
      "https://example.com/",
    );
    expect(events.map((e) => e.title)).toEqual(["Python Workshop", "Career Fair"]);
    expect(events[0].category).toBe("training");
    expect(events[1].category).toBe("meetup");
  });

  it("treats a date without a zone as Hong Kong time", () => {
    const [dateOnly, localTime] = extractJsonLdEvents(
      page(
        { "@type": "Event", name: "A", startDate: "2026-12-01" },
        { "@type": "Event", name: "B", startDate: "2026-12-01T19:30" },
      ),
      "https://example.com/",
    );
    expect(dateOnly.start_at).toBe("2026-11-30T16:00:00.000Z");
    expect(localTime.start_at).toBe("2026-12-01T11:30:00.000Z");
  });

  it("recognises online and hybrid events", () => {
    const [online, hybrid] = extractJsonLdEvents(
      page(
        { "@type": "Event", name: "Webinar", location: { "@type": "VirtualLocation", url: "https://zoom.example" } },
        { "@type": "Event", name: "Talk", eventAttendanceMode: "https://schema.org/MixedEventAttendanceMode" },
      ),
      "https://example.com/",
    );
    expect(online.mode).toBe("online");
    expect(hybrid.mode).toBe("hybrid");
  });

  it("survives broken JSON, missing names and pages with no data", () => {
    expect(
      extractJsonLdEvents(
        page("{ not json", { "@type": "Event" }, { "@type": "Event", name: "Still found" }),
        "https://example.com/",
      ).map((e) => e.title),
    ).toEqual(["Still found"]);
    expect(extractJsonLdEvents("<html><body>hello</body></html>", "https://example.com/")).toEqual([]);
  });

  it("falls back to the page address and drops unsafe links", () => {
    const [event] = extractJsonLdEvents(
      page({ "@type": "Event", name: "X", url: "javascript:alert(1)" }),
      "https://example.com/listing",
    );
    expect(event.url).toBe("https://example.com/listing");
  });

  it("shortens a long description on a word boundary for the summary", () => {
    const [event] = extractJsonLdEvents(
      page({ "@type": "Event", name: "X", description: "<p>word </p>".repeat(100) }),
      "https://example.com/",
    );
    expect(event.summary.length).toBeLessThanOrEqual(221);
    expect(event.summary.endsWith("…")).toBe(true);
    expect(event.summary).not.toContain("<");
  });
});

describe("cleanDescription", () => {
  it("removes Markdown escapes, emphasis markers and link targets", () => {
    expect(
      cleanDescription(
        "HKTDC Entrepreneur Day \\(E\\-Day\\) 2026 \\| **Where** dreams take flight. Register: [link](https://example.com/a_(b)).",
      ),
    ).toBe("HKTDC Entrepreneur Day (E-Day) 2026 | Where dreams take flight. Register: link.");
  });

  it("strips HTML and zero-width characters and collapses whitespace", () => {
    const zeroWidth = String.fromCharCode(0x200b);
    expect(cleanDescription(`<p>${zeroWidth}Your   gateway</p>\n\n<p>to opportunity</p>`)).toBe(
      "Your gateway to opportunity",
    );
  });

  it("leaves ordinary punctuation and CJK text alone", () => {
    expect(cleanDescription("C++ & C#: 100% hands-on (bring a laptop). 人工智能講座")).toBe(
      "C++ & C#: 100% hands-on (bring a laptop). 人工智能講座",
    );
  });
});

describe("isHongKongEvent", () => {
  const place = (country: string, extra: Record<string, unknown> = {}) => ({
    "@type": "Place",
    address: { "@type": "PostalAddress", addressCountry: country, ...extra },
  });

  it("trusts the address when it names a country", () => {
    expect(isHongKongEvent({ name: "Meetup", location: place("hk") })).toBe(true);
    expect(isHongKongEvent({ name: "Hong Kong fans in Manila", location: place("ph") })).toBe(false);
  });

  it("keeps a hybrid event only when its venue is in Hong Kong", () => {
    const virtual = { "@type": "VirtualLocation", url: "https://example.com" };
    expect(isHongKongEvent({ name: "Hands-on", location: [virtual, place("ph")] })).toBe(false);
    expect(isHongKongEvent({ name: "Hands-on", location: [virtual, place("HK")] })).toBe(true);
  });

  it("falls back to the event's own words when the address is hidden", () => {
    const hidden = place("");
    expect(
      isHongKongEvent({ name: "S8E6", organizer: { name: "Hong Kong Machine Learning Meetup" }, location: hidden }),
    ).toBe(true);
    expect(isHongKongEvent({ name: "E-Day", organizer: { name: "HK Science Park Startups" }, location: hidden })).toBe(true);
    expect(isHongKongEvent({ name: "人工智能講座", description: "香港中環", location: hidden })).toBe(true);
  });

  it("drops online events that never mention Hong Kong", () => {
    expect(
      isHongKongEvent({
        name: "Free Thai Speaking Session",
        organizer: { name: "Thai for Expats" },
        location: { "@type": "VirtualLocation", url: "https://example.com" },
      }),
    ).toBe(false);
  });

  it("does not read 'hk' inside another word as Hong Kong", () => {
    expect(isHongKongEvent({ name: "Bangkok chatbots: think tank" })).toBe(false);
  });
});

describe("extractJsonLdEvents options and heuristics", () => {
  it("filters to Hong Kong only when asked", () => {
    const html = page(
      { "@type": "Event", name: "Local", location: { "@type": "Place", address: { addressCountry: "hk" } } },
      { "@type": "Event", name: "Abroad", location: { "@type": "Place", address: { addressCountry: "ph" } } },
    );
    expect(extractJsonLdEvents(html, "https://example.com/").map((e) => e.title)).toEqual(["Local", "Abroad"]);
    expect(
      extractJsonLdEvents(html, "https://example.com/", { hongKongOnly: true }).map((e) => e.title),
    ).toEqual(["Local"]);
  });

  it("lets the title decide the category before the description", () => {
    const [event] = extractJsonLdEvents(
      page({
        "@type": "Event",
        name: "AI Networking Drinks",
        description: "No talks, no workshop, no training. Just a relaxed evening.",
      }),
      "https://example.com/",
    );
    expect(event.category).toBe("meetup");
  });

  it("uses the description for the category only when the title says nothing", () => {
    const [event] = extractJsonLdEvents(
      page({ "@type": "Event", name: "S8E6 @ LSEG", description: "A hands-on workshop on model serving." }),
      "https://example.com/",
    );
    expect(event.category).toBe("training");
  });

  it("tags from the title and opening lines, not from the whole blurb", () => {
    const [event] = extractJsonLdEvents(
      page({
        "@type": "Event",
        name: "WordPress Meetup",
        description: `${"We meet monthly to share tips. ".repeat(12)} Past talks covered security, art and languages.`,
      }),
      "https://example.com/",
    );
    expect(event.tags).not.toContain("arts");
    expect(event.tags).not.toContain("languages");
  });

  it("stores a cleaned description and summary", () => {
    const [event] = extractJsonLdEvents(
      page({ "@type": "Event", name: "E-Day", description: "**Big** day \\(free\\)" }),
      "https://example.com/",
    );
    expect(event.description).toBe("Big day (free)");
    expect(event.summary).toBe("Big day (free)");
  });
});

describe("pageToText", () => {
  it("keeps content and link targets, drops scripts and navigation", () => {
    const text = pageToText(
      `<html><body>
        <nav>Home About</nav>
        <script>track()</script>
        <h1>Volunteer Day</h1>
        <p>Join us on 5 December. <a href="/signup?id=7">Sign up</a></p>
        <footer>Copyright</footer>
      </body></html>`,
      "https://ngo.example.org/events/",
    );
    expect(text).toContain("Volunteer Day");
    expect(text).toContain("Sign up (https://ngo.example.org/signup?id=7)");
    expect(text).not.toContain("track()");
    expect(text).not.toContain("Home About");
    expect(text).not.toContain("Copyright");
  });
});

describe("chunkText", () => {
  it("returns short text as a single chunk and nothing for blank text", () => {
    expect(chunkText("hello")).toEqual(["hello"]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("splits on paragraph breaks without losing text", () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `Paragraph ${i} ${"x".repeat(40)}`);
    const chunks = chunkText(paragraphs.join("\n\n"), 120);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(120);
    expect(chunks.join("\n\n")).toBe(paragraphs.join("\n\n"));
  });

  it("hard-splits one paragraph that is longer than a chunk", () => {
    const long = "y".repeat(250);
    const chunks = chunkText(long, 100);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunks.join("")).toBe(long);
  });
});

describe("sanitizeDraft", () => {
  it("rejects a draft without a title", () => {
    expect(sanitizeDraft({ title: "   " })).toBeNull();
    expect(sanitizeDraft({})).toBeNull();
  });

  it("normalises dates, links, tags and unknown enum values", () => {
    const draft = sanitizeDraft({
      title: "  Data   Night ",
      category: "party",
      mode: "underwater",
      start_at: "2026-11-21T19:00:00+08:00",
      end_at: "2026-11-20T19:00:00+08:00",
      deadline_at: "next Friday",
      url: "javascript:alert(1)",
      apply_url: "https://example.com/apply",
      tags: ["AI", "ai", " Machine Learning ", 42, ""],
    });
    expect(draft).toMatchObject({
      title: "Data Night",
      category: "seminar",
      mode: null,
      start_at: "2026-11-21T11:00:00.000Z",
      end_at: null,
      deadline_at: null,
      url: null,
      apply_url: "https://example.com/apply",
      tags: ["ai", "machine-learning"],
      summary: "Data Night",
    });
  });

  it("drops dates that are obviously parsing accidents", () => {
    expect(sanitizeDraft({ title: "X", start_at: "0001-01-01T00:00:00Z" })?.start_at).toBeNull();
    expect(sanitizeDraft({ title: "X", start_at: "1999-01-01T00:00:00Z" })?.start_at).toBeNull();
  });

  it("moves a lone end date into the start", () => {
    const draft = sanitizeDraft({ title: "X", end_at: "2026-12-01T10:00:00+08:00" });
    expect(draft?.start_at).toBe("2026-12-01T02:00:00.000Z");
    expect(draft?.end_at).toBeNull();
  });

  it("caps overlong text", () => {
    const draft = sanitizeDraft({ title: "t".repeat(500), summary: "s".repeat(1000) });
    expect(draft?.title.length).toBe(160);
    expect(draft?.summary.length).toBe(320);
  });
});

describe("classify", () => {
  it("picks the most specific category", () => {
    expect(guessCategory("Summer Internship Info Session")).toBe("internship");
    expect(guessCategory("Beach clean-up volunteers wanted")).toBe("volunteering");
    expect(guessCategory("Student helper for Open Day")).toBe("helper");
    expect(guessCategory("Something unclear")).toBe("seminar");
  });

  it("limits the number of tags", () => {
    const tags = guessTags("AI data software cybersecurity fintech finance business startup", 3);
    expect(tags).toEqual(["ai", "software", "cybersecurity"]);
  });
});

describe("hk-universities", () => {
  it("recognises university addresses, including student subdomains", () => {
    expect(universityForEmail("someone@my.cityu.edu.hk")?.short).toBe("CityU");
    expect(universityForEmail("x@connect.hku.hk")?.short).toBe("HKU");
    expect(universityForEmail("x@CONNECT.UST.HK")?.short).toBe("HKUST");
    expect(universityForEmail("x@connect.polyu.hk")?.short).toBe("PolyU");
  });

  it("rejects other addresses and look-alike domains", () => {
    expect(isHkUniEmail("x@gmail.com")).toBe(false);
    expect(isHkUniEmail("x@fakehku.hk")).toBe(false);
    expect(isHkUniEmail("x@hku.hk.evil.com")).toBe(false);
    expect(isHkUniEmail("not-an-email")).toBe(false);
  });
});
