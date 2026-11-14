/**
 * One place that says which optional services are switched on. The site is
 * built to keep working when a service is missing: without Supabase it shows
 * the curated list read-only, without an AI key every AI feature is hidden.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** Server only. */
export function isAiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Server only. */
export function isInboxConfigured(): boolean {
  return Boolean(process.env.IMAP_USER && process.env.IMAP_PASS);
}

/** Server only. */
export function agentAdminEmails(): string[] {
  return (process.env.AGENT_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const HK_TIME_ZONE = "Asia/Hong_Kong";
