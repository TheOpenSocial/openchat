import { describe, expect, it, vi, afterEach } from "vitest";
import { ComplianceService } from "../src/compliance/compliance.service.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("ComplianceService", () => {
  it("returns policy inputs with defaults", () => {
    delete process.env.LEGAL_REGION_MODE;
    delete process.env.LEGAL_REGION_COUNTRY_CODES;
    delete process.env.LEGAL_MINIMUM_AGE;

    const service = new ComplianceService({} as any);
    const policy = service.getPolicyInputs();

    expect(policy.ageRestriction.minimumAgeYears).toBe(18);
    expect(policy.regionPolicy.mode).toBe("off");
    expect(policy.termsOfService.version).toBe("v1");
    expect(policy.privacyPolicy.version).toBe("v1");
  });

  it("records legal acceptance and audits it", async () => {
    const prisma: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "user-1" }),
      },
      userPreference: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "pref-1" }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };

    const service = new ComplianceService(prisma);
    const result = await service.recordAcceptance("user-1", {
      type: "terms",
      version: "2026-03-20",
      acceptedAt: "2026-03-20T00:00:00.000Z",
    });

    expect(result.type).toBe("terms");
    expect(prisma.userPreference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          key: "legal_terms_acceptance",
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "compliance.acceptance_recorded",
        }),
      }),
    );
  });

  it("blocks eligibility when legal requirements are missing", async () => {
    process.env.LEGAL_REGION_MODE = "allowlist";
    process.env.LEGAL_REGION_COUNTRY_CODES = "US,CA";
    process.env.LEGAL_MINIMUM_AGE = "18";

    const prisma: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          profile: { country: "US" },
        }),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new ComplianceService(prisma);
    const result = await service.getUserEligibility("user-1");

    expect(result.eligible).toBe(false);
    expect(result.blockingReasons).toEqual(
      expect.arrayContaining([
        "terms_not_accepted",
        "privacy_not_accepted",
        "birth_date_missing",
      ]),
    );
  });

  it("passes eligibility with accepted terms/privacy, age, and region", async () => {
    process.env.LEGAL_REGION_MODE = "allowlist";
    process.env.LEGAL_REGION_COUNTRY_CODES = "US,CA";
    process.env.LEGAL_MINIMUM_AGE = "18";

    const prisma: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          profile: { country: "US" },
        }),
      },
      userPreference: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: "legal_terms_acceptance",
            value: { version: "v1", acceptedAt: "2026-03-19T00:00:00.000Z" },
          },
          {
            key: "legal_privacy_acceptance",
            value: { version: "v1", acceptedAt: "2026-03-19T00:00:00.000Z" },
          },
          { key: "legal_birth_date", value: "2000-01-01" },
        ]),
      },
    };

    const service = new ComplianceService(prisma);
    const result = await service.getUserEligibility("user-1");

    expect(result.eligible).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(result.requirements.ageEligible).toBe(true);
    expect(result.requirements.regionEligible).toBe(true);
  });
});
