const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function readBoolean(value: string | undefined) {
  if (!value) {
    return false;
  }
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

const REMOTE_API_BASE_URL = "https://api.opensocial.so/api";

export const webEnv = {
  apiBaseUrl:
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    (process.env.NODE_ENV === "production"
      ? REMOTE_API_BASE_URL
      : "http://localhost:3000/api"),
  designMock: readBoolean(process.env.NEXT_PUBLIC_DESIGN_MOCK),
  allowWebDemoAuth:
    process.env.NODE_ENV === "development" ||
    readBoolean(process.env.NEXT_PUBLIC_ALLOW_WEB_DEMO_AUTH),
} as const;
