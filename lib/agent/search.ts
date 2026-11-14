import { ApiError } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEARCH_TOPICS, USER_AGENT, type SearchTopic } from "@/lib/agent/config";
import { saveDrafts } from "@/lib/agent/store";
import type { StepOutcome } from "@/lib/agent/run";
import { AiResponseError, assertUsable, generate } from "@/lib/ai/client";
import { extractEvents } from "@/lib/ai/extract";
import { hkDate, normalizeUrl } from "@/lib/events/dedupe";
import { isAiEnabled } from "@/lib/env";
import type { EventDraft } from "@/lib/types";

const SYSTEM_PROMPT = `You are the research agent behind UniPulse HK, a site that lists activities for university students in Hong Kong. Each day you search the web for new opportunities so that students do not have to check dozens of sites themselves.

Search for the kind of activity you are asked about and report what you find. Good places to look include university event calendars and student affairs pages, Cyberport and Hong Kong Science Park, event platforms, hackathon listings, NGO volunteer pages and employers' careers pages, but follow the search results wherever they lead.

Report only activities that are still open: the event is today or later, or applications have not closed. Each item must come from a page you actually saw in the search results. Never fill a gap from memory, because students will click these links and show up at these places.

For every activity write a short block with: its name, what it is in one or two sentences, the date and time, the venue or "online", the organiser, who is eligible, the registration deadline, and the exact URL of the page you found it on. Write "not stated" for anything the page does not say. Aim for eight to twelve solid items rather than a long list of doubtful ones. If you find nothing current, say so plainly.`;

export interface SearchSource {
  title: string;
  url: string;
}

export interface SearchResult {
  notes: string;
  /** Pages the search actually returned, with their real addresses. */
  sources: SearchSource[];
}

/**
 * The search tool reports its sources as temporary redirect links. Following
 * the redirect once gives the page's real address, which is what a card
 * should link to.
 */
async function resolveRedirect(uri: string): Promise<string | null> {
  try {
    const response = await fetch(uri, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    const location = response.headers.get("location");
    if (location && /^https?:\/\//.test(location)) return location;
    // Already a direct link.
    return response.ok && !/grounding-api-redirect/.test(uri) ? uri : null;
  } catch {
    return null;
  }
}

/**
 * Search queries for Tavily. A search engine wants keywords, not the long
 * description the model-based search is given.
 */
const TAVILY_QUERIES: Record<SearchTopic, string[]> = {
  hackathons: [
    "hackathon Hong Kong university students registration open",
    "case competition OR datathon OR coding competition Hong Kong students apply",
  ],
  talks: [
    "seminar OR workshop OR talk Hong Kong university students upcoming register",
    "career fair OR networking event Hong Kong students upcoming",
  ],
  volunteering: ["volunteer programme Hong Kong university students sign up"],
  jobs: [
    "internship Hong Kong university students applications open",
    "student helper OR part-time student assistant Hong Kong university recruitment",
  ],
};

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}

/** Tavily answers 429 or 432 when the plan's credits are used up. */
export class SearchQuotaError extends Error {
  constructor(provider: string) {
    super(provider + " search quota is used up for now.");
    this.name = "SearchQuotaError";
  }
}

async function searchWithTavily(topic: SearchTopic, now: Date): Promise<SearchResult> {
  const today = hkDate(now.toISOString());
  const seen = new Set<string>();
  const sources: SearchSource[] = [];
  const blocks: string[] = [];

  for (const query of TAVILY_QUERIES[topic]) {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.TAVILY_API_KEY },
      body: JSON.stringify({ query, max_results: 10, search_depth: "basic", time_range: "month" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 429 || response.status === 432 || response.status === 433) {
      throw new SearchQuotaError("Tavily");
    }
    if (response.status === 401) throw new AiResponseError("The Tavily API key was rejected. Check TAVILY_API_KEY.");
    if (!response.ok) throw new AiResponseError("Tavily search failed (" + response.status + ").");

    const body = (await response.json()) as { results?: TavilyResult[] };
    for (const result of body.results ?? []) {
      if (!result.url || !result.content) continue;
      const key = normalizeUrl(result.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      sources.push({ title: result.title ?? "", url: result.url });
      blocks.push(`Page: ${result.title ?? "untitled"}\nURL: ${result.url}\n${result.content.trim()}`);
    }
  }

  if (blocks.length === 0) throw new AiResponseError("The web search returned no pages.");
  const notes =
    `Search results for ${topic} (today is ${today}, Hong Kong time). Each block is one page the search engine returned.\n\n` +
    blocks.join("\n\n---\n\n");
  return { notes, sources };
}

/**
 * Searches the web for one topic. Tavily is used when its key is set (it has
 * a free monthly allowance); otherwise Gemini's built-in Google Search, which
 * needs a Gemini plan with search quota.
 */
export async function searchWeb(topic: SearchTopic, now: Date = new Date()): Promise<SearchResult> {
  return process.env.TAVILY_API_KEY ? searchWithTavily(topic, now) : searchWithGemini(topic, now);
}

/**
 * Lets the model search the web for one topic. Returns its notes together
 * with the list of pages the search really returned.
 */
async function searchWithGemini(topic: SearchTopic, now: Date): Promise<SearchResult> {
  const today = hkDate(now.toISOString());

  const response = await generate({
    contents: `Today is ${today} (Hong Kong time). Find current ${SEARCH_TOPICS[topic]}.`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
      maxOutputTokens: 16000,
    },
  });
  assertUsable(response, "this web search");

  const notes = response.text?.trim();
  if (!notes) throw new AiResponseError("The web search returned no notes.");

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const resolved = await Promise.all(
    chunks
      .map((chunk) => chunk.web)
      .filter((web): web is NonNullable<typeof web> => Boolean(web?.uri))
      .slice(0, 40)
      .map(async (web) => {
        const url = await resolveRedirect(web.uri as string);
        return url ? { title: web.title ?? "", url } : null;
      }),
  );

  const seen = new Set<string>();
  const sources: SearchSource[] = [];
  for (const source of resolved) {
    if (!source) continue;
    const key = normalizeUrl(source.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sources.push(source);
  }
  return { notes, sources };
}

/** True when a page answers; used for links the search did not vouch for. */
async function isReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    return response.status < 400;
  } catch {
    return false;
  }
}

