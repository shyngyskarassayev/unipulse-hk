/**
 * Checks that the database is reachable and that supabase/schema.sql has been
 * run: every table the site needs must exist and be readable by the server.
 *
 *   npm run check-db
 */
import "./env";
import { requireEnv } from "./env";

const TABLES = [
  "profiles",
  "profile_private",
  "events",
  "saved_events",
  "follows",
  "teams",
  "team_members",
  "matches",
  "agent_runs",
  "agent_seen",
];

async function main() {
  requireEnv(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);

  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let missing = 0;
  for (const table of TABLES) {
    // A real read, not a HEAD request: a HEAD request for a missing table comes
    // back without an error body, which looks exactly like an empty table.
    const { data, count, error } = await admin
      .from(table)
      .select("*", { count: "exact" })
      .limit(1);
    if (error || data === null || count === null) {
      missing += 1;
      console.log(`  ✗ ${table}: ${error?.message || error?.code || "no answer from the database"}`);
    } else {
      console.log(`  ✓ ${table}: ${count} rows`);
    }
  }

  // The public key must be able to read the feed and nothing private.
  const publicEvents = await anon.from("events").select("id").limit(1);
  console.log(
    publicEvents.error
      ? `  ✗ public key cannot read events: ${publicEvents.error.message}`
      : "  ✓ public key can read events",
  );
  // Only meaningful once the tables exist.
  if (missing === 0) {
    const publicPrivate = await anon.from("profile_private").select("user_id").limit(1);
    console.log(
      publicPrivate.error || (publicPrivate.data ?? []).length === 0
        ? "  ✓ public key cannot read private details"
        : "  ✗ public key CAN read private details: the schema's access rules are not applied",
    );
  }

  if (missing > 0) {
    console.log(`\n${missing} of ${TABLES.length} tables are missing. Run supabase/schema.sql in the SQL Editor.`);
    process.exit(1);
  }
  console.log("\nDatabase is ready.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
