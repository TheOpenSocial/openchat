interface SecurityPostureChecks {
  databaseTlsConfigured: boolean;
  redisTlsConfigured: boolean;
  objectStorageTlsConfigured: boolean;
  mediaCdnTlsConfigured: boolean;
  declaredDatabaseEncryptionAtRest: boolean;
  declaredObjectStorageEncryptionAtRest: boolean;
  jwtSecretsRotationConfigured: boolean;
}

interface SecurityPostureResult {
  generatedAt: string;
  strictMode: boolean;
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

  return {
    generatedAt: new Date().toISOString(),
    strictMode: parseBooleanFlag(process.env.SECURITY_STRICT_MODE),
    environment: process.env.NODE_ENV ?? "development",
    checks,
    violations,
  };
}

export function assertSecurityPosture() {
  const posture = evaluateSecurityPosture();
  if (
    posture.strictMode &&
    posture.environment === "production" &&
    posture.violations.length > 0
  ) {
    throw new Error(
      `security posture checks failed: ${posture.violations.join("; ")}`,
    );
  }
  return posture;
}
