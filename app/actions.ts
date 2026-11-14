"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveDrafts } from "@/lib/agent/store";
import { describeAiError } from "@/lib/ai/client";
import { refreshMatchesFor } from "@/lib/data/matches";
import { getSession } from "@/lib/data/session";
import { sanitizeDraft } from "@/lib/events/sanitize";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient, createClient, isAdminConfigured } from "@/lib/supabase/server";
import { CATEGORIES, TOPICS, type EventDraft, type SavedStatus } from "@/lib/types";

export interface FormState {
  error?: string;
  message?: string;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function list(formData: FormData, name: string): string[] {
  return field(formData, name)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

// ---------------------------------------------------------------------------
// Sign in, sign up, sign out
// ---------------------------------------------------------------------------

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured) return { error: "Sign-in is not set up yet." };
  const email = field(formData, "email");
  const password = field(formData, "password");
  if (!email || !password) return { error: "Enter your e-mail and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured) return { error: "Sign-up is not set up yet." };
  const email = field(formData, "email");
  const password = field(formData, "password");
  const fullName = field(formData, "full_name");
  if (!email || !password) return { error: "Enter your e-mail and a password." };
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) return { error: error.message };

  // With e-mail confirmation switched on there is no session yet.
  if (!data.session) {
    return { message: "Check your inbox and confirm your e-mail, then sign in." };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/");
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();

  const fullName = field(formData, "full_name");
  if (!fullName) return { error: "Tell us your name." };

  const interests = formData
    .getAll("interests")
    .filter((v): v is string => typeof v === "string")
    .filter((v) => (TOPICS as readonly string[]).includes(v));
  const categories = formData
    .getAll("preferred_categories")
    .filter((v): v is string => typeof v === "string")
    .filter((v) => (CATEGORIES as readonly string[]).includes(v));

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName.slice(0, 80),
      university: field(formData, "university").slice(0, 80) || null,
      major: field(formData, "major").slice(0, 120) || null,
      year_of_study: field(formData, "year_of_study").slice(0, 40) || null,
      interests,
      skills: list(formData, "skills"),
      preferred_categories: categories,
      goals: field(formData, "goals").slice(0, 400) || null,
      onboarded: true,
    })
    .eq("id", session.userId);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  if (field(formData, "next") === "feed") redirect("/?tab=foryou&fresh=1");
  return { message: "Profile saved." };
}

export async function updatePrivateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profile_private")
    .update({
      phone: field(formData, "phone").slice(0, 40) || null,
      student_id: field(formData, "student_id").slice(0, 40) || null,
      linkedin: field(formData, "linkedin").slice(0, 200) || null,
      github: field(formData, "github").slice(0, 200) || null,
      pitch: field(formData, "pitch").slice(0, 600) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", session.userId);
  if (error) return { error: error.message };

  revalidatePath("/profile/me");
  return { message: "Saved. Only you can see these details." };
}

/** Re-runs the model's "why this fits you" pass for the signed-in student. */
export async function refreshMatches(): Promise<FormState> {
  const session = await requireSession();
  try {
    const count = await refreshMatchesFor(session.profile);
    revalidatePath("/");
    return { message: count > 0 ? `Explained ${count} matches.` : "Nothing to explain yet." };
  } catch (error) {
    return { error: describeAiError(error) };
  }
}

// ---------------------------------------------------------------------------
// Saving events
// ---------------------------------------------------------------------------

export async function setSavedStatus(eventId: string, status: SavedStatus | null): Promise<void> {
  const session = await requireSession();
  const supabase = await createClient();

  if (status === null) {
    await supabase.from("saved_events").delete().eq("user_id", session.userId).eq("event_id", eventId);
  } else {
    await supabase
      .from("saved_events")
      .upsert({ user_id: session.userId, event_id: eventId, status }, { onConflict: "user_id,event_id" });
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/calendar");
}

// ---------------------------------------------------------------------------
// Following
// ---------------------------------------------------------------------------

export async function setFollowing(targetId: string, follow: boolean): Promise<void> {
  const session = await requireSession();
  if (targetId === session.userId) return;
  const supabase = await createClient();

  if (follow) {
    await supabase
      .from("follows")
      .upsert(
        { follower_id: session.userId, following_id: targetId },
        { onConflict: "follower_id,following_id", ignoreDuplicates: true },
      );
  } else {
    await supabase
      .from("follows")
      .delete()
      .eq("follower_id", session.userId)
      .eq("following_id", targetId);
  }

  revalidatePath("/people");
  revalidatePath(`/profile/${targetId}`);
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function createTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const eventId = field(formData, "event_id");
  const name = field(formData, "name");
  if (!eventId || !name) return { error: "Give your team a name." };

  const supabase = await createClient();
  const { data: team, error } = await supabase
    .from("teams")
    .insert({
      event_id: eventId,
      name: name.slice(0, 60),
      description: field(formData, "description").slice(0, 300) || null,
      looking_for: list(formData, "looking_for").slice(0, 8),
      owner_id: session.userId,
    })
    .select("id")
    .single();
  if (error || !team) return { error: error?.message ?? "Could not create the team." };

  const { error: memberError } = await supabase
    .from("team_members")
    .insert({ team_id: team.id, user_id: session.userId });
  if (memberError) return { error: memberError.message };

  revalidatePath(`/events/${eventId}`);
  return { message: "Team created." };
}

export async function setTeamMembership(teamId: string, eventId: string, join: boolean): Promise<void> {
  const session = await requireSession();
  const supabase = await createClient();

  if (join) {
    await supabase
      .from("team_members")
      .upsert(
        { team_id: teamId, user_id: session.userId },
        { onConflict: "team_id,user_id", ignoreDuplicates: true },
      );
  } else {
    await supabase.from("team_members").delete().eq("team_id", teamId).eq("user_id", session.userId);
  }
  revalidatePath(`/events/${eventId}`);
}

export async function deleteTeam(teamId: string, eventId: string): Promise<void> {
  await requireSession();
  const supabase = await createClient();
  // The database policy only lets the owner delete.
  await supabase.from("teams").delete().eq("id", teamId);
  revalidatePath(`/events/${eventId}`);
}

// ---------------------------------------------------------------------------
// Adding events by hand or from pasted text
// ---------------------------------------------------------------------------

export async function submitEvents(drafts: unknown[]): Promise<FormState> {
  const session = await requireSession();
  if (!isAdminConfigured()) return { error: "The server is not allowed to save events yet." };
  if (!Array.isArray(drafts) || drafts.length === 0) return { error: "Nothing to add." };
  if (drafts.length > 20) return { error: "Add at most 20 activities at a time." };

  // Never trust what the browser sends back: clean every field again.
  const clean = drafts
    .map((draft) => (typeof draft === "object" && draft !== null ? sanitizeDraft(draft as Partial<EventDraft>) : null))
    .filter((draft): draft is EventDraft => draft !== null);
  if (clean.length === 0) return { error: "These activities had no usable title." };

  try {
    const result = await saveDrafts(createAdminClient(), clean, {
      type: "manual",
      ref: null,
      submittedBy: session.userId,
    });
    revalidatePath("/");
    if (result.added === 0) {
      return { message: "Already in the feed, or the date has passed. Nothing new was added." };
    }
    return { message: `Added ${result.added} ${result.added === 1 ? "activity" : "activities"} to the feed.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save." };
  }
}
