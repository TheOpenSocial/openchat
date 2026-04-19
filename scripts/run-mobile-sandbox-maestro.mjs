#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_WORLD_ID = "design-sandbox-v1";
const DEFAULT_FLOW = "sandbox-surface";
const DEFAULT_PORT = "8089";
const DEFAULT_APP_ID = "so.opensocial.app";
const DEFAULT_API_BASE_URL = "https://api.opensocial.so";
const ARTIFACT_ROOT = ".artifacts/mobile-sandbox-maestro";
const REPO_CWD = "/Users/cruciblelabs/Documents/openchat";
const REPO_SLUG = "TheOpenSocial/openchat";

function getArg(flag, fallback = undefined) {
  const exact = `${flag}=`;
  for (const value of process.argv.slice(2)) {
    if (value.startsWith(exact)) {
      return value.slice(exact.length);
    }
  }
  return fallback;
}

function requiredArg(flag) {
  const value = getArg(flag);
  if (!value) {
    throw new Error(`Missing required argument ${flag}`);
  }
  return value;
}

function sanitizeSlug(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio ?? "inherit",
      env: options.env ?? process.env,
      cwd: options.cwd ?? process.cwd(),
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

async function attachToSimulatorUrl(simulatorId, url, waitMs = 8_000) {
  await run("xcrun", ["simctl", "openurl", simulatorId, url], {
    cwd: REPO_CWD,
  });
  await delay(waitMs);
}

async function runMaestroWithRetry({
  flowScript,
  appId,
  simulatorId,
  expUrl,
  env,
  attempts = 2,
}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await run("pnpm", ["-C", "apps/mobile", flowScript], {
        cwd: REPO_CWD,
        env,
      });
      return;
    } catch (error) {
      lastError = error;
      const message = String(error?.message ?? error);
      const isXCTestDriverDrop =
        message.includes("Failed to connect to /127.0.0.1:7001") ||
        message.includes("Failed to connect to /127.0.0.1:");
      if (attempt >= attempts || !isXCTestDriverDrop || appId !== "host.exp.Exponent") {
        break;
      }
      await run("xcrun", ["simctl", "terminate", simulatorId, appId], {
        cwd: REPO_CWD,
      }).catch(() => {});
      await delay(1_000);
      await attachToSimulatorUrl(simulatorId, expUrl, 8_000);
    }
  }
  throw lastError;
}

async function retry(label, fn, attempts = 3, delayMs = 2_000) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(`${label} failed on attempt ${attempt}/${attempts}; retrying`);
        await delay(delayMs);
        continue;
      }
    }
  }
  throw lastError;
}

