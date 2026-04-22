import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  type OnboardingActivationBootstrapResponse,
  type OnboardingActivationPlanResponse,
} from "../../../lib/api";
import {
  buildActivationBootstrapViewModel,
  type ActivationBootstrapViewModel,
} from "../domain/activation-model";

type UseActivationBootstrapArgs = {
  accessToken: string;
  userId: string;
};

export function useActivationBootstrap({
  accessToken,
  userId,
}: UseActivationBootstrapArgs) {
  const [bootstrap, setBootstrap] =
    useState<OnboardingActivationBootstrapResponse | null>(null);
  const [plan, setPlan] = useState<OnboardingActivationPlanResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshingBootstrap, setRefreshingBootstrap] = useState(false);
  const [refreshingPlan, setRefreshingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBootstrap = useCallback(async () => {
    setRefreshingBootstrap(true);
    setError(null);
    try {
      const nextBootstrap = await api.createOnboardingActivationBootstrap(
        userId,
        { limit: 3 },
        accessToken,
      );
      setBootstrap(nextBootstrap);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load activation bootstrap right now.",
      );
    } finally {
      setLoading(false);
      setRefreshingBootstrap(false);
    }
  }, [accessToken, userId]);

  const refreshPlan = useCallback(async () => {
    setRefreshingPlan(true);
    setError(null);
    try {
      const nextPlan = await api.createOnboardingActivationPlan(
        userId,
        {},
        accessToken,
      );
      setPlan(nextPlan);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to refresh activation plan right now.",
      );
    } finally {
      setLoading(false);
      setRefreshingPlan(false);
    }
  }, [accessToken, userId]);

  useEffect(() => {
    void Promise.all([refreshBootstrap(), refreshPlan()]);
  }, [refreshBootstrap, refreshPlan]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshBootstrap(), refreshPlan()]);
  }, [refreshBootstrap, refreshPlan]);

  const viewModel = useMemo<ActivationBootstrapViewModel | null>(
    () => buildActivationBootstrapViewModel({ bootstrap, plan }),
    [bootstrap, plan],
  );

  return {
    error,
    loading,
    refreshAll,
    refreshBootstrap,
    refreshPlan,
    refreshingBootstrap,
    refreshingPlan,
    viewModel,
  };
}
