import Link from "next/link";
import { deadlineInfo, formatWhen } from "@/lib/format";
import {
  CATEGORY_LABELS,
  MODE_LABELS,
  SOURCE_LABELS,
  type Category,
  type EventRow,
} from "@/lib/types";

/** Full class names so Tailwind can see them at build time. */
const CATEGORY_STYLE: Record<Category, { text: string; bar: string }> = {
  hackathon: { text: "text-cat-hackathon", bar: "bg-cat-hackathon" },
  seminar: { text: "text-cat-seminar", bar: "bg-cat-seminar" },
  training: { text: "text-cat-training", bar: "bg-cat-training" },
  meetup: { text: "text-cat-meetup", bar: "bg-cat-meetup" },
  volunteering: { text: "text-cat-volunteering", bar: "bg-cat-volunteering" },
  internship: { text: "text-cat-internship", bar: "bg-cat-internship" },
  helper: { text: "text-cat-helper", bar: "bg-cat-helper" },
};

export function CategoryBadge({ category }: { category: Category }) {
  const style = CATEGORY_STYLE[category];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.bar}`} aria-hidden />
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export function DeadlineBadge({ iso }: { iso: string | null }) {
  const info = deadlineInfo(iso);
  if (!info) return null;
  const tone = info.passed
    ? "bg-line text-muted"
    : info.urgent
      ? "bg-accent-soft text-accent-dark"
      : "bg-warn-soft text-warn";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {info.label}
    </span>
  );
}

export interface EventCardProps {
  event: EventRow;
  /** Shown on the personal feed. */
  fit?: { score: number; matched: string[]; reason: string | null };
}

export function EventCard({ event, fit }: EventCardProps) {
  const when = formatWhen(event);
  const where = event.location ?? (event.mode ? MODE_LABELS[event.mode] : null);
  const style = CATEGORY_STYLE[event.category];

  return (
    <article className="card group relative flex flex-col overflow-hidden transition-shadow hover:shadow-[0_6px_24px_rgb(27_26_23/0.08)]">
      <span className={`absolute inset-y-0 left-0 w-1 ${style.bar}`} aria-hidden />
      <div className="flex flex-1 flex-col gap-3 p-5 pl-6">
        <div className="flex items-start justify-between gap-3">
          <CategoryBadge category={event.category} />
          {fit && fit.score > 0 ? (
            <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 font-mono text-xs text-white">
              {fit.score}% fit
            </span>
          ) : null}
        </div>

        <h3 className="text-lg font-semibold leading-snug tracking-tight">
          <Link href={`/events/${event.id}`} className="after:absolute after:inset-0">
            {event.title}
          </Link>
        </h3>

        <p className="line-clamp-3 text-sm leading-relaxed text-muted">{event.summary}</p>

        {fit?.reason ? (
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-dark">
            <span className="font-semibold">Why this fits you: </span>
            {fit.reason}
          </p>
        ) : fit && fit.matched.length > 0 ? (
          <p className="text-sm text-accent-dark">
            Matches your interest in {fit.matched.slice(0, 3).join(", ")}
          </p>
        ) : null}

        <dl className="mt-auto flex flex-col gap-1 pt-1 text-sm">
          {when ? (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-muted">When</dt>
              <dd className="font-medium">{when}</dd>
            </div>
          ) : null}
          {where ? (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-muted">Where</dt>
              <dd className="line-clamp-1">{where}</dd>
            </div>
          ) : null}
          {event.organizer ? (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-muted">By</dt>
              <dd className="line-clamp-1">{event.organizer}</dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <DeadlineBadge iso={event.deadline_at} />
          {event.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="chip">
              {tag}
            </span>
          ))}
          <span className="ml-auto text-xs text-muted">{SOURCE_LABELS[event.source_type]}</span>
        </div>
      </div>
    </article>
  );
}
