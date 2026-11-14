"use client";

import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions";

/** Submit button that disables itself while its form is being sent. */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}

export function FormNote({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-accent-dark">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="text-sm text-ok">
        {state.message}
      </p>
    );
  }
  return null;
}
