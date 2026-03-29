import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import path from "node:path";

test("moderation drill refreshes stale reporter token via application exchange", async () => {
  let exchangeCount = 0;
  const reportAuths = [];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const json = (status, payload) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    if (req.method === "POST" && url.pathname === "/api/admin/ops/smoke-session/exchange") {
      exchangeCount += 1;
      assert.equal(req.headers["x-application-key"], "app-key");
      assert.equal(req.headers["x-application-token"], "app-token");
      json(200, {
        success: true,
        data: {
          env: {
            SMOKE_ACCESS_TOKEN: "fresh-token",
            SMOKE_USER_ID: "reporter-1",
          },
        },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/moderation/reports") {
      reportAuths.push(req.headers.authorization ?? "");
      const body = JSON.parse(rawBody || "{}");
      assert.equal(body.reporterUserId, "reporter-1");
      if (req.headers.authorization === "Bearer stale-token") {
        json(401, {
          message: "invalid access token",
          error: "Unauthorized",
          statusCode: 401,
        });
        return;
      }
      assert.equal(req.headers.authorization, "Bearer fresh-token");
      json(200, {
        success: true,
        data: {
          moderationFlagId: "flag-1",
          report: { id: "report-1" },
        },
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/moderation/queue") {
      json(200, {
        success: true,
        data: [{ id: "flag-1", status: "open" }],
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/moderation/flags/flag-1/assign") {
      json(200, {
        success: true,
        data: { assigneeUserId: "admin-1" },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/moderation/flags/flag-1/triage") {
      json(200, {
        success: true,
        data: {
          flag: { id: "flag-1", status: "resolved" },
        },
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/audit-logs") {
      json(200, {
        success: true,
        data: [
          {
            id: "audit-report",
            action: "moderation.report_submitted",
            entityId: "report-1",
          },
          {
            id: "audit-assign",
            action: "admin.moderation_flag_assigned",
            entityId: "flag-1",
          },
          {
            id: "audit-triage",
            action: "admin.action",
            entityId: "flag-1",
            metadata: {
              action: "admin.moderation_flag_triage",
            },
          },
        ],
      });
      return;
    }

    json(404, {
      message: `Unhandled ${req.method} ${url.pathname}`,
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const scriptPath = path.resolve(process.cwd(), "scripts/moderation-drill.mjs");
  const child = spawn(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SMOKE_BASE_URL: baseUrl,
      SMOKE_ADMIN_USER_ID: "admin-1",
      SMOKE_ADMIN_ROLE: "admin",
      SMOKE_ADMIN_API_KEY: "admin-api-key",
      SMOKE_APPLICATION_KEY: "app-key",
      SMOKE_APPLICATION_TOKEN: "app-token",
      MODERATION_DRILL_REPORTER_USER_ID: "reporter-1",
      MODERATION_DRILL_ACCESS_TOKEN: "stale-token",
      MODERATION_DRILL_TARGET_USER_ID: "target-1",
      MODERATION_DRILL_ENTITY_TYPE: "user",
      MODERATION_DRILL_ENTITY_ID: "target-1",
      MODERATION_DRILL_ASSIGN_TO_USER_ID: "admin-1",
      MODERATION_DRILL_ACTION: "resolve",
      SMOKE_TIMEOUT_MS: "3000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const [code] = await once(child, "close");
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve(undefined)));
  });

  assert.equal(code, 0, `stdout:\n${stdout}\n\nstderr:\n${stderr}`);
  assert.equal(exchangeCount, 1);
  assert.deepEqual(reportAuths, ["Bearer stale-token", "Bearer fresh-token"]);
  assert.match(stdout, /Refreshed moderation drill smoke session via application credentials\./);
  assert.match(stdout, /Moderation drill passed\./);
});
