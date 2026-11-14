import { HK_TIME_ZONE } from "@/lib/env";
import type { EventDraft } from "@/lib/types";

type CalendarEvent = Pick<
  EventDraft,
  "title" | "summary" | "start_at" | "end_at" | "deadline_at" | "location" | "url"
> & { id?: string };

interface Slot {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Wall-clock parts of an instant in Hong Kong. */
function hkParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    ymd: `${get("year")}${get("month")}${get("day")}`,
    isMidnight: get("hour") === "00" && get("minute") === "00",
  };
}

/**
 * When the calendar entry should sit. Events without a start date fall back to
 * their application deadline; events with no dates at all cannot be exported.
 */
export function calendarSlot(event: CalendarEvent): Slot | null {
  if (event.start_at) {
    const start = new Date(event.start_at);
    if (Number.isNaN(start.getTime())) return null;
    const rawEnd = event.end_at ? new Date(event.end_at) : null;
    const end = rawEnd && rawEnd > start ? rawEnd : null;

    // A start at exactly midnight means the source gave a date without a time.
    const allDay = hkParts(start).isMidnight && (!end || hkParts(end).isMidnight);
    if (allDay) {
      // The stored end is the last day itself; calendars want the day after.
      return { title: event.title, start, end: new Date((end ?? start).getTime() + DAY), allDay };
    }
    return { title: event.title, start, end: end ?? new Date(start.getTime() + HOUR), allDay };
  }

  if (event.deadline_at) {
    const deadline = new Date(event.deadline_at);
    if (Number.isNaN(deadline.getTime())) return null;
    return {
      title: `Deadline: ${event.title}`,
      start: new Date(deadline.getTime() - 30 * 60 * 1000),
      end: deadline,
      allDay: false,
    };
  }

  return null;
}

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545: lines longer than 75 octets continue on the next line after a space. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = out.length === 0 ? 75 : 74;
    if (currentBytes + size > limit) {
      out.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  if (current) out.push(current);
  return out.join("\r\n ");
}

/** Builds an iCalendar file. Events without any date are skipped. */
export function buildIcs(events: CalendarEvent[], now: Date = new Date()): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UniPulse HK//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const event of events) {
    const slot = calendarSlot(event);
    if (!slot) continue;

    const description = [event.summary, event.url].filter(Boolean).join("\n\n");
    const uid = `${event.id ?? utcStamp(slot.start)}-${hashCode(event.title)}@unipulse.hk`;

    lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${utcStamp(now)}`);
    if (slot.allDay) {
      lines.push(
        `DTSTART;VALUE=DATE:${hkParts(slot.start).ymd}`,
        `DTEND;VALUE=DATE:${hkParts(slot.end).ymd}`,
      );
    } else {
      lines.push(`DTSTART:${utcStamp(slot.start)}`, `DTEND:${utcStamp(slot.end)}`);
    }
    lines.push(`SUMMARY:${escapeText(slot.title)}`);
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

function hashCode(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** Link that opens Google Calendar with the event pre-filled. */
export function googleCalendarUrl(event: CalendarEvent): string | null {
  const slot = calendarSlot(event);
  if (!slot) return null;

  const dates = slot.allDay
    ? `${hkParts(slot.start).ymd}/${hkParts(slot.end).ymd}`
    : `${utcStamp(slot.start)}/${utcStamp(slot.end)}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: slot.title,
    dates,
    ctz: HK_TIME_ZONE,
  });
  const details = [event.summary, event.url].filter(Boolean).join("\n\n");
  if (details) params.set("details", details);
  if (event.location) params.set("location", event.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
