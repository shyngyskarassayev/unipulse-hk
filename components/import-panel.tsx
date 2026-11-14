"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitEvents, type FormState } from "@/app/actions";
import { formatWhen } from "@/lib/format";
import { CATEGORIES, CATEGORY_LABELS, type EventDraft } from "@/lib/types";

function Note({ state }: { state: FormState | null }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-accent-dark">
        {state.error}
      </p>
    );
  }
  return (
    <p role="status" className="text-sm text-ok">
      {state.message}
    </p>
  );
}

/** Paste an invitation, let the model turn it into cards, pick the ones to add. */
export function PasteImport({ aiEnabled }: { aiEnabled: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<EventDraft[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [reading, setReading] = useState(false);
  const [state, setState] = useState<FormState | null>(null);
  const [saving, startSaving] = useTransition();

  async function read() {
    setReading(true);
    setState(null);
    setDrafts(null);
    try {
      const response = await fetch("/api/import/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await response.json()) as { drafts?: EventDraft[]; error?: string };
      if (!response.ok || !body.drafts) throw new Error(body.error ?? "Could not read the text.");
      setDrafts(body.drafts);
      setPicked(new Set(body.drafts.map((_, i) => i)));
      if (body.drafts.length === 0) {
        setState({ error: "The AI found no upcoming activity in this text." });
      }
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : "Could not read the text." });
    } finally {
      setReading(false);
    }
  }

  function toggle(index: number) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function add() {
    if (!drafts) return;
    startSaving(async () => {
      const result = await submitEvents(drafts.filter((_, i) => picked.has(i)));
      setState(result);
      if (!result.error) {
        setDrafts(null);
        setText("");
        router.refresh();
      }
    });
  }

  if (!aiEnabled) {
    return (
      <p className="text-sm text-muted">
        Reading pasted invitations needs a Gemini API key. Until then, add the activity by hand
        below.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        maxLength={60000}
        placeholder="Paste the full text of an e-mail, a chat message, or an event page…"
        aria-label="Invitation text"
        className="input font-mono text-xs leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={read}
          disabled={reading || text.trim().length < 20}
          className="btn btn-dark"
        >
          {reading ? "AI is reading…" : "Read with AI"}
        </button>
        <Note state={state} />
      </div>

      {drafts && drafts.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Found {drafts.length} {drafts.length === 1 ? "activity" : "activities"}. Untick anything
            that looks wrong before adding.
          </p>
          <ul className="flex flex-col gap-2">
            {drafts.map((draft, index) => (
              <li key={index}>
                <label className="card flex cursor-pointer items-start gap-3 p-4">
                  <input
                    type="checkbox"
                    checked={picked.has(index)}
                    onChange={() => toggle(index)}
                    className="mt-1 h-4 w-4 accent-[#d7263d]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {CATEGORY_LABELS[draft.category]}
                    </span>
                    <span className="block font-semibold">{draft.title}</span>
                    <span className="block text-sm text-muted">{draft.summary}</span>
                    <span className="mt-1 block text-sm">
                      {[formatWhen(draft), draft.location, draft.organizer].filter(Boolean).join(" · ") ||
                        "No date or place in the text"}
                    </span>
                    {draft.apply_url ?? draft.url ? (
                      <span className="block truncate font-mono text-xs text-muted">
                        {draft.apply_url ?? draft.url}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={add}
            disabled={saving || picked.size === 0}
            className="btn btn-primary self-start"
          >
            {saving ? "Adding…" : `Add ${picked.size} to the feed`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** datetime-local has no zone; the site always means Hong Kong time. */
function hkIso(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || !value) return null;
  return `${value.length === 10 ? `${value}T00:00` : value}:00+08:00`;
}

export function ManualEventForm() {
  const router = useRouter();
  const [state, setState] = useState<FormState | null>(null);
  const [saving, startSaving] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };

    const draft = {
      title: text("title"),
      category: text("category"),
      summary: text("summary"),
      description: null,
      start_at: hkIso(data.get("start_at")),
      end_at: hkIso(data.get("end_at")),
      deadline_at: hkIso(data.get("deadline_at")),
      location: text("location"),
      mode: null,
      organizer: text("organizer"),
      url: text("url"),
      apply_url: null,
      eligibility: text("eligibility"),
      tags: (text("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    };

    startSaving(async () => {
      const result = await submitEvents([draft]);
      setState(result);
      if (!result.error) {
        form.reset();
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div>
          <label htmlFor="me-title" className="label">
            Title
          </label>
          <input id="me-title" name="title" required maxLength={160} className="input" />
        </div>
        <div>
          <label htmlFor="me-category" className="label">
            Kind
          </label>
          <select id="me-category" name="category" className="input" defaultValue="seminar">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="me-summary" className="label">
          What is it?
        </label>
        <textarea id="me-summary" name="summary" rows={2} maxLength={320} className="input" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="me-start" className="label">
            Starts (HK time)
          </label>
          <input id="me-start" name="start_at" type="datetime-local" className="input" />
        </div>
        <div>
          <label htmlFor="me-end" className="label">
            Ends
          </label>
          <input id="me-end" name="end_at" type="datetime-local" className="input" />
        </div>
        <div>
          <label htmlFor="me-deadline" className="label">
            Apply by
          </label>
          <input id="me-deadline" name="deadline_at" type="datetime-local" className="input" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="me-location" className="label">
            Where
          </label>
          <input id="me-location" name="location" maxLength={200} className="input" />
        </div>
        <div>
          <label htmlFor="me-organizer" className="label">
            Organiser
          </label>
          <input id="me-organizer" name="organizer" maxLength={160} className="input" />
        </div>
        <div>
          <label htmlFor="me-url" className="label">
            Link
          </label>
          <input id="me-url" name="url" type="url" placeholder="https://" className="input" />
        </div>
        <div>
          <label htmlFor="me-tags" className="label">
            Topics (comma-separated)
          </label>
          <input id="me-tags" name="tags" placeholder="ai, career" className="input" />
        </div>
      </div>

      <div>
        <label htmlFor="me-eligibility" className="label">
          Who can join
        </label>
        <input id="me-eligibility" name="eligibility" maxLength={300} className="input" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="btn btn-dark">
          {saving ? "Adding…" : "Add to the feed"}
        </button>
        <Note state={state} />
      </div>
    </form>
  );
}
