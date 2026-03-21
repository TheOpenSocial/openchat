import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Migration artifacts", () => {
  const root = resolve(process.cwd(), "../..");
  const initMigration = readFileSync(
    resolve(root, "prisma/migrations/20260319_init/migration.sql"),
    "utf8",
  );
  const authSessionsMigration = readFileSync(
    resolve(
      root,
      "prisma/migrations/20260319_auth_sessions_onboarding/migration.sql",
    ),
    "utf8",
  );

  it("bootstraps blank databases with auth-session schema in the init migration", () => {
    expect(initMigration).toContain('"username" TEXT');
    expect(initMigration).toContain('"onboarding_state" TEXT NOT NULL');
    expect(initMigration).toContain('CREATE TABLE "user_sessions"');
    expect(initMigration).toContain(
      'CREATE UNIQUE INDEX "users_username_key" ON "users"("username")',
    );
  });

  it("keeps the follow-up auth-session migration defensive for already-partial databases", () => {
    expect(authSessionsMigration).toContain(
      'ALTER TABLE IF EXISTS "users"\nADD COLUMN IF NOT EXISTS "username" TEXT;',
    );
    expect(authSessionsMigration).toContain(
      "to_regclass('public.user_sessions')",
    );
    expect(authSessionsMigration).toContain(
      'CREATE INDEX IF NOT EXISTS "user_sessions_expires_at_status_idx"',
    );
  });
});
