import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { HK_UNIVERSITIES } from "@/lib/hk-universities";

/**
 * Runs supabase/schema.sql against a real Postgres (in-process) with a small
 * stand-in for the parts Supabase provides: the auth schema and its roles.
 * This checks the access rules, which are the only thing between one
 * student's private details and another student.
 */
const SUPABASE_STANDIN = `
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema auth to anon, authenticated;
`;

const schema = readFileSync("supabase/schema.sql", "utf8");

let db: PGlite;
let alice: string;
let bob: string;
let eventId: string;

/** Runs statements the way a signed-in student's request would. */
async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec("set role authenticated");
  try {
    return await run();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function asAnon<T>(run: () => Promise<T>): Promise<T> {
  await db.exec("set role anon");
  try {
    return await run();
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STANDIN);
  await db.exec(schema);

  const users = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values
       ('alice@my.cityu.edu.hk', '{"full_name": "Alice Chan"}'),
       ('bob@gmail.com', '{}')
     returning id`,
  );
  [alice, bob] = users.rows.map((row) => row.id);

  const event = await db.query<{ id: string }>(
    `insert into public.events (dedupe_key, title, category, source_type)
     values ('demo-hack--2026-12-01', 'Demo Hack', 'hackathon', 'seed') returning id`,
  );
  eventId = event.rows[0].id;
}, 60_000);

describe("schema.sql", () => {
  it("can be run a second time without errors", async () => {
    await expect(db.exec(schema)).resolves.toBeDefined();
  });

  it("rejects an event with an unknown category or source", async () => {
    await expect(
      db.query(
        "insert into public.events (dedupe_key, title, category, source_type) values ('x', 'X', 'party', 'seed')",
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(
        "insert into public.events (dedupe_key, title, category, source_type) values ('y', 'Y', 'seminar', 'rumour')",
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("refuses a second event with the same dedupe key", async () => {
    await expect(
      db.query(
        "insert into public.events (dedupe_key, title, category, source_type) values ('demo-hack--2026-12-01', 'Copy', 'hackathon', 'web')",
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("sign-up", () => {
  it("creates the public and private profile rows", async () => {
    const profiles = await db.query<{ full_name: string; verified: boolean; onboarded: boolean }>(
      "select full_name, verified, onboarded from public.profiles where id = $1",
      [alice],
    );
    expect(profiles.rows).toEqual([{ full_name: "Alice Chan", verified: true, onboarded: false }]);

    const priv = await db.query("select 1 from public.profile_private where user_id = $1", [alice]);
    expect(priv.rows).toHaveLength(1);
  });

  it("verifies only Hong Kong university addresses", async () => {
    const bobProfile = await db.query<{ verified: boolean }>(
      "select verified from public.profiles where id = $1",
      [bob],
    );
    expect(bobProfile.rows[0].verified).toBe(false);
  });

  it("agrees with the university list used by the site", async () => {
    for (const university of HK_UNIVERSITIES) {
      for (const domain of university.domains) {
        const result = await db.query<{ ok: boolean }>(
          "select public.is_hk_uni_email($1) as ok, public.is_hk_uni_email($2) as sub",
          [`student@${domain}`, `student@mail.${domain}`],
        );
        expect(result.rows[0], domain).toEqual({ ok: true, sub: true });
      }
    }
  });

  it("is not fooled by look-alike domains", async () => {
    const result = await db.query<{ a: boolean; b: boolean; c: boolean }>(
      `select public.is_hk_uni_email('x@fakehku.hk') as a,
              public.is_hk_uni_email('x@hku.hk.evil.com') as b,
              public.is_hk_uni_email('x@gmail.com') as c`,
    );
    expect(result.rows[0]).toEqual({ a: false, b: false, c: false });
  });
});

describe("profiles", () => {
  it("lets a student edit their own profile", async () => {
    const updated = await asUser(alice, () =>
      db.query("update public.profiles set major = 'Computer Science', onboarded = true where id = $1", [alice]),
    );
    expect(updated.affectedRows).toBe(1);
  });

  it("does not let a student give themselves the verified badge", async () => {
    await expect(
      asUser(bob, () => db.query("update public.profiles set verified = true where id = $1", [bob])),
    ).rejects.toThrow(/permission denied/);
  });

  it("does not let a student edit someone else's profile", async () => {
    const updated = await asUser(bob, () =>
      db.query("update public.profiles set full_name = 'Hacked' where id = $1", [alice]),
    );
    expect(updated.affectedRows).toBe(0);
  });

  it("hides profiles from visitors who are not signed in", async () => {
    await expect(asAnon(() => db.query("select * from public.profiles"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("shows private details to their owner only", async () => {
    await asUser(alice, () =>
      db.query("update public.profile_private set phone = '9123 4567' where user_id = $1", [alice]),
    );

    const own = await asUser(alice, () => db.query("select phone from public.profile_private"));
    expect(own.rows).toEqual([{ phone: "9123 4567" }]);

    const others = await asUser(bob, () =>
      db.query("select phone from public.profile_private where user_id = $1", [alice]),
    );
    expect(others.rows).toEqual([]);

    const tampered = await asUser(bob, () =>
      db.query("update public.profile_private set phone = '0' where user_id = $1", [alice]),
    );
    expect(tampered.affectedRows).toBe(0);
  });
});

describe("events", () => {
  it("can be read by anyone", async () => {
    const result = await asAnon(() => db.query("select title from public.events"));
    expect(result.rows).toEqual([{ title: "Demo Hack" }]);
  });

  it("cannot be written by students directly", async () => {
    await expect(
      asUser(alice, () =>
        db.query(
          "insert into public.events (dedupe_key, title, category, source_type) values ('z', 'Z', 'seminar', 'manual')",
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(alice, () => db.query("delete from public.events where id = $1", [eventId])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("saved events", () => {
  it("keeps 'saved' and 'applied' private but shows 'going' to others", async () => {
    await asUser(alice, () =>
      db.query("insert into public.saved_events (user_id, event_id, status) values ($1, $2, 'saved')", [
        alice,
        eventId,
      ]),
    );
    await asUser(bob, () =>
      db.query("insert into public.saved_events (user_id, event_id, status) values ($1, $2, 'going')", [
        bob,
        eventId,
      ]),
    );

    const seenByAlice = await asUser(alice, () =>
      db.query<{ status: string }>("select status from public.saved_events order by status"),
    );
    expect(seenByAlice.rows.map((r) => r.status)).toEqual(["going", "saved"]);

    const seenByBob = await asUser(bob, () =>
      db.query<{ status: string }>("select status from public.saved_events"),
    );
    expect(seenByBob.rows.map((r) => r.status)).toEqual(["going"]);
  });

  it("does not let a student save on someone else's behalf", async () => {
    await db.query("delete from public.saved_events where user_id = $1", [alice]);
    await expect(
      asUser(bob, () =>
        db.query("insert into public.saved_events (user_id, event_id, status) values ($1, $2, 'going')", [
          alice,
          eventId,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("follows", () => {
  it("lets a student follow and unfollow as themselves only", async () => {
    await asUser(alice, () =>
      db.query("insert into public.follows (follower_id, following_id) values ($1, $2)", [alice, bob]),
    );
    await expect(
      asUser(alice, () =>
        db.query("insert into public.follows (follower_id, following_id) values ($1, $2)", [bob, alice]),
      ),
    ).rejects.toThrow(/row-level security/);

    const removedByBob = await asUser(bob, () =>
      db.query("delete from public.follows where follower_id = $1", [alice]),
    );
    expect(removedByBob.affectedRows).toBe(0);
  });

  it("does not allow following yourself", async () => {
    await expect(
      asUser(alice, () =>
        db.query("insert into public.follows (follower_id, following_id) values ($1, $1)", [alice]),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("teams", () => {
  it("lets anyone join, but only the owner delete", async () => {
    const team = await asUser(alice, () =>
      db.query<{ id: string }>(
        "insert into public.teams (event_id, name, owner_id) values ($1, 'Night Owls', $2) returning id",
        [eventId, alice],
      ),
    );
    const teamId = team.rows[0].id;

    await asUser(bob, () =>
      db.query("insert into public.team_members (team_id, user_id) values ($1, $2)", [teamId, bob]),
    );

    const deletedByBob = await asUser(bob, () => db.query("delete from public.teams where id = $1", [teamId]));
    expect(deletedByBob.affectedRows).toBe(0);

    const deletedByAlice = await asUser(alice, () =>
      db.query("delete from public.teams where id = $1", [teamId]),
    );
    expect(deletedByAlice.affectedRows).toBe(1);

    // Memberships go with the team.
    const left = await db.query("select 1 from public.team_members where team_id = $1", [teamId]);
    expect(left.rows).toHaveLength(0);
  });

  it("does not let a student create a team owned by someone else", async () => {
    await expect(
      asUser(bob, () =>
        db.query("insert into public.teams (event_id, name, owner_id) values ($1, 'Fake', $2)", [eventId, alice]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("server-only data", () => {
  it("shows a student only their own matches and never lets them write any", async () => {
    await db.query(
      "insert into public.matches (user_id, event_id, score, reason) values ($1, $2, 90, 'for alice')",
      [alice, eventId],
    );
    const seenByBob = await asUser(bob, () => db.query("select reason from public.matches"));
    expect(seenByBob.rows).toEqual([]);
    const seenByAlice = await asUser(alice, () => db.query("select reason from public.matches"));
    expect(seenByAlice.rows).toEqual([{ reason: "for alice" }]);

    await expect(
      asUser(bob, () =>
        db.query("insert into public.matches (user_id, event_id, score) values ($1, $2, 100)", [bob, eventId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("keeps the agent's bookkeeping away from students", async () => {
    await expect(asUser(alice, () => db.query("select * from public.agent_seen"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asUser(alice, () => db.query("insert into public.agent_runs (step) values ('search')")),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets everyone read the agent's activity log", async () => {
    await db.query("insert into public.agent_runs (step, status) values ('sources', 'ok')");
    const result = await asAnon(() => db.query<{ step: string }>("select step from public.agent_runs"));
    expect(result.rows).toEqual([{ step: "sources" }]);
  });
});
