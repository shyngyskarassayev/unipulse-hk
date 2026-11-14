"use client";

import { useActionState } from "react";
import { createTeam, type FormState } from "@/app/actions";
import { FormNote, SubmitButton } from "@/components/form-bits";

const initial: FormState = {};

export function TeamForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(createTeam, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="event_id" value={eventId} />
      <div>
        <label htmlFor="team-name" className="label">
          Team name
        </label>
        <input id="team-name" name="name" required maxLength={60} className="input" />
      </div>
      <div>
        <label htmlFor="team-description" className="label">
          What are you building?
        </label>
        <input id="team-description" name="description" maxLength={300} className="input" />
      </div>
      <div>
        <label htmlFor="team-looking" className="label">
          Looking for (comma-separated)
        </label>
        <input
          id="team-looking"
          name="looking_for"
          placeholder="designer, backend, pitch"
          className="input"
        />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Creating…">Create team</SubmitButton>
        <FormNote state={state} />
      </div>
    </form>
  );
}
