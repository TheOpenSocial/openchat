import { afterEach, describe, expect, it, vi } from "vitest";
import { transportSecurityMiddleware } from "../src/common/transport-security.middleware.js";

function createResponse() {
  return {
    setHeader: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
}

describe("transportSecurityMiddleware", () => {
  afterEach(() => {
    delete process.env.ENFORCE_HTTPS;
  });

  it("sets transport security headers", () => {
    const request: any = {
      secure: false,
      headers: {},
    };
    const response = createResponse();
    const next = vi.fn();

    transportSecurityMiddleware(request, response, next);

    expect(response.setHeader).toHaveBeenCalledWith(
      "x-content-type-options",
      "nosniff",
    );
    expect(response.setHeader).toHaveBeenCalledWith("x-frame-options", "DENY");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects non-https requests when https enforcement is enabled", () => {
    process.env.ENFORCE_HTTPS = "true";
    const request: any = {
      secure: false,
      headers: {},
    };
    const response = createResponse();
    const next = vi.fn();

    transportSecurityMiddleware(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(426);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "https_required",
        }),
      }),
    );
  });
});
