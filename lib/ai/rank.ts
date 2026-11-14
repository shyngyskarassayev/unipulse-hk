import { z } from "zod";
import { AiResponseError, assertUsable, generate, generateJson } from "@/lib/ai/client";
import type { EventRow, Profile } from "@/lib/types";

const Matches = z.object({
  matches: z.array(
    z.object({
      id: z.string().describe("The id of the event, copied from the list."),
      score: z.number().describe("Fit from 0 to 100."),
      reason: z.string().describe("One sentence, addressed to the student as 'you'."),
    }),
  ),
});

export interface Match {
  id: string;
  score: number;
  reason: string;
}

const SYSTEM_PROMPT = `You rank activities for one university student in Hong Kong on UniPulse HK. You get the student's profile and a shortlist of upcoming activities, and you decide how well each one fits this particular student.

Return every activity from the shortlist with a score from 0 to 100 and one sentence explaining the fit.

Scoring: weigh how closely the activity matches the student's interests and goals first, then whether their skills and year of study make it realistic for them, then whether it is the kind of activity they asked for. An activity that stretches the student in a direction they named as a goal can score high even when it is outside their major. Use the full range, so that a weak fit is clearly lower than a strong one.

The sentence is shown under the event card as "Why this fits you". Make it specific to this student and this activity: name the interest, skill or goal that connects them. Keep it under 20 words, speak to the student as "you", and state only what the profile and the listing support. If the fit is weak, say plainly what the activity offers instead of inventing a connection.`;

/**
 * Asks the model to re-rank a shortlist for one student and say why each
 * event fits. The shortlist should already be narrowed by the tag-based score.
 */
export async function explainMatches(
  profile: Pick<
    Profile,
    "university" | "major" | "year_of_study" | "interests" | "skills" | "preferred_categories" | "goals"
  >,
  events: Array<Pick<EventRow, "id" | "title" | "summary" | "category" | "tags" | "eligibility">>,
): Promise<Match[]> {
  if (events.length === 0) return [];

  const result = await generateJson({
    schema: Matches,
    system: SYSTEM_PROMPT,
    user: `<student>\n${JSON.stringify(profile, null, 2)}\n</student>\n\n<activities>\n${JSON.stringify(events, null, 2)}\n</activities>`,
    what: "ranking these activities",
    maxOutputTokens: 8000,
  });

  const known = new Set(events.map((e) => e.id));
  return result.matches
    .filter((m) => known.has(m.id))
    .map((m) => ({
      id: m.id,
      score: Math.max(0, Math.min(100, Math.round(m.score))),
      reason: m.reason.trim().slice(0, 240),
    }));
}

const APPLY_SYSTEM_PROMPT = `You help a university student in Hong Kong draft the short "Why do you want to join?" answer that registration forms for student activities ask for.

Write in the first person, in the student's voice, 70 to 110 words, in plain English a second-language speaker would naturally write. Connect what the student has said about themselves to what this specific activity offers.

Use only facts from the profile you are given. Do not invent projects, awards, work experience or numbers, because the student will submit this under their own name. If the profile is thin, write a shorter honest answer about their interest and what they want to learn.

Return only the answer text, with no heading, quotation marks or commentary. The student will edit it before sending.`;

/** Drafts a motivation answer the student can edit and paste into a form. */
export async function draftMotivation(
  profile: Pick<
    Profile,
    "full_name" | "university" | "major" | "year_of_study" | "interests" | "skills" | "goals"
  > & { pitch: string | null },
  event: Pick<EventRow, "title" | "summary" | "category" | "organizer" | "eligibility">,
): Promise<string> {
  const response = await generate({
    contents: `<student>\n${JSON.stringify(profile, null, 2)}\n</student>\n\n<activity>\n${JSON.stringify(event, null, 2)}\n</activity>`,
    config: { systemInstruction: APPLY_SYSTEM_PROMPT, maxOutputTokens: 4000 },
  });
  assertUsable(response, "drafting this answer");

  const text = response.text?.trim();
  if (!text) throw new AiResponseError("The model returned an empty draft.");
  return text;
}
