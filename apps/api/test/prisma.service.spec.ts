import { afterEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/database/prisma.service.js";

describe("PrismaService", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it("rejects production startup without DATABASE_URL", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;

    expect(() => new PrismaService()).toThrow(
      "DATABASE_URL is required in production",
    );
  });
});
