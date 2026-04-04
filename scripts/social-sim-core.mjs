import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const SOCIAL_SIM_PROMPT_VERSION = "social-sim-v1";
export const DEFAULT_SOCIAL_SIM_ARTIFACT_ROOT = ".artifacts/social-sim";
export const DEFAULT_SOCIAL_SIM_FIXTURE_PATH = "scripts/social-sim-worlds.json";
export const DEFAULT_SOCIAL_SIM_SCENARIO_FIXTURE_PATH =
  "apps/api/test/fixtures/agentic-scenarios.json";
export const DEFAULT_SOCIAL_SIM_BENCHMARK_SEED = 17031;
export const DEFAULT_SOCIAL_SIM_TUNING = {
  thresholds: {
    lowStrength: 0.35,
    mediumStrength: 0.72,
    nearMatchMin: 0.6,
    weakRelationshipFloor: 0.2,
    networkWeakPenaltyThreshold: 0.38,
    circleContinuityMin: 0.45,
  },
  probabilities: {
    lowStrengthGroupRecovery: 0.55,
    matchingGroupInvite: 0.52,
    memoryConversation: 0.45,
    denseConversationInvite: 0.52,
    pairConversationInvite: 0.52,
    eventConvergence: 0.5,
    strongConvergenceEvent: 0.35,
    genericMemoryReference: 0.65,
    networkMemoryReference: 0.35,
  },
  deltas: {
    askPreference: 0.07,
    reply: 0.12,
    referenceMemory: 0.06,
    referenceMemoryInMemoryWorld: 0.08,
    inviteGroup: 0.1,
    inviteGroupInGroupWorld: 0.14,
    proposeEvent: 0.1,
    proposeEventInLongOrRecovery: 0.13,
  },
  priority: {
    ageBonusStep: 0.02,
    ageBonusCap: 0.12,
    defaultAgeBonus: 0.08,
    matchedPenalty: -0.18,
    unmatchedBonus: 0.14,
    recoverPenalty: -0.35,
    moderationPenalty: -0.45,
    recoveryWeakBonus: 0.06,
    recoveryStrongPenalty: -0.1,
    recoveryRepeatPenalty: -0.4,
    circleSeedBonus: 0.08,
    circleUnmatchedBonus: 0.12,
    circleContinuityBonus: 0.08,
    nearMatchBonus: 0.16,
    circleNearMatchBonus: 0.04,
    networkNearMatchBonus: 0.06,
    networkWeakPenalty: -0.45,
    networkMediumBonus: 0.18,
    networkOrganizerBonus: 0.1,
    networkUnmatchedBonus: 0.08,
    networkRecoverPenalty: -0.35,
  },
  scoring: {
    progressDensityDivisor: 2.8,
    matchedRatioWeight: 0.45,
    progressDensityWeight: 0.18,
    expectationFulfillmentWeight: 0.3,
    noStallBonus: 0.05,
    shallowFollowupDominanceStart: 1.2,
    shallowFollowupPenaltySlope: 0.16,
    shallowFollowupPenaltyCap: 0.22,
    stalledPenaltyWeight: 0.18,
    missingRecoveryPenalty: 0.12,
    missingMemoryPenalty: 0.12,
    missingGroupPenalty: 0.08,
    recoveryBase: 0.62,
    recoveryScale: 0.28,
    recoveryMissingScore: 0.05,
    recoveryExtraScore: 0.48,
    recoveryDefaultScore: 0.2,
    memoryBase: 0.62,
    memoryScale: 0.26,
    memoryMissingScore: 0.08,
    memoryExtraScore: 0.54,
    memoryDefaultScore: 0.28,
    recoveryWorldRecoveryWeight: 0.26,
    requiredEdgeMissPenalty: 0.055,
    preferredEdgeMissPenalty: 0.04,
    recoveryClosureWeight: 0.16,
    recoveryUnresolvedPenalty: 0.09,
    circleReassemblyWeight: 0.14,
    denseBridgeWeight: 0.12,
  },
  judge: {
    turnBase: 0.32,
    recoverBonus: 0.15,
    memoryBonus: 0.15,
    inviteBonus: 0.12,
    eventBonus: 0.12,
    matchedBonus: 0.2,
    stalledPenalty: 0.15,
    weakFollowupPenalty: 0.18,
    worldBase: 0.18,
    worldMatchedRatioWeight: 0.34,
    worldTurnBalanceWeight: 0.12,
    worldExpectationWeight: 0.26,
    worldModerationPenalty: 0.2,
    worldShallowPenaltySlope: 0.18,
    worldShallowPenaltyCap: 0.24,
  },
  policy: {
    recoveryPostRecoveryConversationAction: "current",
    recoveryPostRecoveryConvergenceAction: "current",
    recoveryPostRecoveryTargetStrategy: "drop",
    networkOrganizerPostRecoveryConversationAction: "current",
    networkOrganizerPostRecoveryMemoryDriftAction: "current",
    networkOrganizerPostRecoveryTargetStrategy: "drop",
    denseGraphRecoveredConversationAction: "current",
  },
};

