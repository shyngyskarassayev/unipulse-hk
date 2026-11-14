import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import { USER_AGENT, sourceUrls } from "@/lib/agent/config";
import { filterUnseen, markSeen, saveDrafts } from "@/lib/agent/store";
import type { StepOutcome } from "@/lib/agent/run";
import { describeAiError } from "@/lib/ai/client";
import { extractEvents } from "@/lib/ai/extract";
import { extractJsonLdEvents } from "@/lib/events/jsonld";
import { isAiEnabled } from "@/lib/env";
import type { EventDraft } from "@/lib/types";

/**
 * Readable text of a page, with link targets kept next to their labels so
 * that registration links survive the conversion.
 */
export function pageToText(html: string, pageUrl: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer, header, form, iframe").remove();

  $("a[href]").each((_, a) => {
    const link = $(a);
    const label = link.text().replace(/\s+/g, " ").trim();
    let href: string;
    try {
      href = new URL(link.attr("href") ?? "", pageUrl).toString();
    } catch {
      return;
    }
    if (!/^https?:\/\//.test(href) || !label) return;
    link.replaceWith(` ${label} (${href}) `);
  });

  $("br").replaceWith("\n");
  $("p, div, li, tr, h1, h2, h3, h4, h5, h6, section, article").each((_, el) => {
    $(el).append("\n");
  });

  return $("body")
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    cache: "no-store",
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`answered ${response.status}`);
  return response.text();
}

export async function runSourcesStep(admin: SupabaseClient): Promise<StepOutcome> {
  const urls = sourceUrls();
  if (urls.length === 0) {
    return { status: "skipped", found: 0, added: 0, log: ["No source pages configured (SOURCE_URLS)."] };
  }

  const log: string[] = [];
  let found = 0;
  let added = 0;
  let failures = 0;

  for (const url of urls) {
    try {
      const html = await fetchPage(url);

      // Structured data first: it is exact and costs nothing.
      let drafts: EventDraft[] = extractJsonLdEvents(html, url, { hongKongOnly: true });
      let how = "structured data";

      if (drafts.length === 0) {
        if (!isAiEnabled()) {
          log.push(`${url}: no structured data; a Gemini API key is needed to read the page.`);
          continue;
        }
        const text = pageToText(html, url);
        const ref = `page:${url}#${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;
        if ((await filterUnseen(admin, [ref])).length === 0) {
          log.push(`${url}: unchanged since the last run.`);
          continue;
        }
        drafts = await extractEvents(text, { sourceHint: "a web page that lists activities", baseUrl: url });
        await markSeen(admin, [ref]);
        how = "read by AI";
      }

      const result = await saveDrafts(admin, drafts, { type: "site", ref: url });
      found += result.found;
      added += result.added;
      log.push(`${url}: ${result.found} activities (${how}), ${result.added} added.`);
    } catch (error) {
      failures += 1;
      log.push(`${url}: failed (${describeAiError(error)}).`);
    }
  }

  return { status: failures === urls.length ? "error" : "ok", found, added, log };
}