function capture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env ?? process.env,
      cwd: options.cwd ?? process.cwd(),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with code ${code}: ${stderr || stdout}`.trim(),
        ),
      );
    });
    child.on("error", reject);
  });
}

function resolveBaseUrl() {
  const raw =
    getArg("--api-base-url") ||
    process.env.PLAYGROUND_BASE_URL ||
    process.env.SMOKE_BASE_URL ||
    process.env.STAGING_API_BASE_URL ||
    process.env.API_BASE_URL ||
    DEFAULT_API_BASE_URL;
  return String(raw).trim().replace(/\/+$/, "");
}

async function isPortBusy(port) {
  try {
    const raw = await capture("lsof", ["-ti", `tcp:${port}`]);
    return raw.trim().length > 0;
  } catch {
    return false;
  }
}

async function findAvailablePort(startPort, attempts = 12) {
  let candidate = startPort;
  for (let index = 0; index < attempts; index += 1) {
    if (!(await isPortBusy(candidate))) {
      return candidate;
    }
    candidate += 1;
  }
  throw new Error(`Unable to find an available Expo port near ${startPort}`);
}

function localSandboxCredsAvailable() {
  return Boolean(
    (process.env.PLAYGROUND_ADMIN_USER_ID || process.env.SMOKE_ADMIN_USER_ID) &&
      (process.env.PLAYGROUND_ADMIN_API_KEY || process.env.SMOKE_ADMIN_API_KEY),
  );
}

function localSmokeCredsAvailable() {
  return Boolean(
    process.env.SMOKE_ADMIN_USER_ID ||
      (process.env.SMOKE_APPLICATION_KEY && process.env.SMOKE_APPLICATION_TOKEN),
  );
}

async function triggerWorkflowAndWait(workflowFile, fields) {
  const before = Date.now() - 5_000;
  await retry(`dispatch ${workflowFile}`, () =>
    run("gh", ["workflow", "run", workflowFile, "--repo", REPO_SLUG, ...fields]),
  );
  await delay(3_000);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const raw = await retry(`list runs for ${workflowFile}`, () =>
      capture("gh", [
        "run",
        "list",
        "--repo",
        REPO_SLUG,
        "--workflow",
        workflowFile,
        "--limit",
        "6",
        "--json",
        "databaseId,createdAt",
      ]),
    );
    const runs = JSON.parse(raw);
    const match = runs.find((run) => Date.parse(run.createdAt) >= before);
    if (match?.databaseId) {
      const runId = String(match.databaseId);
      await retry(`watch ${workflowFile} ${runId}`, () =>
        run("gh", [
          "run",
          "watch",
          runId,
          "--repo",
          REPO_SLUG,
          "--exit-status",
        ]),
      );
      return runId;
    }
    await delay(2_000);
  }

  throw new Error(`Unable to resolve run id for workflow ${workflowFile}`);
}

async function prepareScenarioViaLocal(baseUrl, worldId, scenario) {
  await run(
    "pnpm",
    [
      "playground:sandbox",
      "--",
      "--action=scenario",
      `--world-id=${worldId}`,
      `--scenario=${scenario}`,
      `--base-url=${baseUrl}`,
    ],
    { cwd: REPO_CWD },
  );
  const inspectRaw = await capture(
    "pnpm",
    [
      "playground:sandbox",
      "--",
      "--action=inspect",
      `--world-id=${worldId}`,
      `--base-url=${baseUrl}`,
    ],
    { cwd: REPO_CWD },
  );
  return JSON.parse(inspectRaw);
}

async function prepareScenarioViaGitHub(worldId, scenario, artifactDir) {
  await triggerWorkflowAndWait("staging-sandbox-world.yml", [
    "-f",
    "action=scenario",
    "-f",
    `world_id=${worldId}`,
    "-f",
    `scenario=${scenario}`,
  ]);
  const inspectRunId = await triggerWorkflowAndWait("staging-sandbox-world.yml", [
    "-f",
    "action=inspect",
    "-f",
    `world_id=${worldId}`,
  ]);
  const inspectDir = join(artifactDir, "sandbox-inspect");
  mkdirSync(inspectDir, { recursive: true });
  await retry(`download sandbox inspect ${inspectRunId}`, () =>
    run("gh", [
      "run",
      "download",
      inspectRunId,
      "--repo",
      REPO_SLUG,
      "-n",
      "staging-sandbox-world-output",
      "-D",
      inspectDir,
    ]),
  );
  return JSON.parse(readFileSync(join(inspectDir, "sandbox-world-output.json"), "utf8"));
}

async function emitSessionLocally(baseUrl) {
  const env = {
    ...process.env,
    SMOKE_BASE_URL: process.env.SMOKE_BASE_URL?.trim() || baseUrl,
  };
  await run("node", ["scripts/bootstrap-smoke-session.mjs"], {
    cwd: REPO_CWD,
    env,
  });
  await run("node", ["scripts/refresh-smoke-session.mjs"], {
    cwd: REPO_CWD,
    env: { ...env, SMOKE_REFRESH_REQUIRED: "1" },
  });
  const sessionRaw = await capture("node", ["scripts/emit-mobile-e2e-session.mjs"], {
    cwd: REPO_CWD,
    env,
  });
  return JSON.parse(sessionRaw);
}

async function emitSessionViaGitHub(targetUserId, artifactDir) {
  const fields = [];
  if (targetUserId) {
    fields.push("-f", `smoke_user_id=${targetUserId}`);
  }
  const runId = await triggerWorkflowAndWait("staging-mobile-e2e-session.yml", fields);
  const sessionDir = join(artifactDir, "session");
  mkdirSync(sessionDir, { recursive: true });
  await retry(`download mobile session ${runId}`, () =>
    run("gh", [
      "run",
      "download",
      runId,
      "--repo",
      REPO_SLUG,
      "-n",
      `staging-mobile-e2e-session-${runId}`,
      "-D",
      sessionDir,
    ]),
  );
  return JSON.parse(readFileSync(join(sessionDir, "mobile-e2e-session.json"), "utf8"));
}

function toHttpDevServerUrl(url) {
  if (!url) {
    return null;
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  if (/^exp:\/\//i.test(url)) {
    return url.replace(/^exp:\/\//i, "http://");
  }
  return null;
}

function toExpoUrl(httpUrl) {
  if (!httpUrl) {
    return null;
  }
  const normalized = httpUrl
    .replace(/^http:\/\//i, "exp://")
    .replace(/^https:\/\//i, "exp://");
  return normalized.replace(/^exp:\/\/localhost(?=[:/]|$)/i, "exp://127.0.0.1");
}

function toNativeDevClientUrl(httpUrl) {
  if (!httpUrl) {
    return null;
  }
  return `opensocial://expo-development-client/?url=${encodeURIComponent(httpUrl)}`;
}

