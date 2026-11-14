import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForms } from "@/components/login-forms";
import { getSession } from "@/lib/data/session";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(session.profile.onboarded ? "/" : "/onboarding");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Join UniPulse HK</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Use any e-mail. If you sign up with your Hong Kong university address you also get a
          Verified student badge.
        </p>
      </div>
      {isSupabaseConfigured ? (
        <LoginForms />
      ) : (
        <p className="card border-dashed p-5 text-sm text-muted">
          Accounts are switched off until the database is connected. Add the Supabase keys to{" "}
          <code>.env.local</code> and restart the site.
        </p>
      )}
    </div>
  );
}
