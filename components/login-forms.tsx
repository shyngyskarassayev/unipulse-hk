"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type FormState } from "@/app/actions";
import { FormNote, SubmitButton } from "@/components/form-bits";
import { universityForEmail } from "@/lib/hk-universities";

const initial: FormState = {};

export function LoginForms() {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [signInState, signInAction] = useActionState(signIn, initial);
  const [signUpState, signUpAction] = useActionState(signUp, initial);

  const university = universityForEmail(email);
  const isSignUp = mode === "signup";

  return (
    <div className="card flex flex-col gap-5 p-6">
      <div className="flex rounded-full border border-line p-1 text-sm">
        {(["signup", "signin"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            className={`flex-1 rounded-full px-4 py-1.5 ${mode === option ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
          >
            {option === "signup" ? "Create account" : "Sign in"}
          </button>
        ))}
      </div>

      <form action={isSignUp ? signUpAction : signInAction} className="flex flex-col gap-4">
        {isSignUp ? (
          <div>
            <label htmlFor="full_name" className="label">
              Name
            </label>
            <input id="full_name" name="full_name" autoComplete="name" maxLength={80} className="input" />
          </div>
        ) : null}

        <div>
          <label htmlFor="email" className="label">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
          {isSignUp && university ? (
            <p className="mt-1.5 text-xs text-ok">
              ✓ {university.short} address: you will get the Verified student badge.
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={isSignUp ? 8 : undefined}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            className="input"
          />
        </div>

        <SubmitButton pendingLabel={isSignUp ? "Creating…" : "Signing in…"}>
          {isSignUp ? "Create account" : "Sign in"}
        </SubmitButton>
        <FormNote state={isSignUp ? signUpState : signInState} />
      </form>
    </div>
  );
}
