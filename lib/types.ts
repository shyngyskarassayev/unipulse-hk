export const CATEGORIES = [
  "hackathon",
  "seminar",
  "training",
  "meetup",
  "volunteering",
  "internship",
  "helper",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  hackathon: "Hackathon",
  seminar: "Seminar",
  training: "Training",
  meetup: "Meetup",
  volunteering: "Volunteering",
  internship: "Internship",
  helper: "Student helper",
};

export const MODES = ["in_person", "online", "hybrid"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABELS: Record<Mode, string> = {
  in_person: "In person",
  online: "Online",
  hybrid: "Hybrid",
};

export const SOURCE_TYPES = [
  "seed",
  "web",
  "site",
  "email",
  "telegram",
  "manual",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_LABELS: Record<SourceType, string> = {
  seed: "Curated",
  web: "Found by the agent",
  site: "Source website",
  email: "From e-mail",
  telegram: "From Telegram",
  manual: "Added by a student",
};

/**
 * Topic vocabulary shared by event tags and profile interests, so the two can
 * be compared directly when ranking the feed.
 */
export const TOPICS = [
  "ai",
  "data",
  "software",
  "cybersecurity",
  "fintech",
  "finance",
  "business",
  "entrepreneurship",
  "marketing",
  "design",
  "engineering",
  "robotics",
  "sustainability",
  "social-impact",
  "healthcare",
  "education",
  "research",
  "media",
  "arts",
  "law",
  "languages",
  "sports",
  "gaming",
  "career",
] as const;

export type Topic = (typeof TOPICS)[number];

/** An event before it has been stored: what every source produces. */
export interface EventDraft {
  title: string;
  category: Category;
  summary: string;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  deadline_at: string | null;
  location: string | null;
  mode: Mode | null;
  organizer: string | null;
  url: string | null;
  apply_url: string | null;
  eligibility: string | null;
  tags: string[];
}

export interface EventRow extends EventDraft {
  id: string;
  dedupe_key: string;
  source_type: SourceType;
  source_ref: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  university: string | null;
  major: string | null;
  year_of_study: string | null;
  interests: string[];
  skills: string[];
  preferred_categories: string[];
  goals: string | null;
  verified: boolean;
  onboarded: boolean;
}

export interface ProfilePrivate {
  user_id: string;
  phone: string | null;
  student_id: string | null;
  linkedin: string | null;
  github: string | null;
  pitch: string | null;
}

export type SavedStatus = "saved" | "going" | "applied";

export interface AgentRun {
  id: string;
  step: string;
  status: "running" | "ok" | "error" | "skipped";
  started_at: string;
  finished_at: string | null;
  found: number;
  added: number;
  log: string;
}
