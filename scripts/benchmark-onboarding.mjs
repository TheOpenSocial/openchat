#!/usr/bin/env node

/**
 * Benchmarks onboarding probe latency and quality across fast and rich modes.
 *
 * Required env:
 * - ONBOARDING_BENCH_URL (example: https://api.opensocial.app/api/onboarding/probe)
 * - ONBOARDING_PROBE_TOKEN
 *
 * Optional env:
 * - ONBOARDING_BENCH_RUNS (default: 12)
 * - ONBOARDING_BENCH_MODE (fast|rich|both, default: both)
 * - ONBOARDING_BENCH_MODEL (optional exact model override for probe)
 * - ONBOARDING_BENCH_TIMEOUT_MS (default: 20000)
 * - ONBOARDING_BENCH_DATASET (optional path, default: scripts/onboarding-benchmark-dataset.json)
 * - ONBOARDING_BENCH_MAX_GENERIC_PERSONA_RATE (default: 0.30)
 * - ONBOARDING_BENCH_MIN_QUALITY_SCORE (default: 0.72)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.ONBOARDING_BENCH_URL?.trim();
const token = process.env.ONBOARDING_PROBE_TOKEN?.trim();
const runs = Number(process.env.ONBOARDING_BENCH_RUNS ?? 12);
const mode = (process.env.ONBOARDING_BENCH_MODE ?? "both").trim();
const modelOverride = process.env.ONBOARDING_BENCH_MODEL?.trim() || "";
const timeoutMs = Number(process.env.ONBOARDING_BENCH_TIMEOUT_MS ?? 20_000);
const delayMs = Number(process.env.ONBOARDING_BENCH_DELAY_MS ?? 350);
const maxP95Ms = Number(process.env.ONBOARDING_BENCH_MAX_P95_MS ?? 4_000);
const maxFailureRate = Number(
  process.env.ONBOARDING_BENCH_MAX_FAILURE_RATE ?? 0.2,
);
const datasetPath = resolve(
  process.cwd(),
  process.env.ONBOARDING_BENCH_DATASET?.trim() ||
    "scripts/onboarding-benchmark-dataset.json",
);
const maxGenericPersonaRate = Number(
  process.env.ONBOARDING_BENCH_MAX_GENERIC_PERSONA_RATE ?? 0.3,
);
const minQualityScore = Number(
  process.env.ONBOARDING_BENCH_MIN_QUALITY_SCORE ?? 0.72,
);

if (!url) {
  console.error("Missing ONBOARDING_BENCH_URL");
  process.exit(1);
}

if (!token) {
  console.error("Missing ONBOARDING_PROBE_TOKEN");
  process.exit(1);
}

const genericPersonaLabels = new Set([
  "connector",
  "explorer",
  "social builder",
  "researcher",
  "planner",
  "friend",
  "social",
]);

const genericSummaryFragments = [
  "meet people",
  "make plans",
  "social plans",
  "connect with people",
  "new connections",
];

function readDataset() {
  const raw = readFileSync(datasetPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length < 20) {
    throw new Error(
      `Dataset must be an array with at least 20 transcripts. path=${datasetPath}`,
    );
  }
  return parsed
    .map((entry, index) => {
      const transcript =
        typeof entry?.transcript === "string" ? entry.transcript.trim() : "";
      return {
        id:
          typeof entry?.id === "string" && entry.id.trim().length > 0
            ? entry.id.trim()
            : `row-${index + 1}`,
        locale:
          typeof entry?.locale === "string" && entry.locale.trim().length > 0
            ? entry.locale.trim()
            : "unknown",
        transcript,
      };
    })
    .filter((entry) => entry.transcript.length > 0);
}

function isLikelyGenericPersona(value) {
  if (typeof value !== "string") {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return genericPersonaLabels.has(normalized);
}

function isLikelyGenericSummary(value) {
  if (typeof value !== "string") {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 24) {
    return true;
  }
  return genericSummaryFragments.some((fragment) => normalized === fragment);
}

function clampScore(score) {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(1, score));
}

function qualityScore(result, selectedMode) {
  if (!result || typeof result !== "object") {
    return 0;
  }
  const persona = typeof result.persona === "string" ? result.persona : "";
  const summary = typeof result.summary === "string" ? result.summary : "";
  const interests = Array.isArray(result.interests) ? result.interests : [];
  const goals = Array.isArray(result.goals) ? result.goals : [];
  const hasFollowUp =
    typeof result.followUpQuestion === "string" &&
    result.followUpQuestion.trim().length > 0;

  let score = 0;
  score += isLikelyGenericPersona(persona) ? 0.1 : 0.35;
  score += isLikelyGenericSummary(summary) ? 0.1 : 0.3;
  score += interests.length >= 2 ? 0.15 : interests.length === 1 ? 0.08 : 0;
  score += goals.length >= 1 ? 0.1 : 0;
  if (selectedMode === "rich") {
    score += hasFollowUp ? 0.1 : 0;
  }
  return clampScore(score);
}

const modes = mode === "both" ? ["fast", "rich"] : [mode];

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function avg(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function runOne(selectedMode, transcript, index) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onboarding-probe-token": token,
      },
      body: JSON.stringify({
        transcript,
        mode: selectedMode,
        ...(modelOverride ? { model: modelOverride } : {}),
      }),
      signal: controller.signal,
    });
    const elapsed = Date.now() - started;
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        mode: selectedMode,
        elapsed,
        run: index,
        error: `http_${response.status}`,
        detail: json?.error?.message ?? json?.message ?? null,
      };
    }
    const payload = json?.data ?? {};
    const result = payload?.result ?? {};
    const isFallback =
      typeof result?.inferenceMeta === "object" &&
      result?.inferenceMeta != null &&
      result?.persona?.toLowerCase?.() === "connector" &&
      result?.summary != null;
    return {
      ok: true,
      mode: selectedMode,
      elapsed,
      reportedDurationMs: Number(payload?.durationMs ?? elapsed),
      run: index,
      id: transcript.id,
      locale: transcript.locale,
      fallback: Boolean(isFallback),
      hasPersona: Boolean(result?.persona),
      persona: typeof result?.persona === "string" ? result.persona : "",
      summary: typeof result?.summary === "string" ? result.summary : "",
      qualityScore: qualityScore(result, selectedMode),
      genericPersona: isLikelyGenericPersona(result?.persona),
      genericSummary: isLikelyGenericSummary(result?.summary),
      interestsCount: Array.isArray(result?.interests)
        ? result.interests.length
        : 0,
      goalsCount: Array.isArray(result?.goals) ? result.goals.length : 0,
    };
  } catch (error) {
    const elapsed = Date.now() - started;
    return {
      ok: false,
      mode: selectedMode,
      elapsed,
      run: index,
      error: error?.name === "AbortError" ? "timeout" : "request_error",
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function printModeSummary(selectedMode, results) {
  const ok = results.filter((item) => item.ok);
  const failed = results.filter((item) => !item.ok);
  const durations = ok
    .map((item) => item.reportedDurationMs ?? item.elapsed)
    .sort((a, b) => a - b);
  const p95 = percentile(durations, 95);
  const failureRate = results.length === 0 ? 1 : failed.length / results.length;
  const fallbackCount = ok.filter((item) => item.fallback).length;
  const genericPersonaCount = ok.filter((item) => item.genericPersona).length;
  const genericSummaryCount = ok.filter((item) => item.genericSummary).length;
  const qualityAvg = avg(ok.map((item) => item.qualityScore));
  const genericPersonaRate = ok.length ? genericPersonaCount / ok.length : 1;
  const line =
    `mode=${selectedMode} runs=${results.length} ok=${ok.length} ` +
    `failed=${failed.length} p50=${percentile(durations, 50) ?? "n/a"}ms ` +
    `p95=${p95 ?? "n/a"}ms avg=${Math.round(avg(durations) ?? 0)}ms ` +
    `fallbackRate=${ok.length ? Math.round((fallbackCount / ok.length) * 100) : 0}% ` +
    `genericPersonaRate=${Math.round(genericPersonaRate * 100)}% ` +
    `genericSummaryRate=${ok.length ? Math.round((genericSummaryCount / ok.length) * 100) : 0}% ` +
    `quality=${(qualityAvg ?? 0).toFixed(2)}`;
  console.log(line);
  if (failed.length) {
    for (const failure of failed) {
      console.log(
        `  fail run=${failure.run} error=${failure.error} detail=${failure.detail ?? "-"}`,
      );
    }
  }
  const lowQuality = ok
    .filter((item) => item.qualityScore < minQualityScore)
    .slice(0, 5);
  for (const row of lowQuality) {
    console.log(
      `  quality-low id=${row.id} locale=${row.locale} score=${row.qualityScore.toFixed(2)} persona="${row.persona}" summary="${row.summary.slice(0, 90)}"`,
    );
  }
  return {
    failureRate,
    p95,
    qualityAvg: qualityAvg ?? 0,
    genericPersonaRate,
    hasBreached:
      failureRate > maxFailureRate ||
      (typeof p95 === "number" && p95 > maxP95Ms) ||
      (qualityAvg ?? 0) < minQualityScore ||
      genericPersonaRate > maxGenericPersonaRate,
  };
}

async function main() {
  const dataset = readDataset();
  console.log(
    `benchmark starting url=${url} runs=${runs} mode=${mode} model=${modelOverride || "default"} timeoutMs=${timeoutMs} delayMs=${delayMs} datasetSize=${dataset.length}`,
  );
  const all = [];
  let breached = false;
  for (const selectedMode of modes) {
    const modeResults = [];
    for (let i = 0; i < runs; i += 1) {
      const transcript = dataset[i % dataset.length];
      const result = await runOne(selectedMode, transcript, i + 1);
      modeResults.push(result);
      all.push(result);
      const status = result.ok ? "ok" : "fail";
      const ms = result.reportedDurationMs ?? result.elapsed;
      process.stdout.write(
        `[${selectedMode}] run=${i + 1}/${runs} ${status} ${ms}ms\r`,
      );
      if (delayMs > 0 && i < runs - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    process.stdout.write("\n");
    const summary = printModeSummary(selectedMode, modeResults);
    if (summary.hasBreached) {
      breached = true;
      console.error(
        `  threshold breach mode=${selectedMode} failureRate=${Math.round(summary.failureRate * 100)}% maxFailureRate=${Math.round(maxFailureRate * 100)}% p95=${summary.p95 ?? "n/a"}ms maxP95=${maxP95Ms}ms quality=${summary.qualityAvg.toFixed(2)} minQuality=${minQualityScore} genericPersonaRate=${Math.round(summary.genericPersonaRate * 100)}% maxGenericPersonaRate=${Math.round(maxGenericPersonaRate * 100)}%`,
      );
    }
  }
  const totalFailed = all.filter((item) => !item.ok).length;
  console.log(`benchmark finished totalRuns=${all.length} failed=${totalFailed}`);
  if (breached) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
