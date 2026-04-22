import { afterEach, describe, expect, it } from "vitest";
import { evaluateSecurityPosture } from "../src/common/security-posture.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("evaluateSecurityPosture", () => {
  it("flags hosted admin dashboard and admin api key drift", () => {
    process.env.ADMIN_API_KEY = "super-secret";
    process.env.ADMIN_DASHBOARD_REDIRECT_URIS =
      "https://admin.opensocial.so/auth/callback";

    const posture = evaluateSecurityPosture();

    expect(posture.checks.adminDashboardAuthCompatible).toBe(false);
    expect(posture.violations).toContain(
      "ADMIN_API_KEY is configured while admin dashboard redirects are enabled; the hosted admin UI does not send x-admin-api-key",
    );
    expect(posture.status).toBe("watch");
  });

  it("marks posture critical under strict startup enforcement in production", () => {
    process.env.NODE_ENV = "production";
    process.env.SECURITY_STRICT_MODE = "true";
    process.env.SECURITY_STRICT_STARTUP_ENFORCE = "true";

    const posture = evaluateSecurityPosture();

    expect(posture.violations.length).toBeGreaterThan(0);
    expect(posture.status).toBe("critical");
  });
});