const VALID_PROVIDERS = new Set(["ollama", "openai", "stub"]);
const VALID_CLEANUP_MODES = new Set(["archive", "delete", "none"]);
const VALID_WORLD_SETS = new Set(["core", "holdout", "all"]);

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function deepMerge(base, overrides) {
  if (!overrides || typeof overrides !== "object") return base;
  const result = Array.isArray(base) ? base.slice() : { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base?.[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boolFromEnv(value, fallback = false) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sleep(ms) {
  const delay = Math.max(0, Number(ms) || 0);
  if (delay <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export function makeSeededRng(seed) {
  let state = Number.isFinite(seed) ? seed >>> 0 : 0x9e3779b9;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSocialSimTuning(overrides = null) {
  return deepMerge(DEFAULT_SOCIAL_SIM_TUNING, overrides ?? {});
}

function loadSocialSimTuning(flags, env) {
  const tuningFile = normalizeString(
    flags.get("tuning-file") ?? env.SOCIAL_SIM_TUNING_FILE,
    "",
  );
  const tuningJson = normalizeString(
    flags.get("tuning-json") ?? env.SOCIAL_SIM_TUNING_JSON,
    "",
  );
  let overrides = null;
  if (tuningFile) {
    overrides = safeJsonParse(readFileSync(path.resolve(process.cwd(), tuningFile), "utf8"), null);
  } else if (tuningJson) {
    overrides = safeJsonParse(tuningJson, null);
  }
  return normalizeSocialSimTuning(overrides);
}

function getTuning(config) {
  return config?.tuning ?? DEFAULT_SOCIAL_SIM_TUNING;
}

function resolvePolicyAction(setting, fallback) {
  return setting && setting !== "current" ? setting : fallback;
}

function resolvePolicyTargetStrategy(setting, fallback = "drop") {
  return setting && setting !== "current" ? setting : fallback;
}

function sanitizeBootstrapForArtifact(bootstrap) {
  if (!bootstrap || typeof bootstrap !== "object") return bootstrap;
  const next = { ...bootstrap };
  if (next.env && typeof next.env === "object") {
    const redactedEnv = {};
    for (const [key, value] of Object.entries(next.env)) {
      const normalizedKey = String(key).toUpperCase();
      const shouldRedact =
        normalizedKey.includes("TOKEN") ||
        normalizedKey.includes("KEY") ||
        normalizedKey.includes("SECRET") ||
        normalizedKey.includes("PASSWORD");
      redactedEnv[key] = shouldRedact ? "[redacted]" : value;
    }
    next.env = redactedEnv;
  }
  return next;
}

export function parseSocialSimArgs(argv = process.argv.slice(2), env = process.env) {
  const args = Array.isArray(argv) ? argv : [];
  const flags = new Map();

  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  const provider = normalizeString(
    flags.get("provider") ?? env.SOCIAL_SIM_PROVIDER,
    "ollama",
  ).toLowerCase();
  const judgeProvider = normalizeString(
    flags.get("judge-provider") ?? env.SOCIAL_SIM_JUDGE_PROVIDER,
    provider,
  ).toLowerCase();
  const horizon = normalizeString(
    flags.get("horizon") ?? env.SOCIAL_SIM_HORIZON,
    "all",
  ).toLowerCase();
  const worldFilter = parseList(flags.get("world") ?? env.SOCIAL_SIM_WORLD);
  const scenarioFilter = parseList(
    flags.get("scenario") ?? env.SOCIAL_SIM_SCENARIO,
  );
  const worldSet = normalizeString(
    flags.get("world-set") ?? env.SOCIAL_SIM_WORLD_SET,
    "core",
  ).toLowerCase();
  const benchmarkMode = boolFromEnv(
    flags.get("benchmark-mode") ?? env.SOCIAL_SIM_BENCHMARK_MODE,
    false,
  );
  const hasExplicitSeed = flags.has("seed") || typeof env.SOCIAL_SIM_SEED === "string";
  const seed = toNumber(
    flags.get("seed") ?? env.SOCIAL_SIM_SEED,
    benchmarkMode ? DEFAULT_SOCIAL_SIM_BENCHMARK_SEED : Date.now() % 2_147_483_647,
  );
  const namespace = normalizeString(
    flags.get("namespace") ?? env.SOCIAL_SIM_NAMESPACE,
    `social-sim-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  const rawTurnBudget = flags.get("turn-budget") ?? env.SOCIAL_SIM_TURN_BUDGET;
  const turnBudget =
    rawTurnBudget == null || normalizeString(rawTurnBudget, "") === ""
      ? null
      : clamp(toNumber(rawTurnBudget, 12), 1, 128);
  const cleanupMode = normalizeString(
    flags.get("cleanup") ?? env.SOCIAL_SIM_CLEANUP,
    "archive",
  ).toLowerCase();
  const dryRun = boolFromEnv(flags.get("dry-run") ?? env.SOCIAL_SIM_DRY_RUN);
  const nightly = boolFromEnv(flags.get("nightly") ?? env.SOCIAL_SIM_NIGHTLY);
  const artifactRoot = path.resolve(
    process.cwd(),
    normalizeString(
      flags.get("artifact-root") ?? env.SOCIAL_SIM_ARTIFACT_ROOT,
      DEFAULT_SOCIAL_SIM_ARTIFACT_ROOT,
    ),
  );
  const fixturePath = path.resolve(
    process.cwd(),
    normalizeString(
      flags.get("fixture") ?? env.SOCIAL_SIM_FIXTURE_PATH,
      DEFAULT_SOCIAL_SIM_FIXTURE_PATH,
    ),
  );
  const scenarioFixturePath = path.resolve(
    process.cwd(),
    normalizeString(
      flags.get("scenario-fixture") ??
        env.SOCIAL_SIM_SCENARIO_FIXTURE_PATH,
      DEFAULT_SOCIAL_SIM_SCENARIO_FIXTURE_PATH,
    ),
  );
  const baseUrl = normalizeString(
    flags.get("base-url") ?? env.SOCIAL_SIM_BASE_URL,
    "",
  );
  const adminUserId = normalizeString(
    flags.get("admin-user-id") ?? env.SOCIAL_SIM_ADMIN_USER_ID,
    "",
  );
  const adminRole = normalizeString(
    flags.get("admin-role") ?? env.SOCIAL_SIM_ADMIN_ROLE,
    "admin",
  );
  const adminApiKey = normalizeString(
    flags.get("admin-api-key") ?? env.SOCIAL_SIM_ADMIN_API_KEY,
    "",
  );
  const ollamaBaseUrl = normalizeString(
    flags.get("ollama-base-url") ?? env.OLLAMA_BASE_URL,
    "http://localhost:11434",
  );
  const ollamaModel = normalizeString(
    flags.get("ollama-model") ?? env.SOCIAL_SIM_OLLAMA_MODEL,
    "llama3.1",
  );
  const ollamaApiKey = normalizeString(
    flags.get("ollama-api-key") ?? env.OLLAMA_API_KEY,
    "",
  );
  const openaiModel = normalizeString(
    flags.get("openai-model") ?? env.SOCIAL_SIM_OPENAI_MODEL,
    "gpt-4.1-mini",
  );
  const openaiApiKey = normalizeString(
    flags.get("openai-api-key") ?? env.OPENAI_API_KEY,
    "",
  );
  const useRemoteProvider = boolFromEnv(
    flags.get("use-remote-provider") ??
      env.SOCIAL_SIM_USE_REMOTE_PROVIDER,
    false,
  );
  const useRemoteJudge = boolFromEnv(
    flags.get("use-remote-judge") ?? env.SOCIAL_SIM_USE_REMOTE_JUDGE,
    useRemoteProvider,
  );
  const failOnRemoteFallback = boolFromEnv(
    flags.get("fail-on-remote-fallback") ?? env.SOCIAL_SIM_FAIL_ON_REMOTE_FALLBACK,
    benchmarkMode,
  );
  const backendTurnDelayMs = clamp(
    toNumber(
      flags.get("backend-turn-delay-ms") ??
        env.SOCIAL_SIM_BACKEND_TURN_DELAY_MS,
      250,
    ),
    0,
    10_000,
  );
  const backendRetryCount = clamp(
    toNumber(
      flags.get("backend-retry-count") ?? env.SOCIAL_SIM_BACKEND_RETRY_COUNT,
      3,
    ),
    0,
    10,
  );
  const backendRetryBaseDelayMs = clamp(
    toNumber(
      flags.get("backend-retry-base-delay-ms") ??
        env.SOCIAL_SIM_BACKEND_RETRY_BASE_DELAY_MS,
      750,
    ),
    0,
    30_000,
  );
  const tuning = loadSocialSimTuning(flags, env);

  if (!VALID_PROVIDERS.has(provider)) {
    throw new Error(
      `Invalid social sim provider "${provider}". Expected ollama, openai, or stub.`,
    );
  }
  if (!VALID_PROVIDERS.has(judgeProvider)) {
    throw new Error(
      `Invalid social sim judge provider "${judgeProvider}". Expected ollama, openai, or stub.`,
    );
  }
  if (!VALID_CLEANUP_MODES.has(cleanupMode)) {
    throw new Error(
      `Invalid cleanup mode "${cleanupMode}". Expected archive, delete, or none.`,
    );
  }
  if (!VALID_WORLD_SETS.has(worldSet)) {
    throw new Error(
      `Invalid world set "${worldSet}". Expected core, holdout, or all.`,
    );
  }
  if (benchmarkMode && !hasExplicitSeed && seed !== DEFAULT_SOCIAL_SIM_BENCHMARK_SEED) {
    throw new Error("Benchmark mode must use the default deterministic benchmark seed.");
  }
  if (benchmarkMode && provider !== "stub" && !useRemoteProvider) {
    throw new Error(
      `Benchmark mode requires --use-remote-provider for provider "${provider}".`,
    );
  }
  if (benchmarkMode && judgeProvider !== "stub" && !useRemoteJudge) {
    throw new Error(
      `Benchmark mode requires --use-remote-judge for judge provider "${judgeProvider}".`,
    );
  }

  return {
    provider,
    judgeProvider,
    horizon,
    worldFilter,
    worldSet,
    benchmarkMode,
    scenarioFilter,
    seed,
    namespace,
    turnBudget,
    cleanupMode,
    dryRun,
    nightly,
    artifactRoot,
    fixturePath,
    scenarioFixturePath,
    baseUrl,
    adminUserId,
    adminRole,
    adminApiKey,
    ollamaBaseUrl,
    ollamaModel,
    ollamaApiKey,
    openaiApiKey,
    openaiModel,
    useRemoteProvider,
    useRemoteJudge,
    failOnRemoteFallback,
    backendTurnDelayMs,
    backendRetryCount,
    backendRetryBaseDelayMs,
    tuning,
  };
}

export function loadSocialSimScenarioCorpus(scenarioFixturePath) {
  try {
    const parsed = safeJsonParse(
      readFileSync(scenarioFixturePath, "utf8"),
      null,
    );
    const scenarios = Array.isArray(parsed?.scenarios) ? parsed.scenarios : [];
    return new Map(
      scenarios
        .filter((scenario) => scenario && typeof scenario.id === "string")
        .map((scenario) => [scenario.id, scenario]),
    );
  } catch {
    return new Map();
  }
}

export function loadSocialSimWorldFixture(fixturePath, scenarioFixturePath) {
  const parsed = safeJsonParse(readFileSync(fixturePath, "utf8"), null);
  if (!parsed || !Array.isArray(parsed.worlds)) {
    throw new Error(
      `Social sim fixture must be an object with a worlds array: ${fixturePath}`,
    );
  }
  const scenarioCorpus = loadSocialSimScenarioCorpus(scenarioFixturePath);

  return parsed.worlds
    .map((world, index) => normalizeWorld(world, index, scenarioCorpus))
    .filter(Boolean);
}

function normalizeWorld(world, index, scenarioCorpus) {
  if (!world || typeof world !== "object") return null;
  const id = normalizeString(world.id, `world-${index + 1}`);
  const name = normalizeString(world.name, id);
  const horizon = normalizeString(world.horizon, "short").toLowerCase();
  const family = normalizeString(world.family, "social");
  const turnBudget = clamp(toNumber(world.turnBudget, 12), 1, 128);
  const seedScenarioIds = Array.isArray(world.seedScenarioIds)
    ? world.seedScenarioIds.filter((entry) => typeof entry === "string")
    : [];
  const resolvedScenarios = seedScenarioIds
    .map((scenarioId) => scenarioCorpus.get(scenarioId))
    .filter(Boolean);
  const actors = Array.isArray(world.actors)
    ? world.actors
        .map((actor, actorIndex) => normalizeActor(actor, actorIndex, id))
        .filter(Boolean)
    : [];
  const relationships = Array.isArray(world.relationships)
    ? world.relationships
        .map((relationship, relationshipIndex) =>
          normalizeRelationship(relationship, relationshipIndex, actors),
        )
        .filter(Boolean)
    : [];

  const benchmark = normalizeWorldBenchmark(world.benchmark, relationships);
  return {
    id,
    name,
    horizon: ["short", "medium", "long"].includes(horizon)
      ? horizon
      : "short",
    family,
    turnBudget,
    seedScenarioIds,
    sourceScenarioIds: resolvedScenarios.map((scenario) => scenario.id),
    summary:
      typeof world.summary === "string" && world.summary.trim().length > 0
        ? world.summary.trim()
        : `${name} (${family})`,
    goals: Array.isArray(world.goals)
      ? world.goals.filter((goal) => typeof goal === "string")
      : [],
    actors,
    relationships,
    worldSet:
      normalizeString(world.worldSet, "").toLowerCase() === "holdout" ||
      benchmark.split === "holdout"
        ? "holdout"
        : "core",
    evaluationFocus: Array.isArray(world.evaluationFocus)
      ? world.evaluationFocus.filter((value) => typeof value === "string")
      : [],
    judgeHints: Array.isArray(world.judgeHints)
      ? world.judgeHints.filter((value) => typeof value === "string")
      : [],
    artifactHints: Array.isArray(world.artifactHints)
      ? world.artifactHints.filter((value) => typeof value === "string")
      : [],
    benchmark,
    oracle: normalizeWorldOracle(world.oracle, relationships),
  };
}

function normalizeWorldBenchmark(benchmark, relationships) {
  const relationshipIds = new Set(
    Array.isArray(relationships)
      ? relationships.map((relationship) => relationship.id)
      : [],
  );
  const source = benchmark && typeof benchmark === "object" ? benchmark : {};
  const split = normalizeString(source.split, "train").toLowerCase() === "holdout"
    ? "holdout"
    : "train";
  const requiredTransitions = Array.isArray(source.requiredTransitions)
    ? source.requiredTransitions
        .map((transition, index) => {
          if (!transition || typeof transition !== "object") return null;
          const type = normalizeString(transition.type, "match_edge");
          const targetEdgeId = normalizeString(transition.targetEdgeId, "");
          const sourceEdgeId = normalizeString(transition.sourceEdgeId, "");
          if (!targetEdgeId || !relationshipIds.has(targetEdgeId)) return null;
          if (sourceEdgeId && !relationshipIds.has(sourceEdgeId)) return null;
          return {
            id: normalizeString(transition.id, `transition-${index + 1}`),
            type,
            targetEdgeId,
            sourceEdgeId: sourceEdgeId || null,
          };
        })
        .filter(Boolean)
    : [];
  return {
    split,
    requiredTransitions,
  };
}

function normalizeWorldOracle(oracle, relationships) {
  const relationshipIds = new Set(
    Array.isArray(relationships)
      ? relationships.map((relationship) => relationship.id)
      : [],
  );
  const normalizeEdgeIds = (value) =>
    Array.isArray(value)
      ? value
          .filter((entry) => typeof entry === "string" && relationshipIds.has(entry))
      : [];
  const normalizeActorIds = (value) =>
    Array.isArray(value)
      ? value.filter((entry) => typeof entry === "string" && entry.trim().length > 0)
      : [];
  const source = oracle && typeof oracle === "object" ? oracle : {};
  return {
    preferredOutcomeEdges: normalizeEdgeIds(source.preferredOutcomeEdges),
    acceptableFallbackEdges: normalizeEdgeIds(source.acceptableFallbackEdges),
    forbiddenOutcomeEdges: normalizeEdgeIds(source.forbiddenOutcomeEdges),
    requiredIsolations: normalizeActorIds(source.requiredIsolations),
    requiredGroupClosure: normalizeEdgeIds(source.requiredGroupClosure),
  };
}

function normalizeActor(actor, index, worldId) {
  if (!actor || typeof actor !== "object") return null;
  const id = normalizeString(actor.id, `${worldId}-actor-${index + 1}`);
  const kind = normalizeString(actor.kind, "individual");
  const persona = normalizeString(actor.persona, "curious, warm, social");
  return {
    id,
    kind: ["individual", "pair", "group_seed", "circle_seed", "event_seed"].includes(kind)
      ? kind
      : "individual",
    persona,
    goals: Array.isArray(actor.goals)
      ? actor.goals.filter((goal) => typeof goal === "string")
      : [],
    preferences: actor.preferences && typeof actor.preferences === "object"
      ? actor.preferences
      : {},
    hardConstraints: Array.isArray(actor.hardConstraints)
      ? actor.hardConstraints.filter((constraint) => typeof constraint === "string")
      : [],
    socialStyle: normalizeString(actor.socialStyle, "warm"),
    patience: clamp(toNumber(actor.patience, 0.6), 0, 1),
    initiative: clamp(toNumber(actor.initiative, 0.6), 0, 1),
    mismatchTolerance: clamp(
      toNumber(actor.mismatchTolerance, 0.5),
      0,
      1,
    ),
    memoryDriftProfile: normalizeString(actor.memoryDriftProfile, "stable"),
    hiddenGoals: Array.isArray(actor.hiddenGoals)
      ? actor.hiddenGoals.filter((goal) => typeof goal === "string")
      : [],
    backendHints: actor.backendHints && typeof actor.backendHints === "object"
      ? actor.backendHints
      : {},
  };
}

function normalizeRelationship(relationship, index, actors) {
  if (!relationship || typeof relationship !== "object") return null;
  const type = normalizeString(relationship.type, "pair");
  const members = Array.isArray(relationship.members)
    ? relationship.members.filter((member) => typeof member === "string")
    : [];
  if (members.length === 0) return null;
  const memberSet = new Set(actors.map((actor) => actor.id));
  const validMembers = members.filter((member) => memberSet.has(member));
  if (validMembers.length === 0) return null;
  return {
    id: normalizeString(
      relationship.id,
      `${type}-${index + 1}-${validMembers.join("-")}`,
    ),
    type,
    members: validMembers,
    label: normalizeString(
      relationship.label,
      `${type} ${validMembers.join(" / ")}`,
    ),
    strength: clamp(toNumber(relationship.strength, 0.5), 0, 1),
    notes: normalizeString(relationship.notes, ""),
  };
}

function selectHorizonWorlds(worlds, horizon) {
  if (!horizon || horizon === "all") {
    return worlds.slice();
  }
  return worlds.filter((world) => world.horizon === horizon);
}

export function selectSocialSimWorlds(worlds, config) {
  const selectedWorldSet = config.worldSet ?? "core";
  const baseWorlds =
    config.worldFilter.length > 0 || config.scenarioFilter.length > 0
      ? worlds.slice()
      : worlds.filter((world) =>
          selectedWorldSet === "all" ? true : world.worldSet === selectedWorldSet,
        );
  const selectedByHorizon = selectHorizonWorlds(baseWorlds, config.horizon);
  const selectedByWorld = config.worldFilter.length
    ? selectedByHorizon.filter(
        (world) =>
          config.worldFilter.includes(world.id) ||
          config.worldFilter.includes(world.name),
      )
    : selectedByHorizon;
  const selectedByScenario = config.scenarioFilter.length
    ? selectedByWorld.filter((world) =>
        config.scenarioFilter.some(
          (scenarioId) =>
            world.seedScenarioIds.includes(scenarioId) ||
            world.sourceScenarioIds.includes(scenarioId) ||
            world.id.includes(scenarioId) ||
            world.name.toLowerCase().includes(scenarioId.toLowerCase()),
        ),
      )
    : selectedByWorld;

  return selectedByScenario.length > 0 ? selectedByScenario : selectedByHorizon;
}

export function createBackendAdapter(config) {
  return new SocialSimBackendAdapter(config);
}

export function createBrainProvider(config) {
  if (config.provider === "ollama") {
    return new OllamaSocialSimProvider(config);
  }
  if (config.provider === "openai") {
    return new OpenAISocialSimProvider(config);
  }
  return new HeuristicSocialSimProvider(config);
}

export function createJudgeProvider(config) {
  if (config.judgeProvider === "ollama") {
    return new OllamaJudgeProvider(config);
  }
  if (config.judgeProvider === "openai") {
    return new OpenAIJudgeProvider(config);
  }
  return new HeuristicJudgeProvider(config);
}

export async function runSocialSimulation(config) {
  mkdirSync(config.artifactRoot, { recursive: true });
  const runId = config.runId ?? `social-sim-${config.namespace}`;
  const runDir = path.join(config.artifactRoot, runId);
  mkdirSync(runDir, { recursive: true });

  const worlds = loadSocialSimWorldFixture(
    config.fixturePath,
    config.scenarioFixturePath,
  );
  const selectedWorlds = selectSocialSimWorlds(worlds, config);
  const adapter = createBackendAdapter(config);
  const brainProvider = createBrainProvider(config);
  const judgeProvider = createJudgeProvider(config);
  const startedAt = nowIso();
  const globalRng = makeSeededRng(config.seed);
  const bootstrap = await adapter.bootstrapRun({
    runId,
    namespace: config.namespace,
    dryRun: config.dryRun,
    worldCount: selectedWorlds.length,
  });
  const artifactBootstrap = sanitizeBootstrapForArtifact(bootstrap);

  const worldRuns = [];
  for (const [worldIndex, world] of selectedWorlds.entries()) {
    const worldSeed = Math.floor(globalRng() * 2_147_483_647) ^ worldIndex;
    const worldRng = makeSeededRng(worldSeed);
    const result = await runWorldSimulation({
      world,
      config,
      adapter,
      brainProvider,
      judgeProvider,
      runId,
      runDir,
      worldRng,
      worldIndex,
      bootstrap,
    });
    worldRuns.push(result);
  }

  const summary = summarizeRun(worldRuns, config, artifactBootstrap);
  const artifact = {
    runId,
    namespace: config.namespace,
    createdAt: startedAt,
    completedAt: nowIso(),
    promptVersion: SOCIAL_SIM_PROMPT_VERSION,
    config: {
      provider: config.provider,
      judgeProvider: config.judgeProvider,
      horizon: config.horizon,
      turnBudget: config.turnBudget,
      backendTurnDelayMs: config.backendTurnDelayMs,
      backendRetryCount: config.backendRetryCount,
      backendRetryBaseDelayMs: config.backendRetryBaseDelayMs,
      cleanupMode: config.cleanupMode,
      dryRun: config.dryRun,
      nightly: config.nightly,
      benchmarkMode: config.benchmarkMode,
      failOnRemoteFallback: config.failOnRemoteFallback,
      seed: config.seed,
      worldFilter: config.worldFilter,
      scenarioFilter: config.scenarioFilter,
      fixturePath: config.fixturePath,
      scenarioFixturePath: config.scenarioFixturePath,
      tuning: config.tuning,
    },
    bootstrap,
    worlds: worldRuns,
    summary,
  };

  writeSocialSimArtifact(runDir, "run.json", artifact);
  writeSocialSimArtifact(runDir, "summary.json", summary);

  const cleanup = await adapter.cleanupRun({
    runId,
    namespace: config.namespace,
    worlds: worldRuns,
    mode: config.cleanupMode,
  });
  artifact.cleanup = cleanup;
  writeSocialSimArtifact(runDir, "run.json", artifact);

  return {
    runDir,
    artifact,
    summary,
    cleanup,
  };
}

async function runWorldSimulation({
  world,
  config,
  adapter,
  brainProvider,
  judgeProvider,
  runId,
  runDir,
  worldRng,
  worldIndex,
  bootstrap,
}) {
  const worldRunId = `${runId}:${world.id}`;
  const transcript = [];
  const judgeTurns = [];
  const metrics = {
    introductions: 0,
    replies: 0,
    followups: 0,
    invites: 0,
    memorySignals: 0,
    recoverySignals: 0,
    moderationSignals: 0,
    matchedMembers: new Set(),
    stalledTurns: 0,
    totalTurns: 0,
  };
  for (const relationship of world.relationships) {
    if (!Number.isFinite(relationship.initialStrength)) {
      relationship.initialStrength = relationship.strength;
    }
  }
  const state = {
    stage: "onboarding",
    turnIndex: 0,
    focusActorIndex: 0,
    lastActionByActor: new Map(),
    knownTargets: new Map(),
    relationships: world.relationships.map((relationship) => ({
      ...relationship,
      status: "pending",
    })),
  };

  const turnBudget = config.turnBudget ?? world.turnBudget;
  for (let turnIndex = 0; turnIndex < turnBudget; turnIndex += 1) {
    state.turnIndex = turnIndex;
    state.stage = inferWorldStage(turnIndex, turnBudget, world);
    const actor = world.actors[(turnIndex + worldIndex) % world.actors.length];
    const action = await brainProvider.generateActorTurn({
      world,
      state,
      actor,
      transcript,
      rng: worldRng,
      config,
    });
    const backendResult = await adapter.submitTurn({
      runId,
      world,
      actor,
      action,
      state,
      transcript,
      config,
      dryRun: config.dryRun,
    });
    const turnRecord = applyTurnOutcome({
      world,
      config,
      actor,
      action,
      backendResult,
      state,
      transcript,
      metrics,
      rng: worldRng,
      turnIndex,
      bootstrap,
    });
    transcript.push(turnRecord);
    metrics.totalTurns += 1;
    judgeTurns.push(
      await judgeProvider.scoreTurn({
        world,
        actor,
        action,
        turnRecord,
        transcript,
        state,
        config,
      }),
    );
  }

  const finalJudge = await judgeProvider.scoreWorld({
    world,
    transcript,
    state,
    metrics,
    turns: judgeTurns,
    config,
  });
  const worldSummary = summarizeWorld(world, transcript, metrics, finalJudge, config);
  const worldArtifact = {
    worldRunId,
    worldId: world.id,
    name: world.name,
    horizon: world.horizon,
    family: world.family,
    turnBudget,
    seedScenarioIds: world.seedScenarioIds,
    sourceScenarioIds: world.sourceScenarioIds,
    promptVersion: SOCIAL_SIM_PROMPT_VERSION,
    actors: world.actors,
    relationships: world.relationships,
    transcript,
    judgeTurns,
    judge: finalJudge,
    summary: worldSummary,
  };
  writeSocialSimArtifact(runDir, `${world.id}.json`, worldArtifact);
  return worldArtifact;
}

function inferWorldStage(turnIndex, turnBudget, world) {
  if (turnIndex === 0) return "onboarding";
  if (turnIndex < Math.max(2, Math.floor(turnBudget * 0.4))) {
    return "matching";
  }
  if (turnIndex < Math.max(4, Math.floor(turnBudget * 0.75))) {
    return "conversation";
  }
  if (world.horizon === "long") {
    return "memory_drift";
  }
  return "convergence";
}

function applyTurnOutcome({
  world,
  config,
  actor,
  action,
  backendResult,
  state,
  metrics,
  rng,
  turnIndex,
  bootstrap,
}) {
  const targetRelationship = action.detachedFromWeakFit
    ? null
    : findBestRelationship(world, actor, action.targetActorId, state);
  const isPositive =
    action.intent === "introduce" ||
    action.intent === "ask_preference" ||
    action.intent === "reply" ||
    action.intent === "follow_up" ||
    action.intent === "invite_group" ||
    action.intent === "propose_event" ||
    action.intent === "reference_memory";

  if (action.intent === "introduce") metrics.introductions += 1;
  if (action.intent === "reply") metrics.replies += 1;
  if (action.intent === "follow_up") metrics.followups += 1;
  if (action.intent === "invite_group") metrics.invites += 1;
  if (action.intent === "reference_memory") metrics.memorySignals += 1;
  if (action.intent === "recover_no_match") metrics.recoverySignals += 1;
  if (action.intent === "flag_moderation") metrics.moderationSignals += 1;

  if (targetRelationship && isPositive) {
    const nextStrength = clamp(
      targetRelationship.strength + relationshipDeltaForAction(world, action.intent, getTuning(config)),
      0,
      1,
    );
    targetRelationship.strength = nextStrength;
    if (nextStrength >= 0.75) {
      targetRelationship.status = "matched";
      targetRelationship.lastMatchedTurn = turnIndex;
      metrics.matchedMembers.add(targetRelationship.id);
    }
    state.knownTargets.set(targetRelationship.id, {
      turnIndex,
      action: action.intent,
      confidence: action.confidence,
    });
  }

  const stalled =
    action.intent === "idle" ||
    action.intent === "wait" ||
    action.intent === "unknown";
  if (stalled) {
    metrics.stalledTurns += 1;
  }

  state.lastActionByActor.set(actor.id, {
    ...action,
    backendMode: backendResult.mode,
    backendStatus: backendResult.status,
    backendDetail: backendResult.detail ?? null,
  });

  return {
    turnIndex,
    actorId: actor.id,
    actorKind: actor.kind,
    stage: state.stage,
    promptVersion: SOCIAL_SIM_PROMPT_VERSION,
    intent: action.intent,
    targetActorId: action.targetActorId ?? null,
    message: action.message,
    rationale: action.rationale,
    tone: action.tone,
    confidence: action.confidence,
    memoryReferences: action.memoryReferences ?? [],
    detachedFromWeakFit: Boolean(action.detachedFromWeakFit),
    worldContext: {
      horizon: world.horizon,
      family: world.family,
      relationshipId: targetRelationship?.id ?? null,
      backendMode: backendResult.mode,
      bootstrapRunId: bootstrap?.runId ?? null,
    },
    backend: backendResult,
    outcome: {
      matched: Boolean(targetRelationship && targetRelationship.status === "matched"),
      relationshipStrength: targetRelationship?.strength ?? null,
      stalled,
      positive: isPositive,
    },
    randomFactor: Number(rng().toFixed(6)),
  };
}

function findBestRelationship(world, actor, explicitTargetId, state, tuning = DEFAULT_SOCIAL_SIM_TUNING) {
  return findBestRelationshipWithState(world, actor, explicitTargetId, state ?? null, tuning);
}

function findBestRelationshipWithState(
  world,
  actor,
  explicitTargetId,
  state,
  tuning = DEFAULT_SOCIAL_SIM_TUNING,
) {
  if (explicitTargetId) {
    const explicit = world.relationships.find(
      (relationship) =>
        relationship.members.includes(actor.id) &&
        relationship.members.includes(explicitTargetId),
    );
    if (explicit) return explicit;
  }
  const candidates = world.relationships.filter((relationship) =>
    relationship.members.includes(actor.id),
  );
  if (candidates.length === 0) return null;

  const ranked = candidates
    .map((relationship) => ({
      relationship,
      score: relationshipPriorityScore(world, actor, relationship, state, tuning),
    }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  if (!best) return null;
  if (
    (world.family === "recovery" || world.family === "network-rebalancing") &&
    best.score < tuning.thresholds.weakRelationshipFloor
  ) {
    return null;
  }
  return best.relationship;
}

function findWeakRelationshipWithState(world, actor, state, tuning = DEFAULT_SOCIAL_SIM_TUNING) {
  const candidates = world.relationships.filter(
    (relationship) =>
      relationship.members.includes(actor.id) &&
      relationship.status !== "matched" &&
      relationship.strength < tuning.thresholds.lowStrength,
  );
  if (candidates.length === 0) return null;

  return candidates
    .map((relationship) => ({
      relationship,
      score: relationshipPriorityScore(world, actor, relationship, state, tuning),
    }))
    .sort((left, right) => left.score - right.score)[0]?.relationship ?? null;
}

function findBestAlternativeRelationshipWithState(
  world,
  actor,
  state,
  tuning = DEFAULT_SOCIAL_SIM_TUNING,
  options = {},
) {
  const excludedIds = new Set(options.excludedIds ?? []);
  const candidates = world.relationships.filter((relationship) => {
    if (!relationship.members.includes(actor.id)) return false;
    if (excludedIds.has(relationship.id)) return false;
    const meta = state?.knownTargets?.get(relationship.id) ?? null;
    if (meta?.action === "recover_no_match") return false;
    if (relationship.strength < tuning.thresholds.lowStrength) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  return candidates
    .map((relationship) => ({
      relationship,
      score: relationshipPriorityScore(world, actor, relationship, state, tuning),
    }))
    .sort((left, right) => right.score - left.score)[0]?.relationship ?? null;
}

function resolvePostRecoveryTargetActorId({
  world,
  actor,
  state,
  tuning,
  currentTargetActorId,
  excludedRelationshipIds = [],
  strategy = "drop",
}) {
  const resolvedStrategy = resolvePolicyTargetStrategy(strategy, "drop");
  if (resolvedStrategy === "drop") return null;
  if (resolvedStrategy === "current") return currentTargetActorId ?? null;

  const alternative = findBestAlternativeRelationshipWithState(world, actor, state, tuning, {
    excludedIds: excludedRelationshipIds,
  });
  return alternative?.members.find((member) => member !== actor.id) ?? null;
}

function findBestOracleRelationshipForActor(
  world,
  actor,
  state,
  tuning = DEFAULT_SOCIAL_SIM_TUNING,
  options = {},
) {
  const classes = new Set(options.classes ?? ["preferred", "acceptable"]);
  const excludedIds = new Set(options.excludedIds ?? []);
  const onlyUnmatched = Boolean(options.onlyUnmatched);
  const requireGroupClosure = Boolean(options.requireGroupClosure);
  const minStrength = Number.isFinite(options.minStrength) ? options.minStrength : null;
  const candidates = world.relationships.filter((relationship) => {
    if (!relationship.members.includes(actor.id)) return false;
    if (excludedIds.has(relationship.id)) return false;
    if (onlyUnmatched && relationship.status === "matched") return false;
    if (requireGroupClosure && !isRequiredGroupClosure(world, relationship)) return false;
    if (minStrength !== null && (relationship.strength ?? 0) < minStrength) return false;
    const oracleClass = classifyOracleRelationship(world, relationship);
    if (!classes.has(oracleClass)) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  return candidates
    .map((relationship) => ({
      relationship,
      score: relationshipPriorityScore(world, actor, relationship, state, tuning),
    }))
    .sort((left, right) => right.score - left.score)[0]?.relationship ?? null;
}

function averageScore(values) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function computeRecoveryResolutionScore(world, oracleMetrics, metrics) {
  if (world.family !== "recovery") return 0;
  if (oracleMetrics.preferredMatchedCount > 0) return 1;
  if (oracleMetrics.acceptableMatchedCount > 0) return 0.78;
  if (metrics.recoverySignals > 0 && oracleMetrics.forbiddenMatchedCount === 0) return 0.34;
  return 0;
}

function computeCircleReassemblyScore(world, oracleMetrics) {
  if (world.family !== "circle") return 0;
  return averageScore([
    oracleMetrics.preferredRecall,
    oracleMetrics.groupClosureSuccess,
    oracleMetrics.oracleProgressScore,
  ]);
}

function computeDenseBridgeScore(world, oracleMetrics) {
  if (world.family !== "dense-social-graph") return 0;
  return averageScore([
    oracleMetrics.groupClosureSuccess,
    oracleMetrics.closurePrecision,
    oracleMetrics.oracleProgressScore,
  ]);
}

function classifyOracleRelationship(world, relationship) {
  if (!relationship) return "neutral";
  const oracle = world.oracle ?? {};
  if ((oracle.forbiddenOutcomeEdges ?? []).includes(relationship.id)) return "forbidden";
  if ((oracle.preferredOutcomeEdges ?? []).includes(relationship.id)) return "preferred";
  if ((oracle.acceptableFallbackEdges ?? []).includes(relationship.id)) return "acceptable";
  return "neutral";
}

function isRequiredGroupClosure(world, relationship) {
  return (world.oracle?.requiredGroupClosure ?? []).includes(relationship?.id);
}

function worldNeedsRecovery(world) {
  return world.relationships.some((relationship) => relationship.strength < 0.35);
}

function worldNeedsMemory(world) {
  return (
    world.horizon === "long" ||
    world.family === "circle" ||
    world.family === "event-and-memory" ||
    world.evaluationFocus.includes("memory_helpfulness")
  );
}

function worldNeedsGroupProgress(world) {
  return (
    world.family === "pair-and-group" ||
    world.family === "dense-social-graph" ||
    world.family === "circle" ||
    world.family === "network-rebalancing"
  );
}

function relationshipDeltaForAction(world, intent, tuning = DEFAULT_SOCIAL_SIM_TUNING) {
  if (intent === "ask_preference") return tuning.deltas.askPreference;
  if (intent === "reply") return tuning.deltas.reply;
  if (intent === "reference_memory") {
    return worldNeedsMemory(world)
      ? tuning.deltas.referenceMemoryInMemoryWorld
      : tuning.deltas.referenceMemory;
  }
  if (intent === "invite_group") {
    return worldNeedsGroupProgress(world)
      ? tuning.deltas.inviteGroupInGroupWorld
      : tuning.deltas.inviteGroup;
  }
  if (intent === "propose_event") {
    return world.horizon === "long" || world.family === "recovery"
      ? tuning.deltas.proposeEventInLongOrRecovery
      : tuning.deltas.proposeEvent;
  }
  return tuning.deltas.inviteGroup;
}

function relationshipPriorityScore(
  world,
  actor,
  relationship,
  state,
  tuning = DEFAULT_SOCIAL_SIM_TUNING,
) {
  const meta = state?.knownTargets?.get(relationship.id) ?? null;
  const lastAction = normalizeString(meta?.action, "");
  const lastTurnIndex = Number.isFinite(meta?.turnIndex) ? meta.turnIndex : -1;
  const turnIndex = Number.isFinite(state?.turnIndex) ? state.turnIndex : 0;
  const ageBonus = lastTurnIndex >= 0
    ? clamp(
        (turnIndex - lastTurnIndex) * tuning.priority.ageBonusStep,
        0,
        tuning.priority.ageBonusCap,
      )
    : tuning.priority.defaultAgeBonus;
  const pendingBonus =
    relationship.status === "matched"
      ? tuning.priority.matchedPenalty
      : tuning.priority.unmatchedBonus;
  let score = relationship.strength + pendingBonus + ageBonus;
  const oracleClass = classifyOracleRelationship(world, relationship);
  if (oracleClass === "preferred") score += 0.26;
  if (oracleClass === "acceptable") score += 0.12;
  if (oracleClass === "forbidden") score -= 0.55;
  if (isRequiredGroupClosure(world, relationship)) score += 0.14;
  if (relationship.status === "matched" && oracleClass === "forbidden") score -= 0.35;

  if (lastAction === "recover_no_match") score += tuning.priority.recoverPenalty;
  if (lastAction === "flag_moderation") score += tuning.priority.moderationPenalty;

  if (world.family === "recovery") {
    score += relationship.strength < tuning.thresholds.lowStrength
      ? tuning.priority.recoveryWeakBonus
      : tuning.priority.recoveryStrongPenalty;
    if (lastAction === "recover_no_match") score += tuning.priority.recoveryRepeatPenalty;
  }

  if (world.family === "circle") {
    if (actor.kind === "circle_seed") score += tuning.priority.circleSeedBonus;
    if (relationship.status !== "matched") score += tuning.priority.circleUnmatchedBonus;
    if (
      relationship.status !== "matched" &&
      relationship.strength >= tuning.thresholds.nearMatchMin
    ) {
      score += tuning.priority.nearMatchBonus + tuning.priority.circleNearMatchBonus;
    }
    if (
      world.horizon !== "short" &&
      relationship.strength >= tuning.thresholds.circleContinuityMin &&
      relationship.strength < tuning.thresholds.mediumStrength
    ) {
      score += tuning.priority.circleContinuityBonus;
    }
  }

  if (world.family === "network-rebalancing") {
    if (relationship.strength < tuning.thresholds.networkWeakPenaltyThreshold) {
      score += tuning.priority.networkWeakPenalty;
    }
    if (
      relationship.status !== "matched" &&
      relationship.strength >= tuning.thresholds.nearMatchMin
    ) {
      score += tuning.priority.nearMatchBonus + tuning.priority.networkNearMatchBonus;
    }
    if (
      relationship.strength >= tuning.thresholds.circleContinuityMin &&
      relationship.strength < tuning.thresholds.mediumStrength
    ) {
      score += tuning.priority.networkMediumBonus;
    }
    if (["event_seed", "group_seed", "circle_seed"].includes(actor.kind)) {
      score += tuning.priority.networkOrganizerBonus;
    }
    if (relationship.status !== "matched") score += tuning.priority.networkUnmatchedBonus;
    if (lastAction === "recover_no_match") score += tuning.priority.networkRecoverPenalty;
  }

  return score;
}

function createPlannedAction({
  context,
  intent,
  targetActorId = null,
  detachedFromWeakFit = false,
  confidence = null,
  rationale = null,
  memoryReferences = null,
}) {
  const { actor, state, world } = context;
  const resolvedIntent = normalizeString(intent, "follow_up");
  const resolvedTargetActorId = normalizeString(targetActorId, "") || null;
  return {
    provider: "heuristic",
    promptVersion: SOCIAL_SIM_PROMPT_VERSION,
    intent: resolvedIntent,
    targetActorId: resolvedTargetActorId,
    message: buildMessageForIntent({
      intent: resolvedIntent,
      actor,
      targetActorId: resolvedTargetActorId,
      world,
      state,
    }),
    detachedFromWeakFit: Boolean(detachedFromWeakFit),
    tone: actor.socialStyle,
    confidence: clamp(
      toNumber(
        confidence,
        resolvedIntent === "recover_no_match" ? 0.52 : 0.76,
      ),
      0,
      1,
    ),
    rationale:
      normalizeString(
        rationale,
        resolvedIntent === "reference_memory"
          ? "Using earlier conversation context to improve continuity."
          : resolvedIntent === "invite_group"
            ? "Trying to move the social graph toward a broader group outcome."
            : resolvedIntent === "propose_event"
              ? "Trying to convert a weak or partial thread into a clearer concrete plan."
              : resolvedIntent === "recover_no_match"
                ? "The pairing looks weak, so the actor is trying a recovery path."
                : "Advancing the conversation in a socially plausible way.",
      ),
    memoryReferences:
      memoryReferences ??
      (worldNeedsMemory(world)
        ? [
            {
              key: "preference_memory",
              confidence: 0.71,
              excerpt: actor.goals[0] ?? actor.persona,
            },
          ]
        : []),
  };
}

function resolveActorTarget(world, actor, relationship) {
  if (!relationship) return null;
  return relationship.members.find((member) => member !== actor.id) ?? null;
}

function canUseNearMatch(world, relationship, tuning = DEFAULT_SOCIAL_SIM_TUNING) {
  return (
    relationship &&
    relationship.status !== "matched" &&
    relationship.strength >= tuning.thresholds.nearMatchMin
  );
}

function shouldPreferMemory(world, actor, state, recentRelationshipAction) {
  return (
    worldNeedsMemory(world) &&
    (state.stage === "memory_drift" ||
      actor.memoryDriftProfile !== "stable" ||
      recentRelationshipAction === "reference_memory")
  );
}

function planRecoveryFamilyAction(context) {
  const { actor, state, world, rng } = context;
  const tuning = getTuning(context.config);
  const targetRelationship = findBestRelationshipWithState(world, actor, null, state, tuning);
  const weakRelationship = findWeakRelationshipWithState(world, actor, state, tuning);
  const preferredFallbackRelationship = findBestOracleRelationshipForActor(
    world,
    actor,
    state,
    tuning,
    {
      classes: ["preferred", "acceptable"],
      onlyUnmatched: true,
    },
  );
  const targetActorId = resolveActorTarget(world, actor, targetRelationship);
  const weakTargetActorId = resolveActorTarget(world, actor, weakRelationship);
  const preferredFallbackTargetActorId = resolveActorTarget(
    world,
    actor,
    preferredFallbackRelationship,
  );
  const knownTargets = state.knownTargets ?? new Map();
  const lastActionByActor = state.lastActionByActor ?? new Map();
  const recentActorAction = lastActionByActor.get(actor.id)?.intent ?? "";
  const recentRelationshipAction =
    targetRelationship ? knownTargets.get(targetRelationship.id)?.action ?? "" : "";
  const recentWeakRelationshipAction =
    weakRelationship ? knownTargets.get(weakRelationship.id)?.action ?? "" : "";
  const recoveredRelationshipIds = world.relationships
    .filter(
      (relationship) =>
        relationship.members.includes(actor.id) &&
        knownTargets.get(relationship.id)?.action === "recover_no_match",
    )
    .map((relationship) => relationship.id);
  const hasRecoveredRelationship =
    recentRelationshipAction === "recover_no_match" ||
    recentActorAction === "recover_no_match";
  const targetOracleClass = classifyOracleRelationship(world, targetRelationship);
  const mediumStrength = (targetRelationship?.strength ?? 0) >= tuning.thresholds.lowStrength &&
    (targetRelationship?.strength ?? 0) < tuning.thresholds.mediumStrength;
  const strongStrength = (targetRelationship?.strength ?? 0) >= tuning.thresholds.mediumStrength;
  const fallbackTargetActorId =
    preferredFallbackTargetActorId ??
    resolvePostRecoveryTargetActorId({
      world,
      actor,
      state,
      tuning,
      currentTargetActorId: targetActorId,
      excludedRelationshipIds: recoveredRelationshipIds,
      strategy: "best_alternative",
    });

  if (state.stage === "onboarding") {
    return createPlannedAction({
      context,
      intent: "introduce",
      targetActorId,
    });
  }

  if (hasRecoveredRelationship && state.stage === "conversation") {
    return createPlannedAction({
      context,
      intent:
        fallbackTargetActorId && preferredFallbackRelationship
          ? (preferredFallbackRelationship.strength ?? 0) >= tuning.thresholds.nearMatchMin
            ? "propose_event"
            : "reply"
          : resolvePolicyAction(
              tuning.policy.recoveryPostRecoveryConversationAction,
              "invite_group",
            ),
      targetActorId: fallbackTargetActorId,
      detachedFromWeakFit: !fallbackTargetActorId,
    });
  }

  if (hasRecoveredRelationship && state.stage === "convergence") {
    return createPlannedAction({
      context,
      intent: fallbackTargetActorId ? "propose_event" : resolvePolicyAction(
        tuning.policy.recoveryPostRecoveryConvergenceAction,
        "propose_event",
      ),
      targetActorId: fallbackTargetActorId,
      detachedFromWeakFit: !fallbackTargetActorId,
    });
  }

  if (weakRelationship && worldNeedsRecovery(world) &&
    (["group_seed", "circle_seed", "event_seed"].includes(actor.kind) ||
      actor.socialStyle === "clear")
  ) {
    if (recentWeakRelationshipAction === "recover_no_match") {
      return createPlannedAction({
        context,
        intent:
          world.family === "circle"
            ? "invite_group"
            : state.stage === "convergence"
              ? "propose_event"
              : "invite_group",
        targetActorId:
          world.family === "network-rebalancing"
            ? resolvePostRecoveryTargetActorId({
                world,
                actor,
                state,
                tuning,
                currentTargetActorId: targetActorId,
                excludedRelationshipIds: [
                  ...recoveredRelationshipIds,
                  weakRelationship?.id,
                ].filter(Boolean),
                strategy: tuning.policy.networkOrganizerPostRecoveryTargetStrategy,
              })
            : null,
        detachedFromWeakFit: true,
      });
    }
    return createPlannedAction({
      context,
      intent: "recover_no_match",
      targetActorId: weakTargetActorId,
    });
  }

  if (world.family === "recovery" && recentActorAction === "recover_no_match" && state.stage !== "onboarding") {
    return createPlannedAction({
      context,
      intent:
        state.stage === "matching"
          ? "reply"
          : state.stage === "convergence"
            ? "propose_event"
            : "reply",
      targetActorId: fallbackTargetActorId,
      detachedFromWeakFit: true,
    });
  }

  if (isLowStrength(targetRelationship, tuning) && state.stage !== "onboarding") {
    return createPlannedAction({
      context,
      intent: worldNeedsGroupProgress(world) && rng() > tuning.probabilities.lowStrengthGroupRecovery
        ? "invite_group"
        : "recover_no_match",
      targetActorId: lowStrengthTargetActorId(world, actor, state, tuning, targetRelationship),
      detachedFromWeakFit: false,
    });
  }

  if (state.stage === "matching") {
    return createPlannedAction({
      context,
      intent:
        preferredFallbackTargetActorId && weakRelationship
          ? "reply"
          : (targetOracleClass === "preferred" || targetOracleClass === "acceptable")
            ? "reply"
          : mediumStrength && worldNeedsGroupProgress(world) && rng() > tuning.probabilities.matchingGroupInvite
          ? "invite_group"
          : "ask_preference",
      targetActorId: preferredFallbackTargetActorId ?? targetActorId,
    });
  }

  if (
    world.family === "recovery" &&
    (targetOracleClass === "preferred" || targetOracleClass === "acceptable") &&
    state.stage === "conversation"
  ) {
    return createPlannedAction({
      context,
      intent:
        (targetRelationship?.strength ?? 0) >= tuning.thresholds.lowStrength
          ? "propose_event"
          : "reply",
      targetActorId,
    });
  }

  if (
    world.family === "recovery" &&
    (targetOracleClass === "preferred" || targetOracleClass === "acceptable") &&
    state.stage === "convergence"
  ) {
    return createPlannedAction({
      context,
      intent: "propose_event",
      targetActorId,
    });
  }

  if (
    strongStrength &&
    state.stage === "conversation"
  ) {
    return createPlannedAction({
      context,
      intent: "reply",
      targetActorId,
    });
  }

  if (state.stage === "memory_drift") {
    return createPlannedAction({
      context,
      intent: shouldPreferMemory(world, actor, state, recentRelationshipAction)
        ? "reference_memory"
        : "follow_up",
      targetActorId,
    });
  }

  if (
    worldNeedsMemory(world) &&
    state.stage === "conversation" &&
    rng() > tuning.probabilities.memoryConversation
  ) {
    return createPlannedAction({
      context,
      intent: "reference_memory",
      targetActorId,
    });
  }

  if (
    state.stage === "conversation" &&
    world.family === "dense-social-graph" &&
    rng() > tuning.probabilities.denseConversationInvite
  ) {
    return createPlannedAction({
      context,
      intent: "invite_group",
      targetActorId,
    });
  }

  if (
    state.stage === "conversation" &&
    world.family === "pair-and-group" &&
    rng() > tuning.probabilities.pairConversationInvite
  ) {
    return createPlannedAction({
      context,
      intent: "invite_group",
      targetActorId,
    });
  }

  if (
    state.stage === "convergence" &&
    world.family === "event-and-memory" &&
    rng() > tuning.probabilities.eventConvergence
  ) {
    return createPlannedAction({
      context,
      intent: "propose_event",
      targetActorId,
    });
  }

  if (
    state.stage === "convergence" &&
    strongStrength &&
    rng() > tuning.probabilities.strongConvergenceEvent
  ) {
    return createPlannedAction({
      context,
      intent: "propose_event",
      targetActorId,
    });
  }

  if (
    shouldPreferMemory(world, actor, state, recentRelationshipAction) &&
    state.stage !== "onboarding" &&
    rng() > tuning.probabilities.genericMemoryReference
  ) {
    return createPlannedAction({
      context,
      intent: "reference_memory",
      targetActorId,
    });
  }

  return createPlannedAction({
    context,
    intent: "follow_up",
    targetActorId,
  });
}

function isLowStrength(relationship, tuning) {
  return (relationship?.strength ?? 0) < tuning.thresholds.lowStrength;
}

function lowStrengthTargetActorId(world, actor, state, tuning, relationship) {
  if (!relationship) {
    const fallback = findBestRelationshipWithState(world, actor, null, state, tuning);
    return resolveActorTarget(world, actor, fallback);
  }
  return resolveActorTarget(world, actor, relationship);
}

function planCircleFamilyAction(context) {
  const { actor, state, world } = context;
  const tuning = getTuning(context.config);
  const targetRelationship = findBestRelationshipWithState(world, actor, null, state, tuning);
  const weakRelationship = findWeakRelationshipWithState(world, actor, state, tuning);
  const requiredRelationship =
    findBestOracleRelationshipForActor(world, actor, state, tuning, {
      classes: ["preferred"],
      onlyUnmatched: true,
      requireGroupClosure: true,
    }) ??
    findBestOracleRelationshipForActor(world, actor, state, tuning, {
      classes: ["preferred"],
      onlyUnmatched: true,
    });
  const resolvedRelationship = requiredRelationship ?? targetRelationship;
  const targetActorId = resolveActorTarget(world, actor, resolvedRelationship);
  const knownTargets = state.knownTargets ?? new Map();
  const recentRelationshipAction =
    resolvedRelationship ? knownTargets.get(resolvedRelationship.id)?.action ?? "" : "";
  const mediumStrength = (resolvedRelationship?.strength ?? 0) >= tuning.thresholds.lowStrength &&
    (resolvedRelationship?.strength ?? 0) < tuning.thresholds.mediumStrength;

  if (state.stage === "onboarding") {
    return createPlannedAction({
      context,
      intent: "introduce",
      targetActorId,
    });
  }

  if (actor.kind === "circle_seed" || actor.id.includes("organizer")) {
    if (
      state.stage !== "onboarding" &&
      weakRelationship &&
      recentRelationshipAction === "recover_no_match"
    ) {
      return createPlannedAction({
        context,
        intent: "invite_group",
        targetActorId: null,
        detachedFromWeakFit: true,
      });
    }
    if (canUseNearMatch(world, resolvedRelationship, tuning)) {
      return createPlannedAction({
        context,
        intent: "invite_group",
        targetActorId,
      });
    }
    if (
      worldNeedsMemory(world) &&
      state.stage !== "onboarding" &&
      mediumStrength
    ) {
      return createPlannedAction({
        context,
        intent: requiredRelationship || recentRelationshipAction === "reference_memory"
          ? "invite_group"
          : "reference_memory",
        targetActorId,
      });
    }
  }

  if (
    world.horizon === "long" &&
    ["circle_seed", "group_seed"].includes(actor.kind) &&
    mediumStrength &&
    state.stage !== "onboarding"
  ) {
    return createPlannedAction({
      context,
      intent:
        canUseNearMatch(world, resolvedRelationship, tuning) ||
        recentRelationshipAction === "reference_memory"
          ? "invite_group"
          : "reply",
      targetActorId,
    });
  }

  if (
    requiredRelationship &&
    state.stage === "conversation" &&
    state.stage !== "onboarding"
  ) {
    return createPlannedAction({
      context,
      intent:
        canUseNearMatch(world, resolvedRelationship, tuning) ||
        (resolvedRelationship?.strength ?? 0) >= tuning.thresholds.circleContinuityMin
          ? "invite_group"
          : "reply",
      targetActorId,
    });
  }

  if (worldNeedsMemory(world) && state.stage === "memory_drift") {
    return createPlannedAction({
      context,
      intent:
        requiredRelationship &&
        (resolvedRelationship?.strength ?? 0) >= tuning.thresholds.circleContinuityMin
          ? "invite_group"
          : "reference_memory",
      targetActorId,
    });
  }

  if (
    world.family === "circle" &&
    weakRelationship &&
    state.stage !== "onboarding" &&
    weakRelationship.strength < tuning.thresholds.lowStrength
  ) {
    return createPlannedAction({
      context,
      intent: "recover_no_match",
      targetActorId: resolveActorTarget(world, actor, weakRelationship),
    });
  }

  return null;
}

function planNetworkRebalancingFamilyAction(context) {
  const { actor, state, world, rng } = context;
  const tuning = getTuning(context.config);
  const targetRelationship = findBestRelationshipWithState(world, actor, null, state, tuning);
  const weakRelationship = findWeakRelationshipWithState(world, actor, state, tuning);
  const targetActorId = resolveActorTarget(world, actor, targetRelationship);
  const knownTargets = state.knownTargets ?? new Map();
  const recentRelationshipAction =
    targetRelationship ? knownTargets.get(targetRelationship.id)?.action ?? "" : "";
  const recoveredRelationshipIds = world.relationships
    .filter(
      (relationship) =>
        relationship.members.includes(actor.id) &&
        knownTargets.get(relationship.id)?.action === "recover_no_match",
    )
    .map((relationship) => relationship.id);
  const hasRecoveredRelationship =
    recentRelationshipAction === "recover_no_match" ||
    (state.lastActionByActor.get(actor.id)?.intent ?? "") === "recover_no_match";

  if (state.stage === "onboarding") {
    return createPlannedAction({
      context,
      intent: "introduce",
      targetActorId,
    });
  }

  if (["event_seed", "group_seed", "circle_seed"].includes(actor.kind)) {
    const nearMatchTarget = canUseNearMatch(world, targetRelationship, tuning);
    if (hasRecoveredRelationship && (state.stage === "conversation" || state.stage === "memory_drift")) {
      return createPlannedAction({
        context,
        intent:
          state.stage === "memory_drift"
            ? resolvePolicyAction(
                tuning.policy.networkOrganizerPostRecoveryMemoryDriftAction,
                "propose_event",
              )
            : resolvePolicyAction(
                tuning.policy.networkOrganizerPostRecoveryConversationAction,
                "invite_group",
              ),
        targetActorId: resolvePostRecoveryTargetActorId({
          world,
          actor,
          state,
          tuning,
          currentTargetActorId: targetActorId,
          excludedRelationshipIds: recoveredRelationshipIds,
          strategy: tuning.policy.networkOrganizerPostRecoveryTargetStrategy,
        }),
        detachedFromWeakFit: true,
      });
    }
    if (nearMatchTarget && state.stage === "conversation") {
      return createPlannedAction({
        context,
        intent: "invite_group",
        targetActorId,
      });
    }
    if (nearMatchTarget && state.stage === "memory_drift") {
      return createPlannedAction({
        context,
        intent: "propose_event",
        targetActorId,
      });
    }
    if (state.stage === "matching") {
      return createPlannedAction({
        context,
        intent:
          (targetRelationship?.strength ?? 0) >= tuning.thresholds.lowStrength
            ? "invite_group"
            : "ask_preference",
        targetActorId,
      });
    }
    if (weakRelationship && weakRelationship.strength < tuning.thresholds.networkWeakPenaltyThreshold) {
      return createPlannedAction({
        context,
        intent: "recover_no_match",
        targetActorId: resolveActorTarget(world, actor, weakRelationship),
      });
    }
    if (worldNeedsMemory(world) && rng() > tuning.probabilities.networkMemoryReference) {
      return createPlannedAction({
        context,
        intent: "reference_memory",
        targetActorId,
      });
    }
    return createPlannedAction({
      context,
      intent:
        worldNeedsGroupProgress(world) && (targetRelationship?.strength ?? 0) >= tuning.thresholds.lowStrength
          ? "invite_group"
          : "follow_up",
      targetActorId,
    });
  }

  if (
    weakRelationship &&
    weakRelationship.strength < tuning.thresholds.lowStrength &&
    state.stage !== "onboarding"
  ) {
    return createPlannedAction({
      context,
      intent: "recover_no_match",
      targetActorId: resolveActorTarget(world, actor, weakRelationship),
    });
  }

  return null;
}

function planDenseSocialGraphFamilyAction(context) {
  const { actor, state, world, rng } = context;
  const tuning = getTuning(context.config);
  const targetRelationship = findBestRelationshipWithState(world, actor, null, state, tuning);
  const weakRelationship = findWeakRelationshipWithState(world, actor, state, tuning);
  const requiredRelationship =
    findBestOracleRelationshipForActor(world, actor, state, tuning, {
      classes: ["preferred", "acceptable"],
      onlyUnmatched: true,
      requireGroupClosure: true,
      minStrength: tuning.thresholds.lowStrength,
    }) ??
    findBestOracleRelationshipForActor(world, actor, state, tuning, {
      classes: ["preferred", "acceptable"],
      onlyUnmatched: true,
      minStrength: tuning.thresholds.lowStrength,
    });
  const resolvedRelationship = requiredRelationship ?? targetRelationship;
  const targetActorId = resolveActorTarget(world, actor, resolvedRelationship);
  const knownTargets = state.knownTargets ?? new Map();
  const recentRelationshipAction =
    resolvedRelationship ? knownTargets.get(resolvedRelationship.id)?.action ?? "" : "";
  const hasRecoveredRelationship =
    recentRelationshipAction === "recover_no_match" ||
    (state.lastActionByActor.get(actor.id)?.intent ?? "") === "recover_no_match";
  const nearMatchTarget = canUseNearMatch(world, resolvedRelationship, tuning);

  if (state.stage === "onboarding") {
    return createPlannedAction({
      context,
      intent: "introduce",
      targetActorId,
    });
  }

  if (hasRecoveredRelationship && state.stage === "conversation") {
    return createPlannedAction({
      context,
      intent: resolvePolicyAction(tuning.policy.denseGraphRecoveredConversationAction, "reply"),
      targetActorId,
      detachedFromWeakFit: true,
    });
  }

  if (
    ["group_seed", "event_seed"].includes(actor.kind) &&
    state.stage === "conversation"
  ) {
    if (nearMatchTarget || requiredRelationship) {
      return createPlannedAction({
        context,
        intent: "invite_group",
        targetActorId,
      });
    }
    if (worldNeedsMemory(world) && rng() > tuning.probabilities.memoryConversation) {
      return createPlannedAction({
        context,
        intent: "reference_memory",
        targetActorId,
      });
    }
    return createPlannedAction({
      context,
      intent: "reply",
      targetActorId,
    });
  }

  if (
    worldNeedsGroupProgress(world) &&
    state.stage !== "onboarding" &&
    nearMatchTarget &&
    actor.initiative >= 0.55
  ) {
    return createPlannedAction({
      context,
      intent: "invite_group",
      targetActorId,
    });
  }

  if (weakRelationship && state.stage !== "onboarding" && weakRelationship.strength < tuning.thresholds.lowStrength) {
    return createPlannedAction({
      context,
      intent: "recover_no_match",
      targetActorId: resolveActorTarget(world, actor, weakRelationship),
    });
  }

  if (worldNeedsMemory(world) && state.stage === "memory_drift") {
    return createPlannedAction({
      context,
      intent: "reference_memory",
      targetActorId,
    });
  }

  if (
    state.stage === "conversation" &&
    (requiredRelationship || rng() > tuning.probabilities.denseConversationInvite)
  ) {
    return createPlannedAction({
      context,
      intent: requiredRelationship ? "reply" : "invite_group",
      targetActorId,
    });
  }

  return null;
}

function planSocialSimAction(context) {
  const family = normalizeString(context.world.family, "social");
  if (family === "recovery") {
    return planRecoveryFamilyAction(context);
  }
  if (family === "circle") {
    return planCircleFamilyAction(context);
  }
  if (family === "network-rebalancing") {
    return planNetworkRebalancingFamilyAction(context);
  }
  if (family === "dense-social-graph") {
    return planDenseSocialGraphFamilyAction(context);
  }
  return null;
}

function worldSpecificExpectationCount(world) {
  let count = 0;
  if (worldNeedsRecovery(world)) count += 1;
  if (worldNeedsMemory(world)) count += 1;
  if (worldNeedsGroupProgress(world)) count += 1;
  return count;
}

function computeTemporalTransitionMetrics(
  world,
  relationships,
  transcript,
  tuning = DEFAULT_SOCIAL_SIM_TUNING,
) {
  const transitions = world.benchmark?.requiredTransitions ?? [];
  if (transitions.length === 0) {
    return {
      transitionSuccess: 1,
      transitionMisses: [],
    };
  }
  const relationshipMap = new Map(
    (Array.isArray(relationships) ? relationships : []).map((relationship) => [
      relationship.id,
      relationship,
    ]),
  );
  const actionHistory = Array.isArray(transcript)
    ? transcript.map((turn) => ({
        turnIndex: turn.turnIndex,
        relationshipId: turn.worldContext?.relationshipId ?? null,
        intent: turn.intent,
      }))
    : [];
  const misses = [];
  let satisfied = 0;

  for (const transition of transitions) {
    const targetRelationship = relationshipMap.get(transition.targetEdgeId);
    const targetMatchedTurn = Number.isFinite(targetRelationship?.lastMatchedTurn)
      ? targetRelationship.lastMatchedTurn
      : null;

    if (transition.type === "recover_then_match") {
      const sourceRecoverTurn = actionHistory.find((entry) =>
        entry.relationshipId === transition.sourceEdgeId &&
        entry.intent === "recover_no_match"
      )?.turnIndex;
      const satisfiedTransition =
        Number.isFinite(sourceRecoverTurn) &&
        Number.isFinite(targetMatchedTurn) &&
        sourceRecoverTurn < targetMatchedTurn;
      if (satisfiedTransition) {
        satisfied += 1;
      } else {
        misses.push({
          id: transition.id,
          type: transition.type,
          sourceEdgeId: transition.sourceEdgeId,
          targetEdgeId: transition.targetEdgeId,
        });
      }
      continue;
    }

    const satisfiedTransition =
      targetRelationship?.status === "matched" ||
      (targetRelationship?.strength ?? 0) >= tuning.thresholds.nearMatchMin;
    if (satisfiedTransition) {
      satisfied += 1;
    } else {
      misses.push({
        id: transition.id,
        type: transition.type,
        sourceEdgeId: transition.sourceEdgeId,
        targetEdgeId: transition.targetEdgeId,
      });
    }
  }

  return {
    transitionSuccess: Number((satisfied / Math.max(transitions.length, 1)).toFixed(3)),
    transitionMisses: misses,
  };
}

function computeOracleMetrics(
  world,
  relationships,
  transcript,
  tuning = DEFAULT_SOCIAL_SIM_TUNING,
) {
  const oracle = world.oracle ?? {};
  const relationshipMap = new Map(
    (Array.isArray(relationships) ? relationships : []).map((relationship) => [
      relationship.id,
      relationship,
    ]),
  );
  const matchedRelationships = Array.isArray(relationships)
    ? relationships.filter((relationship) => relationship.status === "matched")
    : [];
  const matchedEdgeIds = new Set(matchedRelationships.map((relationship) => relationship.id));
  const preferredEdges = oracle.preferredOutcomeEdges ?? [];
  const acceptableEdges = oracle.acceptableFallbackEdges ?? [];
  const forbiddenEdges = oracle.forbiddenOutcomeEdges ?? [];
  const requiredGroupClosure = oracle.requiredGroupClosure ?? [];
  const requiredIsolations = oracle.requiredIsolations ?? [];
  const favorableEdgeIds = new Set([...preferredEdges, ...acceptableEdges]);
  const preferredMatchedCount = preferredEdges.filter((edgeId) => matchedEdgeIds.has(edgeId)).length;
  const acceptableMatchedCount = acceptableEdges.filter((edgeId) => matchedEdgeIds.has(edgeId)).length;
  const forbiddenMatchedCount = forbiddenEdges.filter((edgeId) => matchedEdgeIds.has(edgeId)).length;
  const requiredGroupMatchedCount = requiredGroupClosure.filter((edgeId) =>
    matchedEdgeIds.has(edgeId),
  ).length;
  const averageConvergedEdgeStrength = (edgeIds) => {
    if (edgeIds.length === 0) return 0;
    const converged = edgeIds
      .map((edgeId) => relationshipMap.get(edgeId))
      .filter((relationship) =>
        relationship &&
        (
          relationship.status === "matched" ||
          (relationship.strength ?? 0) >= tuning.thresholds.nearMatchMin
        ),
      );
    return converged.length > 0
      ? converged.reduce((sum, relationship) => sum + (relationship.strength ?? 0), 0) /
          converged.length
      : 0;
  };
  const isolatedActorCount = requiredIsolations.filter((actorId) =>
    matchedRelationships.every((relationship) => !relationship.members.includes(actorId)),
  ).length;
  const closurePrecision =
    matchedRelationships.length > 0
      ? matchedRelationships.filter((relationship) => favorableEdgeIds.has(relationship.id)).length /
        matchedRelationships.length
      : preferredEdges.length === 0 && acceptableEdges.length === 0
        ? 1
        : 0;
  const preferredRecall =
    preferredEdges.length > 0 ? preferredMatchedCount / preferredEdges.length : 1;
  const forbiddenAvoidance =
    forbiddenEdges.length > 0 ? 1 - forbiddenMatchedCount / forbiddenEdges.length : 1;
  const groupClosureSuccess =
    requiredGroupClosure.length > 0
      ? requiredGroupMatchedCount / requiredGroupClosure.length
      : 1;
  const isolationSuccess =
    requiredIsolations.length > 0 ? isolatedActorCount / requiredIsolations.length : 1;
  const acceptableLift =
    acceptableEdges.length > 0 ? acceptableMatchedCount / acceptableEdges.length : 0;
  const preferredStrengthMean = averageConvergedEdgeStrength(preferredEdges);
  const acceptableStrengthMean = averageConvergedEdgeStrength(acceptableEdges);
  const forbiddenStrengthMean = averageConvergedEdgeStrength(forbiddenEdges);
  const groupClosureStrengthMean = averageConvergedEdgeStrength(requiredGroupClosure);
  const temporalMetrics = computeTemporalTransitionMetrics(world, relationships, transcript, tuning);
  const oracleProgressScore = clamp(
    preferredStrengthMean * 0.42 +
      acceptableStrengthMean * 0.08 +
      (1 - forbiddenStrengthMean) * 0.2 +
      groupClosureStrengthMean * 0.15 +
      isolationSuccess * 0.1 +
      temporalMetrics.transitionSuccess * 0.05,
    0,
    1,
  );
  const oracleScore = clamp(
    preferredRecall * 0.38 +
      closurePrecision * 0.24 +
      forbiddenAvoidance * 0.18 +
      groupClosureSuccess * 0.1 +
      isolationSuccess * 0.05 +
      temporalMetrics.transitionSuccess * 0.05 +
      acceptableLift * 0.05,
    0,
    1,
  );

  return {
    preferredMatchedCount,
    acceptableMatchedCount,
    forbiddenMatchedCount,
    requiredGroupMatchedCount,
    isolatedActorCount,
    closurePrecision: Number(closurePrecision.toFixed(3)),
    preferredRecall: Number(preferredRecall.toFixed(3)),
    forbiddenAvoidance: Number(forbiddenAvoidance.toFixed(3)),
    groupClosureSuccess: Number(groupClosureSuccess.toFixed(3)),
    isolationSuccess: Number(isolationSuccess.toFixed(3)),
    preferredStrengthMean: Number(preferredStrengthMean.toFixed(3)),
    acceptableStrengthMean: Number(acceptableStrengthMean.toFixed(3)),
    forbiddenStrengthMean: Number(forbiddenStrengthMean.toFixed(3)),
    groupClosureStrengthMean: Number(groupClosureStrengthMean.toFixed(3)),
    temporalTransitionSuccess: temporalMetrics.transitionSuccess,
    oracleProgressScore: Number(oracleProgressScore.toFixed(3)),
    oracleScore: Number(oracleScore.toFixed(3)),
    transitionMisses: temporalMetrics.transitionMisses,
    matchedEdgeIds: Array.from(matchedEdgeIds),
    relationshipSnapshot: Array.from(relationshipMap.values()).map((relationship) => ({
      id: relationship.id,
      status: relationship.status,
      strength: Number((relationship.strength ?? 0).toFixed(3)),
    })),
  };
}

function buildWorldDiagnostics(world, relationships, oracleMetrics, tuning) {
  const relationshipMap = new Map(
    relationships.map((relationship) => [relationship.id, relationship]),
  );
  const preferredEdgeMisses = (world.oracle?.preferredOutcomeEdges ?? []).filter(
    (edgeId) => !oracleMetrics.matchedEdgeIds.includes(edgeId),
  );
  const forbiddenEdgeHits = (world.oracle?.forbiddenOutcomeEdges ?? []).filter((edgeId) =>
    oracleMetrics.matchedEdgeIds.includes(edgeId),
  );
  const lowStrengthMatchedPreferredEdges = (world.oracle?.preferredOutcomeEdges ?? []).filter(
    (edgeId) =>
      oracleMetrics.matchedEdgeIds.includes(edgeId) &&
      (relationshipMap.get(edgeId)?.strength ?? 0) < tuning.thresholds.nearMatchMin,
  );
  const groupClosureMisses = (world.oracle?.requiredGroupClosure ?? []).filter(
    (edgeId) => !oracleMetrics.matchedEdgeIds.includes(edgeId),
  );
  const isolationFailures = (world.oracle?.requiredIsolations ?? []).filter((actorId) =>
    relationships.some(
      (relationship) =>
        relationship.status === "matched" && relationship.members.includes(actorId),
    ),
  );
  const transitionMisses = Array.isArray(oracleMetrics.transitionMisses)
    ? oracleMetrics.transitionMisses
    : [];
  const severity =
    preferredEdgeMisses.length * 0.16 +
    forbiddenEdgeHits.length * 0.22 +
    lowStrengthMatchedPreferredEdges.length * 0.12 +
    groupClosureMisses.length * 0.15 +
    isolationFailures.length * 0.18 +
    transitionMisses.length * 0.2;
  const primaryReason =
    forbiddenEdgeHits.length > 0
      ? "forbidden_edge_hit"
      : isolationFailures.length > 0
        ? "isolation_failure"
        : transitionMisses.length > 0
          ? "transition_miss"
        : groupClosureMisses.length > 0
          ? "group_closure_miss"
          : preferredEdgeMisses.length > 0
            ? "preferred_edge_miss"
            : lowStrengthMatchedPreferredEdges.length > 0
              ? "weak_preferred_closure"
              : "none";

  return {
    preferredEdgeMisses,
    forbiddenEdgeHits,
    lowStrengthMatchedPreferredEdges,
    groupClosureMisses,
    isolationFailures,
    transitionMisses,
    issueCount:
      preferredEdgeMisses.length +
      forbiddenEdgeHits.length +
      lowStrengthMatchedPreferredEdges.length +
      groupClosureMisses.length +
      isolationFailures.length +
      transitionMisses.length,
    severity: Number(severity.toFixed(3)),
    primaryReason,
  };
}

function summarizeWorld(world, transcript, metrics, judge, config) {
  const tuning = getTuning(config);
  const totalTurns = transcript.length || 1;
  const matchedRelationships = metrics.matchedMembers.size;
  const relationships = Array.isArray(world.relationships) ? world.relationships : [];
  const strongRelationshipCount = relationships.filter(
    (relationship) =>
      (relationship.initialStrength ?? relationship.strength ?? 0) >=
      tuning.thresholds.nearMatchMin,
  ).length;
  const strongRelationshipsMatched = relationships.filter(
    (relationship) =>
      (relationship.initialStrength ?? relationship.strength ?? 0) >=
        tuning.thresholds.nearMatchMin && relationship.status === "matched",
  ).length;
  const weakStartMatchCount = relationships.filter(
    (relationship) =>
      (relationship.initialStrength ?? relationship.strength ?? 0) <
        tuning.thresholds.lowStrength && relationship.status === "matched",
  ).length;
  const meanStrengthLift =
    relationships.reduce(
      (sum, relationship) =>
        sum +
        ((relationship.strength ?? 0) -
          (relationship.initialStrength ?? relationship.strength ?? 0)),
      0,
    ) / Math.max(relationships.length, 1);
  const matchedRatio =
    matchedRelationships / Math.max(world.relationships.length || 1, 1);
  const progressDensity =
    (metrics.introductions + metrics.replies + metrics.followups + metrics.invites) /
    Math.max(totalTurns * tuning.scoring.progressDensityDivisor, 1);
  const recoveryNeeded = worldNeedsRecovery(world);
  const memoryNeeded = worldNeedsMemory(world);
  const groupNeeded = worldNeedsGroupProgress(world);
  const expectationCount = worldSpecificExpectationCount(world);
  const expectationFulfillment =
    ((recoveryNeeded && metrics.recoverySignals > 0 ? 1 : 0) +
      (memoryNeeded && metrics.memorySignals > 0 ? 1 : 0) +
      (groupNeeded && metrics.invites > 0 ? 1 : 0)) /
    Math.max(expectationCount, 1);
  const followupDominance =
    metrics.followups / Math.max(metrics.introductions + metrics.replies + metrics.invites, 1);
  const shallowFollowupPenalty = clamp(
    (followupDominance - tuning.scoring.shallowFollowupDominanceStart) *
      tuning.scoring.shallowFollowupPenaltySlope,
    0,
    tuning.scoring.shallowFollowupPenaltyCap,
  );
  const stalledPenalty =
    (metrics.stalledTurns / Math.max(totalTurns, 1)) * tuning.scoring.stalledPenaltyWeight;
  const missingRecoveryPenalty =
    recoveryNeeded && metrics.recoverySignals === 0 ? tuning.scoring.missingRecoveryPenalty : 0;
  const missingMemoryPenalty =
    memoryNeeded && metrics.memorySignals === 0 ? tuning.scoring.missingMemoryPenalty : 0;
  const missingGroupPenalty =
    groupNeeded && metrics.invites === 0 ? tuning.scoring.missingGroupPenalty : 0;
  const noMatchRecoveryQuality = clamp(
    recoveryNeeded
      ? metrics.recoverySignals > 0
        ? tuning.scoring.recoveryBase +
          (metrics.recoverySignals / Math.max(totalTurns * 2.5, 1)) * tuning.scoring.recoveryScale
        : tuning.scoring.recoveryMissingScore
      : metrics.recoverySignals > 0
        ? tuning.scoring.recoveryExtraScore
        : tuning.scoring.recoveryDefaultScore,
    0,
    1,
  );
  const recoveryWorldBonus =
    world.family === "recovery"
      ? noMatchRecoveryQuality * tuning.scoring.recoveryWorldRecoveryWeight
      : 0;
  const oracleMetrics = computeOracleMetrics(world, relationships, transcript, tuning);
  const diagnostics = buildWorldDiagnostics(world, relationships, oracleMetrics, tuning);
  const recoveryResolutionScore = computeRecoveryResolutionScore(world, oracleMetrics, metrics);
  const circleReassemblyScore = computeCircleReassemblyScore(world, oracleMetrics);
  const denseBridgeScore = computeDenseBridgeScore(world, oracleMetrics);
  const familyGoalBonus =
    recoveryResolutionScore * tuning.scoring.recoveryClosureWeight +
    circleReassemblyScore * tuning.scoring.circleReassemblyWeight +
    denseBridgeScore * tuning.scoring.denseBridgeWeight;
  const requiredEdgeMissPenalty =
    (diagnostics.groupClosureMisses.length * tuning.scoring.requiredEdgeMissPenalty) +
    (diagnostics.preferredEdgeMisses.length * tuning.scoring.preferredEdgeMissPenalty);
  const recoveryUnresolvedPenalty =
    world.family === "recovery" &&
    metrics.recoverySignals > 0 &&
    oracleMetrics.preferredMatchedCount === 0 &&
    oracleMetrics.acceptableMatchedCount === 0
      ? tuning.scoring.recoveryUnresolvedPenalty
      : 0;
  const expectedTurnBudget = toNumber(world.turnBudget, totalTurns);
  const turnBudgetGap = Math.max(0, expectedTurnBudget - totalTurns);
  const convergenceScore = clamp(
    matchedRatio * tuning.scoring.matchedRatioWeight +
      progressDensity * tuning.scoring.progressDensityWeight +
      expectationFulfillment * tuning.scoring.expectationFulfillmentWeight +
      recoveryWorldBonus +
      familyGoalBonus +
      (metrics.stalledTurns === 0 ? tuning.scoring.noStallBonus : 0) -
      shallowFollowupPenalty -
      stalledPenalty -
      missingRecoveryPenalty -
      missingMemoryPenalty -
      missingGroupPenalty -
      requiredEdgeMissPenalty -
      recoveryUnresolvedPenalty,
    0,
    1,
  );
  const memoryConsistency = clamp(
    memoryNeeded
      ? metrics.memorySignals > 0
        ? tuning.scoring.memoryBase +
          (metrics.memorySignals / Math.max(totalTurns * 2.5, 1)) * tuning.scoring.memoryScale
        : tuning.scoring.memoryMissingScore
      : metrics.memorySignals > 0
        ? tuning.scoring.memoryExtraScore
      : tuning.scoring.memoryDefaultScore,
    0,
    1,
  );

  return {
    totalTurns,
    introductions: metrics.introductions,
    replies: metrics.replies,
    followups: metrics.followups,
    invites: metrics.invites,
    memorySignals: metrics.memorySignals,
    recoverySignals: metrics.recoverySignals,
    moderationSignals: metrics.moderationSignals,
    matchedRelationships,
    strongRelationshipCoverage: Number(
      clamp(
        strongRelationshipsMatched / Math.max(strongRelationshipCount, 1),
        0,
        1,
      ).toFixed(3),
    ),
    weakStartMatchCount,
    meanStrengthLift: Number(meanStrengthLift.toFixed(3)),
    convergenceScore: Number(convergenceScore.toFixed(3)),
    noMatchRecoveryQuality: Number(noMatchRecoveryQuality.toFixed(3)),
    memoryConsistency: Number(memoryConsistency.toFixed(3)),
    oracleScore: oracleMetrics.oracleScore,
    oracleProgressScore: oracleMetrics.oracleProgressScore,
    closurePrecision: oracleMetrics.closurePrecision,
    preferredRecall: oracleMetrics.preferredRecall,
    forbiddenAvoidance: oracleMetrics.forbiddenAvoidance,
    groupClosureSuccess: oracleMetrics.groupClosureSuccess,
    isolationSuccess: oracleMetrics.isolationSuccess,
    oracleCounts: {
      preferredMatchedCount: oracleMetrics.preferredMatchedCount,
      acceptableMatchedCount: oracleMetrics.acceptableMatchedCount,
      forbiddenMatchedCount: oracleMetrics.forbiddenMatchedCount,
      requiredGroupMatchedCount: oracleMetrics.requiredGroupMatchedCount,
      isolatedActorCount: oracleMetrics.isolatedActorCount,
      preferredStrengthMean: oracleMetrics.preferredStrengthMean,
      acceptableStrengthMean: oracleMetrics.acceptableStrengthMean,
      forbiddenStrengthMean: oracleMetrics.forbiddenStrengthMean,
      groupClosureStrengthMean: oracleMetrics.groupClosureStrengthMean,
      temporalTransitionSuccess: oracleMetrics.temporalTransitionSuccess,
    },
    scoreBreakdown: {
      matchedRatio: Number(matchedRatio.toFixed(3)),
      progressDensity: Number(progressDensity.toFixed(3)),
      expectationFulfillment: Number(expectationFulfillment.toFixed(3)),
      followupDominance: Number(followupDominance.toFixed(3)),
      shallowFollowupPenalty: Number(shallowFollowupPenalty.toFixed(3)),
      stalledPenalty: Number(stalledPenalty.toFixed(3)),
      missingRecoveryPenalty: Number(missingRecoveryPenalty.toFixed(3)),
      missingMemoryPenalty: Number(missingMemoryPenalty.toFixed(3)),
      missingGroupPenalty: Number(missingGroupPenalty.toFixed(3)),
      recoveryWorldBonus: Number(recoveryWorldBonus.toFixed(3)),
      familyGoalBonus: Number(familyGoalBonus.toFixed(3)),
      requiredEdgeMissPenalty: Number(requiredEdgeMissPenalty.toFixed(3)),
      recoveryUnresolvedPenalty: Number(recoveryUnresolvedPenalty.toFixed(3)),
      recoveryResolutionScore: Number(recoveryResolutionScore.toFixed(3)),
      circleReassemblyScore: Number(circleReassemblyScore.toFixed(3)),
      denseBridgeScore: Number(denseBridgeScore.toFixed(3)),
    },
    measurement: {
      expectedTurnBudget,
      executedTurnBudget: totalTurns,
      turnBudgetGap,
      usedOverrideTurnBudget: Number.isFinite(config.turnBudget),
      requiresRecovery: recoveryNeeded,
      requiresMemory: memoryNeeded,
      requiresGroupProgress: groupNeeded,
    },
    oracle: {
      preferredOutcomeEdges: world.oracle?.preferredOutcomeEdges ?? [],
      acceptableFallbackEdges: world.oracle?.acceptableFallbackEdges ?? [],
      forbiddenOutcomeEdges: world.oracle?.forbiddenOutcomeEdges ?? [],
      requiredIsolations: world.oracle?.requiredIsolations ?? [],
      requiredGroupClosure: world.oracle?.requiredGroupClosure ?? [],
      benchmark: world.benchmark ?? { split: "train", requiredTransitions: [] },
      matchedEdgeIds: oracleMetrics.matchedEdgeIds,
      relationshipSnapshot: oracleMetrics.relationshipSnapshot,
      transitionMisses: oracleMetrics.transitionMisses,
    },
    diagnostics,
    judge,
  };
}

function summarizeRun(worldRuns, config, bootstrap) {
  const totals = {
    worlds: worldRuns.length,
    turns: 0,
    matchedRelationships: 0,
    memorySignals: 0,
    moderationSignals: 0,
    convergenceScoreTotal: 0,
    oracleScoreTotal: 0,
    oracleProgressScoreTotal: 0,
  };
  const familyRollup = new Map();
  for (const world of worldRuns) {
    totals.turns += world.summary?.totalTurns ?? 0;
    totals.matchedRelationships += world.summary?.matchedRelationships ?? 0;
    totals.memorySignals += world.summary?.memorySignals ?? 0;
    totals.moderationSignals += world.summary?.moderationSignals ?? 0;
    totals.convergenceScoreTotal += world.summary?.convergenceScore ?? 0;
    totals.oracleScoreTotal += world.summary?.oracleScore ?? 0;
    totals.oracleProgressScoreTotal += world.summary?.oracleProgressScore ?? 0;
    const currentFamily = familyRollup.get(world.family) ?? {
      worlds: 0,
      convergenceScoreTotal: 0,
      matchedRelationships: 0,
      turnBudgetGap: 0,
      strongRelationshipCoverageTotal: 0,
      weakStartMatchCount: 0,
      meanStrengthLiftTotal: 0,
      oracleScoreTotal: 0,
      oracleProgressScoreTotal: 0,
      closurePrecisionTotal: 0,
      preferredRecallTotal: 0,
      forbiddenAvoidanceTotal: 0,
      diagnosticIssueCount: 0,
      diagnosticSeverityTotal: 0,
    };
    currentFamily.worlds += 1;
    currentFamily.convergenceScoreTotal += world.summary?.convergenceScore ?? 0;
    currentFamily.matchedRelationships += world.summary?.matchedRelationships ?? 0;
    currentFamily.turnBudgetGap += world.summary?.measurement?.turnBudgetGap ?? 0;
    currentFamily.strongRelationshipCoverageTotal +=
      world.summary?.strongRelationshipCoverage ?? 0;
    currentFamily.weakStartMatchCount += world.summary?.weakStartMatchCount ?? 0;
    currentFamily.meanStrengthLiftTotal += world.summary?.meanStrengthLift ?? 0;
    currentFamily.oracleScoreTotal += world.summary?.oracleScore ?? 0;
    currentFamily.oracleProgressScoreTotal += world.summary?.oracleProgressScore ?? 0;
    currentFamily.closurePrecisionTotal += world.summary?.closurePrecision ?? 0;
    currentFamily.preferredRecallTotal += world.summary?.preferredRecall ?? 0;
    currentFamily.forbiddenAvoidanceTotal += world.summary?.forbiddenAvoidance ?? 0;
    currentFamily.diagnosticIssueCount += world.summary?.diagnostics?.issueCount ?? 0;
    currentFamily.diagnosticSeverityTotal += world.summary?.diagnostics?.severity ?? 0;
    familyRollup.set(world.family, currentFamily);
  }
  const avgConvergence =
    worldRuns.length > 0 ? totals.convergenceScoreTotal / worldRuns.length : 0;
  const familyScores = Object.fromEntries(
    Array.from(familyRollup.entries()).map(([family, rollup]) => [
      family,
      {
        worlds: rollup.worlds,
        averageConvergenceScore: Number(
          (rollup.convergenceScoreTotal / Math.max(rollup.worlds, 1)).toFixed(3),
        ),
        matchedRelationships: rollup.matchedRelationships,
        turnBudgetGap: rollup.turnBudgetGap,
        averageStrongRelationshipCoverage: Number(
          (rollup.strongRelationshipCoverageTotal / Math.max(rollup.worlds, 1)).toFixed(3),
        ),
        weakStartMatchCount: rollup.weakStartMatchCount,
        averageMeanStrengthLift: Number(
          (rollup.meanStrengthLiftTotal / Math.max(rollup.worlds, 1)).toFixed(3),
        ),
        averageOracleScore: Number(
          (rollup.oracleScoreTotal / Math.max(rollup.worlds, 1)).toFixed(3),
        ),
        averageOracleProgressScore: Number(
          (rollup.oracleProgressScoreTotal / Math.max(rollup.worlds, 1)).toFixed(3),
        ),
        averageClosurePrecision: Number(
          (rollup.closurePrecisionTotal / Math.max(rollup.worlds, 1)).toFixed(3),
        ),
        averagePreferredRecall: Number(
          (rollup.preferredRecallTotal / Math.max(rollup.worlds, 1)).toFixed(3),
        ),
        averageForbiddenAvoidance: Number(
          (rollup.forbiddenAvoidanceTotal / Math.max(rollup.worlds, 1)).toFixed(3),
        ),
        diagnosticIssueCount: rollup.diagnosticIssueCount,
        averageDiagnosticSeverity: Number(
          (rollup.diagnosticSeverityTotal / Math.max(rollup.worlds, 1)).toFixed(3),
        ),
      },
    ]),
  );
  const worldDiagnostics = worldRuns
    .map((world) => ({
      worldId: world.worldId,
      family: world.family,
      horizon: world.horizon,
      convergenceScore: world.summary?.convergenceScore ?? 0,
      oracleScore: world.summary?.oracleScore ?? 0,
      oracleProgressScore: world.summary?.oracleProgressScore ?? 0,
      diagnostics: world.summary?.diagnostics ?? {},
    }))
    .sort(
      (left, right) =>
        (right.diagnostics?.severity ?? 0) - (left.diagnostics?.severity ?? 0),
    );
  const measurementWarnings = [];
  const truncatedWorlds = worldRuns.filter(
    (world) => (world.summary?.measurement?.turnBudgetGap ?? 0) > 0,
  );
  if (truncatedWorlds.length > 0) {
    measurementWarnings.push(
      `turn_budget_override_truncated_${truncatedWorlds.length}_worlds`,
    );
  }
  if (
    config.provider !== "stub" &&
    config.provider === config.judgeProvider
  ) {
    measurementWarnings.push("actor_judge_provider_coupled");
  }
  if (config.benchmarkMode) {
    measurementWarnings.push(`benchmark_seed_${config.seed}`);
    if (config.provider !== "stub" && !config.useRemoteProvider) {
      measurementWarnings.push("benchmark_provider_not_remote");
    }
    if (config.judgeProvider !== "stub" && !config.useRemoteJudge) {
      measurementWarnings.push("benchmark_judge_not_remote");
    }
  }
  if (bootstrap?.backendMode && bootstrap.backendMode !== "backend") {
    measurementWarnings.push(`backend_mode_${bootstrap.backendMode}`);
  }
  const verdict =
    avgConvergence >= 0.75 && totals.moderationSignals === 0
      ? "healthy"
      : avgConvergence >= 0.5
        ? "watch"
        : "critical";
  return {
    totals: {
      ...totals,
      averageConvergenceScore: Number(avgConvergence.toFixed(3)),
      averageOracleScore: Number(
        (worldRuns.length > 0 ? totals.oracleScoreTotal / worldRuns.length : 0).toFixed(3),
      ),
      averageOracleProgressScore: Number(
        (worldRuns.length > 0 ? totals.oracleProgressScoreTotal / worldRuns.length : 0).toFixed(3),
      ),
    },
    verdict,
    familyScores,
    worldDiagnostics,
    measurementWarnings,
    bootstrap,
    provider: config.provider,
    judgeProvider: config.judgeProvider,
    benchmarkMode: Boolean(config.benchmarkMode),
    nightly: config.nightly,
  };
}

export function writeSocialSimArtifact(runDir, filename, data) {
  const filePath = path.join(runDir, filename);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return filePath;
}

function defaultBrainAction(context) {
  const plannedAction = planSocialSimAction(context);
  if (plannedAction) return plannedAction;
  return planGenericBrainAction(context);
}

function planGenericBrainAction(context) {
  const { actor, state, world, rng } = context;
  const tuning = getTuning(context.config);
  const knownTargets = state.knownTargets ?? new Map();
  const lastActionByActor = state.lastActionByActor ?? new Map();
  const targetRelationship = findBestRelationshipWithState(world, actor, null, state, tuning);
  const weakRelationship = findWeakRelationshipWithState(world, actor, state, tuning);
  const targetActorId = targetRelationship?.members.find((member) => member !== actor.id) ?? null;
  const weakTargetActorId =
    weakRelationship?.members.find((member) => member !== actor.id) ?? null;
  const recentActorAction = lastActionByActor.get(actor.id)?.intent ?? "";
  const recentRelationshipAction =
    targetRelationship ? knownTargets.get(targetRelationship.id)?.action ?? "" : "";
  const recentWeakRelationshipAction =
    weakRelationship ? knownTargets.get(weakRelationship.id)?.action ?? "" : "";
  const recoveredRelationshipIds = world.relationships
    .filter(
      (relationship) =>
        relationship.members.includes(actor.id) &&
        knownTargets.get(relationship.id)?.action === "recover_no_match",
    )
    .map((relationship) => relationship.id);
  const hasRecoveredRelationship =
    recentRelationshipAction === "recover_no_match" ||
    recentActorAction === "recover_no_match";
  const hasMemorySignal =
    world.horizon === "long" || actor.memoryDriftProfile === "fluid";
  const lowStrength = (targetRelationship?.strength ?? 0) < tuning.thresholds.lowStrength;
  const mediumStrength =
    (targetRelationship?.strength ?? 0) >= tuning.thresholds.lowStrength &&
    (targetRelationship?.strength ?? 0) < tuning.thresholds.mediumStrength;
  const strongStrength = (targetRelationship?.strength ?? 0) >= tuning.thresholds.mediumStrength;
  let intent = "follow_up";
  let resolvedTargetActorId = targetActorId;
  let detachedFromWeakFit = false;
  if (state.stage === "onboarding") {
    intent = "introduce";
  } else if (
    world.family === "recovery" &&
    hasRecoveredRelationship &&
    state.stage === "conversation"
  ) {
    intent = resolvePolicyAction(
      tuning.policy.recoveryPostRecoveryConversationAction,
      "invite_group",
    );
    resolvedTargetActorId = resolvePostRecoveryTargetActorId({
      world,
      actor,
      state,
      tuning,
      currentTargetActorId: targetActorId,
      excludedRelationshipIds: recoveredRelationshipIds,
      strategy: tuning.policy.recoveryPostRecoveryTargetStrategy,
    });
    detachedFromWeakFit = true;
  } else if (
    world.family === "recovery" &&
    hasRecoveredRelationship &&
    state.stage === "convergence"
  ) {
    intent = resolvePolicyAction(
      tuning.policy.recoveryPostRecoveryConvergenceAction,
      "propose_event",
    );
    resolvedTargetActorId = resolvePostRecoveryTargetActorId({
      world,
      actor,
      state,
      tuning,
      currentTargetActorId: targetActorId,
      excludedRelationshipIds: recoveredRelationshipIds,
      strategy: tuning.policy.recoveryPostRecoveryTargetStrategy,
    });
    detachedFromWeakFit = true;
  } else if (
    weakRelationship &&
    worldNeedsRecovery(world) &&
    (world.family === "dense-social-graph" ||
      world.family === "circle" ||
      world.family === "network-rebalancing") &&
    (["group_seed", "circle_seed", "event_seed"].includes(actor.kind) ||
      actor.socialStyle === "clear")
  ) {
    intent = "recover_no_match";
    resolvedTargetActorId = weakTargetActorId;
    if (recentWeakRelationshipAction === "recover_no_match") {
      intent =
        world.family === "circle"
          ? "invite_group"
          : state.stage === "convergence"
            ? "propose_event"
            : "invite_group";
      resolvedTargetActorId =
        world.family === "network-rebalancing"
          ? resolvePostRecoveryTargetActorId({
              world,
              actor,
              state,
              tuning,
              currentTargetActorId: targetActorId,
              excludedRelationshipIds: [
                ...recoveredRelationshipIds,
                weakRelationship?.id,
              ].filter(Boolean),
              strategy: tuning.policy.networkOrganizerPostRecoveryTargetStrategy,
            })
          : null;
      detachedFromWeakFit = true;
    }
  } else if (
    world.family === "network-rebalancing" &&
    lowStrength &&
    state.stage !== "onboarding"
  ) {
    intent = "recover_no_match";
    if (recentRelationshipAction === "recover_no_match") {
      resolvedTargetActorId = null;
      detachedFromWeakFit = true;
    }
  } else if (
    world.family === "recovery" &&
    recentActorAction === "recover_no_match" &&
    state.stage !== "onboarding"
  ) {
    intent =
      state.stage === "matching"
        ? "ask_preference"
        : state.stage === "convergence"
          ? "propose_event"
          : "invite_group";
    resolvedTargetActorId = null;
    detachedFromWeakFit = true;
  } else if (
    world.family === "circle" &&
    world.horizon === "long" &&
    ["circle_seed", "group_seed"].includes(actor.kind) &&
    mediumStrength &&
    state.stage !== "onboarding"
  ) {
    intent =
      (targetRelationship?.strength ?? 0) >= tuning.thresholds.nearMatchMin
        ? "invite_group"
        : recentRelationshipAction === "reference_memory"
          ? "invite_group"
          : "reply";
  } else if (
    world.family === "circle" &&
    worldNeedsMemory(world) &&
    (actor.kind === "circle_seed" || actor.id.includes("organizer")) &&
    state.stage !== "onboarding" &&
    mediumStrength
  ) {
    intent =
      (targetRelationship?.strength ?? 0) >= tuning.thresholds.nearMatchMin
        ? "invite_group"
        : recentRelationshipAction === "reference_memory"
          ? "invite_group"
          : "reference_memory";
  } else if (
    world.family === "network-rebalancing" &&
    ["event_seed", "group_seed", "circle_seed"].includes(actor.kind) &&
    state.stage !== "onboarding"
  ) {
    intent =
      (targetRelationship?.strength ?? 0) >= tuning.thresholds.nearMatchMin &&
      state.stage === "conversation"
        ? "invite_group"
      : (targetRelationship?.strength ?? 0) >= tuning.thresholds.nearMatchMin &&
          state.stage === "memory_drift"
        ? "propose_event"
      :
      hasRecoveredRelationship && state.stage === "conversation"
        ? resolvePolicyAction(
            tuning.policy.networkOrganizerPostRecoveryConversationAction,
            "invite_group",
          )
        : hasRecoveredRelationship && state.stage === "memory_drift"
          ? resolvePolicyAction(
              tuning.policy.networkOrganizerPostRecoveryMemoryDriftAction,
              "propose_event",
            )
        : state.stage === "matching"
        ? mediumStrength
          ? "invite_group"
          : "ask_preference"
        : worldNeedsMemory(world) && rng() > tuning.probabilities.networkMemoryReference
          ? "reference_memory"
          : "invite_group";
    if (
      hasRecoveredRelationship &&
      (state.stage === "conversation" || state.stage === "memory_drift")
    ) {
      resolvedTargetActorId = resolvePostRecoveryTargetActorId({
        world,
        actor,
        state,
        tuning,
        currentTargetActorId: targetActorId,
        excludedRelationshipIds: recoveredRelationshipIds,
        strategy: tuning.policy.networkOrganizerPostRecoveryTargetStrategy,
      });
      detachedFromWeakFit = true;
    }
  } else if (strongStrength && state.stage === "matching") {
    intent = "reply";
  } else if (lowStrength && state.stage !== "onboarding") {
    intent = worldNeedsGroupProgress(world) && rng() > tuning.probabilities.lowStrengthGroupRecovery
      ? "invite_group"
      : "recover_no_match";
  } else if (state.stage === "matching") {
    intent = mediumStrength && worldNeedsGroupProgress(world) && rng() > tuning.probabilities.matchingGroupInvite
      ? "invite_group"
      : "ask_preference";
  } else if (
    world.family === "dense-social-graph" &&
    ["group_seed", "event_seed"].includes(actor.kind) &&
    mediumStrength &&
    state.stage === "conversation"
  ) {
    intent =
      hasRecoveredRelationship
        ? resolvePolicyAction(
            tuning.policy.denseGraphRecoveredConversationAction,
            "reply",
          )
        : recentRelationshipAction === "invite_group"
          ? "reply"
          : "invite_group";
  } else if (state.stage === "memory_drift") {
    intent = hasMemorySignal ? "reference_memory" : "follow_up";
  } else if (
    worldNeedsMemory(world) &&
    state.stage === "conversation" &&
    rng() > tuning.probabilities.memoryConversation
  ) {
    intent = "reference_memory";
  } else if (
    state.stage === "conversation" &&
    world.family === "dense-social-graph" &&
    rng() > tuning.probabilities.denseConversationInvite
  ) {
    intent = "invite_group";
  } else if (
    state.stage === "conversation" &&
    world.family === "pair-and-group" &&
    rng() > tuning.probabilities.pairConversationInvite
  ) {
    intent = "invite_group";
  } else if (strongStrength && state.stage === "conversation") {
    intent = "reply";
  } else if (
    state.stage === "convergence" &&
    world.family === "event-and-memory" &&
    rng() > tuning.probabilities.eventConvergence
  ) {
    intent = "propose_event";
  } else if (
    state.stage === "convergence" &&
    strongStrength &&
    rng() > tuning.probabilities.strongConvergenceEvent
  ) {
    intent = "propose_event";
  } else if (
    hasMemorySignal &&
    state.stage !== "onboarding" &&
    rng() > tuning.probabilities.genericMemoryReference
  ) {
    intent = "reference_memory";
  }
  if (
    !resolvedTargetActorId &&
    (intent === "reference_memory" || intent === "invite_group") &&
    targetRelationship
  ) {
    resolvedTargetActorId =
      targetRelationship.members.find((member) => member !== actor.id) ?? null;
  }
  if (
    targetRelationship &&
    targetRelationship.strength < 0.35 &&
    recentRelationshipAction === "recover_no_match" &&
    (intent === "propose_event" || intent === "ask_preference")
  ) {
    resolvedTargetActorId = null;
    detachedFromWeakFit = true;
  }
  const message = buildMessageForIntent({
    intent,
    actor,
    targetActorId: resolvedTargetActorId,
    world,
    state,
  });
  return {
    provider: "heuristic",
    promptVersion: SOCIAL_SIM_PROMPT_VERSION,
    intent,
    targetActorId: resolvedTargetActorId,
    message,
    detachedFromWeakFit,
    tone: actor.socialStyle,
    confidence: intent === "recover_no_match" ? 0.52 : 0.76,
    rationale:
      intent === "reference_memory"
        ? "Using earlier conversation context to improve continuity."
        : intent === "invite_group"
          ? "Trying to move the social graph toward a broader group outcome."
          : intent === "propose_event"
            ? "Trying to convert a weak or partial thread into a clearer concrete plan."
            : intent === "recover_no_match"
              ? "The pairing looks weak, so the actor is trying a recovery path."
              : "Advancing the conversation in a socially plausible way.",
    memoryReferences: hasMemorySignal
      ? [
          {
            key: "preference_memory",
            confidence: 0.71,
            excerpt: actor.goals[0] ?? actor.persona,
          },
        ]
      : [],
  };
}

function buildMessageForIntent({ intent, actor, targetActorId, state }) {
  const targetLabel = targetActorId ? ` @${targetActorId}` : "";
  switch (intent) {
    case "introduce":
      return `${actor.persona.split(",")[0]} here${targetLabel}. I’m trying to connect around ${actor.goals[0] ?? "shared interests"}.`;
    case "ask_preference":
      return `What kind of ${actor.goals[0] ?? "plans"} are you into${targetLabel}? I’m trying to find a good fit.`;
    case "reply":
      return `That overlaps well with what I want too${targetLabel}. We should make the next step more concrete.`;
    case "follow_up":
      return `Following up on our earlier thread${targetLabel} — would you be open to continuing this in a smaller circle?`;
    case "invite_group":
      return `This feels like a good thread to bring a few more people in${targetLabel}. Want to try a group conversation?`;
    case "propose_event":
      return `We could move this into a casual event or session${targetLabel} if that feels better.`;
    case "reference_memory":
      return `I remember you mentioned ${actor.goals[0] ?? "your preferences"} before, so I’m keeping that in mind${targetLabel}.`;
    case "recover_no_match":
      return `I don’t think this is the best fit yet${targetLabel}, but I can try a different angle or connect you with someone else.`;
    case "flag_moderation":
      return `This needs a moderation check because the conversation direction feels off${targetLabel}.`;
    default:
      return `Checking in on the current conversation${targetLabel} (${state.stage}).`;
  }
}

class HeuristicSocialSimProvider {
  constructor(config) {
    this.config = config;
    this.kind = "stub";
    this.name = "heuristic";
  }

  async generateActorTurn(context) {
    return defaultBrainAction(context);
  }
}

class RemoteSocialSimProviderBase {
  constructor(config) {
    this.config = config;
    this.kind = "remote";
    this.useRemote = false;
  }

  async generateActorTurn(context) {
    const remote = await this.tryRemote(context);
    if (remote) return remote;
    if (this.useRemote && this.config.failOnRemoteFallback) {
      throw new Error(
        `Social simulation actor provider "${this.name}" fell back to heuristic output in fail-closed mode.`,
      );
    }
    return defaultBrainAction(context);
  }

  async tryRemote() {
    return null;
  }
}

class OllamaSocialSimProvider extends RemoteSocialSimProviderBase {
  constructor(config) {
    super(config);
    this.name = "ollama";
    this.endpoint =
      normalizeString(config.ollamaBaseUrl, "http://localhost:11434").replace(
        /\/+$/,
        "",
      );
    this.model = normalizeString(config.ollamaModel, "llama3.1");
    this.apiKey = normalizeString(config.ollamaApiKey, "");
    this.useRemote = config.useRemoteProvider || boolFromEnv(process.env.SOCIAL_SIM_USE_REMOTE_PROVIDER);
  }

  async tryRemote(context) {
    if (!this.useRemote) return null;
    try {
      const response = await fetch(`${this.endpoint}/api/chat`, {
        method: "POST",
        headers: buildOllamaHeaders(this.apiKey),
        body: JSON.stringify({
          model: this.model,
          format: "json",
          stream: false,
          messages: [
            {
              role: "system",
              content: [
                "You are a synthetic social simulation actor.",
                `Return JSON matching prompt version ${SOCIAL_SIM_PROMPT_VERSION}.`,
                "Fields: intent, targetActorId, message, tone, confidence, rationale, memoryReferences[].",
              ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify(buildProviderContext(context), null, 2),
            },
          ],
        }),
      });
      const payload = await response.json().catch(() => null);
      const content = payload?.message?.content;
      if (!response.ok || typeof content !== "string") return null;
      const parsed = safeJsonParse(content, null);
      if (!parsed || typeof parsed !== "object") return null;
      return normalizeBrainOutput(parsed, "ollama", context);
    } catch {
      return null;
    }
  }
}

class OpenAISocialSimProvider extends RemoteSocialSimProviderBase {
  constructor(config) {
    super(config);
    this.name = "openai";
    this.model = normalizeString(config.openaiModel, "gpt-4.1-mini");
    this.apiKey = normalizeString(config.openaiApiKey, "");
    this.useRemote =
      config.useRemoteProvider ||
      boolFromEnv(process.env.SOCIAL_SIM_USE_REMOTE_PROVIDER);
  }

  async tryRemote(context) {
    if (!this.useRemote || !this.apiKey) return null;
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "You are a synthetic social simulation actor.",
                `Return JSON matching prompt version ${SOCIAL_SIM_PROMPT_VERSION}.`,
                "Fields: intent, targetActorId, message, tone, confidence, rationale, memoryReferences[].",
              ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify(buildProviderContext(context), null, 2),
            },
          ],
        }),
      });
      const payload = await response.json().catch(() => null);
      const content = payload?.choices?.[0]?.message?.content;
      if (!response.ok || typeof content !== "string") return null;
      const parsed = safeJsonParse(content, null);
      if (!parsed || typeof parsed !== "object") return null;
      return normalizeBrainOutput(parsed, "openai", context);
    } catch {
      return null;
    }
  }
}

function normalizeBrainOutput(output, provider, context) {
  const targetActorId =
    typeof output.targetActorId === "string" ? output.targetActorId : null;
  const intent = normalizeString(output.intent, "follow_up");
  return {
    provider,
    promptVersion: SOCIAL_SIM_PROMPT_VERSION,
    intent,
    targetActorId,
    message: normalizeString(
      output.message,
      buildMessageForIntent({
        intent,
        actor: context.actor,
        targetActorId,
        world: context.world,
        state: context.state,
      }),
    ),
    tone: normalizeString(output.tone, context.actor.socialStyle),
    confidence: clamp(toNumber(output.confidence, 0.65), 0, 1),
    rationale: normalizeString(output.rationale, "Remote provider turn plan."),
    memoryReferences: Array.isArray(output.memoryReferences)
      ? output.memoryReferences
          .filter((entry) => entry && typeof entry === "object")
          .map((entry) => ({
            key: normalizeString(entry.key, "preference_memory"),
            confidence: clamp(toNumber(entry.confidence, 0.5), 0, 1),
            excerpt: normalizeString(entry.excerpt, ""),
          }))
      : [],
  };
}

class HeuristicJudgeProvider {
  constructor(config) {
    this.config = config;
    this.kind = "stub";
    this.name = "heuristic";
  }

  async scoreTurn(context) {
    const { action, turnRecord } = context;
    const tuning = getTuning(context.config);
    const lowStrength = (turnRecord.outcome.relationshipStrength ?? 0) < 0.35;
    const progressPenalty =
      action.intent === "follow_up" && !turnRecord.outcome.matched && lowStrength
        ? tuning.judge.weakFollowupPenalty
        : 0;
    const score = clamp(
      tuning.judge.turnBase +
        (action.intent === "recover_no_match" ? tuning.judge.recoverBonus : 0) +
        (action.intent === "reference_memory" ? tuning.judge.memoryBonus : 0) +
        (action.intent === "invite_group" ? tuning.judge.inviteBonus : 0) +
        (action.intent === "propose_event" ? tuning.judge.eventBonus : 0) +
        (turnRecord.outcome.matched ? tuning.judge.matchedBonus : 0) +
        (turnRecord.outcome.stalled ? -tuning.judge.stalledPenalty : 0) -
        progressPenalty,
      0,
      1,
    );
    return {
      turnIndex: turnRecord.turnIndex,
      label:
        score >= 0.75
          ? "healthy"
          : score >= 0.5
            ? "watch"
            : "broken",
      conversation: turnRecord.outcome.stalled ? "stalled" : "alive",
      memory: action.memoryReferences?.length ? "memory_helpful" : "memory_neutral",
      convergence: turnRecord.outcome.matched ? "converged" : "partial",
      usefulness: score >= 0.6 ? "good_match" : score >= 0.45 ? "weak_match" : "bad_match",
      instability: turnRecord.outcome.stalled ? "unstable" : "healthy",
      operatorAttentionNeeded: Boolean(
        turnRecord.outcome.stalled ||
          !["passed", "recovered"].includes(turnRecord.backend?.status ?? ""),
      ),
      score: Number(score.toFixed(3)),
      rationale:
        turnRecord.outcome.matched
          ? "Turn advanced a relationship toward convergence."
          : progressPenalty > 0
            ? "Turn kept moving but did not resolve a weak-fit relationship."
            : "Turn kept the simulation moving without a confirmed match.",
    };
  }

  async scoreWorld(context) {
    const tuning = getTuning(context.config);
    const matchedRatio =
      context.metrics.matchedMembers.size /
      Math.max(context.world.relationships.length || 1, 1);
    const turnBalance = 1 - context.metrics.stalledTurns / Math.max(context.metrics.totalTurns || 1, 1);
    const expectationCount = worldSpecificExpectationCount(context.world);
    const expectationFulfillment =
      ((worldNeedsRecovery(context.world) && context.metrics.recoverySignals > 0 ? 1 : 0) +
        (worldNeedsMemory(context.world) && context.metrics.memorySignals > 0 ? 1 : 0) +
        (worldNeedsGroupProgress(context.world) && context.metrics.invites > 0 ? 1 : 0)) /
      Math.max(expectationCount, 1);
    const shallowFollowupPenalty =
      clamp(
        (context.metrics.followups /
          Math.max(
            context.metrics.replies +
              context.metrics.introductions +
              context.metrics.invites,
            1,
          ) -
          1.15) *
          tuning.judge.worldShallowPenaltySlope,
        0,
        tuning.judge.worldShallowPenaltyCap,
      );
    const score = clamp(
      tuning.judge.worldBase +
        matchedRatio * tuning.judge.worldMatchedRatioWeight +
        turnBalance * tuning.judge.worldTurnBalanceWeight +
        expectationFulfillment * tuning.judge.worldExpectationWeight +
        (context.metrics.moderationSignals > 0 ? -tuning.judge.worldModerationPenalty : 0) -
        shallowFollowupPenalty,
      0,
      1,
    );
    return buildWorldJudgeResult(context.world, score, context.metrics);
  }
}

class RemoteJudgeProviderBase extends HeuristicJudgeProvider {
  async scoreTurn(context) {
    const remote = await this.tryRemoteTurn(context);
    if (!remote && this.useRemote && this.config.failOnRemoteFallback) {
      throw new Error(
        `Social simulation judge provider "${this.name}" fell back to heuristic turn scoring in fail-closed mode.`,
      );
    }
    return remote ?? super.scoreTurn(context);
  }

  async scoreWorld(context) {
    const remote = await this.tryRemoteWorld(context);
    if (!remote && this.useRemote && this.config.failOnRemoteFallback) {
      throw new Error(
        `Social simulation judge provider "${this.name}" fell back to heuristic world scoring in fail-closed mode.`,
      );
    }
    return remote ?? super.scoreWorld(context);
  }
}

class OllamaJudgeProvider extends RemoteJudgeProviderBase {
  constructor(config) {
    super(config);
    this.name = "ollama";
    this.endpoint =
      normalizeString(config.ollamaBaseUrl, "http://localhost:11434").replace(
        /\/+$/,
        "",
      );
    this.model = normalizeString(config.ollamaModel, "llama3.1");
    this.apiKey = normalizeString(config.ollamaApiKey, "");
    this.useRemote =
      config.useRemoteJudge || boolFromEnv(process.env.SOCIAL_SIM_USE_REMOTE_JUDGE);
  }

  async tryRemoteTurn(context) {
    return this.tryRemote("turn", context);
  }

  async tryRemoteWorld(context) {
    return this.tryRemote("world", context);
  }

  async tryRemote(scope, context) {
    if (!this.useRemote) return null;
    try {
      const response = await fetch(`${this.endpoint}/api/chat`, {
        method: "POST",
        headers: buildOllamaHeaders(this.apiKey),
        body: JSON.stringify({
          model: this.model,
          format: "json",
          stream: false,
          messages: [
            {
              role: "system",
              content: [
                "You are a judge for a social simulation harness.",
                `Return JSON matching prompt version ${SOCIAL_SIM_PROMPT_VERSION}.`,
              ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify(
                {
                  scope,
                  ...buildJudgeContext(context),
                },
                null,
                2,
              ),
            },
          ],
        }),
      });
      const payload = await response.json().catch(() => null);
      const content = payload?.message?.content;
      if (!response.ok || typeof content !== "string") return null;
      const parsed = safeJsonParse(content, null);
      if (!parsed || typeof parsed !== "object") return null;
      return normalizeJudgeOutput(parsed, scope, context, "ollama");
    } catch {
      return null;
    }
  }
}

function buildOllamaHeaders(apiKey = "") {
  const headers = { "content-type": "application/json" };
  const normalizedApiKey = normalizeString(apiKey, "");
  if (normalizedApiKey) {
    headers.authorization = `Bearer ${normalizedApiKey}`;
  }
  return headers;
}

class OpenAIJudgeProvider extends RemoteJudgeProviderBase {
  constructor(config) {
    super(config);
    this.name = "openai";
    this.model = normalizeString(config.openaiModel, "gpt-4.1-mini");
    this.apiKey = normalizeString(config.openaiApiKey, "");
    this.useRemote =
      config.useRemoteJudge || boolFromEnv(process.env.SOCIAL_SIM_USE_REMOTE_JUDGE);
  }

  async tryRemoteTurn(context) {
    return this.tryRemote("turn", context);
  }

  async tryRemoteWorld(context) {
    return this.tryRemote("world", context);
  }

  async tryRemote(scope, context) {
    if (!this.useRemote || !this.apiKey) return null;
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "You are a judge for a social simulation harness.",
                `Return JSON matching prompt version ${SOCIAL_SIM_PROMPT_VERSION}.`,
              ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify(
                {
                  scope,
                  ...buildJudgeContext(context),
                },
                null,
                2,
              ),
            },
          ],
        }),
      });
      const payload = await response.json().catch(() => null);
      const content = payload?.choices?.[0]?.message?.content;
      if (!response.ok || typeof content !== "string") return null;
      const parsed = safeJsonParse(content, null);
      if (!parsed || typeof parsed !== "object") return null;
      return normalizeJudgeOutput(parsed, scope, context, "openai");
    } catch {
      return null;
    }
  }
}

function buildProviderContext(context) {
  return {
    promptVersion: SOCIAL_SIM_PROMPT_VERSION,
    actor: context.actor,
    world: {
      id: context.world.id,
      name: context.world.name,
      family: context.world.family,
      horizon: context.world.horizon,
      turnBudget: context.world.turnBudget,
      goals: context.world.goals,
      relationships: context.world.relationships,
      evaluationFocus: context.world.evaluationFocus,
    },
    state: {
      stage: context.state.stage,
      turnIndex: context.state.turnIndex,
      knownTargets: Array.from(context.state.knownTargets.entries()),
    },
    transcriptPreview: context.transcript.slice(-4),
  };
}

function buildJudgeContext(context) {
  return {
    promptVersion: SOCIAL_SIM_PROMPT_VERSION,
    world: {
      id: context.world.id,
      name: context.world.name,
      family: context.world.family,
      horizon: context.world.horizon,
      turnBudget: context.world.turnBudget,
      relationships: context.world.relationships,
      evaluationFocus: context.world.evaluationFocus,
    },
    transcript: context.transcript.slice(-8),
    state: {
      stage: context.state.stage,
      turnIndex: context.state.turnIndex,
      matchedMembers: Array.from(context.metrics.matchedMembers ?? []),
    },
    metrics: {
      introductions: context.metrics.introductions,
      replies: context.metrics.replies,
      followups: context.metrics.followups,
      invites: context.metrics.invites,
      memorySignals: context.metrics.memorySignals,
      recoverySignals: context.metrics.recoverySignals,
      moderationSignals: context.metrics.moderationSignals,
      matchedRelationships: context.metrics.matchedMembers.size,
      stalledTurns: context.metrics.stalledTurns,
      totalTurns: context.metrics.totalTurns,
    },
  };
}

function normalizeJudgeOutput(output, scope, context, provider) {
  if (scope === "turn") {
    const score = clamp(toNumber(output.score, 0.5), 0, 1);
    return {
      turnIndex: context.turnRecord.turnIndex,
      label: normalizeString(output.label, score >= 0.5 ? "watch" : "broken"),
      conversation: normalizeString(
        output.conversation,
        context.turnRecord.outcome.stalled ? "stalled" : "alive",
      ),
      memory: normalizeString(
        output.memory,
        context.action.memoryReferences?.length
          ? "memory_helpful"
          : "memory_neutral",
      ),
      convergence: normalizeString(
        output.convergence,
        context.turnRecord.outcome.matched ? "converged" : "partial",
      ),
      usefulness: normalizeString(
        output.usefulness,
        score >= 0.6 ? "good_match" : score >= 0.45 ? "weak_match" : "bad_match",
      ),
      instability: normalizeString(
        output.instability,
        context.turnRecord.outcome.stalled ? "unstable" : "healthy",
      ),
      operatorAttentionNeeded:
        typeof output.operatorAttentionNeeded === "boolean"
          ? output.operatorAttentionNeeded
          : Boolean(context.turnRecord.outcome.stalled),
      score,
      rationale: normalizeString(output.rationale, `${provider} remote turn judgment.`),
    };
  }
  const score = clamp(toNumber(output.score, 0.6), 0, 1);
  return buildWorldJudgeResult(context.world, score, context.metrics, {
    provider,
    label: normalizeString(output.label, score >= 0.75 ? "healthy" : "watch"),
    conversation: normalizeString(output.conversation, "alive"),
    memory: normalizeString(output.memory, "memory_helpful"),
    convergence: normalizeString(output.convergence, "converged"),
    usefulness: normalizeString(output.usefulness, "good_match"),
    instability: normalizeString(output.instability, "healthy"),
    operatorAttentionNeeded:
      typeof output.operatorAttentionNeeded === "boolean"
        ? output.operatorAttentionNeeded
        : false,
    rationale: normalizeString(output.rationale, `${provider} remote world judgment.`),
  });
}

function buildWorldJudgeResult(world, score, metrics, overrides = {}) {
  const label =
    overrides.label ??
    (score >= 0.75 ? "healthy" : score >= 0.5 ? "watch" : "broken");
  const convergence =
    overrides.convergence ??
    (score >= 0.75 ? "converged" : score >= 0.5 ? "partial" : "failed");
  const memory =
    overrides.memory ?? (metrics.memorySignals > 0 ? "memory_helpful" : "memory_neutral");
  const conversation =
    overrides.conversation ??
    (metrics.stalledTurns > metrics.totalTurns / 2
      ? "stalled"
      : metrics.followups >
            metrics.replies + metrics.introductions + metrics.invites
        ? "awkward"
        : "alive");
  const usefulness =
    overrides.usefulness ??
    (score >= 0.6 ? "good_match" : score >= 0.45 ? "weak_match" : "bad_match");
  const instability =
    overrides.instability ??
    (metrics.moderationSignals > 0
      ? "unstable"
      : metrics.followups >
            metrics.replies + metrics.introductions + metrics.invites
        ? "unstable"
        : "healthy");
  return {
    worldId: world.id,
    label,
    conversation,
    memory,
    convergence,
    usefulness,
    instability,
    operatorAttentionNeeded:
      overrides.operatorAttentionNeeded ??
      Boolean(metrics.moderationSignals > 0 || metrics.stalledTurns > metrics.totalTurns / 2),
    score: Number(score.toFixed(3)),
    rationale:
      overrides.rationale ??
      `world=${world.id} score=${score.toFixed(3)} matched=${metrics.matchedMembers.size}`,
  };
}

function buildCleanupResult(mode, worlds, config) {
  return {
    mode,
    attempted: mode !== "none",
    applied: false,
    namespace: config.namespace,
    worldIds: worlds.map((world) => world.worldId),
    notes:
      mode === "none"
        ? ["Cleanup disabled by configuration."]
        : [
            "Script-local MVP cleanup is artifact-only unless a backend cleanup adapter is configured.",
          ],
  };
}

class SocialSimBackendAdapter {
  constructor(config) {
    this.config = config;
    this.baseUrl = normalizeString(config.baseUrl, "");
    this.adminUserId = normalizeString(config.adminUserId, "");
    this.adminRole = normalizeString(config.adminRole, "admin");
    this.adminApiKey = normalizeString(config.adminApiKey, "");
    this.enabled = Boolean(this.baseUrl && this.adminUserId);
    this.remoteRunId = null;
    this.backendTurnDelayMs = clamp(
      toNumber(config.backendTurnDelayMs, 250),
      0,
      10_000,
    );
    this.backendRetryCount = clamp(toNumber(config.backendRetryCount, 3), 0, 10);
    this.backendRetryBaseDelayMs = clamp(
      toNumber(config.backendRetryBaseDelayMs, 750),
      0,
      30_000,
    );
    this.nextAllowedTurnAtMs = 0;
  }

  async bootstrapRun({ runId, namespace, dryRun, worldCount }) {
    if (!this.enabled || dryRun) {
      return {
        backendMode: "offline",
        runId,
        namespace,
        worldCount,
        status: "stubbed",
        notes: this.enabled
          ? ["Dry-run mode prevented backend bootstrap."]
          : ["No backend credentials configured; using offline simulation mode."],
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/admin/playground/bootstrap`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-user-id": this.adminUserId,
          "x-admin-role": this.adminRole,
          "x-social-sim-namespace": namespace,
          ...(this.adminApiKey ? { "x-admin-api-key": this.adminApiKey } : {}),
        },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        return {
          backendMode: "offline",
          runId,
          namespace,
          worldCount,
          status: "bootstrap_failed",
          error: {
            status: response.status,
            payload,
          },
        };
      }
      const bootstrap = {
        backendMode: "playground",
        runId,
        namespace,
        worldCount,
        status: "bootstrapped",
        env: payload?.data?.env ?? {},
        entities: payload?.data?.entities ?? {},
        notes: Array.isArray(payload?.data?.notes) ? payload.data.notes : [],
      };

      const runResponse = await fetch(`${this.baseUrl}/api/admin/social-sim/runs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-user-id": this.adminUserId,
          "x-admin-role": this.adminRole,
          "x-social-sim-namespace": namespace,
          ...(this.adminApiKey ? { "x-admin-api-key": this.adminApiKey } : {}),
        },
        body: JSON.stringify({
          scenarioFamily: "full-social-world",
          provider: this.config.provider,
          judgeProvider: this.config.judgeProvider,
          horizon: this.config.horizon === "all" ? "medium" : this.config.horizon,
          seed: String(this.config.seed),
          namespace,
          turnBudget: this.config.turnBudget,
          actorCount: this.config.actorCount ?? worldCount,
          cleanupMode:
            this.config.cleanupMode === "none" ? "archive" : this.config.cleanupMode,
          notes: [
            `script-run:${runId}`,
            `worldCount:${worldCount}`,
          ],
        }),
      });
      const runPayload = await runResponse.json().catch(() => null);
      if (runResponse.ok && runPayload?.success && runPayload?.data?.runId) {
        this.remoteRunId = runPayload.data.runId;
        bootstrap.remoteRunId = this.remoteRunId;
        bootstrap.notes = [
          ...(bootstrap.notes ?? []),
          `remoteRunId:${this.remoteRunId}`,
        ];
      } else {
        bootstrap.notes = [
          ...(bootstrap.notes ?? []),
          "remote run bootstrap failed; backend turns will fall back to offline mode.",
        ];
      }
      return bootstrap;
    } catch (error) {
      return {
        backendMode: "offline",
        runId,
        namespace,
        worldCount,
        status: "bootstrap_error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async submitTurn({ world, actor, action, state, dryRun }) {
    if (!this.enabled || dryRun || !this.remoteRunId) {
      return {
        mode: "offline",
        status: this.remoteRunId || dryRun || !this.enabled ? "passed" : "skipped",
        actionType: action.intent,
        detail: this.remoteRunId
          ? "offline simulation turn"
          : "remote run unavailable; offline simulation turn",
      };
    }
    const headers = {
      "content-type": "application/json",
      "x-admin-user-id": this.adminUserId,
      "x-admin-role": this.adminRole,
      "x-social-sim-namespace": this.config.namespace,
      ...(this.adminApiKey ? { "x-admin-api-key": this.adminApiKey } : {}),
    };
    const payload = {
      namespace: this.config.namespace,
      runId: this.remoteRunId,
      worldId: world.id,
      actorId: actor.id,
      actorKind: actor.kind,
      stage: state.stage,
      promptVersion: SOCIAL_SIM_PROMPT_VERSION,
      action,
      metrics: {
        turnIndex: state.turnIndex,
      },
    };
    let lastFailure = null;
    for (
      let attemptIndex = 0;
      attemptIndex <= this.backendRetryCount;
      attemptIndex += 1
    ) {
      const now = Date.now();
      if (this.nextAllowedTurnAtMs > now) {
        await sleep(this.nextAllowedTurnAtMs - now);
      }

      try {
        const response = await fetch(`${this.baseUrl}/api/admin/social-sim/turn`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        const json = await response.json().catch(() => null);
        if (response.ok && json?.success) {
          this.nextAllowedTurnAtMs = Date.now() + this.backendTurnDelayMs;
          return {
            mode: "backend",
            status: attemptIndex > 0 ? "recovered" : "passed",
            actionType: action.intent,
            detail: {
              ...(json?.data ?? {}),
              retryCount: attemptIndex,
            },
          };
        }

        lastFailure = {
          status: response.status,
          payload: json,
        };
        const isThrottle =
          response.status === 429 ||
          json?.error?.code === "abuse_throttled";
        if (!isThrottle || attemptIndex >= this.backendRetryCount) {
          break;
        }

        const delay =
          this.backendRetryBaseDelayMs * Math.max(1, 2 ** attemptIndex);
        this.nextAllowedTurnAtMs = Date.now() + delay;
        await sleep(delay);
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
        if (attemptIndex >= this.backendRetryCount) {
          break;
        }
        const delay =
          this.backendRetryBaseDelayMs * Math.max(1, 2 ** attemptIndex);
        this.nextAllowedTurnAtMs = Date.now() + delay;
        await sleep(delay);
      }
    }

    return {
      mode: "offline",
      status: "failed",
      actionType: action.intent,
      detail: lastFailure,
    };
  }

  async cleanupRun({ runId, namespace, worlds, mode }) {
    if (mode === "none") {
      return buildCleanupResult(mode, worlds, this.config);
    }
    if (!this.enabled) {
      return buildCleanupResult(mode, worlds, this.config);
    }
    if (this.remoteRunId) {
      try {
        const response = await fetch(
          `${this.baseUrl}/api/admin/social-sim/runs/${this.remoteRunId}/cleanup`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-admin-user-id": this.adminUserId,
              "x-admin-role": this.adminRole,
              "x-social-sim-namespace": namespace,
              ...(this.adminApiKey ? { "x-admin-api-key": this.adminApiKey } : {}),
            },
            body: JSON.stringify({
              mode: mode === "none" ? "archive" : mode,
            }),
          },
        );
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.success) {
          return {
            mode,
            attempted: true,
            applied: true,
            namespace,
            remoteRunId: this.remoteRunId,
            worldIds: worlds.map((world) => world.worldId),
            notes: [`remote cleanup applied for ${this.remoteRunId}`],
          };
        }
      } catch {
        // Remote cleanup is best-effort. Local artifacts remain available.
      }
    }
    return {
      mode,
      attempted: true,
      applied: false,
      namespace,
      worldIds: worlds.map((world) => world.worldId),
      notes: [
        "Backend cleanup adapter is intentionally not wired in the script-only MVP.",
        "Artifacts remain available under the run directory.",
        `Run ${runId} is namespaced and may be cleaned up later from backend tooling.`,
      ],
    };
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const config = parseSocialSimArgs(argv, env);
  const result = await runSocialSimulation(config);
  const output = {
    runId: result.artifact.runId,
    runDir: result.runDir,
    namespace: result.artifact.namespace,
    summary: result.summary,
    cleanup: result.cleanup,
    worlds: result.artifact.worlds.map((world) => ({
      worldId: world.worldId,
      horizon: world.horizon,
      family: world.family,
      convergenceScore: world.summary.convergenceScore,
      noMatchRecoveryQuality: world.summary.noMatchRecoveryQuality,
      memoryConsistency: world.summary.memoryConsistency,
      judge: world.judge,
    })),
  };
  console.log(JSON.stringify(output, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
  return output;
}

export async function nightlyMain(argv = process.argv.slice(2), env = process.env) {
  const config = parseSocialSimArgs(argv, env);
  const fixture = loadSocialSimWorldFixture(
    config.fixturePath,
    config.scenarioFixturePath,
  );
  const canonical = [
    ...fixture.filter((world) => world.horizon === "short").slice(0, 1),
    ...fixture.filter((world) => world.horizon === "medium").slice(0, 1),
    ...fixture.filter((world) => world.horizon === "long").slice(0, 1),
  ];
  const nightlyConfig = {
    ...config,
    nightly: true,
    horizon: "all",
    worldFilter: canonical.map((world) => world.id),
    turnBudget: Number.isFinite(config.turnBudget) ? Math.min(config.turnBudget, 8) : 8,
    cleanupMode: config.cleanupMode === "none" ? "none" : "archive",
  };
  nightlyConfig.runId = `${config.namespace}-nightly-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const result = await runSocialSimulation(nightlyConfig);
  const rollup = {
    runId: result.artifact.runId,
    namespace: result.artifact.namespace,
    nightly: true,
    summary: result.summary,
    worlds: result.artifact.worlds.map((world) => ({
      worldId: world.worldId,
      horizon: world.horizon,
      convergenceScore: world.summary.convergenceScore,
      judgeLabel: world.judge.label,
      operatorAttentionNeeded: world.judge.operatorAttentionNeeded,
    })),
  };
  const nightlyPath = path.join(result.runDir, "nightly-rollup.json");
  writeFileSync(nightlyPath, `${JSON.stringify(rollup, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(rollup, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
  return rollup;
}

export {
  HeuristicJudgeProvider,
  HeuristicSocialSimProvider,
  OllamaJudgeProvider,
  OllamaSocialSimProvider,
  OpenAIJudgeProvider,
  OpenAISocialSimProvider,
  SocialSimBackendAdapter,
  buildMessageForIntent,
};
