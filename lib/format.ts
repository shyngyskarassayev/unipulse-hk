import { HK_TIME_ZONE } from "@/lib/env";
import { inclusiveEnd } from "@/lib/time";
import type { EventDraft } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: HK_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const dateYearFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: HK_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: HK_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: HK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function parse(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDay(date: Date, now: Date): string {
  const sameYear = dayKeyFmt.format(date).slice(0, 4) === dayKeyFmt.format(now).slice(0, 4);
  // en-GB adds a comma after the weekday only when the year is shown; drop it
  // so both forms read the same.
  return (sameYear ? dateFmt : dateYearFmt).format(date).replace(",", "");
}

/** "Sat 21 Nov, 10:00–18:00" in Hong Kong time, or a date range. */
export function formatWhen(
  event: Pick<EventDraft, "start_at" | "end_at">,
  now: Date = new Date(),
): string | null {
  const start = parse(event.start_at);
  if (!start) return null;
  const end = parse(event.end_at);

  const startHasTime = timeFmt.format(start) !== "00:00";
  const startDay = formatDay(start, now);

  if (!end || end <= start) {
    return startHasTime ? `${startDay}, ${timeFmt.format(start)}` : startDay;
  }

  const sameDay = dayKeyFmt.format(start) === dayKeyFmt.format(end);
  if (sameDay) {
    return startHasTime
      ? `${startDay}, ${timeFmt.format(start)}–${timeFmt.format(end)}`
      : startDay;
  }
  return `${startDay} – ${formatDay(end, now)}`;
}

export function formatDate(iso: string | null, now: Date = new Date()): string | null {
  const date = parse(iso);
  return date ? formatDay(date, now) : null;
}

/** "Apply by Fri 20 Nov" plus how urgent it is. */
export function deadlineInfo(
  iso: string | null,
  now: Date = new Date(),
): { label: string; urgent: boolean; passed: boolean } | null {
  const parsed = parse(iso);
  if (!parsed) return null;
  // A deadline given as a bare date runs to the end of that day.
  const date = inclusiveEnd(parsed);
  const daysLeft = Math.floor((date.getTime() - now.getTime()) / DAY);
  if (daysLeft < 0) return { label: "Applications closed", urgent: false, passed: true };
  const day = formatDay(date, now);
  if (daysLeft === 0) return { label: `Apply today (${day})`, urgent: true, passed: false };
  if (daysLeft === 1) return { label: `Apply by tomorrow (${day})`, urgent: true, passed: false };
  return {
    label: `Apply by ${day} · ${daysLeft} days left`,
    urgent: daysLeft <= 5,
    passed: false,
  };
}

export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
