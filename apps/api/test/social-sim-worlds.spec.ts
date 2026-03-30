import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const fixturePath = resolve(
  process.cwd(),
  "test/fixtures/social-sim-worlds.json",
);

const horizons = new Set(["short", "medium", "long"]);
const actorKinds = new Set([
  "individual",
  "pair",
  "group_seed",
  "circle_seed",
  "event_seed",
]);
const interactionKinds = new Set([
  "individual",
  "pair",
  "group",
  "circle",
  "event",
]);
const pathKinds = new Set([
  "success",
  "stagnation",
  "mismatch",
  "recovery",
  "moderationTrust",
]);
const convergenceKinds = new Set(["converged", "partial", "failed"]);
const matchKinds = new Set(["good", "weak", "bad"]);
const conversationKinds = new Set(["alive", "stalled", "awkward", "unsafe"]);
const memoryKinds = new Set([
  "memory_helpful",
  "memory_neutral",
  "memory_harmful",
]);

function loadFixture() {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as {
    version: number;
    worlds: Array<{
      id: string;
      horizon: string;
      title: string;
      simulationBrief: string;
      actors: Array<{ kind: string; actorId: string }>;
      entities: {
        pairs: unknown[];
        groups: unknown[];
        circles: unknown[];
        events: unknown[];
      };
      scenarios: Array<{
        id: string;
        pathKind: string;
        interactionKind: string;
        expectedOutcome: {
          convergence: string;
          matchQuality: string;
          conversationQuality: string;
          memoryOutcome: string;
        };
      }>;
      coverage: Record<string, string>;
    }>;
  };
}

describe("social-sim world fixture", () => {
  it("captures the full social graph and all lane horizons", () => {
    const fixture = loadFixture();

    expect(fixture.version).toBe(1);
    expect(fixture.worlds).toHaveLength(3);

    const seenHorizons = new Set<string>();
    const seenActorKinds = new Set<string>();
    const seenInteractionKinds = new Set<string>();
    const seenPathKinds = new Set<string>();
    const seenWorldIds = new Set<string>();
    const seenScenarioIds = new Set<string>();

    for (const world of fixture.worlds) {
      expect(seenWorldIds.has(world.id)).toBe(false);
      seenWorldIds.add(world.id);

      seenHorizons.add(world.horizon);
      expect(world.title).toMatch(/\S/);
      expect(world.simulationBrief).toMatch(/\S/);

      expect(world.actors.length).toBeGreaterThanOrEqual(4);
      expect(world.entities.pairs.length).toBeGreaterThan(0);
      expect(world.entities.groups.length).toBeGreaterThan(0);
      expect(world.entities.circles.length).toBeGreaterThan(0);
      expect(world.entities.events.length).toBeGreaterThan(0);

      expect(Object.keys(world.coverage).sort()).toEqual([
        "mismatch",
        "moderationTrust",
        "recovery",
        "stagnation",
        "success",
      ]);

      const scenarioIds = new Set(
        world.scenarios.map((scenario) => scenario.id),
      );
      expect(scenarioIds.size).toBe(world.scenarios.length);

      for (const actor of world.actors) {
        seenActorKinds.add(actor.kind);
        expect(actor.actorId).toMatch(/^sim-/);
      }

      for (const scenario of world.scenarios) {
        expect(seenScenarioIds.has(scenario.id)).toBe(false);
        seenScenarioIds.add(scenario.id);

        seenInteractionKinds.add(scenario.interactionKind);
        seenPathKinds.add(scenario.pathKind);
        expect(scenario.expectedOutcome.convergence).toBeDefined();
        expect(scenario.expectedOutcome.matchQuality).toBeDefined();
        expect(scenario.expectedOutcome.conversationQuality).toBeDefined();
        expect(scenario.expectedOutcome.memoryOutcome).toBeDefined();

        expect(convergenceKinds.has(scenario.expectedOutcome.convergence)).toBe(
          true,
        );
        expect(matchKinds.has(scenario.expectedOutcome.matchQuality)).toBe(
          true,
        );
        expect(
          conversationKinds.has(scenario.expectedOutcome.conversationQuality),
        ).toBe(true);
        expect(memoryKinds.has(scenario.expectedOutcome.memoryOutcome)).toBe(
          true,
        );

        expect(world.coverage[scenario.pathKind]).toBe(scenario.id);
      }
    }

    expect(seenHorizons).toEqual(horizons);
    expect(seenActorKinds).toEqual(actorKinds);
    expect(seenInteractionKinds).toEqual(interactionKinds);
    expect(seenPathKinds).toEqual(pathKinds);
    expect(seenScenarioIds.size).toBe(15);
  });
});
