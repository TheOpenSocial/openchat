#!/usr/bin/env node
import { randomUUID, createHash, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";

const { Client } = pg;

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signHs256(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${signingInput}.${signature}`;
}

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  const userRes = await client.query("select id from users limit 1");
  const userId = userRes.rows[0]?.id;
  if (!userId) {
    throw new Error("no users found");
  }

  const threadRes = await client.query(
    "select id from agent_threads where user_id = $1 limit 1",
    [userId],
  );
  let threadId = threadRes.rows[0]?.id;

  if (!threadId) {
    threadId = randomUUID();
    await client.query(
      "insert into agent_threads (id, user_id) values ($1, $2)",
      [threadId, userId],
    );
  }

  const sessionId = randomUUID();
  await client.query(
    "insert into user_sessions (id, user_id, status, refresh_token_hash, expires_at, created_at, updated_at) values ($1, $2, $3, $4, now() + interval '1 day', now(), now())",
    [
      sessionId,
      userId,
      "active",
      createHash("sha256").update(randomUUID()).digest("hex"),
    ],
  );

  const nowSec = Math.floor(Date.now() / 1000);
  const token = signHs256(
    {
      sub: userId,
      sessionId,
      tokenType: "access",
      iat: nowSec,
      exp: nowSec + 60 * 15,
    },
    process.env.JWT_ACCESS_SECRET || "dev-access-secret",
  );

  const child = spawn("node", ["scripts/benchmark-agentic-intents.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      AGENTIC_BENCH_URL:
        process.env.AGENTIC_BENCH_URL || "http://localhost:3000",
      AGENTIC_BENCH_ACCESS_TOKEN: token,
      AGENTIC_BENCH_USER_ID: userId,
      AGENTIC_BENCH_THREAD_ID: threadId,
      AGENTIC_BENCH_RUNS: process.env.AGENTIC_BENCH_RUNS || "3",
    },
  });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  process.exit(code ?? 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
