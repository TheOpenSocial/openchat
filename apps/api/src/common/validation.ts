import { BadRequestException } from "@nestjs/common";
import { z, type ZodTypeAny } from "zod";

export function parseRequestPayload<TSchema extends ZodTypeAny>(
  schema: TSchema,
  payload: unknown,
): z.infer<TSchema> {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }

  throw new BadRequestException({
    code: "invalid_request_payload",
    message: "Request payload validation failed.",
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    })),
  });
}
