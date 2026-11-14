import { z } from "zod";
import { describeAiError } from "@/lib/ai/client";
import { onboardingTurn } from "@/lib/ai/onboarding";
import { getSession } from "@/lib/data/session";
import { isAiEnabled } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const Body = z.object({
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(30),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!isAiEnabled()) {
    return Response.json({ error: "The AI guide is off. Use the form instead." }, { status: 503 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.history.at(-1)?.role !== "user") {
    return Response.json({ error: "Malformed conversation." }, { status: 400 });
  }

  try {
    const result = await onboardingTurn(parsed.data.history, async (profile) => {
      const supabase = await createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name.slice(0, 80),
          university: profile.university.slice(0, 80) || null,
          major: profile.major.slice(0, 120) || null,
          year_of_study: profile.year_of_study.slice(0, 40) || null,
          interests: [...new Set(profile.interests)],
          skills: [...new Set(profile.skills.map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
          preferred_categories: [...new Set(profile.preferred_categories)],
          goals: profile.goals.slice(0, 400) || null,
          onboarded: true,
        })
        .eq("id", session.userId);
      if (error) throw new Error(`Could not save the profile: ${error.message}`);
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: describeAiError(error) }, { status: 502 });
  }
}
