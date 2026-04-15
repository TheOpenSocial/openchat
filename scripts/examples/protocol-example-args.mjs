export function getArg(flag, fallback = undefined) {
  const exact = `${flag}=`;
  for (const value of process.argv.slice(2)) {
    if (value.startsWith(exact)) {
      return value.slice(exact.length);
    }
  }
  return fallback;
}

export function resolveProtocolBaseUrl() {
  const value =
    getArg("--base-url") ||
    process.env.PROTOCOL_BASE_URL ||
    process.env.PLAYGROUND_BASE_URL ||
    process.env.SMOKE_BASE_URL ||
    process.env.STAGING_API_BASE_URL ||
    process.env.API_BASE_URL;
  if (!value) {
    throw new Error(
      "Missing base URL. Set --base-url or PROTOCOL_BASE_URL / PLAYGROUND_BASE_URL / SMOKE_BASE_URL / STAGING_API_BASE_URL / API_BASE_URL.",
    );
  }
  return value.replace(/\/+$/, "");
}

export function resolveRequiredStringArg({ flag, envName, errorMessage }) {
  const provided = getArg(flag) || process.env[envName];
  if (!provided) {
    throw new Error(errorMessage);
  }
  return provided;
}

export function resolveOptionalStringArg({
  flag,
  envName,
  fallback = undefined,
}) {
  return getArg(flag) || process.env[envName] || fallback;
}

export function resolveIntegerArg({
  flag,
  envName,
  fallback,
  minimum = 0,
  errorMessage,
}) {
  const raw = getArg(flag) || process.env[envName] || fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(errorMessage ?? `Invalid ${flag} value: ${raw}`);
  }
  return value;
}

export function logSection(prefix, title, value) {
  console.log(`\n[${prefix}] ${title}`);
  if (typeof value === "string") {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}
