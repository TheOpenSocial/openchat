import { describe, expect, it } from "vitest";
import {
  getOpsRuntimeMetricsSnapshot,
  recordModerationDecisionMetric,
  resetOpsRuntimeMetrics,
} from "../src/common/ops-metrics.js";

describe("ops-metrics moderation runtime", () => {
  it("resets moderation counters", () => {
    resetOpsRuntimeMetrics();
    recordModerationDecisionMetric({ riskLevel: "review", source: "openai" });
    recordModerationDecisionMetric({ riskLevel: "block", source: "human" });

    const beforeReset = getOpsRuntimeMetricsSnapshot();
    expect(beforeReset.moderation.total).toBe(2);
    expect(beforeReset.moderation.byRiskLevel.review).toBe(1);
    expect(beforeReset.moderation.bySource.human).toBe(1);

    resetOpsRuntimeMetrics();
    const afterReset = getOpsRuntimeMetricsSnapshot();
    expect(afterReset.moderation.total).toBe(0);
    expect(afterReset.moderation.byRiskLevel.review).toBe(0);
    expect(afterReset.moderation.byRiskLevel.block).toBe(0);
    expect(afterReset.moderation.bySource.openai).toBe(0);
    expect(afterReset.moderation.bySource.human).toBe(0);
  });
});