async function startExpoMetro({ encodedSession, baseUrl, port, artifactDir, appId }) {
  const env = {
    ...process.env,
    EXPO_PUBLIC_ENABLE_E2E_AUTH_BYPASS: "1",
    EXPO_PUBLIC_E2E_SESSION_B64: encodedSession,
    EXPO_PUBLIC_API_BASE_URL: baseUrl,
    EXPO_NO_TELEMETRY: "1",
    CI: "1",
  };

  const logPath = join(artifactDir, "expo.log");
  const useExpoGo = appId === "host.exp.Exponent";
  const useNativeDevClient = !useExpoGo && process.env.MAESTRO_NATIVE_DEV_CLIENT !== "0";

  if (useNativeDevClient) {
    await run("pnpm", ["--filter", "@opensocial/mobile", "predev"], {
      cwd: REPO_CWD,
      env,
    });
  }

  const startArgs =
    useExpoGo
      ? [
          "--filter",
          "@opensocial/mobile",
          "dev",
          "--",
          "--clear",
          "--go",
          "--lan",
          "--port",
          String(port),
        ]
      : !useNativeDevClient
        ? ["--filter", "@opensocial/mobile", "dev", "--", "--clear", "--port", String(port)]
      : [
          "--filter",
          "@opensocial/mobile",
          "exec",
          "expo",
          "start",
          "--clear",
          "--dev-client",
          "--port",
          String(port),
        ];

  const child = spawn("pnpm", startArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    env,
    cwd: REPO_CWD,
  });

  let combined = "";
  const urls = await new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for Expo dev URL"));
    }, 120_000);

    const onData = (chunk) => {
      const text = chunk.toString();
      combined += text;
      writeFileSync(logPath, combined, "utf8");
      const expMatch = combined.match(/exp:\/\/[^\s"'`]+/);
      const httpMatch = combined.match(/Waiting on (https?:\/\/[^\s"'`]+)/);
      const httpUrl = httpMatch?.[1] ?? toHttpDevServerUrl(expMatch?.[0]);
      const expUrl = expMatch?.[0] ?? toExpoUrl(httpUrl);
      const nativeDevClientUrl = toNativeDevClientUrl(httpUrl);
      if ((httpUrl || expUrl) && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          httpUrl,
          expUrl,
          nativeDevClientUrl,
        });
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(`Expo dev server exited before URL was ready (code ${code})`));
      }
    });
    child.on("error", (error) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  });

  return { child, ...urls };
}

async function resolveBootedSimulatorId() {
  const raw = await capture("xcrun", ["simctl", "list", "devices", "booted", "-j"]);
  const payload = JSON.parse(raw);
  const runtimes = Object.values(payload.devices ?? {});
  for (const entries of runtimes) {
    if (!Array.isArray(entries)) {
      continue;
    }
    const booted = entries.find((device) => device.state === "Booted");
    if (booted?.udid) {
      return String(booted.udid);
    }
  }
  throw new Error("Unable to find a booted iOS simulator for Maestro");
}

function expectedActivitySectionTitle(inspectPayload) {
  return (
    process.env.MAESTRO_EXPECTED_ACTIVITY_SECTION_TITLE ||
    inspectPayload?.experience?.activity?.orderedSections?.[0]?.mobileTitle ||
    "What needs your attention"
  );
}

