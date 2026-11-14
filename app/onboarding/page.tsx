import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingChat } from "@/components/onboarding-chat";
import { ProfileForm } from "@/components/profile-form";
import { ONBOARDING_GREETING } from "@/lib/ai/onboarding";
import { getSession } from "@/lib/data/session";
import { isAiEnabled } from "@/lib/env";

export const metadata: Metadata = { title: "Set up your feed" };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ai = isAiEnabled();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pt-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-accent">Two minutes</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Tell us what you are into</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {ai
            ? "Chat with the guide. It asks a handful of questions, then builds your profile and sorts the feed for you."
            : "Pick your topics below and the feed will be sorted for you."}
        </p>
      </div>

      {ai ? <OnboardingChat greeting={ONBOARDING_GREETING} /> : null}

      {ai ? (
        <details className="card p-5">
          <summary className="cursor-pointer text-sm font-medium">
            Prefer a form? Fill it in yourself
          </summary>
          <div className="mt-5">
            <ProfileForm profile={session.profile} next="feed" />
          </div>
        </details>
      ) : (
        <div className="card p-5">
          <ProfileForm profile={session.profile} next="feed" />
        </div>
      )}
    </div>
  );
}
