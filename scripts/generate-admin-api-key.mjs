#!/usr/bin/env node

import { randomBytes } from "node:crypto";

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    bytes: Number.parseInt(
      normalizeString(flags.get("bytes") ?? env.ADMIN_API_KEY_BYTES, "32"),
      10,
    ),
    format: normalizeString(
      flags.get("format") ?? env.ADMIN_API_KEY_FORMAT,
      "shell",
    ),
  };
}

export function generateAdminApiKey(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function renderAdminApiKeyOutput(key, format = "shell") {
  if (format === "json") {
    return JSON.stringify(
      {
        ADMIN_API_KEY: key,
        rotationTargets: [
          "staging runtime ADMIN_API_KEY",
          "production runtime ADMIN_API_KEY",
          "GitHub secret STAGING_SMOKE_ADMIN_API_KEY",
          "GitHub secret SMOKE_ADMIN_API_KEY",
        ],
      },
      null,
      2,
    );
  }

  return [
    `ADMIN_API_KEY=${key}`,
    "",
    "# Apply this same value to:",
    "# - staging runtime ADMIN_API_KEY",
    "# - production runtime ADMIN_API_KEY",
    "# - GitHub secret STAGING_SMOKE_ADMIN_API_KEY",
    "# - GitHub secret SMOKE_ADMIN_API_KEY",
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = parseArgs();
  const key = generateAdminApiKey(
    Number.isFinite(config.bytes) ? config.bytes : 32,
  );
  console.log(renderAdminApiKeyOutput(key, config.format));
}
