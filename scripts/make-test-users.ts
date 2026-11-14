/**
 * Creates two confirmed test accounts for trying the site locally and writes
 * their sign-in details to .env.test-accounts (ignored by git). No e-mail is
 * sent: the accounts are created through the admin API as already confirmed.
 *
 *   npx tsx scripts/make-test-users.ts
 */
import "./env";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { requireEnv } from "./env";

const FILE = ".env.test-accounts";

async function main() {
  requireEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (existsSync(FILE)) {
    console.log(`${FILE} already exists. Delete it to create new test accounts.`);
    return;
  }

  const { createAdminClient } = await import("@/lib/supabase/server");
  const admin = createAdminClient();

  const accounts = [
    { key: "TEST_STUDENT", email: "unipulse.test.student@my.cityu.edu.hk", name: "Test Student" },
    { key: "TEST_FRIEND", email: "unipulse.test.friend@example.com", name: "Test Friend" },
  ];

  const lines: string[] = ["# Test accounts for local use only. Do not commit."];
  for (const account of accounts) {
    const password = randomBytes(12).toString("base64url");
    const { error } = await admin.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: account.name },
    });
    if (error) {
      console.error(`Could not create ${account.email}: ${error.message}`);
      process.exit(1);
    }
    lines.push(`${account.key}_EMAIL=${account.email}`, `${account.key}_PASSWORD=${password}`);
    console.log(`created ${account.email}`);
  }

  writeFileSync(FILE, `${lines.join("\n")}\n`);
  console.log(`Sign-in details written to ${FILE}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
