import { describe, expect, it } from "vitest";

import type { PendingIntentsSummaryResponse } from "../../../lib/api";
import type { AgentTimelineMessage } from "../../../types";
import { deriveHomeRuntimeViewModel } from "./runtime-model";

const USER_MESSAGE: AgentTimelineMessage = {
  id: "u1",
  role: "user",
  body: "Find people for tonight",
};

function pendingSummary(
  overrides?: Partial<PendingIntentsSummaryResponse>,
): PendingIntentsSummaryResponse {
  return {
    userId: "user-1",
    activeIntentCount: 1,
    summaryText: "",
    intents: [
      {
        intentId: "intent-1",
        rawText: "Find people for tonight",
        status: "matching",
        ageMinutes: 1,
        requests: {
          pending: 1,
          accepted: 0,
          rejected: 0,
          expired: 0,
          cancelled: 0,
        },
      },
    ],
    ...overrides,
  };
}

describe("deriveHomeRuntimeViewModel", () => {
  it("computes canSend from draft + sending state", () => {
    const model = deriveHomeRuntimeViewModel({
      messages: [USER_MESSAGE],
      pending: pendingSummary(),
      sending: false,
      threadLoading: false,
      hasDraft: true,
    });

    expect(model.canSend).toBe(true);
  });

  it("disables canSend while sending", () => {
    const model = deriveHomeRuntimeViewModel({
      messages: [USER_MESSAGE],
      pending: pendingSummary(),
      sending: true,
      threadLoading: false,
      hasDraft: true,
    });

    expect(model.state).toBe("sending");
    expect(model.canSend).toBe(false);
  });

  it("promotes state to error when hasError is true", () => {
    const model = deriveHomeRuntimeViewModel({
      messages: [USER_MESSAGE],
      pending: pendingSummary(),
      sending: false,
      threadLoading: false,
      hasDraft: false,
      hasError: true,
    });

    expect(model.state).toBe("error");
    expect(model.canRetry).toBe(true);
  });

  it("exposes retry for no_match state", () => {
    const model = deriveHomeRuntimeViewModel({
      messages: [USER_MESSAGE],
      pending: pendingSummary({
        activeIntentCount: 0,
        intents: [
          {
            intentId: "intent-1",
            rawText: "Find people for tonight",
            status: "complete",
            ageMinutes: 12,
            requests: {
              pending: 0,
              accepted: 0,
              rejected: 0,
              expired: 0,
              cancelled: 0,
            },
          },
        ],
      }),
      sending: false,
      threadLoading: false,
      hasDraft: false,
    });

    expect(model.state).toBe("no_match");
    expect(model.canRetry).toBe(true);
  });
});
