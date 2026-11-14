import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManualEventForm, PasteImport } from "@/components/import-panel";
import { getSession } from "@/lib/data/session";
import { isAiEnabled, isInboxConfigured, isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Add an activity" };

export default async function ImportPage() {
  if (!isSupabaseConfigured) {
    return (
      <p className="card border-dashed p-5 text-sm text-muted">
        Adding activities is switched on once the database is connected.
      </p>
    );
  }

  const session = await getSession();
  if (!session) redirect("/login");

  const inbox = isInboxConfigured() ? process.env.IMAP_USER : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 pt-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Add an activity</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Got an invitation that is not in the feed? Share it and every student in Hong Kong can
          find it.
        </p>
      </div>

      {inbox ? (
        <section className="card flex flex-col gap-2 p-6">
          <h2 className="text-xl font-semibold tracking-tight">Forward it</h2>
          <p className="text-sm leading-relaxed text-muted">
            Forward university e-mails to{" "}
            <a href={`mailto:${inbox}`} className="font-mono text-ink underline">
              {inbox}
            </a>
            . The agent reads the inbox every day and turns invitations into cards. Only the
            activity details are kept, never your address or the rest of the message.
          </p>
        </section>
      ) : null}

      <section className="card flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Paste an invitation</h2>
          <p className="mt-1 text-sm text-muted">
            Gemini reads the text and pulls out the title, date, place, deadline and link.
          </p>
        </div>
        <PasteImport aiEnabled={isAiEnabled()} />
      </section>

      <section className="card flex flex-col gap-4 p-6">
        <h2 className="text-xl font-semibold tracking-tight">Or add it by hand</h2>
        <ManualEventForm />
      </section>
    </div>
  );
}
