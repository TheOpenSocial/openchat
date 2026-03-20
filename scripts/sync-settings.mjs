#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const settingsPath = path.join(repoRoot, "settings.json");

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--env" && argv[i + 1]) {
      parsed.env = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}

function normalizeOrigin(input, keyName) {
  let origin;
  try {
    const url = new URL(input);
    origin = `${url.protocol}//${url.host}`;
  } catch {
    throw new Error(`Invalid URL in settings for ${keyName}: ${input}`);
  }
  return origin.replace(/\/+$/, "");
}

function normalizePath(input) {
  if (!input || input === "/") {
    return "/api";
  }
  return input.startsWith("/") ? input.replace(/\/+$/, "") : `/${input}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function writeFile(targetPath, content) {
  writeFileSync(targetPath, `${content.trimEnd()}\n`, "utf8");
}

const cli = parseArgs(process.argv.slice(2));
const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
const envName = cli.env ?? settings.defaultEnvironment ?? "production";
const envConfig = settings.environments?.[envName];

if (!envConfig) {
  throw new Error(`settings.json missing environments.${envName}`);
}

const apiOrigin = normalizeOrigin(envConfig.domains?.apiOrigin, `${envName}.domains.apiOrigin`);
const adminOrigin = normalizeOrigin(
  envConfig.domains?.adminOrigin,
  `${envName}.domains.adminOrigin`,
);
const appOrigin = normalizeOrigin(envConfig.domains?.appOrigin, `${envName}.domains.appOrigin`);
const apiBasePath = normalizePath(envConfig.apiBasePath);
const apiBaseUrl = `${apiOrigin}${apiBasePath}`;
const googleRedirectUri = `${apiBaseUrl}/auth/google/callback`;
const adminDashboardCallbackUri =
  envConfig.oauth?.google?.adminDashboardCallbackUri ??
  `${adminOrigin}/auth/callback`;

const googleOrigins = unique([
  appOrigin,
  adminOrigin,
  apiOrigin,
  ...(envConfig.oauth?.google?.extraAuthorizedJavaScriptOrigins ?? []),
]);

const googleRedirectUris = unique([
  googleRedirectUri,
  ...(envConfig.oauth?.google?.extraAuthorizedRedirectUris ?? []),
]);

const header = `# Auto-generated from settings.json (${envName}) via: pnpm settings:sync`;
const webEnvPath = path.join(repoRoot, "apps", "web", ".env.local");
const adminEnvPath = path.join(repoRoot, "apps", "admin", ".env.local");
const generatedDir = path.join(repoRoot, "settings.generated");
const oauthJsonPath = path.join(generatedDir, `${envName}.google-oauth.json`);
const serverEnvPath = path.join(generatedDir, `${envName}.server.env`);

writeFile(
  webEnvPath,
  `${header}
NEXT_PUBLIC_API_BASE_URL=${apiBaseUrl}`,
);

writeFile(
  adminEnvPath,
  `${header}
NEXT_PUBLIC_API_BASE_URL=${apiBaseUrl}`,
);

mkdirSync(generatedDir, { recursive: true });
writeFile(
  oauthJsonPath,
  JSON.stringify(
    {
      environment: envName,
      authorizedJavaScriptOrigins: googleOrigins,
      authorizedRedirectUris: googleRedirectUris,
    },
    null,
    2,
  ),
);

writeFile(
  serverEnvPath,
  `${header}
NEXT_PUBLIC_API_BASE_URL=${apiBaseUrl}
GOOGLE_REDIRECT_URI=${googleRedirectUri}
ADMIN_DASHBOARD_REDIRECT_URIS=${adminDashboardCallbackUri}`,
);

console.log(`Synced settings for environment: ${envName}`);
console.log(`- ${path.relative(repoRoot, webEnvPath)}`);
console.log(`- ${path.relative(repoRoot, adminEnvPath)}`);
console.log(`- ${path.relative(repoRoot, oauthJsonPath)}`);
console.log(`- ${path.relative(repoRoot, serverEnvPath)}`);
