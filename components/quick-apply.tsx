"use client";

import { useState } from "react";

interface Field {
  label: string;
  value: string;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked; the text stays selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-ink hover:text-ink"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Everything a registration form usually asks for, one tap from the
 * clipboard, plus a motivation answer drafted from the student's profile.
 */
export function QuickApply({
  eventId,
  fields,
  applyUrl,
  aiEnabled,
}: {
  eventId: string;
  fields: Field[];
  applyUrl: string | null;
  aiEnabled: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function writeDraft() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/apply/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const body = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !body.text) throw new Error(body.error ?? "Could not write a draft.");
      setDraft(body.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write a draft.");
    } finally {
      setLoading(false);
    }
  }

  const filled = fields.filter((f) => f.value);

  return (
    <div className="flex flex-col gap-4">
      {filled.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line">
          {filled.map((f) => (
            <li key={f.label} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-muted">{f.label}</p>
                <p className="truncate text-sm">{f.value}</p>
              </div>
              <CopyButton value={f.value} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          Fill in your profile once and your details will be ready to copy here.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-muted">Why do you want to join?</p>
          {draft ? <CopyButton value={draft} /> : null}
        </div>
        {draft ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={7}
            className="input leading-relaxed"
            aria-label="Draft answer"
          />
        ) : null}
        {aiEnabled ? (
          <button type="button" onClick={writeDraft} disabled={loading} className="btn btn-ghost self-start">
            {loading ? "AI is writing…" : draft ? "Write another draft" : "Draft my answer with AI"}
          </button>
        ) : (
          <p className="text-sm text-muted">AI drafting is off until a Gemini API key is added.</p>
        )}
        {draft ? (
          <p className="text-xs text-muted">
            This is a starting point built from your profile. Edit it so it sounds like you.
          </p>
        ) : null}
        {error ? <p className="text-sm text-accent-dark">{error}</p> : null}
      </div>

      {applyUrl ? (
        <a href={applyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
          Open the registration page
        </a>
      ) : null}
    </div>
  );
}