async function main() {
  const scenario = getArg("--scenario", "baseline");
  const worldId = getArg("--world-id", DEFAULT_WORLD_ID);
  const flow = getArg("--flow", DEFAULT_FLOW);
  const requestedPort = Number.parseInt(getArg("--port", DEFAULT_PORT), 10) || 8089;
  const appId = getArg("--app-id", DEFAULT_APP_ID);
  const baseUrl = resolveBaseUrl();
  const activityTargetId = getArg("--activity-target-id");
  const activityTargetScreenId = getArg("--activity-target-screen-id");
  const activityTargetCloseId = getArg("--activity-target-close-id");

  const artifactDir = join(
    REPO_CWD,
    ARTIFACT_ROOT,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${sanitizeSlug(scenario)}-${sanitizeSlug(flow)}`,
  );
  mkdirSync(artifactDir, { recursive: true });

  const inspectPayload = localSandboxCredsAvailable()
    ? await prepareScenarioViaLocal(baseUrl, worldId, scenario)
    : await prepareScenarioViaGitHub(worldId, scenario, artifactDir);

  const targetUserId =
    inspectPayload?.world?.focalUserId ??
    inspectPayload?.focalUserId ??
    process.env.SMOKE_TARGET_USER_ID ??
    "";

  const sessionPayload = localSmokeCredsAvailable()
    ? await emitSessionLocally(baseUrl)
    : await emitSessionViaGitHub(targetUserId, artifactDir);

  writeFileSync(
    join(artifactDir, "scenario-inspect.json"),
    JSON.stringify(inspectPayload, null, 2),
    "utf8",
  );
  writeFileSync(
    join(artifactDir, "mobile-session.json"),
    JSON.stringify(sessionPayload, null, 2),
    "utf8",
  );

  const expectedHomeStatusTitle =
    inspectPayload?.experience?.home?.status?.title ?? "Live";
  const expectedActivityTitle = expectedActivitySectionTitle(inspectPayload);
  const port = await findAvailablePort(requestedPort);

  const { child: metroChild, expUrl, httpUrl, nativeDevClientUrl } = await startExpoMetro({
    encodedSession: sessionPayload.encodedSession,
    baseUrl,
    port,
    artifactDir,
    appId,
  });
  const simulatorId = await resolveBootedSimulatorId();

  const cleanup = () => {
    if (!metroChild.killed) {
      metroChild.kill("SIGTERM");
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    const flowScript =
      flow === "sandbox-surface"
        ? appId === "host.exp.Exponent"
          ? "test:e2e:maestro:sandbox-surface:expo-go:attached"
          : "test:e2e:maestro:sandbox-surface"
        : flow === "home-activity"
          ? "test:e2e:maestro:sandbox-home-activity:expo-go:attached"
          : flow === "activity-target"
            ? "test:e2e:maestro:sandbox-activity-target:expo-go:attached"
        : flow === "surface-smoke"
          ? "test:e2e:maestro:surface-smoke"
          : flow === "route-graph"
            ? "test:e2e:maestro:route-graph"
            : flow === "daily-loop"
              ? "test:e2e:maestro:daily-loop:native"
              : null;

    if (!flowScript) {
      throw new Error(`Unsupported flow ${flow}`);
    }

    if (flow === "activity-target") {
      requiredArg("--activity-target-id");
      requiredArg("--activity-target-screen-id");
      requiredArg("--activity-target-close-id");
    }

    if (appId === "so.opensocial.app") {
      await run("xcrun", ["simctl", "terminate", simulatorId, appId], {
        cwd: REPO_CWD,
      }).catch(() => {});
      await delay(1_000);
      const attachUrl = nativeDevClientUrl ?? expUrl;
      await run("xcrun", ["simctl", "openurl", simulatorId, attachUrl], {
        cwd: REPO_CWD,
      });
      await delay(5_000);
    } else if (appId === "host.exp.Exponent") {
      await run("xcrun", ["simctl", "terminate", simulatorId, appId], {
        cwd: REPO_CWD,
      }).catch(() => {});
      await delay(1_000);
      await attachToSimulatorUrl(simulatorId, expUrl, 8_000);
    }

    await runMaestroWithRetry({
      flowScript,
      appId,
      simulatorId,
      expUrl,
      env: {
        ...process.env,
        MAESTRO_APP_ID: appId,
        MAESTRO_EXPO_URL: expUrl,
        MAESTRO_EXPECTED_HOME_STATUS_TITLE: expectedHomeStatusTitle,
        MAESTRO_EXPECTED_ACTIVITY_SECTION_TITLE: expectedActivityTitle,
        MAESTRO_ACTIVITY_TARGET_ID: activityTargetId,
        MAESTRO_ACTIVITY_TARGET_SCREEN_ID: activityTargetScreenId,
        MAESTRO_ACTIVITY_TARGET_CLOSE_ID: activityTargetCloseId,
        PATH: `${process.env.HOME}/.maestro/bin:${process.env.PATH ?? ""}`,
      },
    });
  } finally {
    cleanup();
    await delay(1_500);
  }

  writeFileSync(
    join(artifactDir, "summary.json"),
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        worldId,
        scenario,
        flow,
        appId,
        expUrl,
        httpUrl,
        nativeDevClientUrl,
        expectedHomeStatusTitle,
        expectedActivitySectionTitle: expectedActivityTitle,
        activityTargetId,
        activityTargetScreenId,
        activityTargetCloseId,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactDir,
        worldId,
        scenario,
        flow,
        expectedHomeStatusTitle,
        expectedActivitySectionTitle: expectedActivityTitle,
        activityTargetId,
        activityTargetScreenId,
        activityTargetCloseId,
      },
      null,
      2,
    ),
  );
}

await main();
