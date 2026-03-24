import { useEffect, type MutableRefObject } from "react";

type CarryoverState = "processing" | "queued" | "ready" | null;

type UseOnboardingCarryoverSeedInput = {
  buildIdempotencyKey: (userId: string, seed: string) => string;
  initialAgentMessage: string | null;
  onInitialAgentMessageConsumed?: () => void;
  onboardingSeedHandledRef: MutableRefObject<boolean>;
  setOnboardingCarryoverIdempotencyKey: (value: string | null) => void;
  setOnboardingCarryoverSeed: (value: string) => void;
  setOnboardingCarryoverState: (value: CarryoverState) => void;
  userId: string;
};

export function useOnboardingCarryoverSeed({
  buildIdempotencyKey,
  initialAgentMessage,
  onInitialAgentMessageConsumed,
  onboardingSeedHandledRef,
  setOnboardingCarryoverIdempotencyKey,
  setOnboardingCarryoverSeed,
  setOnboardingCarryoverState,
  userId,
}: UseOnboardingCarryoverSeedInput) {
  useEffect(() => {
    const seed = initialAgentMessage?.trim();
    if (!seed || !onInitialAgentMessageConsumed) {
      return;
    }
    if (onboardingSeedHandledRef.current) {
      return;
    }
    onboardingSeedHandledRef.current = true;
    setOnboardingCarryoverSeed(seed);
    setOnboardingCarryoverIdempotencyKey(buildIdempotencyKey(userId, seed));
    setOnboardingCarryoverState("ready");
  }, [
    buildIdempotencyKey,
    initialAgentMessage,
    onInitialAgentMessageConsumed,
    onboardingSeedHandledRef,
    setOnboardingCarryoverIdempotencyKey,
    setOnboardingCarryoverSeed,
    setOnboardingCarryoverState,
    userId,
  ]);
}
