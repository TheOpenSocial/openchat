interface SecurityPostureChecks {
  databaseTlsConfigured: boolean;
  redisTlsConfigured: boolean;
  objectStorageTlsConfigured: boolean;
  mediaCdnTlsConfigured: boolean;
  declaredDatabaseEncryptionAtRest: boolean;
  declaredObjectStorageEncryptionAtRest: boolean;
  jwtSecretsRotationConfigured: boolean;
  adminDashboardAuthCompatible: boolean;
}

interface SecurityPostureResult {
  generatedAt: string;
  strictMode: boolean;
  strictStartupEnforcement: boolean;
  status: "healthy" | "watch" | "critical";
  environment: string;
  checks: SecurityPostureChecks;
  violations: string[];
}

function parseBooleanFlag(value: string | undefined) {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function urlUsesHttps(urlValue: string | undefined) {
  if (!urlValue) {
    return false;
  }
  return urlValue.trim().toLowerCase().startsWith("https://");
}

function databaseUrlHasTls(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    return false;
  }
  const normalized = databaseUrl.toLowerCase();
  return (
    normalized.includes("sslmode=require") ||
    normalized.includes("ssl=true") ||
    normalized.includes("sslaccept=strict")
  );
}

function redisUrlHasTls(redisUrl: string | undefined) {
  if (!redisUrl) {
    return false;
  }
  return redisUrl.trim().toLowerCase().startsWith("rediss://");
}

function hasJwtRotationConfiguration() {
  const accessSecrets = process.env.JWT_ACCESS_SECRETS?.trim();
  const refreshSecrets = process.env.JWT_REFRESH_SECRETS?.trim();
  return Boolean(
    accessSecrets &&
    refreshSecrets &&
    accessSecrets.includes(",") &&
    refreshSecrets.includes(","),
  );
}

function isAdminDashboardAuthCompatible() {
  const adminApiKey = process.env.ADMIN_API_KEY?.trim();
  const adminDashboardRedirectUris =
    process.env.ADMIN_DASHBOARD_REDIRECT_URIS?.trim();
  if (!adminApiKey) {
    return true;
  }
  return !adminDashboardRedirectUris;
}

export function evaluateSecurityPosture(): SecurityPostureResult {
  const checks: SecurityPostureChecks = {
    databaseTlsConfigured: databaseUrlHasTls(process.env.DATABASE_URL),
    redisTlsConfigured:
      redisUrlHasTls(process.env.REDIS_URL) ||
      parseBooleanFlag(process.env.REDIS_TLS_ENABLED),
    objectStorageTlsConfigured: urlUsesHttps(process.env.S3_ENDPOINT),
    mediaCdnTlsConfigured: urlUsesHttps(process.env.MEDIA_CDN_BASE_URL),
    declaredDatabaseEncryptionAtRest: parseBooleanFlag(
      process.env.DB_ENCRYPTION_AT_REST,
    ),
    declaredObjectStorageEncryptionAtRest: parseBooleanFlag(
      process.env.OBJECT_STORAGE_ENCRYPTION_AT_REST,
    ),
    jwtSecretsRotationConfigured: hasJwtRotationConfiguration(),
    adminDashboardAuthCompatible: isAdminDashboardAuthCompatible(),
  };

  const violations: string[] = [];
  if (!checks.databaseTlsConfigured) {
    violations.push("database TLS is not configured");
  }
  if (!checks.redisTlsConfigured) {
    violations.push("redis TLS is not configured");
  }
  if (!checks.objectStorageTlsConfigured) {
    violations.push("object storage endpoint is not HTTPS");
  }
  if (!checks.mediaCdnTlsConfigured) {
    violations.push("media CDN endpoint is not HTTPS");
  }
  if (!checks.declaredDatabaseEncryptionAtRest) {
    violations.push("database encryption-at-rest declaration is missing");
  }
  if (!checks.declaredObjectStorageEncryptionAtRest) {
    violations.push("object-storage encryption-at-rest declaration is missing");
  }
  if (!checks.jwtSecretsRotationConfigured) {
    violations.push("JWT secrets rotation chain is not configured");
  }
  if (!checks.adminDashboardAuthCompatible) {
    violations.push(
      "ADMIN_API_KEY is configured while admin dashboard redirects are enabled; the hosted admin UI does not send x-admin-api-key",
    );
  }

  const strictMode = parseBooleanFlag(process.env.SECURITY_STRICT_MODE);
  const strictStartupEnforcement = parseBooleanFlag(
    process.env.SECURITY_STRICT_STARTUP_ENFORCE,
  );
  const environment = process.env.NODE_ENV ?? "development";
  const status =
    violations.length === 0
      ? "healthy"
      : strictMode && strictStartupEnforcement && environment === "production"
        ? "critical"
        : "watch";

  return {
    generatedAt: new Date().toISOString(),
    strictMode,
    strictStartupEnforcement,
    status,
    environment,
    checks,
    violations,
  };
}

export function assertSecurityPosture() {
  const posture = evaluateSecurityPosture();
  if (
    posture.strictMode &&
    posture.strictStartupEnforcement &&
    posture.environment === "production" &&
    posture.violations.length > 0
  ) {
    throw new Error(
      `security posture checks failed: ${posture.violations.join("; ")}`,
    );
  }
  return posture;
}
