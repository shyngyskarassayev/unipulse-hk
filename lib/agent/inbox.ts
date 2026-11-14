import type { SupabaseClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { filterUnseen, markSeen, saveDrafts } from "@/lib/agent/store";
import type { StepOutcome } from "@/lib/agent/run";
import { describeAiError } from "@/lib/ai/client";
import { extractEvents } from "@/lib/ai/extract";
import { isAiEnabled, isInboxConfigured } from "@/lib/env";

const LOOKBACK_DAYS = 14;
const MAX_MESSAGES_PER_RUN = 25;

export interface InboxMessage {
  ref: string;
  subject: string;
  text: string;
}

/** Plain text of an e-mail, with link targets kept beside their labels. */
export function mailToText(mail: Pick<ParsedMail, "subject" | "date" | "text" | "html">): string {
  let body = mail.text?.trim() ?? "";

  // HTML-only newsletters: recover the text and keep the links readable.
  if (!body && typeof mail.html === "string") {
    const $ = cheerio.load(mail.html);
    $("script, style").remove();
    $("a[href]").each((_, a) => {
      const link = $(a);
      const href = link.attr("href") ?? "";
      const label = link.text().replace(/\s+/g, " ").trim();
      if (/^https?:\/\//.test(href) && label) link.replaceWith(` ${label} (${href}) `);
    });
    $("br").replaceWith("\n");
    $("p, div, li, tr, h1, h2, h3").each((_, el) => {
      $(el).append("\n");
    });
    body = $.root().text().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  const header = [
    mail.subject ? `Subject: ${mail.subject}` : null,
    mail.date ? `Sent: ${mail.date.toISOString()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${header}\n\n${body}`.trim();
}

/** Downloads recent messages from the project inbox over IMAP. */
async function fetchInbox(): Promise<{ messages: InboxMessage[]; total: number }> {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: process.env.IMAP_USER ?? "", pass: process.env.IMAP_PASS ?? "" },
    logger: false,
  });

  const messages: InboxMessage[] = [];
  let total = 0;

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const uids = (await client.search({ since }, { uid: true })) || [];
      total = uids.length;

      // Newest first, and never more than one run can comfortably process.
      const wanted = uids.slice(-MAX_MESSAGES_PER_RUN).reverse();
      if (wanted.length > 0) {
        for await (const message of client.fetch(wanted, { source: true, envelope: true }, { uid: true })) {
          if (!message.source) continue;
          const mail = await simpleParser(message.source);
          const messageId = mail.messageId ?? message.envelope?.messageId ?? `uid-${message.uid}`;
          messages.push({
            ref: `mail:${messageId}`,
            subject: mail.subject ?? "(no subject)",
            text: mailToText(mail),
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return { messages, total };
}

export async function runInboxStep(admin: SupabaseClient): Promise<StepOutcome> {
  if (!isInboxConfigured()) {
    return { status: "skipped", found: 0, added: 0, log: ["No project inbox configured (IMAP_USER, IMAP_PASS)."] };
  }
  if (!isAiEnabled()) {
    return { status: "skipped", found: 0, added: 0, log: ["A Gemini API key is needed to read e-mails."] };
  }

  const { messages, total } = await fetchInbox();
  const unseenRefs = new Set(await filterUnseen(admin, messages.map((m) => m.ref)));
  const fresh = messages.filter((m) => unseenRefs.has(m.ref));

  const log: string[] = [`Inbox has ${total} e-mails from the last ${LOOKBACK_DAYS} days, ${fresh.length} not processed yet.`];
  if (total > MAX_MESSAGES_PER_RUN) {
    log.push(`Only the newest ${MAX_MESSAGES_PER_RUN} are read per run.`);
  }

  let found = 0;
  let added = 0;
  for (const message of fresh) {
    try {
      const drafts = await extractEvents(message.text, {
        sourceHint: "a university e-mail forwarded by a student",
      });
      // Only the subject is kept as the source; the sender and the forwarding
      // student are not stored anywhere.
      const result = await saveDrafts(admin, drafts, { type: "email", ref: message.subject.slice(0, 200) });
      await markSeen(admin, [message.ref]);
      found += result.found;
      added += result.added;
      log.push(`"${message.subject}": ${result.found} activities, ${result.added} added.`);
    } catch (error) {
      log.push(`"${message.subject}": failed (${describeAiError(error)}).`);
    }
  }

  return { status: "ok", found, added, log };
}
