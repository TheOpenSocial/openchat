#!/usr/bin/env node

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

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

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
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
      reject(
        new Error(`${command} ${args.join(" ")} failed with code ${code}`),
      );
    });
    child.on("error", reject);
  });
}

async function scenarioViaGitHubWorkflow(worldId, scenario) {
  await run("gh", [
    "workflow",
    "run",
    "staging-sandbox-world.yml",
    "--repo",
    "TheOpenSocial/openchat",
    "-f",
    "action=scenario",
    "-f",
    `world_id=${worldId}`,
    "-f",
    `scenario=${scenario}`,
  ]);

  const runId = await capture("gh", [
    "run",
    "list",
    "--repo",
    "TheOpenSocial/openchat",
    "--workflow",
    "staging-sandbox-world.yml",
    "--limit",
    "1",
    "--json",
    "databaseId",
    "--jq",
    ".[0].databaseId",
  ]);

  await run("gh", [
    "run",
    "watch",
    runId.trim(),
    "--repo",
    "TheOpenSocial/openchat",
    "--exit-status",
  ]);
}

function capture(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "inherit"],
      env,
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(`${command} ${args.join(" ")} failed with code ${code}`),
      );
    });
    child.on("error", reject);
  });
}

async function main() {
  const scenario = getArg("--scenario", "baseline");
  const worldId = getArg("--world-id", "design-sandbox-v1");
  const simulatorId = requireEnv("MAESTRO_DEVICE_ID");
  const metroUrl = requireEnv("MAESTRO_DEV_CLIENT_URL");
  const appId = process.env.MAESTRO_APP_ID?.trim() || "so.opensocial.app";

  const playgroundBaseUrl = optionalEnv("PLAYGROUND_BASE_URL");
  const playgroundAdminUserId = optionalEnv("PLAYGROUND_ADMIN_USER_ID");
  const playgroundAdminApiKey = optionalEnv("PLAYGROUND_ADMIN_API_KEY");

  if (playgroundBaseUrl && playgroundAdminUserId && playgroundAdminApiKey) {
    await run("pnpm", [
      "playground:sandbox",
      "--",
      "--action=scenario",
      `--world-id=${worldId}`,
      `--scenario=${scenario}`,
    ]);
  } else {
    await scenarioViaGitHubWorkflow(worldId, scenario);
  }

  await run("xcrun", ["simctl", "terminate", simulatorId, appId]).catch(
    () => {},
  );
  await delay(1000);
  await run("xcrun", ["simctl", "openurl", simulatorId, metroUrl]);
  await delay(5000);

  const env = {
    ...process.env,
    MAESTRO_APP_ID: appId,
    PATH: `${process.env.HOME}/.maestro/bin:${process.env.PATH ?? ""}`,
  };
  await run(
    "pnpm",
    ["-C", "apps/mobile", "test:e2e:maestro:daily-loop:native"],
    env,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
