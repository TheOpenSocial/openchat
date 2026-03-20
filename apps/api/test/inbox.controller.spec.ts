import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { InboxController } from "../src/inbox/inbox.controller.js";

describe("InboxController", () => {
  it("allows stale expiration in non-production when no cron key is configured", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousCronKey = process.env.INBOX_EXPIRE_STALE_CRON_KEY;
    process.env.NODE_ENV = "development";
    delete process.env.INBOX_EXPIRE_STALE_CRON_KEY;

    try {
      const inboxService = {
        expireStaleRequests: vi.fn().mockResolvedValue({ expiredCount: 1 }),
      };
      const controller = new InboxController(inboxService as any);

      const result = await controller.expireStale(undefined);
      expect(result).toEqual({
        success: true,
        data: { expiredCount: 1 },
      });
      expect(inboxService.expireStaleRequests).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      process.env.INBOX_EXPIRE_STALE_CRON_KEY = previousCronKey;
    }
  });

  it("rejects stale expiration in production when cron key is not configured", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousCronKey = process.env.INBOX_EXPIRE_STALE_CRON_KEY;
    process.env.NODE_ENV = "production";
    delete process.env.INBOX_EXPIRE_STALE_CRON_KEY;

    try {
      const inboxService = {
        expireStaleRequests: vi.fn(),
      };
      const controller = new InboxController(inboxService as any);

      await expect(controller.expireStale(undefined)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(inboxService.expireStaleRequests).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      process.env.INBOX_EXPIRE_STALE_CRON_KEY = previousCronKey;
    }
  });

  it("requires a valid cron key when one is configured", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousCronKey = process.env.INBOX_EXPIRE_STALE_CRON_KEY;
    process.env.NODE_ENV = "production";
    process.env.INBOX_EXPIRE_STALE_CRON_KEY = "super-secret-cron-key";

    try {
      const inboxService = {
        expireStaleRequests: vi.fn().mockResolvedValue({ expiredCount: 2 }),
      };
      const controller = new InboxController(inboxService as any);

      await expect(controller.expireStale("bad-key")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(inboxService.expireStaleRequests).not.toHaveBeenCalled();

      const success = await controller.expireStale("super-secret-cron-key");
      expect(success).toEqual({
        success: true,
        data: { expiredCount: 2 },
      });
      expect(inboxService.expireStaleRequests).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      process.env.INBOX_EXPIRE_STALE_CRON_KEY = previousCronKey;
    }
  });
});
