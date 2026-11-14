/**
 * What the daily agent looks at. Lists can be extended without code changes
 * through SOURCE_URLS (comma-separated).
 */

function listFromEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}


/**
 * Pages that list activities. Each is checked for schema.org data first and
 * only read by the model when it has none. The first entry publishes
 * structured data, so it works even without an AI key.
 */
export const DEFAULT_SOURCE_URLS: string[] = [
  // Technology meetups in Hong Kong (structured data).
  "https://www.meetup.com/find/?location=hk--Hong+Kong&source=EVENTS&categoryId=546",
  // University and ecosystem calendars (read by the model).
  "https://calendar.hkust.edu.hk/",
  "https://www.startmeup.hk/upcoming-events/events-calendar/",
  "https://www.hkcert.org/event",
];

export function sourceUrls(): string[] {
  return [...new Set([...DEFAULT_SOURCE_URLS, ...listFromEnv("SOURCE_URLS")])];
}

/** One web search per topic keeps each run short enough for a serverless function. */
export const SEARCH_TOPICS = {
  hackathons:
    "hackathons, datathons, case competitions, pitch competitions and CTFs open to university students in Hong Kong",
  talks:
    "public seminars, talks, workshops, training sessions, career fairs and networking meetups for university students in Hong Kong",
  volunteering:
    "volunteering opportunities and community service programmes in Hong Kong that university students can sign up for",
  jobs:
    "internships, graduate trainee programmes and part-time student helper roles in Hong Kong currently accepting applications from university students",
} as const;

export type SearchTopic = keyof typeof SEARCH_TOPICS;

export const AGENT_STEPS = ["sources", "inbox", "search"] as const;
export type AgentStep = (typeof AGENT_STEPS)[number];

export const USER_AGENT = "UniPulseHK-bot/0.1 (student events aggregator)";
