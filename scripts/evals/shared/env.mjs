function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

export function readEnv(env, ...keys) {
  for (const key of keys) {
    const value = env?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

export function readWithStagingProdFallback(env, primary, ...fallbacks) {
  const stageEqualsProd = env?.STAGING_EQUALS_PROD === "true";
  if (!stageEqualsProd) {
    return readEnv(env, primary, ...fallbacks);
  }

  const expanded = [];
  for (const key of [primary, ...fallbacks]) {
    if (key.startsWith("STAGING_")) {
      expanded.push(key.replace(/^STAGING_/, "PROD_"));
      expanded.push(key.replace(/^STAGING_/, "PRODUCTION_"));
    }
    expanded.push(key);
  }
  return readEnv(env, ...expanded);
}

export function resolveSharedAdminEnv(env = {}) {
  return {
    baseUrl: normalizeString(
      readWithStagingProdFallback(
        env,
        "EVAL_BASE_URL",
        "SMOKE_BASE_URL",
        "STAGING_API_BASE_URL",
        "PROD_API_BASE_URL",
        "PRODUCTION_API_BASE_URL",
        "API_BASE_URL",
      ),
      "http://localhost:3001",
    ).replace(/\/+$/, ""),
    adminUserId: normalizeString(
      readWithStagingProdFallback(
        env,
        "EVAL_ADMIN_USER_ID",
        "SMOKE_ADMIN_USER_ID",
        "STAGING_SMOKE_ADMIN_USER_ID",
        "PROD_SMOKE_ADMIN_USER_ID",
        "PRODUCTION_SMOKE_ADMIN_USER_ID",
      ),
      "11111111-1111-4111-8111-111111111111",
    ),
    adminRole: normalizeString(
      readWithStagingProdFallback(
        env,
        "EVAL_ADMIN_ROLE",
        "SMOKE_ADMIN_ROLE",
        "STAGING_SMOKE_ADMIN_ROLE",
        "PROD_SMOKE_ADMIN_ROLE",
        "PRODUCTION_SMOKE_ADMIN_ROLE",
      ),
      "support",
    ),
    adminApiKey: normalizeString(
      readWithStagingProdFallback(
        env,
        "EVAL_ADMIN_API_KEY",
        "SMOKE_ADMIN_API_KEY",
        "STAGING_SMOKE_ADMIN_API_KEY",
        "PROD_SMOKE_ADMIN_API_KEY",
        "PRODUCTION_SMOKE_ADMIN_API_KEY",
      ),
      "",
    ),
    accessToken: normalizeString(
      readWithStagingProdFallback(
        env,
        "EVAL_ACCESS_TOKEN",
        "SMOKE_ACCESS_TOKEN",
        "STAGING_SMOKE_ACCESS_TOKEN",
        "PROD_SMOKE_ACCESS_TOKEN",
        "PRODUCTION_SMOKE_ACCESS_TOKEN",
      ),
      "",
    ),
    hostHeader: normalizeString(
      readWithStagingProdFallback(
        env,
        "EVAL_HOST_HEADER",
        "SMOKE_HOST_HEADER",
        "STAGING_SMOKE_HOST_HEADER",
        "PROD_SMOKE_HOST_HEADER",
        "PRODUCTION_SMOKE_HOST_HEADER",
      ),
      "",
    ),
  };
}
