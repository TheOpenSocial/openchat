import { describe, expect, it } from "vitest";

import type { PendingIntentsSummaryResponse } from "../lib/api";
import { deriveThreadRuntimeModel } from "./thread-types";

const USER_ID = "user-1";

function pendingSummary(
  overrides?: Partial<PendingIntentsSummaryResponse>,
): PendingIntentsSummaryResponse {
  return {
    userId: USER_ID,
    activeIntentCount: 1,
    summaryText: "",
    intents: [
      {
        intentId: "intent-1",
        rawText: "Find people tonight",
        status: "matching",
        ageMinutes: 2,
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

describe("deriveThreadRuntimeModel", () => {
  it("returns idle/empty when user has not sent a message", () => {
    const model = deriveThreadRuntimeModel(
      [{ id: "a1", role: "agent", body: "What do you want to do?" }],
      null,
      false,
      false,
    );

    expect(model.phase).toBe("empty");
    expect(model.state).toBe("idle");
    expect(model.contextLabel).toBeNull();
  });

  it("prioritizes sending state over pending summary signals", () => {
    const model = deriveThreadRuntimeModel(
      [{ id: "u1", role: "user", body: "I want to play Apex tonight" }],
      pendingSummary(),
      true,
      false,
    );

    expect(model.state).toBe("sending");
    expect(model.contextLabel).toBe("Sending");
    expect(model.thinkingLabel).toBe("Thinking…");
  });

  it("maps accepted >= 2 to ready state", () => {
    const model = deriveThreadRuntimeModel(
      [{ id: "u1", role: "user", body: "Find startup people" }],
      pendingSummary({
        intents: [
          {
            intentId: "intent-1",
            rawText: "Find startup people",
            status: "matching",
            ageMinutes: 4,
            requests: {
              pending: 0,
              accepted: 2,
              rejected: 0,
              expired: 0,
              cancelled: 0,
            },
          },
        ],
      }),
      false,
      false,
    );

    expect(model.phase).toBe("ready");
    expect(model.state).toBe("ready");
    expect(model.contextLabel).toBe("Ready");
    expect(model.thinkingLabel).toBeNull();
  });

  it("maps no accepted + no pending + no active intents to no_match", () => {
    const model = deriveThreadRuntimeModel(
      [{ id: "u1", role: "user", body: "Meet someone new" }],
      pendingSummary({
        activeIntentCount: 0,
        intents: [
          {
            intentId: "intent-1",
            rawText: "Meet someone new",
            status: "complete",
            ageMinutes: 15,
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
      false,
      false,
    );

    expect(model.phase).toBe("no_match");
    expect(model.state).toBe("no_match");
    expect(model.contextLabel).toBe("No match yet");
  });
});
