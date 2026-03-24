import { Panel } from "@/app/components/Panel";
import {
  type LlmRuntimeHealthSnapshot,
  type OnboardingActivationSnapshot,
} from "./workbench-config";

function formatRate(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatMs(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return `${Math.round(value)}ms`;
}

function formatSeconds(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "n/a";
  }
  return `${value.toFixed(1)}s`;
}

export function SystemControlsPanel({
  adminButtonClass,
  health,
  relayCount,
  loadDeadLetters,
  relayOutbox,
}: {
  adminButtonClass: string;
  health: string;
  relayCount: number | null;
  loadDeadLetters: () => Promise<unknown>;
  relayOutbox: () => Promise<unknown>;
}) {
  return (
    <Panel
      subtitle="Live queue operations and system health."
      title="System Controls"
    >
      <div className="flex flex-wrap gap-2">
        <button
          className={adminButtonClass}
          onClick={loadDeadLetters}
          type="button"
        >
          Load dead letters
        </button>
        <button
          className={adminButtonClass}
          onClick={relayOutbox}
          type="button"
        >
          Relay outbox
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        health: <span className="text-foreground">{health}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        outbox processed:{" "}
        <span className="text-foreground">{relayCount ?? "n/a"}</span>
      </p>
    </Panel>
  );
}

export function OnboardingActivationHealthPanel({
  adminButtonClass,
  onboardingActivationSnapshot,
  loadOnboardingActivationSnapshot,
}: {
  adminButtonClass: string;
  onboardingActivationSnapshot: OnboardingActivationSnapshot | null;
  loadOnboardingActivationSnapshot: () => Promise<unknown>;
}) {
  return (
    <Panel
      subtitle="Server-side onboarding first-activation execution snapshot."
      title="Onboarding Activation Health"
    >
      <div className="flex flex-wrap gap-2">
        <button
          className={adminButtonClass}
          onClick={loadOnboardingActivationSnapshot}
          type="button"
        >
          Refresh activation snapshot
        </button>
      </div>
      {!onboardingActivationSnapshot ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No activation snapshot loaded yet.
        </p>
      ) : (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>
            window: last {onboardingActivationSnapshot.window.hours}h · started:{" "}
            {onboardingActivationSnapshot.counters.started} · succeeded:{" "}
            {onboardingActivationSnapshot.counters.succeeded} · failed:{" "}
            {onboardingActivationSnapshot.counters.failed} · processing:{" "}
            {onboardingActivationSnapshot.counters.processing}
          </p>
          <p>
            success:{" "}
            {formatRate(onboardingActivationSnapshot.metrics.successRate)} ·
            failure:{" "}
            {formatRate(onboardingActivationSnapshot.metrics.failureRate)} ·
            processing:{" "}
            {formatRate(onboardingActivationSnapshot.metrics.processingRate)} ·
            avg completion:{" "}
            {formatSeconds(
              onboardingActivationSnapshot.metrics.avgCompletionSeconds,
            )}
          </p>
        </div>
      )}
    </Panel>
  );
}

export function LlmRuntimeHealthPanel({
  adminButtonClass,
  llmRuntimeHealthSnapshot,
  loadLlmRuntimeHealthSnapshot,
}: {
  adminButtonClass: string;
  llmRuntimeHealthSnapshot: LlmRuntimeHealthSnapshot | null;
  loadLlmRuntimeHealthSnapshot: () => Promise<unknown>;
}) {
  return (
    <Panel
      subtitle="Primary runtime snapshot for onboarding + agentic LLM operations."
      title="LLM Runtime Health"
    >
      <div className="flex flex-wrap gap-2">
        <button
          className={adminButtonClass}
          onClick={loadLlmRuntimeHealthSnapshot}
          type="button"
        >
          Refresh runtime health
        </button>
      </div>
      {!llmRuntimeHealthSnapshot ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No runtime snapshot loaded yet.
        </p>
      ) : (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>
            onboarding calls: {llmRuntimeHealthSnapshot.onboarding.calls} ·
            fallback:{" "}
            {formatRate(llmRuntimeHealthSnapshot.onboarding.fallbackRate)} ·
            unavailable:{" "}
            {formatRate(llmRuntimeHealthSnapshot.onboarding.unavailableRate)} ·
            p95: {formatMs(llmRuntimeHealthSnapshot.onboarding.p95LatencyMs)}
          </p>
          <p>
            openai calls: {llmRuntimeHealthSnapshot.openai.calls} · error:{" "}
            {formatRate(llmRuntimeHealthSnapshot.openai.errorRate)} · avg
            latency: {formatMs(llmRuntimeHealthSnapshot.openai.avgLatencyMs)}
          </p>
          <p>
            circuits open:{" "}
            {llmRuntimeHealthSnapshot.budget.anyCircuitOpen
              ? `${llmRuntimeHealthSnapshot.budget.openCircuitCount}/${llmRuntimeHealthSnapshot.budget.clientCount}`
              : "0"}
          </p>
        </div>
      )}
    </Panel>
  );
}
