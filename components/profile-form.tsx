"use client";

import { useActionState } from "react";
import { updatePrivateProfile, updateProfile, type FormState } from "@/app/actions";
import { FormNote, SubmitButton } from "@/components/form-bits";
import { HK_UNIVERSITIES } from "@/lib/hk-universities";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  TOPICS,
  type Profile,
  type ProfilePrivate,
} from "@/lib/types";

const initial: FormState = {};

function CheckPill({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span className="inline-flex rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-muted transition-colors peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
        {label}
      </span>
    </label>
  );
}

/**
 * The public profile. Used on the profile page and as the onboarding form
 * when the AI guide is not available.
 */
export function ProfileForm({ profile, next }: { profile: Profile; next?: "feed" }) {
  const [state, action] = useActionState(updateProfile, initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pf-name" className="label">
            Name
          </label>
          <input
            id="pf-name"
            name="full_name"
            required
            maxLength={80}
            defaultValue={profile.full_name}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="pf-university" className="label">
            University
          </label>
          <input
            id="pf-university"
            name="university"
            list="hk-universities"
            maxLength={80}
            defaultValue={profile.university ?? ""}
            className="input"
          />
          <datalist id="hk-universities">
            {HK_UNIVERSITIES.map((u) => (
              <option key={u.short} value={u.short}>
                {u.name}
              </option>
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="pf-major" className="label">
            Major
          </label>
          <input
            id="pf-major"
            name="major"
            maxLength={120}
            defaultValue={profile.major ?? ""}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="pf-year" className="label">
            Year of study
          </label>
          <input
            id="pf-year"
            name="year_of_study"
            placeholder="Year 1"
            maxLength={40}
            defaultValue={profile.year_of_study ?? ""}
            className="input"
          />
        </div>
      </div>

      <fieldset>
        <legend className="label">Topics you care about</legend>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((topic) => (
            <CheckPill
              key={topic}
              name="interests"
              value={topic}
              label={topic}
              defaultChecked={profile.interests.includes(topic)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">What you want to see more of</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <CheckPill
              key={category}
              name="preferred_categories"
              value={category}
              label={CATEGORY_LABELS[category]}
              defaultChecked={profile.preferred_categories.includes(category)}
            />
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="pf-skills" className="label">
          Skills (comma-separated)
        </label>
        <input
          id="pf-skills"
          name="skills"
          placeholder="python, figma, public speaking"
          defaultValue={profile.skills.join(", ")}
          className="input"
        />
      </div>

      <div>
        <label htmlFor="pf-goals" className="label">
          What do you want out of all this?
        </label>
        <textarea
          id="pf-goals"
          name="goals"
          rows={2}
          maxLength={400}
          defaultValue={profile.goals ?? ""}
          className="input"
        />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton>{next ? "Save and show my feed" : "Save profile"}</SubmitButton>
        <FormNote state={state} />
      </div>
    </form>
  );
}

/** Details that only ever leave the site when the student copies them. */
export function PrivateProfileForm({ details }: { details: ProfilePrivate | null }) {
  const [state, action] = useActionState(updatePrivateProfile, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pp-phone" className="label">
            Phone
          </label>
          <input
            id="pp-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={40}
            defaultValue={details?.phone ?? ""}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="pp-sid" className="label">
            Student ID
          </label>
          <input
            id="pp-sid"
            name="student_id"
            maxLength={40}
            defaultValue={details?.student_id ?? ""}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="pp-linkedin" className="label">
            LinkedIn
          </label>
          <input
            id="pp-linkedin"
            name="linkedin"
            maxLength={200}
            defaultValue={details?.linkedin ?? ""}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="pp-github" className="label">
            GitHub
          </label>
          <input
            id="pp-github"
            name="github"
            maxLength={200}
            defaultValue={details?.github ?? ""}
            className="input"
          />
        </div>
      </div>
      <div>
        <label htmlFor="pp-pitch" className="label">
          A few lines about you (used to draft application answers)
        </label>
        <textarea
          id="pp-pitch"
          name="pitch"
          rows={3}
          maxLength={600}
          defaultValue={details?.pitch ?? ""}
          className="input"
        />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton>Save private details</SubmitButton>
        <FormNote state={state} />
      </div>
    </form>
  );
}
