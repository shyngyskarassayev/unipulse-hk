import { config } from "dotenv";

// Scripts run outside Next.js, so they load the same file Next.js reads.
config({ path: ".env.local", quiet: true });

export function requireEnv(names: string[]): void {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(`Missing in .env.local: ${missing.join(", ")}`);
    console.error("Copy .env.example to .env.local and fill these in first.");
    process.exit(1);
  }
}
