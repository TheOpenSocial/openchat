import type { NextFunction, Request, Response } from "express";

function parseBooleanFlag(value: string | undefined) {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isHttpsRequest(request: Request) {
  if (request.secure) {
    return true;
  }
  const header = request.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(header) ? header[0] : header;
  return (
    typeof forwardedProto === "string" &&
    forwardedProto.toLowerCase().includes("https")
  );
}

export function transportSecurityMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-permitted-cross-domain-policies", "none");

  const enforceHttps = parseBooleanFlag(process.env.ENFORCE_HTTPS);
  const requestIsHttps = isHttpsRequest(request);
  if (requestIsHttps) {
    response.setHeader(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  if (enforceHttps && !requestIsHttps) {
    response.status(426).json({
      success: false,
      error: {
        code: "https_required",
        message: "https is required for this endpoint",
      },
    });
    return;
  }

  next();
}
