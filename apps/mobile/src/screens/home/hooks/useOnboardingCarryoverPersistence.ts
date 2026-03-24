import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, type MutableRefObject } from "react";

const ONBOARDING_CARRYOVER_STORAGE_KEY_PREFIX =
  "opensocial.mobile.onboarding.carryover.v1";

function onboardingCarryoverStorageKey(userId: string) {
  return `${ONBOARDING_CARRYOVER_STORAGE_KEY_PREFIX}.${userId}`;
}

type CarryoverState = "processing" | "queued" | "ready" | null;

type BannerInput = {
  tone: "error" | "info" | "success";
  text: string;
};

type UseOnboardingCarryoverPersistenceInput = {
  designMock: boolean;
  enableE2ELocalMode: boolean;
  initialAgentMessage: string | null;
  onboardingCarryoverIdempotencyKey: string | null;
  onboardingCarryoverSeed: string;
  onboardingCarryoverState: CarryoverState;
  onboardingSeedHandledRef: MutableRefObject<boolean>;
  setBanner: (input: BannerInput | null) => void;
  setOnboardingCarryoverIdempotencyKey: (value: string | null) => void;
  setOnboardingCarryoverSeed: (value: string) => void;
  setOnboardingCarryoverState: (value: CarryoverState) => void;
  userId: string;
};

export function useOnboardingCarryoverPersistence({
  designMock,
  enableE2ELocalMode,
  initialAgentMessage,
  onboardingCarryoverIdempotencyKey,
  onboardingCarryoverSeed,
  onboardingCarryoverState,
  onboardingSeedHandledRef,
  setBanner,
  setOnboardingCarryoverIdempotencyKey,
  setOnboardingCarryoverSeed,
  setOnboardingCarryoverState,
  userId,
}: UseOnboardingCarryoverPersistenceInput) {
  useEffect(() => {
    if (designMock || enableE2ELocalMode) {
      return;
    }
    if (initialAgentMessage?.trim()) {
      return;
    }
    let mounted = true;
    AsyncStorage.getItem(onboardingCarryoverStorageKey(userId))
      .then((raw) => {
        if (!mounted || !raw || onboardingSeedHandledRef.current) {
          return;
        }
        try {
          const parsed = JSON.parse(raw) as {
            seed?: string;
            state?: "processing" | "queued" | "ready";
            idempotencyKey?: string;
          };
          const seed = parsed.seed?.trim();
          const idempotencyKey = parsed.idempotencyKey?.trim();
          if (!seed || !idempotencyKey) {
            return;
          }
          onboardingSeedHandledRef.current = true;
          setOnboardingCarryoverSeed(seed);
          setOnboardingCarryoverIdempotencyKey(idempotencyKey);
          if (parsed.state === "queued") {
            setOnboardingCarryoverState("queued");
            return;
          }
          setOnboardingCarryoverState("ready");
          if (parsed.state === "processing") {
            setBanner({
              tone: "info",
              text: "We restored your first activation step. Tap to resume.",
            });
          }
        } catch {
          // Ignore malformed persisted carryover payloads.
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [designMock, enableE2ELocalMode, initialAgentMessage, userId]);

  useEffect(() => {
    const seed = onboardingCarryoverSeed.trim();
    const idempotencyKey = onboardingCarryoverIdempotencyKey?.trim();
    if (!seed || !onboardingCarryoverState || !idempotencyKey) {
      AsyncStorage.removeItem(onboardingCarryoverStorageKey(userId)).catch(
        () => {},
      );
      return;
    }
    const persistedState =
      onboardingCarryoverState === "processing"
        ? "ready"
        : onboardingCarryoverState;
    AsyncStorage.setItem(
      onboardingCarryoverStorageKey(userId),
      JSON.stringify({
        seed,
        state: persistedState,
        idempotencyKey,
        updatedAt: new Date().toISOString(),
      }),
    ).catch(() => {});
  }, [
    onboardingCarryoverIdempotencyKey,
    onboardingCarryoverSeed,
    onboardingCarryoverState,
    userId,
  ]);
}
