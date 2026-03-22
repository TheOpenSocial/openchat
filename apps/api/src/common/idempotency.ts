import { BadRequestException } from "@nestjs/common";

const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

export function readIdempotencyKeyHeader(
  value: string | string[] | undefined,
): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new BadRequestException("idempotency key is too long");
  }
  return normalized;
}
