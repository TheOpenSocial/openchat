const SENSITIVE_KEY_FRAGMENTS = [
  "authorization",
  "cookie",
  "token",
  "secret",
  "password",
  "api_key",
  "apikey",
  "refresh",
  "session",
  "code",
  "email",
  "phone",
  "mobile",
  "full_name",
  "first_name",
  "last_name",
  "displayname",
  "address",
  "ip_address",
  "dob",
  "birth",
];

const REDACTED_VALUE = "[REDACTED]";
const REDACTED_EMAIL_VALUE = "[REDACTED_EMAIL]";
const REDACTED_PHONE_VALUE = "[REDACTED_PHONE]";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;

function isSensitiveKey(key: string) {
  const normalized = key.trim().toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment),
  );
}

function truncateString(value: string, maxLength = 256) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...[truncated:${value.length - maxLength}]`;
}

function redactSensitiveTokens(value: string) {
  return value
    .replace(EMAIL_PATTERN, REDACTED_EMAIL_VALUE)
    .replace(PHONE_PATTERN, REDACTED_PHONE_VALUE);
}

export function redactForLogs(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return "[MaxDepth]";
  }

  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(redactSensitiveTokens(value));
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactForLogs(item, depth + 1));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (isSensitiveKey(key)) {
        output[key] = REDACTED_VALUE;
      } else {
        output[key] = redactForLogs(entry, depth + 1);
      }
    }
    return output;
  }

  return String(value);
}
