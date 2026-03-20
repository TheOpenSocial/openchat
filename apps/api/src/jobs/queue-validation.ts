import { supportedQueueSchemas } from "@opensocial/types";
import { z } from "zod";

export function validateQueuePayload<
  TType extends keyof typeof supportedQueueSchemas,
>(
  type: TType,
  payload: unknown,
): z.infer<(typeof supportedQueueSchemas)[TType]> {
  return supportedQueueSchemas[type].parse(payload) as z.infer<
    (typeof supportedQueueSchemas)[TType]
  >;
}
