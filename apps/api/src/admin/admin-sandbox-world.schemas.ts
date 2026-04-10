import { z } from "zod";

const uuidSchema = z.string().uuid();
const isoDateTimeSchema = z.string().datetime();

export const adminSandboxWorldIdSchema = z.enum(["design-sandbox-v1"]);

export const adminSandboxWorldCreateBodySchema = z
  .object({
    worldId: adminSandboxWorldIdSchema.default("design-sandbox-v1"),
    focalUserId: uuidSchema.optional(),
    reset: z.boolean().optional(),
  })
  .default({
    worldId: "design-sandbox-v1",
  });

export const adminSandboxWorldJoinBodySchema = z.object({
  focalUserId: uuidSchema,
});

export const adminSandboxWorldTickBodySchema = z
  .object({
    note: z.string().min(1).max(240).optional(),
  })
  .default(() => ({}));

export const adminSandboxWorldScenarioSchema = z.enum([
  "baseline",
  "waiting_replies",
  "activity_burst",
  "stalled_search",
]);

export const adminSandboxWorldScenarioBodySchema = z.object({
  scenario: adminSandboxWorldScenarioSchema,
});

export const adminSandboxWorldActorSummarySchema = z.object({
  userId: uuidSchema,
  displayName: z.string().min(1),
  role: z.enum(["focal", "synthetic"]),
});

export const adminSandboxWorldSummarySchema = z.object({
  worldId: adminSandboxWorldIdSchema,
  fixtureLabel: z.string().min(1),
  status: z.enum(["ready", "joined", "reset"]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  joinedAt: isoDateTimeSchema.nullable(),
  focalUserId: uuidSchema.nullable(),
  actorCount: z.number().int().nonnegative(),
  directChatCount: z.number().int().nonnegative(),
  groupChatCount: z.number().int().nonnegative(),
  notificationCount: z.number().int().nonnegative(),
  syntheticActors: z.array(adminSandboxWorldActorSummarySchema),
  notes: z.array(z.string().min(1)).default([]),
});
