import type {
  OnboardingActivationBootstrapResponse,
  OnboardingActivationPlanResponse,
} from "../../../lib/api";

type ActivationPlanSnapshot = {
  stateLabel: string;
  sourceLabel: string;
  summary: string;
  actionLabel: string;
  actionText: string;
};

export interface ActivationBootstrapViewModel {
  activationStateLabel: string;
  discoverySummary: string;
  executionStateLabel: string;
  onboardingStateLabel: string;
  primaryThreadLabel: string;
  planSnapshot: ActivationPlanSnapshot | null;
  recommendedActionLabel: string;
  recommendedActionText: string;
  summary: string;
}

function titleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function labelForActivationState(
  state: OnboardingActivationPlanResponse["state"],
) {
  switch (state) {
    case "idle":
      return "Idle";
    case "pending":
      return "Pending";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
  }
}

function labelForExecutionState(
  state: OnboardingActivationBootstrapResponse["execution"]["status"],
) {
  switch (state) {
    case "idle":
      return "Idle";
    case "processing":
      return "Processing";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

export function buildActivationBootstrapViewModel(input: {
  bootstrap: OnboardingActivationBootstrapResponse | null;
  plan: OnboardingActivationPlanResponse | null;
}): ActivationBootstrapViewModel | null {
  if (!input.bootstrap) {
    return null;
  }

  const bootstrap = input.bootstrap;
  const activation = bootstrap.activation;

  return {
    activationStateLabel: labelForActivationState(activation.state),
    discoverySummary: `${bootstrap.discovery.tonightCount} tonight · ${bootstrap.discovery.reconnectCount} reconnects · ${bootstrap.discovery.groupCount} groups · ${bootstrap.discovery.activeIntentCount} active intents`,
    executionStateLabel: labelForExecutionState(bootstrap.execution.status),
    onboardingStateLabel: titleCase(bootstrap.onboardingState),
    primaryThreadLabel: bootstrap.primaryThread
      ? `Primary thread: ${bootstrap.primaryThread.title ?? "Untitled"}`
      : "No primary thread yet",
    planSnapshot: input.plan
      ? {
          actionLabel: input.plan.recommendedAction.label,
          actionText: input.plan.recommendedAction.text,
          sourceLabel: titleCase(input.plan.source),
          stateLabel: labelForActivationState(input.plan.state),
          summary: input.plan.summary,
        }
      : null,
    recommendedActionLabel: activation.recommendedAction.label,
    recommendedActionText: activation.recommendedAction.text,
    summary: activation.summary,
  };
}