/**
 * Keeps only cards whose link can be trusted: either the search returned that
 * page, or the page answers when asked. A language model can write a link
 * that looks right and leads nowhere, and a student should never get one.
 */
export async function keepVerifiedDrafts(
  drafts: EventDraft[],
  sources: SearchSource[],
): Promise<{ kept: EventDraft[]; dropped: number }> {
  const trusted = new Set(sources.map((s) => normalizeUrl(s.url)).filter(Boolean));

  const checks = await Promise.all(
    drafts.map(async (draft) => {
      if (!draft.url) return false;
      const key = normalizeUrl(draft.url);
      if (!key) return false;
      return trusted.has(key) || (await isReachable(draft.url));
    }),
  );

  const kept = drafts.filter((_, index) => checks[index]);
  return { kept, dropped: drafts.length - kept.length };
}

export async function runSearchStep(admin: SupabaseClient, topic: SearchTopic): Promise<StepOutcome> {
  if (!isAiEnabled()) {
    return { status: "skipped", found: 0, added: 0, log: ["An AI key is needed for web search."] };
  }

  let found: SearchResult;
  try {
    found = await searchWeb(topic);
  } catch (error) {
    // Search-backed requests have their own quota, and free Gemini keys have
    // none. That is a missing capability, not a failure of the run.
    if (error instanceof SearchQuotaError) {
      return { status: "skipped", found: 0, added: 0, log: ["The Tavily monthly allowance is used up; web search resumes next month."] };
    }
    if (error instanceof ApiError && error.status === 429) {
      return {
        status: "skipped",
        found: 0,
        added: 0,
        log: [
          "Google Search is not available on this Gemini key's plan (quota exceeded). Add a Tavily key (TAVILY_API_KEY, free tier) or enable billing for the Gemini key to switch web search on.",
        ],
      };
    }
    throw error;
  }
  const { notes, sources } = found;

  // The real addresses of the pages go in with the notes, so the extractor
  // can copy a link exactly instead of relying on the model's wording.
  const sourceList = sources.map((s) => `- ${s.title || "page"}: ${s.url}`).join("\n");
  const drafts = await extractEvents(
    sourceList ? `${notes}\n\nPages returned by the search:\n${sourceList}` : notes,
    { sourceHint: "notes from a web search, followed by the list of pages the search returned" },
  );

  const { kept, dropped } = await keepVerifiedDrafts(drafts, sources);
  const result = await saveDrafts(admin, kept, { type: "web", ref: `search:${topic}` });

  const log = [
    `Searched for ${topic}: read ${sources.length} pages, found ${drafts.length} activities, ${result.added} added.`,
  ];
  if (dropped > 0) log.push(`Left out ${dropped} whose link could not be confirmed.`);
  if (result.titles.length > 0) log.push(`New: ${result.titles.join("; ")}.`);
  return { status: "ok", found: drafts.length, added: result.added, log };
}
