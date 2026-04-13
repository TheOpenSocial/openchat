import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const DEFAULT_TOKEN_BYTES = 24;
const DEFAULT_SCRYPT_KEYLEN = 64;
const DEFAULT_SCRYPT_N = 16384;
const DEFAULT_SCRYPT_R = 8;
const DEFAULT_SCRYPT_P = 1;

export type ProtocolAppTokenHash = string;

function toBase64Url(input: Buffer) {
  return input.toString("base64url");
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url");
}

export function issueProtocolAppToken(byteLength = DEFAULT_TOKEN_BYTES) {
  return randomBytes(byteLength).toString("hex");
}

export function hashProtocolAppToken(token: string) {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error("protocol app token is required");
  }

  const salt = randomBytes(16);
  const derivedKey = scryptSync(normalizedToken, salt, DEFAULT_SCRYPT_KEYLEN, {
    N: DEFAULT_SCRYPT_N,
    r: DEFAULT_SCRYPT_R,
    p: DEFAULT_SCRYPT_P,
  });

  return [
    "scrypt",
    DEFAULT_SCRYPT_N,
    DEFAULT_SCRYPT_R,
    DEFAULT_SCRYPT_P,
    DEFAULT_SCRYPT_KEYLEN,
    toBase64Url(salt),
    toBase64Url(derivedKey),
  ].join("$") as ProtocolAppTokenHash;
}

export function verifyProtocolAppToken(
  token: string,
  tokenHash: string,
): boolean {
  const normalizedToken = token.trim();
  if (!normalizedToken || !tokenHash.trim()) {
    return false;
  }

  const [algorithm, n, r, p, keyLength, saltEncoded, digestEncoded] =
    tokenHash.split("$");
  if (
    algorithm !== "scrypt" ||
    !n ||
    !r ||
    !p ||
    !keyLength ||
    !saltEncoded ||
    !digestEncoded
  ) {
    return false;
  }

  const salt = fromBase64Url(saltEncoded);
  const expectedDigest = fromBase64Url(digestEncoded);
  const actualDigest = scryptSync(normalizedToken, salt, expectedDigest.length, {
    N: Number.parseInt(n, 10),
    r: Number.parseInt(r, 10),
    p: Number.parseInt(p, 10),
  });

  if (actualDigest.length !== expectedDigest.length) {
    return false;
  }

  return timingSafeEqual(actualDigest, expectedDigest);
}

export function issueProtocolAppTokenRecord() {
  const appToken = issueProtocolAppToken();
  return {
    appToken,
    appTokenHash: hashProtocolAppToken(appToken),
  };
}
