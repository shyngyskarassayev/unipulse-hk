import type { Content } from "@google/genai";
import { z } from "zod";
import { AiResponseError, assertUsable, generate, getAi } from "@/lib/ai/client";
import { HK_UNIVERSITIES } from "@/lib/hk-universities";
import { CATEGORIES, TOPICS } from "@/lib/types";

export const ONBOARDING_GREETING =
  "Hi! I'm the UniPulse guide. A few quick questions and I'll tune your feed to what you actually care about. First: what's your name, and which university are you at?";

export const OnboardingProfile = z.object({
  full_name: z.string().describe("The student's name as they gave it."),
  university: z
    .string()
    .describe("Short name of their Hong Kong university, e.g. CityU, HKU, CUHK, HKUST, PolyU."),
  major: z.string().describe("Their programme or major."),
  year_of_study: z.string().describe('For example "Year 1", "Year 3", "Postgraduate".'),
  interests: z
    .array(z.enum(TOPICS))
    .describe("Topics they care about, mapped onto the allowed list."),
  skills: z
    .array(z.string())
    .describe("Concrete skills they mentioned, lowercase, e.g. python, figma, public speaking."),
  preferred_categories: z
    .array(z.enum(CATEGORIES))
    .describe("Kinds of activity they want to see more of."),
  goals: z.string().describe("One sentence on what they want out of university life."),
});

export type OnboardingProfileData = z.infer<typeof OnboardingProfile>;

const SYSTEM_PROMPT = `You are the onboarding guide for UniPulse HK, a site that collects hackathons, seminars, workshops, meetups, volunteering, internships and student helper jobs for university students in Hong Kong. Your job in this chat is to learn enough about a new student to personalise their feed, then save their profile.

You have already opened the chat with: "${ONBOARDING_GREETING}"

What you need to learn, in roughly this order:
1. Their name and university (${HK_UNIVERSITIES.map((u) => u.short).join(", ")}, or another Hong Kong institution).
2. Their major and year of study.
3. Which topics interest them. The feed understands these topics: ${TOPICS.join(", ")}.
4. Which kinds of activity they want: ${CATEGORIES.join(", ")}.
5. A few skills they have, and what they hope to get out of these activities.

How to run the conversation:
- Ask one short question per message and keep each message to two or three sentences. Students are doing this on their phone between classes.
- Sound like a friendly senior student, not a form. React briefly to what they said before the next question.
- If an answer already covers a later question, skip that question. If they answer vaguely, offer two or three examples rather than asking again in the abstract.
- Four or five questions is the whole interview. As soon as you have the five things above, call save_profile once. Fill gaps with your best reading of what they said rather than asking a sixth question.
- After save_profile succeeds, reply with one or two sentences confirming what you set up and telling them their feed is ready.

Map what they say onto the allowed topics and activity kinds (for example "machine learning" is ai, "startups" is entrepreneurship, "part-time work on campus" is helper). Keep skills as the student phrased them.

Do not ask for a phone number, student ID or other contact details. Those are entered separately on a private page that only the student can see.`;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface OnboardingResult {
  reply: string;
  saved: boolean;
}

/**
 * Runs one turn of the onboarding chat. `history` is the text-only transcript
 * kept by the browser and must end with the student's latest message.
 * `save` is called when the model decides it knows enough.
 */
export async function onboardingTurn(
  history: ChatTurn[],
  save: (profile: OnboardingProfileData) => Promise<void>,
): Promise<OnboardingResult> {
  getAi(); // fail early, with a clear error, when no key is set
  let saved = false;

  const config = {
    systemInstruction: SYSTEM_PROMPT,
    maxOutputTokens: 4000,
    tools: [
      {
        functionDeclarations: [
          {
            name: "save_profile",
            description:
              "Save the student's profile once you know their name, university, major, year, interests, preferred kinds of activity, skills and goals. Call it exactly once, at the end of the interview.",
            parametersJsonSchema: z.toJSONSchema(OnboardingProfile),
          },
        ],
      },
    ],
  };

  // The model speaks as "model"; the browser keeps the transcript as "assistant".
  const contents: Content[] = history.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));

  // At most: one turn that calls save_profile, one retry if its arguments
  // were malformed, and one turn for the closing message.
  for (let step = 0; step < 3; step++) {
    const response = await generate({ contents, config });
    assertUsable(response, "continuing this conversation");

    const call = response.functionCalls?.find((c) => c.name === "save_profile");
    if (!call) {
      const reply = response.text?.trim();
      if (reply) return { reply, saved };
      break;
    }

    // Arguments come from the model, so they are checked before anything is stored.
    const parsed = OnboardingProfile.safeParse(call.args);
    let outcome: Record<string, unknown>;
    if (!parsed.success) {
      outcome = { error: "The profile did not match the expected fields. Call save_profile again with every field filled in." };
    } else if (saved) {
      outcome = { output: "The profile is already saved." };
    } else {
      await save(parsed.data);
      saved = true;
      outcome = { output: "Profile saved. The student's feed is now personalised." };
    }

    // The model's own turn goes back unchanged, followed by the tool's result.
    const modelTurn = response.candidates?.[0]?.content;
    if (!modelTurn) break;
    contents.push(modelTurn, {
      role: "user",
      parts: [{ functionResponse: { id: call.id, name: "save_profile", response: outcome } }],
    });
  }

  if (saved) return { reply: "All set. Your profile is saved and your feed is ready.", saved };
  throw new AiResponseError("The guide did not answer. Send your message again.");
}
