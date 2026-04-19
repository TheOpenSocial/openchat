import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  api,
  type OnboardingActivationBootstrapResponse,
  type OnboardingActivationPlanResponse,
} from "../../../lib/api";
import { mobileQueryKeys } from "../../../lib/query-client";
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
  const bootstrapQuery = useQuery({
    enabled: Boolean(accessToken && userId),
    queryFn: () =>
      api.createOnboardingActivationBootstrap(
        userId,
        { limit: 3 },
        accessToken,
      ),
    queryKey: mobileQueryKeys.activationBootstrap(userId),
  });

  const planQuery = useQuery({
    enabled: Boolean(accessToken && userId),
    queryFn: () => api.createOnboardingActivationPlan(userId, {}, accessToken),
    queryKey: mobileQueryKeys.activationPlan(userId),
  });

  const refreshBootstrap = useCallback(async () => {
    await bootstrapQuery.refetch();
  }, [bootstrapQuery]);

  const refreshPlan = useCallback(async () => {
    await planQuery.refetch();
  }, [planQuery]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshBootstrap(), refreshPlan()]);
  }, [refreshBootstrap, refreshPlan]);

  const viewModel = useMemo<ActivationBootstrapViewModel | null>(
    () =>
      buildActivationBootstrapViewModel({
        bootstrap:
          (bootstrapQuery.data as OnboardingActivationBootstrapResponse | null) ??
          null,
        plan:
          (planQuery.data as OnboardingActivationPlanResponse | null) ?? null,
      }),
    [bootstrapQuery.data, planQuery.data],
  );

  return {
    error:
      (bootstrapQuery.error instanceof Error && bootstrapQuery.error.message) ||
      (planQuery.error instanceof Error && planQuery.error.message) ||
      null,
    loading:
      (bootstrapQuery.isLoading && !bootstrapQuery.data) ||
      (planQuery.isLoading && !planQuery.data),
    refreshAll,
    refreshBootstrap,
    refreshPlan,
    refreshingBootstrap: bootstrapQuery.isRefetching,
    refreshingPlan: planQuery.isRefetching,
    viewModel,
  };
}
