#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const baseUrl = (
  process.env.PLAYGROUND_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "");
const adminUserId = process.env.PLAYGROUND_ADMIN_USER_ID?.trim() || "";
const adminRole = process.env.PLAYGROUND_ADMIN_ROLE?.trim() || "admin";
const adminApiKey = process.env.PLAYGROUND_ADMIN_API_KEY?.trim() || "";
const rotateProbeToken =
  process.env.PLAYGROUND_BOOTSTRAP_ROTATE_PROBE_TOKEN === "1";

if (!adminUserId) {
  console.error("Missing PLAYGROUND_ADMIN_USER_ID");
  process.exit(1);
}

const headers = {
  "content-type": "application/json",
  "x-admin-user-id": adminUserId,
  "x-admin-role": adminRole,
  ...(adminApiKey ? { "x-admin-api-key": adminApiKey } : {}),
};

async function callJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json();
  if (!response.ok || !payload?.success) {
    throw new Error(
      `request failed ${path}: ${response.status} ${JSON.stringify(payload)}`,
    );
  }
  return payload.data;
}

function extractArtifactPath(output) {
  const lines = output.split("\n");
  for (const rawLine of lines.reverse()) {
    const line = rawLine.trim();
    const match = line.match(/artifact written to (.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
    const matchAlt = line.match(/Artifact written to (.+)$/);
    if (matchAlt?.[1]) {
      return matchAlt[1].trim();
    }
  }
  return null;
}

function maybeReadArtifact(path) {
  if (!path) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {
      path,
      parseError: true,
    };
  }
}

function runCommand(command, args, env) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    shell: process.platform === "win32",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return {
    status: result.status === 0 ? "passed" : "failed",
    latencyMs: Date.now() - startedAt,
    artifactPath: extractArtifactPath(output),
    output,
  };
}

async function ingestVerificationRun(record) {
  await callJson("/api/admin/ops/verification-runs", {
    method: "POST",
    body: JSON.stringify(record),
  });
}

async function main() {
  const bootstrap = await callJson("/api/admin/playground/bootstrap", {
    method: "POST",
    body: JSON.stringify({
      rotateProbeToken,
    }),
  });
  const env = {
    ...process.env,
    ...bootstrap.env,
  };

  const verification = runCommand(
    "pnpm",
    ["test:agentic:suite:verification"],
    env,
  );
  await ingestVerificationRun({
    runId: `ec2-verification-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    lane: "verification",
    layer: "full",
    status: verification.status,
    canaryVerdict: verification.status === "passed" ? "healthy" : "critical",
    summary: {
      source: "playground-ec2-bridge",
      latencyMs: verification.latencyMs,
    },
    artifact: maybeReadArtifact(verification.artifactPath),
  });

  const opsPack = runCommand("pnpm", ["test:backend:ops-pack"], env);
  await ingestVerificationRun({
    runId: `ec2-ops-pack-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    lane: "suite",
    layer: "full",
    status: opsPack.status,
    canaryVerdict: opsPack.status === "passed" ? "healthy" : "critical",
    summary: {
      source: "playground-ec2-bridge",
      command: "test:backend:ops-pack",
      latencyMs: opsPack.latencyMs,
    },
    artifact: maybeReadArtifact(opsPack.artifactPath),
  });

  if (verification.status !== "passed" || opsPack.status !== "passed") {
    process.exit(1);
  }
}

await main();

