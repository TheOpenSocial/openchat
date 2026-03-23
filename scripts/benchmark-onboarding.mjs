#!/usr/bin/env node

/**
 * Benchmarks onboarding probe latency/quality across fast and rich modes.
 *
 * Required env:
 * - ONBOARDING_BENCH_URL (example: https://api.opensocial.app/api/onboarding/probe)
 * - ONBOARDING_PROBE_TOKEN
 *
 * Optional env:
 * - ONBOARDING_BENCH_RUNS (default: 12)
 * - ONBOARDING_BENCH_MODE (fast|rich|both, default: both)
 * - ONBOARDING_BENCH_TIMEOUT_MS (default: 20000)
 */

const url = process.env.ONBOARDING_BENCH_URL?.trim();
const token = process.env.ONBOARDING_PROBE_TOKEN?.trim();
const runs = Number(process.env.ONBOARDING_BENCH_RUNS ?? 12);
const mode = (process.env.ONBOARDING_BENCH_MODE ?? "both").trim();
const timeoutMs = Number(process.env.ONBOARDING_BENCH_TIMEOUT_MS ?? 20_000);
const delayMs = Number(process.env.ONBOARDING_BENCH_DELAY_MS ?? 350);

if (!url) {
  console.error("Missing ONBOARDING_BENCH_URL");
  process.exit(1);
}

if (!token) {
  console.error("Missing ONBOARDING_PROBE_TOKEN");
  process.exit(1);
}

const transcripts = [
  "I want to meet thoughtful people to make weekend plans around design and coffee.",
  "Looking for football and fitness groups in my city, mostly evenings.",
  "I like startups and AI, hoping to find 1:1 chats and maybe small founder circles.",
  "I just moved and want genuine new friends for chill plans.",
];

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
      fallback: Boolean(isFallback),
      hasPersona: Boolean(result?.persona),
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
  const fallbackCount = ok.filter((item) => item.fallback).length;
  const line =
    `mode=${selectedMode} runs=${results.length} ok=${ok.length} ` +
    `failed=${failed.length} p50=${percentile(durations, 50) ?? "n/a"}ms ` +
    `p95=${percentile(durations, 95) ?? "n/a"}ms avg=${Math.round(avg(durations) ?? 0)}ms ` +
    `fallbackRate=${ok.length ? Math.round((fallbackCount / ok.length) * 100) : 0}%`;
  console.log(line);
  if (failed.length) {
    for (const failure of failed) {
      console.log(
        `  fail run=${failure.run} error=${failure.error} detail=${failure.detail ?? "-"}`,
      );
    }
  }
}

async function main() {
  console.log(
    `benchmark starting url=${url} runs=${runs} mode=${mode} timeoutMs=${timeoutMs} delayMs=${delayMs}`,
  );
  const all = [];
  for (const selectedMode of modes) {
    const modeResults = [];
    for (let i = 0; i < runs; i += 1) {
      const transcript = transcripts[i % transcripts.length];
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
    printModeSummary(selectedMode, modeResults);
  }
  const totalFailed = all.filter((item) => !item.ok).length;
  console.log(`benchmark finished totalRuns=${all.length} failed=${totalFailed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
