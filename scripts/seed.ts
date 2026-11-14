/**
 * Loads the curated starter list (data/seed-events.json) into the database.
 * Safe to run more than once: entries that are already stored are skipped.
 *
 *   npm run seed
 */
import "./env";
import { requireEnv } from "./env";

async function main() {
  requireEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

  // Imported after the environment is loaded, because these read it on import.
  const { seedRows } = await import("@/lib/data/events");
  const { createAdminClient } = await import("@/lib/supabase/server");

  // The database assigns its own id and creation time.
  const rows = seedRows().map((row) => {
    const copy: Partial<typeof row> = { ...row };
    delete copy.id;
    delete copy.created_at;
    return copy;
  });
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("events")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error(`Could not seed: ${error.message}`);
    if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
      console.error("Run supabase/schema.sql in the Supabase SQL Editor first.");
    }
    process.exit(1);
  }

  const added = data?.length ?? 0;
  console.log(`Seed list has ${rows.length} activities: ${added} added, ${rows.length - added} already there.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
