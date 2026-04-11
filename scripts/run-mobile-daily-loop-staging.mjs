#!/usr/bin/env node

import { spawn } from "node:child_process";

function getArg(flag, fallback = undefined) {
  const exact = `${flag}=`;
  for (const value of process.argv.slice(2)) {
    if (value.startsWith(exact)) {
      return value.slice(exact.length);
    }
  }
  return fallback;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const scenario = getArg("--scenario", "baseline");
  const worldId = getArg("--world-id", "design-sandbox-v1");

  requireEnv("PLAYGROUND_BASE_URL");
  requireEnv("PLAYGROUND_ADMIN_USER_ID");
  requireEnv("PLAYGROUND_ADMIN_API_KEY");
  requireEnv("EXPO_PUBLIC_E2E_SESSION_B64");

  await run("pnpm", [
    "playground:sandbox",
    "--",
    `--action=scenario`,
    `--world-id=${worldId}`,
    `--scenario=${scenario}`,
  ]);

  await run(
    "pnpm",
    ["-C", "apps/mobile", "test:e2e:maestro:daily-loop"],
    process.env,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
