import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Database foundation migrations", () => {
  const migrationPath = resolve(
    process.cwd(),
    "../../prisma/migrations/20260319_personalization_indexing_retention/migration.sql",
  );
  const sql = readFileSync(migrationPath, "utf8");

  it("creates missing core schema tables", () => {
    expect(sql).toContain('CREATE TABLE "user_topics"');
    expect(sql).toContain('CREATE TABLE "user_availability_windows"');
  });

  it("creates missing personalization preference tables", () => {
    expect(sql).toContain('CREATE TABLE "inferred_preferences"');
    expect(sql).toContain('CREATE TABLE "explicit_preferences"');
    expect(sql).toContain('CREATE TABLE "preference_feedback_events"');
  });

  it("adds hot-path partial indexes and ANN retrieval index strategy", () => {
    expect(sql).toContain("intents_active_workload_idx");
    expect(sql).toContain("intent_requests_pending_recipient_expires_idx");
    expect(sql).toContain("embeddings_vector_hnsw_idx");
    expect(sql).toContain("embeddings_vector_ivfflat_idx");
  });

  it("adds retention/archive tables for chat and audit logs", () => {
    expect(sql).toContain('CREATE TABLE "chat_messages_archive"');
    expect(sql).toContain('CREATE TABLE "audit_logs_archive"');
  });
});
