import test from "node:test";
import assert from "node:assert/strict";

import {
  generateAdminApiKey,
  renderAdminApiKeyOutput,
} from "./generate-admin-api-key.mjs";

test("generateAdminApiKey returns a non-empty base64url token", () => {
  const key = generateAdminApiKey(32);
  assert.ok(key.length >= 40);
  assert.match(key, /^[A-Za-z0-9_-]+$/);
});

test("renderAdminApiKeyOutput includes expected rotation targets", () => {
  const output = renderAdminApiKeyOutput("test-key", "shell");
  assert.match(output, /ADMIN_API_KEY=test-key/);
  assert.match(output, /STAGING_SMOKE_ADMIN_API_KEY/);
  assert.match(output, /SMOKE_ADMIN_API_KEY/);
});
