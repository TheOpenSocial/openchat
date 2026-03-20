import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";

const TERMS_ACCEPTANCE_KEY = "legal_terms_acceptance";
const PRIVACY_ACCEPTANCE_KEY = "legal_privacy_acceptance";
const BIRTH_DATE_KEY = "legal_birth_date";
const REGION_OVERRIDE_KEY = "legal_region_override";

const DEFAULT_MINIMUM_AGE = 18;
const DEFAULT_TERMS_VERSION = "v1";
const DEFAULT_PRIVACY_VERSION = "v1";

type ComplianceAcceptanceType = "terms" | "privacy";
type RegionMode = "off" | "allowlist" | "denylist";

interface AcceptanceRecord {
  version: string;
  acceptedAt: string;
}

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  getPolicyInputs() {
    const regionMode = this.readRegionMode();
    const regionCountries = this.readCsvEnv("LEGAL_REGION_COUNTRY_CODES");
    const minimumAgeYears = this.readMinimumAge();

    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      termsOfService: {
        url: process.env.TERMS_OF_SERVICE_URL ?? "",
        version: process.env.LEGAL_TERMS_VERSION ?? DEFAULT_TERMS_VERSION,
      },
      privacyPolicy: {
        url: process.env.PRIVACY_POLICY_URL ?? "",
        version: process.env.LEGAL_PRIVACY_VERSION ?? DEFAULT_PRIVACY_VERSION,
      },
      ageRestriction: {
        minimumAgeYears,
      },
      regionPolicy: {
        mode: regionMode,
        countryCodes: regionCountries,
      },
      checklist: {
        termsUrlConfigured: Boolean(process.env.TERMS_OF_SERVICE_URL),
        privacyUrlConfigured: Boolean(process.env.PRIVACY_POLICY_URL),
        minimumAgeConfigured: Number.isFinite(
          Number(process.env.LEGAL_MINIMUM_AGE),
        ),
        regionPolicyConfigured:
          regionMode === "off" || regionCountries.length > 0,
      },
    };
  }

  async recordAcceptance(
    userId: string,
    input: {
      type: ComplianceAcceptanceType;
      version: string;
      acceptedAt?: string;
    },
  ) {
    await this.ensureUserExists(userId);
    const key =
      input.type === "terms" ? TERMS_ACCEPTANCE_KEY : PRIVACY_ACCEPTANCE_KEY;
    const acceptedAt = input.acceptedAt ?? new Date().toISOString();
    const value: AcceptanceRecord = {
      version: input.version,
      acceptedAt,
    };

    await this.upsertPreference(userId, key, value);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: userId,
        actorType: "user",
        action: "compliance.acceptance_recorded",
        entityType: "user",
        entityId: userId,
        metadata: {
          type: input.type,
          version: input.version,
          acceptedAt,
        },
      },
    });

    return {
      userId,
      ...value,
      type: input.type,
    };
  }

  async setBirthDate(userId: string, birthDateInput: string) {
    await this.ensureUserExists(userId);
    const birthDate = this.parseBirthDateOrThrow(birthDateInput);
    const today = new Date();
    const ageYears = this.calculateAgeYears(birthDate, today);

    if (ageYears > 120) {
      throw new BadRequestException("birthDate appears invalid");
    }

    await this.upsertPreference(userId, BIRTH_DATE_KEY, birthDateInput);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: userId,
        actorType: "user",
        action: "compliance.birth_date_set",
        entityType: "user",
        entityId: userId,
        metadata: {
          birthDate: birthDateInput,
          ageYears,
        },
      },
    });

    return {
      userId,
      birthDate: birthDateInput,
      ageYears,
    };
  }

  async getUserEligibility(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          select: {
            country: true,
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const prefs = await this.prisma.userPreference.findMany({
      where: {
        userId,
        key: {
          in: [
            TERMS_ACCEPTANCE_KEY,
            PRIVACY_ACCEPTANCE_KEY,
            BIRTH_DATE_KEY,
            REGION_OVERRIDE_KEY,
          ],
        },
      },
      select: {
        key: true,
        value: true,
      },
    });

    const byKey = new Map(prefs.map((pref) => [pref.key, pref.value]));
    const terms = this.readAcceptanceRecord(byKey.get(TERMS_ACCEPTANCE_KEY));
    const privacy = this.readAcceptanceRecord(
      byKey.get(PRIVACY_ACCEPTANCE_KEY),
    );
    const birthDateRaw = this.readBirthDateValue(byKey.get(BIRTH_DATE_KEY));
    const birthDate =
      birthDateRaw === null ? null : this.parseBirthDateOrNull(birthDateRaw);
    const ageYears =
      birthDate === null ? null : this.calculateAgeYears(birthDate, new Date());
    const minimumAgeYears = this.readMinimumAge();
    const ageEligible = ageYears !== null && ageYears >= minimumAgeYears;

    const regionCountryRaw =
      this.readRegionOverride(byKey.get(REGION_OVERRIDE_KEY)) ??
      user.profile?.country ??
      null;
    const countryCode = this.normalizeCountryCode(regionCountryRaw);
    const regionPolicy = this.getPolicyInputs().regionPolicy;
    const regionEvaluation = this.evaluateRegionEligibility(
      countryCode,
      regionPolicy.mode,
      regionPolicy.countryCodes,
    );

    const blockingReasons: string[] = [];
    if (!terms) {
      blockingReasons.push("terms_not_accepted");
    }
    if (!privacy) {
      blockingReasons.push("privacy_not_accepted");
    }
    if (!ageEligible) {
      blockingReasons.push(
        ageYears === null ? "birth_date_missing" : "age_restricted",
      );
    }
    if (!regionEvaluation.eligible) {
      blockingReasons.push(regionEvaluation.reason);
    }

    return {
      userId,
      eligible: blockingReasons.length === 0,
      blockingReasons,
      requirements: {
        termsAccepted: Boolean(terms),
        privacyAccepted: Boolean(privacy),
        minimumAgeYears,
        ageYears,
        ageEligible,
        countryCode,
        regionEligible: regionEvaluation.eligible,
        regionPolicy,
      },
      acceptances: {
        terms,
        privacy,
      },
    };
  }

  private readRegionMode(): RegionMode {
    const raw = (process.env.LEGAL_REGION_MODE ?? "off").trim().toLowerCase();
    if (raw === "allowlist" || raw === "denylist" || raw === "off") {
      return raw;
    }
    return "off";
  }

  private readMinimumAge() {
    const parsed = Number(process.env.LEGAL_MINIMUM_AGE);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return DEFAULT_MINIMUM_AGE;
    }
    return Math.trunc(parsed);
  }

  private readCsvEnv(name: string) {
    return (process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter((value) => value.length === 2);
  }

  private readAcceptanceRecord(value: unknown): AcceptanceRecord | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const version = (value as Record<string, unknown>).version;
    const acceptedAt = (value as Record<string, unknown>).acceptedAt;
    if (typeof version !== "string" || typeof acceptedAt !== "string") {
      return null;
    }
    if (
      !this.parseBirthDateOrNull(acceptedAt) &&
      Number.isNaN(Date.parse(acceptedAt))
    ) {
      return null;
    }
    return {
      version,
      acceptedAt,
    };
  }

  private readBirthDateValue(value: unknown): string | null {
    return typeof value === "string" ? value : null;
  }

  private readRegionOverride(value: unknown): string | null {
    return typeof value === "string" ? value : null;
  }

  private parseBirthDateOrNull(input: string) {
    const parsed = new Date(`${input}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private parseBirthDateOrThrow(input: string) {
    const parsed = this.parseBirthDateOrNull(input);
    if (!parsed) {
      throw new BadRequestException("birthDate must be in YYYY-MM-DD format");
    }
    if (parsed > new Date()) {
      throw new BadRequestException("birthDate cannot be in the future");
    }
    return parsed;
  }

  private calculateAgeYears(birthDate: Date, now: Date) {
    let years = now.getUTCFullYear() - birthDate.getUTCFullYear();
    const monthDelta = now.getUTCMonth() - birthDate.getUTCMonth();
    const dayDelta = now.getUTCDate() - birthDate.getUTCDate();
    if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
      years -= 1;
    }
    return years;
  }

  private normalizeCountryCode(raw: string | null) {
    if (!raw) {
      return null;
    }
    const normalized = raw.trim().toUpperCase();
    return normalized.length === 2 ? normalized : null;
  }

  private evaluateRegionEligibility(
    countryCode: string | null,
    mode: RegionMode,
    countryCodes: string[],
  ) {
    if (mode === "off") {
      return { eligible: true, reason: "region_policy_disabled" };
    }
    if (!countryCode) {
      return { eligible: false, reason: "country_code_missing" };
    }

    const listed = countryCodes.includes(countryCode);
    if (mode === "allowlist") {
      return listed
        ? { eligible: true, reason: "allowlist_match" }
        : { eligible: false, reason: "country_not_allowlisted" };
    }
    return listed
      ? { eligible: false, reason: "country_denylisted" }
      : { eligible: true, reason: "not_denylisted" };
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
  }

  private async upsertPreference(userId: string, key: string, value: unknown) {
    const jsonValue = this.toInputJsonValue(value);
    const existing = await this.prisma.userPreference.findFirst({
      where: { userId, key },
      orderBy: { updatedAt: "desc" },
    });
    if (existing) {
      await this.prisma.userPreference.update({
        where: { id: existing.id },
        data: { value: jsonValue },
      });
      return;
    }
    await this.prisma.userPreference.create({
      data: { userId, key, value: jsonValue },
    });
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
