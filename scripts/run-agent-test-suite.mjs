#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const argMap = new Map(
  argv
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? "true"];
    }),
);

const layer =
  argMap.get("layer") ?? process.env.AGENT_TEST_SUITE_LAYER ?? "full";
const requireBenchmark =
  (argMap.get("require-benchmark") ??
    process.env.AGENT_TEST_SUITE_REQUIRE_BENCHMARK ??
    "0") === "1";
const enableProdSmoke =
  (argMap.get("enable-prod-smoke") ??
    process.env.AGENT_TEST_SUITE_ENABLE_PROD_SMOKE ??
    "0") === "1";
const requireProdSmoke =
  (argMap.get("require-prod-smoke") ??
    process.env.AGENT_TEST_SUITE_REQUIRE_PROD_SMOKE ??
    "0") === "1";
const runId =
  process.env.AGENT_TEST_SUITE_RUN_ID ??
  `agent-suite-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const artifactRoot = path.resolve(
  process.cwd(),
  process.env.AGENT_TEST_SUITE_ARTIFACT_DIR ?? ".artifacts/agent-test-suite",
  runId,
);

mkdirSync(artifactRoot, { recursive: true });

const scenarioFixturePath = path.resolve(
  process.cwd(),
  "apps/api/test/fixtures/agentic-scenarios.json",
);

function loadScenarioFixture() {
  try {
    const parsed = JSON.parse(readFileSync(scenarioFixturePath, "utf8"));
    if (!Array.isArray(parsed?.scenarios)) {
      return { scenarios: [] };
    }
    return {
      scenarios: parsed.scenarios.filter(
        (entry) =>
          entry &&
          typeof entry.id === "string" &&
          Array.isArray(entry.layerTargets),
      ),
    };
  } catch {
    return { scenarios: [] };
  }
}

function scenarioIdsForLayer(dataset, targetLayer) {
  return dataset.scenarios
    .filter((scenario) => scenario.layerTargets.includes(targetLayer))
    .map((scenario) => scenario.id);
}

const scenarioFixture = loadScenarioFixture();
const scenarioById = new Map(
  scenarioFixture.scenarios.map((scenario) => [scenario.id, scenario]),
);
const scenarioLayerScenarioIds = scenarioIdsForLayer(
  scenarioFixture,
  "scenario",
);
const benchmarkLayerScenarioIds = scenarioIdsForLayer(
  scenarioFixture,
  "benchmark",
);
const evalLayerScenarioIds = Array.from(
  new Set([
    ...scenarioIdsForLayer(scenarioFixture, "eval"),
    "eval_workflow_runtime_traceability_v1",
  ]),
);

const preflightChecks = [
  {
    id: "runtime-naming-residue",
    summary: "Runtime naming residue guard",
    cmd: "node",
    args: ["scripts/check-runtime-version-residue.mjs"],
  },
  {
    id: "prisma-client-generate",
    summary: "Prisma client generation baseline",
    cmd: "pnpm",
    args: ["db:generate"],
  },
  {
    id: "protocol-types-build",
    summary: "Protocol types package build baseline",
    cmd: "pnpm",
    args: ["--filter", "@opensocial/protocol-types", "build"],
  },
  {
    id: "protocol-events-build",
    summary: "Protocol events package build baseline",
    cmd: "pnpm",
    args: ["--filter", "@opensocial/protocol-events", "build"],
  },
  {
    id: "protocol-server-build",
    summary: "Protocol server package build baseline",
    cmd: "pnpm",
    args: ["--filter", "@opensocial/protocol-server", "build"],
  },
  {
    id: "types-package-build",
    summary: "Types package build baseline",
    cmd: "pnpm",
    args: ["--filter", "@opensocial/types", "build"],
  },
  {
    id: "openai-package-build",
    summary: "OpenAI package build baseline",
    cmd: "pnpm",
    args: ["--filter", "@opensocial/openai", "build"],
  },
  {
    id: "api-typecheck",
    summary: "API typecheck baseline",
    cmd: "pnpm",
    args: ["--filter", "@opensocial/api", "typecheck"],
  },
  {
    id: "api-lint",
    summary: "API lint baseline",
    cmd: "pnpm",
    args: ["--filter", "@opensocial/api", "lint"],
  },
  {
    id: "api-release-check",
    summary: "API release gate baseline",
    cmd: "pnpm",
    args: ["release:check:api"],
  },
];

const layerChecks = {
  contract: [
    {
      id: "openai-package-contracts",
      summary: "OpenAI package contracts",
      cmd: "pnpm",
      args: ["--filter", "@opensocial/openai", "test"],
    },
    {
      id: "api-contracts-and-regressions",
      summary: "API contract and agent runtime regressions",
      cmd: "pnpm",
      args: [
        "--filter",
        "@opensocial/api",
        "exec",
        "vitest",
        "run",
        "test/onboarding-agent.contract.spec.ts",
        "test/openai-client.spec.ts",
        "test/agent-conversation.service.spec.ts",
      ],
    },
  ],
  workflow: [
    {
      id: "agent-workflow-foundation",
      summary:
        "Intent, workflow runtime, follow-up, connection, and admin ops workflow coverage",
      cmd: "pnpm",
      args: [
        "--filter",
        "@opensocial/api",
        "exec",
        "vitest",
        "run",
        "test/intents.service.spec.ts",
        "test/async-agent-followup.consumer.spec.ts",
        "test/connection-setup.service.spec.ts",
        "test/agent-workflow-runtime.service.spec.ts",
        "test/admin.controller.spec.ts",
        "test/runtime.controller.spec.ts",
        "test/runtime.service.spec.ts",
      ],
    },
  ],
  queue: [
    {
      id: "queue-replay-safety",
      summary: "Dead-letter, replay, and follow-up queue safety",
      cmd: "pnpm",
      args: [
        "--filter",
        "@opensocial/api",
        "exec",
        "vitest",
        "run",
        "test/dead-letter.service.spec.ts",
        "test/async-agent-followup.consumer.spec.ts",
        "test/execution-reconciliation.service.spec.ts",
        "test/connection-setup.service.spec.ts",
      ],
    },
  ],
  scenario: [
    {
      id: "scenario-corpus-suite",
      summary: "Canonical backend scenario corpus",
      cmd: "pnpm",
      args: [
        "--filter",
        "@opensocial/api",
        "exec",
        "vitest",
        "run",
        "test/agentic-scenario-suite.spec.ts",
      ],
      scenarioIds: scenarioLayerScenarioIds,
    },
  ],
  eval: [
    {
      id: "agentic-eval-scorecards",
      summary: "Agentic eval scorecards and admin snapshot coverage",
      cmd: "pnpm",
      args: [
        "--filter",
        "@opensocial/api",
        "exec",
        "vitest",
        "run",
        "test/agentic-evals.service.spec.ts",
        "test/admin.controller.spec.ts",
      ],
      scenarioIds: evalLayerScenarioIds,
    },
  ],
  benchmark: [
    {
      id: "agentic-benchmark",
      summary: "Agentic benchmark and async follow-up timings",
      scenarioIds: benchmarkLayerScenarioIds,
      benchmark: true,
    },
  ],
  "prod-smoke": [
    {
      id: "prod-smoke-verification-lane",
      summary: "Production/staging verification lane smoke checks",
      prodSmoke: true,
      scenarioIds: [
        "prod_smoke_health_v1",
        "prod_smoke_ops_metrics_v1",
        "prod_smoke_llm_runtime_v1",
        "prod_smoke_incident_readiness_v1",
      ],
    },
  ],
};

function commandForLayer(selectedLayer) {
  const baselineChecks = preflightChecks.filter((check) =>
    [
      "runtime-naming-residue",
      "prisma-client-generate",
      "protocol-types-build",
      "protocol-events-build",
      "protocol-server-build",
      "types-package-build",
      "openai-package-build",
    ].includes(check.id),
  );

  if (selectedLayer === "full") {
    return [
      ...preflightChecks,
      ...layerChecks.contract,
      ...layerChecks.workflow,
      ...layerChecks.queue,
      ...layerChecks.scenario,
      ...layerChecks.eval,
      ...layerChecks.benchmark,
      ...layerChecks["prod-smoke"],
    ];
  }

  return [...baselineChecks, ...(layerChecks[selectedLayer] ?? [])];
}

function runCommand(check) {
  const startedAt = Date.now();
  const result = spawnSync(check.cmd, check.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    id: check.id,
    scenarioId: null,
    scenarioIds: check.scenarioIds ?? [],
    workflowRunId: null,
    traceId: null,
    status: result.status === 0 ? "passed" : "failed",
    latencyMs: Date.now() - startedAt,
    failureClass: result.status === 0 ? null : inferFailureClass(check.id),
    summary: check.summary,
    sideEffects: [],
  };
}

function inferFailureClass(id) {
  if (id.includes("benchmark")) return "latency_or_capacity";
  if (id.includes("queue") || id.includes("workflow")) return "queue_or_replay";
  if (id.includes("eval")) return "llm_or_schema";
  if (id.includes("contract")) return "llm_or_schema";
  if (id.includes("scenario")) return "matching_or_negotiation";
  return "observability_gap";
}

function benchmarkEnvAvailable() {
  return Boolean(
    process.env.AGENTIC_BENCH_ACCESS_TOKEN &&
    process.env.AGENTIC_BENCH_USER_ID &&
    process.env.AGENTIC_BENCH_THREAD_ID,
  );
}

function prodSmokeEnvSummary() {
  return {
    smokeBaseUrl: Boolean(process.env.SMOKE_BASE_URL),
    smokeAccessToken: Boolean(process.env.SMOKE_ACCESS_TOKEN),
    smokeAdminApiKey: Boolean(process.env.SMOKE_ADMIN_API_KEY),
    onboardingProbeToken: Boolean(process.env.ONBOARDING_PROBE_TOKEN),
  };
}

function runBenchmark(check) {
  if (!benchmarkEnvAvailable()) {
    return {
      id: check.id,
      scenarioId: null,
      scenarioIds: check.scenarioIds ?? [],
      workflowRunId: null,
      traceId: null,
      status: requireBenchmark ? "failed" : "skipped",
      latencyMs: null,
      failureClass: requireBenchmark ? "latency_or_capacity" : null,
      summary: requireBenchmark
        ? "Benchmark env is missing required credentials."
        : "Benchmark skipped because AGENTIC_BENCH_* env was not provided.",
      sideEffects: [],
    };
  }

  const artifactPath = path.join(artifactRoot, "benchmark-raw.json");
  const startedAt = Date.now();
  const result = spawnSync("node", ["scripts/benchmark-agentic-intents.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      AGENTIC_BENCH_ARTIFACT_PATH: artifactPath,
    },
    shell: process.platform === "win32",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  let benchmarkArtifact = null;
  let scenarioIds = [];
  try {
    benchmarkArtifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    scenarioIds = Array.isArray(benchmarkArtifact?.scenarioIds)
      ? benchmarkArtifact.scenarioIds.filter(
          (value) => typeof value === "string",
        )
      : (check.scenarioIds ?? []);
  } catch {
    benchmarkArtifact = null;
    scenarioIds = check.scenarioIds ?? [];
  }
  const workflowHealthFailed =
    benchmarkArtifact?.guardrail?.workflowHealthPass === false;
  if (result.status !== 0) {
    const guardrail = benchmarkArtifact?.guardrail ?? null;
    const workflowHealth = benchmarkArtifact?.workflowHealth ?? null;
    const results = Array.isArray(benchmarkArtifact?.results)
      ? benchmarkArtifact.results
      : [];
    const sampleResults = results.slice(0, 3).map((entry) => ({
      scenarioId: entry?.scenarioId ?? null,
      ackLatencyMs:
        typeof entry?.ackLatencyMs === "number" ? entry.ackLatencyMs : null,
      ackWithinSlo: Boolean(entry?.ackWithinSlo),
      backgroundFollowupDetected: Boolean(entry?.backgroundFollowupDetected),
      duplicateVisibleSideEffects:
        typeof entry?.duplicateVisibleSideEffects === "number"
          ? entry.duplicateVisibleSideEffects
          : null,
      queueLagMs:
        typeof entry?.queueLagMs === "number" ? entry.queueLagMs : null,
      error:
        typeof entry?.error === "string" && entry.error.length > 0
          ? entry.error
          : null,
    }));
    console.error("[agentic-benchmark] benchmark stage failed");
    if (guardrail) {
      console.error(
        `[agentic-benchmark] guardrail=${JSON.stringify(guardrail)}`,
      );
    }
    if (workflowHealth) {
      console.error(
        `[agentic-benchmark] workflowHealth=${JSON.stringify(workflowHealth)}`,
      );
    }
    if (sampleResults.length > 0) {
      console.error(
        `[agentic-benchmark] sampleResults=${JSON.stringify(sampleResults)}`,
      );
    }
    if (!benchmarkArtifact) {
      console.error(
        "[agentic-benchmark] benchmark artifact missing or unreadable",
      );
    }
  }
  const failureClass =
    result.status === 0
      ? null
      : workflowHealthFailed
        ? "observability_gap"
        : "latency_or_capacity";
  return {
    id: check.id,
    scenarioId: null,
    scenarioIds,
    workflowRunId: null,
    traceId: null,
    status: result.status === 0 ? "passed" : "failed",
    latencyMs: Date.now() - startedAt,
    failureClass,
    summary: check.summary,
    sideEffects: [],
    metadata: {
      guardrail: benchmarkArtifact?.guardrail ?? null,
      workflowHealth: benchmarkArtifact?.workflowHealth ?? null,
      benchmarkResults: Array.isArray(benchmarkArtifact?.results)
        ? benchmarkArtifact.results
        : [],
    },
  };
}

function runProdSmoke(check) {
  const envSummary = prodSmokeEnvSummary();
  if (!enableProdSmoke) {
    return {
      id: check.id,
      scenarioId: null,
      scenarioIds: check.scenarioIds ?? [],
      workflowRunId: null,
      traceId: null,
      status: requireProdSmoke ? "failed" : "skipped",
      latencyMs: null,
      failureClass: requireProdSmoke ? "observability_gap" : null,
      summary: requireProdSmoke
        ? "Prod-smoke is required but AGENT_TEST_SUITE_ENABLE_PROD_SMOKE=1 was not set."
        : "Prod-smoke skipped (set AGENT_TEST_SUITE_ENABLE_PROD_SMOKE=1 to execute verification lane checks).",
      sideEffects: [],
      metadata: envSummary,
    };
  }

  const rawArtifactPath = path.join(artifactRoot, "prod-smoke-raw.json");
  const startedAt = Date.now();
  const result = spawnSync("node", ["scripts/run-agent-prod-smoke-lane.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      AGENTIC_PROD_SMOKE_ARTIFACT_PATH: rawArtifactPath,
      AGENTIC_PROD_SMOKE_RUN_ID: `${runId}:prod-smoke`,
    },
    shell: process.platform === "win32",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  let laneArtifact = null;
  try {
    laneArtifact = JSON.parse(readFileSync(rawArtifactPath, "utf8"));
  } catch {
    laneArtifact = null;
  }

  if (result.status !== 0) {
    return {
      id: check.id,
      scenarioId: null,
      scenarioIds: check.scenarioIds ?? [],
      workflowRunId: null,
      traceId: null,
      status: "failed",
      latencyMs: Date.now() - startedAt,
      failureClass: "observability_gap",
      summary: "Prod-smoke verification lane failed.",
      sideEffects: [],
      metadata: {
        ...envSummary,
        laneArtifact,
      },
    };
  }

  return {
    id: check.id,
    scenarioId: null,
    scenarioIds: check.scenarioIds ?? [],
    workflowRunId: null,
    traceId: null,
    status: "passed",
    latencyMs: Date.now() - startedAt,
    failureClass: null,
    summary: check.summary,
    sideEffects: [],
    metadata: {
      ...envSummary,
      laneArtifact,
    },
  };
}

function toArrayOfStrings(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => typeof entry === "string");
}

function expectedSideEffectsForScenario(scenarioId) {
  if (!scenarioId) {
    return [];
  }
  const scenario = scenarioById.get(scenarioId);
  if (!scenario || typeof scenario !== "object") {
    return [];
  }
  const expected =
    scenario.expected && typeof scenario.expected === "object"
      ? scenario.expected
      : null;
  if (!Array.isArray(expected?.sideEffects)) {
    return [];
  }
  return expected.sideEffects
    .map((sideEffect) => {
      if (typeof sideEffect === "string") {
        return sideEffect;
      }
      if (sideEffect && typeof sideEffect === "object") {
        const relation = sideEffect.relation;
        if (typeof relation === "string" && relation.trim().length > 0) {
          return relation.trim();
        }
      }
      return null;
    })
    .filter((sideEffect) => typeof sideEffect === "string");
}

function summarizeFailureClasses(records) {
  return records.reduce((acc, record) => {
    if (!record.failureClass) {
      return acc;
    }
    acc[record.failureClass] = (acc[record.failureClass] ?? 0) + 1;
    return acc;
  }, {});
}

function recordStatusCounts(records) {
  return records.reduce(
    (acc, record) => {
      if (record.status === "passed") {
        acc.passed += 1;
      } else if (record.status === "failed") {
        acc.failed += 1;
      } else if (record.status === "skipped") {
        acc.skipped += 1;
      }
      return acc;
    },
    {
      total: records.length,
      passed: 0,
      failed: 0,
      skipped: 0,
    },
  );
}

function buildBenchmarkRecords(entry) {
  const benchmarkResults = Array.isArray(entry.metadata?.benchmarkResults)
    ? entry.metadata.benchmarkResults
    : [];
  if (benchmarkResults.length === 0) {
    return [];
  }
  return benchmarkResults
    .map((result) => {
      const scenarioId =
        typeof result?.scenarioId === "string" ? result.scenarioId : null;
      const intentId =
        typeof result?.intentId === "string" ? result.intentId : null;
      const ackLatencyMs =
        typeof result?.ackLatencyMs === "number" ? result.ackLatencyMs : null;
      const ackWithinSlo = Boolean(result?.ackWithinSlo);
      const backgroundFollowupDetected = Boolean(
        result?.backgroundFollowupDetected,
      );
      const queueLagMs =
        typeof result?.queueLagMs === "number" ? result.queueLagMs : null;
      const duplicateVisibleSideEffects =
        typeof result?.duplicateVisibleSideEffects === "number"
          ? Math.max(0, Math.floor(result.duplicateVisibleSideEffects))
          : 0;
      const maxQueueLagMs =
        typeof entry.metadata?.guardrail?.maxQueueLagMs === "number"
          ? entry.metadata.guardrail.maxQueueLagMs
          : Number.POSITIVE_INFINITY;
      const queueLagPass = queueLagMs === null || queueLagMs <= maxQueueLagMs;
      const duplicatePass = duplicateVisibleSideEffects === 0;
      const scenarioStatus =
        ackWithinSlo &&
        backgroundFollowupDetected &&
        queueLagPass &&
        duplicatePass
          ? "passed"
          : "failed";
      return {
        runId,
        layer,
        checkId: entry.id,
        summary: entry.summary,
        scenarioId,
        workflowRunId: intentId ? `social:intent:${intentId}` : null,
        traceId: null,
        status:
          entry.status === "skipped"
            ? "skipped"
            : entry.status === "failed"
              ? "failed"
              : scenarioStatus,
        latencyMs: ackLatencyMs,
        failureClass:
          entry.status === "skipped"
            ? null
            : entry.status === "failed"
              ? entry.failureClass
              : scenarioStatus === "failed"
                ? "latency_or_capacity"
                : null,
        sideEffects: [
          ackWithinSlo ? "ack_within_slo" : "ack_over_slo",
          backgroundFollowupDetected
            ? "background_followup_detected"
            : "background_followup_missing",
          duplicatePass
            ? "duplicate_visible_side_effects_none"
            : "duplicate_visible_side_effects_detected",
          queueLagPass ? "queue_lag_within_budget" : "queue_lag_over_budget",
        ],
        metrics: {
          ackWithinSlo,
          backgroundFollowupDetected,
          ackDetectedMs:
            typeof result?.ackDetectedMs === "number"
              ? result.ackDetectedMs
              : null,
          queueLagMs,
          duplicateVisibleSideEffects,
          duplicateVisibleSideEffectRate:
            typeof entry.metadata?.guardrail?.duplicateVisibleSideEffectRate ===
            "number"
              ? entry.metadata.guardrail.duplicateVisibleSideEffectRate
              : null,
          workerIndex:
            typeof result?.workerIndex === "number" ? result.workerIndex : null,
          burstIndex:
            typeof result?.burstIndex === "number" ? result.burstIndex : null,
          concurrency:
            typeof entry.metadata?.guardrail?.concurrency === "number"
              ? entry.metadata.guardrail.concurrency
              : null,
          burstSize:
            typeof entry.metadata?.guardrail?.burstSize === "number"
              ? entry.metadata.guardrail.burstSize
              : null,
        },
      };
    })
    .filter((record) => record.scenarioId);
}

function buildGenericScenarioRecords(entry) {
  const scenarioIds = toArrayOfStrings(entry.scenarioIds);
  if (scenarioIds.length === 0) {
    return [
      {
        runId,
        layer,
        checkId: entry.id,
        summary: entry.summary,
        scenarioId: null,
        workflowRunId: entry.workflowRunId ?? null,
        traceId: entry.traceId ?? null,
        status: entry.status,
        latencyMs: entry.latencyMs ?? null,
        failureClass: entry.failureClass ?? null,
        sideEffects: Array.isArray(entry.sideEffects) ? entry.sideEffects : [],
      },
    ];
  }
  return scenarioIds.map((scenarioId) => ({
    runId,
    layer,
    checkId: entry.id,
    summary: entry.summary,
    scenarioId,
    workflowRunId: entry.workflowRunId ?? null,
    traceId: entry.traceId ?? null,
    status: entry.status,
    latencyMs: entry.latencyMs ?? null,
    failureClass: entry.failureClass ?? null,
    sideEffects: expectedSideEffectsForScenario(scenarioId),
  }));
}

function buildRecordsForCase(entry) {
  const benchmarkRecords = buildBenchmarkRecords(entry);
  if (benchmarkRecords.length > 0) {
    return benchmarkRecords;
  }
  return buildGenericScenarioRecords(entry);
}

const checks = commandForLayer(layer);
if (checks.length === 0) {
  console.error(`Unsupported layer: ${layer}`);
  process.exit(1);
}

const cases = [];
for (const check of checks) {
  console.log(`\n==> ${check.summary}`);
  cases.push(
    check.benchmark
      ? runBenchmark(check)
      : check.prodSmoke
        ? runProdSmoke(check)
        : runCommand(check),
  );
  if (cases.at(-1)?.status === "failed") {
    break;
  }
}

const status = cases.some((entry) => entry.status === "failed")
  ? "failed"
  : cases.every((entry) => entry.status === "skipped")
    ? "skipped"
    : "passed";
const records = cases.flatMap((entry) => buildRecordsForCase(entry));
const benchmarkCase = cases.find((entry) => entry.id === "agentic-benchmark");
const benchmarkRecordQueueLagValues = records
  .filter((record) => record.checkId === "agentic-benchmark")
  .map((record) =>
    typeof record.metrics?.queueLagMs === "number"
      ? record.metrics.queueLagMs
      : null,
  )
  .filter((value) => typeof value === "number")
  .sort((left, right) => left - right);
const benchmarkQueueLagP95Ms =
  benchmarkRecordQueueLagValues.length === 0
    ? null
    : benchmarkRecordQueueLagValues[
        Math.max(0, Math.ceil(benchmarkRecordQueueLagValues.length * 0.95) - 1)
      ];
const benchmarkSummary =
  benchmarkCase && benchmarkCase.metadata?.guardrail
    ? {
        runCount:
          typeof benchmarkCase.metadata?.benchmarkResults?.length === "number"
            ? benchmarkCase.metadata.benchmarkResults.length
            : 0,
        concurrency:
          typeof benchmarkCase.metadata.guardrail.concurrency === "number"
            ? benchmarkCase.metadata.guardrail.concurrency
            : undefined,
        burstSize:
          typeof benchmarkCase.metadata.guardrail.burstSize === "number"
            ? benchmarkCase.metadata.guardrail.burstSize
            : undefined,
        duplicateVisibleSideEffectRate:
          typeof benchmarkCase.metadata.guardrail
            .duplicateVisibleSideEffectRate === "number"
            ? benchmarkCase.metadata.guardrail.duplicateVisibleSideEffectRate
            : undefined,
        queueLagP95Ms:
          typeof benchmarkQueueLagP95Ms === "number"
            ? benchmarkQueueLagP95Ms
            : undefined,
      }
    : undefined;

const artifact = {
  runId,
  generatedAt: new Date().toISOString(),
  layer,
  status,
  cases,
  records,
  summary: {
    caseCounts: recordStatusCounts(
      cases.map((entry) => ({
        status: entry.status,
      })),
    ),
    recordCounts: recordStatusCounts(records),
    failureClasses: summarizeFailureClasses(records),
    benchmark: benchmarkSummary,
  },
};

const artifactPath = path.join(artifactRoot, `${layer}.json`);
writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
console.log(`\nArtifact written to ${artifactPath}`);

if (status === "failed") {
  process.exit(1);
}
