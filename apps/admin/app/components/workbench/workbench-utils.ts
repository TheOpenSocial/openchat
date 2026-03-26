"use client";

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function parseRecordJsonInput(
  label: string,
  raw: string,
  allowEmpty = true,
): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    if (allowEmpty) {
      return undefined;
    }
    throw new Error(`${label} cannot be empty.`);
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  throw new Error(`${label} must be a JSON object.`);
}

export function parseContextInput(
  raw: string,
): Record<string, unknown> | undefined {
  return parseRecordJsonInput("Policy context", raw);
}

export function normalizeQueryValues(
  record: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | undefined> | undefined {
  if (!record) {
    return undefined;
  }

  const normalized: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(record)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === undefined
    ) {
      normalized[key] = value;
      continue;
    }

    if (value === null) {
      normalized[key] = "null";
      continue;
    }

    normalized[key] = JSON.stringify(value);
  }

  return normalized;
}

export function createHistoryId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
