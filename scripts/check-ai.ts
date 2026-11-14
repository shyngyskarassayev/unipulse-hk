/**
 * Exercises every AI feature once against the real model, without touching
 * the database. Each call costs a little, so this is for checking a new key
 * or a new model, not for running in a loop.
 *
 *   npm run check-ai            everything except web search
 *   npm run check-ai -- search  web search only (slower)
 */
import "./env";
import { requireEnv } from "./env";

const INVITATION = `Subject: [CS Dept] Invitation: AI Agents Hack Night, 28 Nov

Dear students,

The Department of Computer Science and the CityU Google Developer Group invite you to AI Agents Hack Night
on Saturday 28 November 2026, 6:30 pm to 11:00 pm, at Room 4410, Li Dak Sum Yip Yio Chin Academic Building,
City University of Hong Kong. Form a team of up to 4 and build a working agent in one evening. Pizza provided.

Open to all CityU undergraduates. Seats are limited: register by 25 November at
https://example.edu/cs/hack-night-2026

Also a reminder that course registration for Semester B opens on 1 December.

Best regards,
CS General Office`;

async function time<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  const start = Date.now();
  try {
    const result = await run();
    console.log(`\n✓ ${label} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    return result;
  } catch (error) {
    const { describeAiError } = await import("@/lib/ai/client");
    console.log(`\n✗ ${label}: ${describeAiError(error)}`);
    process.exitCode = 1;
    return null;
  }
}

async function main() {
  requireEnv(["GEMINI_API_KEY"]);
  const { aiModel } = await import("@/lib/ai/client");
  console.log(`model: ${aiModel()}`);

  if (process.argv[2] === "search") {
    const { searchWeb, keepVerifiedDrafts } = await import("@/lib/agent/search");
    const { extractEvents } = await import("@/lib/ai/extract");
    const found = await time("web search: hackathons", () => searchWeb("hackathons"));
    if (!found) return;
    console.log(`  notes: ${found.notes.length} characters, ${found.sources.length} pages with real addresses`);
    for (const source of found.sources.slice(0, 5)) console.log(`  - ${source.url.slice(0, 100)}`);

    const sourceList = found.sources.map((s) => `- ${s.title || "page"}: ${s.url}`).join("\n");
    const drafts = await time("turning the notes into cards", () =>
      extractEvents(`${found.notes}\n\nPages returned by the search:\n${sourceList}`, {
        sourceHint: "notes from a web search, followed by the list of pages the search returned",
      }),
    );
    if (!drafts) return;
    const checked = await time("checking every link", () => keepVerifiedDrafts(drafts, found.sources));
    if (!checked) return;
    console.log(`  ${drafts.length} cards, ${checked.kept.length} with a confirmed link, ${checked.dropped} left out`);
    for (const draft of checked.kept) {
      console.log(`  - [${draft.category}] ${draft.title.slice(0, 60)} | ${draft.start_at ?? "no date"} | ${draft.url?.slice(0, 70)}`);
    }
    return;
  }

  const { extractEvents } = await import("@/lib/ai/extract");
  const drafts = await time("reading a forwarded e-mail", () =>
    extractEvents(INVITATION, { sourceHint: "a university e-mail forwarded by a student" }),
  );
  if (drafts) console.log(JSON.stringify(drafts, null, 1));

  const { onboardingTurn } = await import("@/lib/ai/onboarding");
  const first = await time("onboarding: first answer", () =>
    onboardingTurn([{ role: "user", content: "I'm Mei, I study at CityU." }], async () => {
      throw new Error("the profile was saved after one answer, which is too early");
    }),
  );
  if (first) console.log(`  guide: ${first.reply}`);

  let savedProfile: unknown = null;
  const last = await time("onboarding: enough to save", () =>
    onboardingTurn(
      [
        { role: "user", content: "I'm Mei, I study at CityU." },
        { role: "assistant", content: "Nice to meet you, Mei! What's your major and which year are you in?" },
        { role: "user", content: "Computer Science, year 2." },
        { role: "assistant", content: "Great. Which topics are you into?" },
        { role: "user", content: "Machine learning and startups, and a bit of cybersecurity." },
        { role: "assistant", content: "And what kinds of activity do you want: hackathons, internships, talks?" },
        { role: "user", content: "Hackathons and internships mostly." },
        { role: "assistant", content: "Last one: what skills do you have, and what do you hope to get out of this?" },
        { role: "user", content: "Python and a little React. I want a summer internship and some real projects." },
      ],
      async (profile) => {
        savedProfile = profile;
      },
    ),
  );
  if (last) {
    console.log(`  saved: ${last.saved}`);
    console.log(`  profile: ${JSON.stringify(savedProfile)}`);
    console.log(`  guide: ${last.reply}`);
    if (!last.saved) {
      console.log("  ✗ the profile was not saved even though every question was answered");
      process.exitCode = 1;
    }
  }

  const profile = {
    full_name: "Mei",
    university: "CityU",
    major: "Computer Science",
    year_of_study: "Year 2",
    interests: ["ai", "entrepreneurship", "cybersecurity"],
    skills: ["python", "react"],
    preferred_categories: ["hackathon", "internship"],
    goals: "Get a summer internship and build real projects.",
  };
  const events = [
    { id: "a", title: "HKCERT Capture the Flag Challenge 2026", summary: "Cybersecurity capture-the-flag competition.", category: "hackathon" as const, tags: ["cybersecurity"], eligibility: null },
    { id: "b", title: "M+ Museum Hong Kong Visit", summary: "A group visit to the M+ museum.", category: "meetup" as const, tags: ["arts"], eligibility: null },
    { id: "c", title: "Ricoh: Intern, Cloud and AI Engineering", summary: "An internship in cloud and AI engineering.", category: "internship" as const, tags: ["ai", "software"], eligibility: null },
  ];

  const { explainMatches, draftMotivation } = await import("@/lib/ai/rank");
  const matches = await time("why this fits you", () => explainMatches(profile, events));
  if (matches) {
    for (const match of matches) console.log(`  ${match.id}: ${match.score} — ${match.reason}`);
    const museum = matches.find((m) => m.id === "b");
    const best = Math.max(...matches.filter((m) => m.id !== "b").map((m) => m.score));
    if (matches.length !== 3 || !museum || museum.score >= best) {
      console.log("  ✗ expected three results with the museum visit ranked lowest");
      process.exitCode = 1;
    }
  }

  const draft = await time("drafting an application answer", () =>
    draftMotivation({ ...profile, pitch: null }, { ...events[2], organizer: "Ricoh Asia Pacific" }),
  );
  if (draft) console.log(`  (${draft.split(/\s+/).length} words) ${draft}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
