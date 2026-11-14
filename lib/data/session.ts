import { cache } from "react";
import { agentAdminEmails, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Profile, ProfilePrivate } from "@/lib/types";

export interface Session {
  userId: string;
  email: string;
  profile: Profile;
  isAgentAdmin: boolean;
}

function emptyProfile(id: string): Profile {
  return {
    id,
    full_name: "",
    university: null,
    major: null,
    year_of_study: null,
    interests: [],
    skills: [],
    preferred_categories: [],
    goals: null,
    verified: false,
    onboarded: false,
  };
}

/** The signed-in student, or null. Cached for the duration of one request. */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  // Verifies the session token's signature (locally, against the project's
  // public keys) instead of asking the auth server on every request.
  const { data: verified } = await supabase.auth.getClaims();
  const userId = verified?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const email = typeof verified.claims.email === "string" ? verified.claims.email : "";

  return {
    userId,
    email,
    profile: (data as Profile | null) ?? emptyProfile(userId),
    isAgentAdmin: agentAdminEmails().includes(email.toLowerCase()),
  };
});

export async function getPrivateProfile(userId: string): Promise<ProfilePrivate | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_private")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ProfilePrivate | null) ?? null;
}

export function displayName(profile: Pick<Profile, "full_name">, fallback = "Student"): string {
  return profile.full_name.trim() || fallback;
}
