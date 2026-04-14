import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = resolve(
  process.cwd(),
  "apps/api/test/fixtures/social-sim-worlds.json",
);

const expectedScenarioFamilies = {
  short: {
    coverage: [
      "success",
      "stagnation",
      "mismatch",
      "recovery",
      "moderationTrust",
    ],
  },
  medium: {
    coverage: [
      "success",
      "stagnation",
      "mismatch",
      "recovery",
      "moderationTrust",
    ],
  },
  long: {
    coverage: [
      "success",
      "stagnation",
      "mismatch",
      "recovery",
      "moderationTrust",
    ],
  },
};

function loadSocialSimFixture() {
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

function summarizeSocialSimWorlds(fixture) {
  const worlds = fixture.worlds.map((world) => ({
    id: world.id,
    horizon: world.horizon,
    scenarioCount: world.scenarios.length,
    actorKinds: new Set(world.actors.map((actor) => actor.kind)),
    pathKinds: new Set(world.scenarios.map((scenario) => scenario.pathKind)),
  }));

  return {
    version: fixture.version,
    worldCount: fixture.worlds.length,
    horizons: new Set(worlds.map((world) => world.horizon)),
    worlds,
  };
}

test("social-sim worlds fixture covers all horizons and lane paths", () => {
  const fixture = loadSocialSimFixture();
  const summary = summarizeSocialSimWorlds(fixture);

  assert.equal(summary.version, 1);
  assert.equal(summary.worldCount, 3);
  assert.deepEqual(Array.from(summary.horizons).sort(), [
    "long",
    "medium",
    "short",
  ]);

  const scenarioIds = new Set();
  const actorKinds = new Set();
  const pathKinds = new Set();

  for (const world of fixture.worlds) {
    const expectations = expectedScenarioFamilies[world.horizon];
    assert.ok(expectations, `unexpected horizon ${world.horizon}`);
    assert.equal(world.scenarios.length, expectations.coverage.length);
    assert.deepEqual(
      Object.keys(world.coverage).sort(),
      expectations.coverage.slice().sort(),
    );

    for (const actor of world.actors) {
      actorKinds.add(actor.kind);
      assert.match(actor.actorId, /^sim-/);
    }

    for (const scenario of world.scenarios) {
      assert.equal(world.coverage[scenario.pathKind], scenario.id);
      assert.equal(
        scenario.id.startsWith(`social-sim-${world.horizon}-`),
        true,
      );
      scenarioIds.add(scenario.id);
      pathKinds.add(scenario.pathKind);
    }
  }

  assert.deepEqual(Array.from(actorKinds).sort(), [
    "circle_seed",
    "event_seed",
    "group_seed",
    "individual",
    "pair",
  ]);
  assert.deepEqual(Array.from(pathKinds).sort(), [
    "mismatch",
    "moderationTrust",
    "recovery",
    "stagnation",
    "success",
  ]);
  assert.equal(scenarioIds.size, 15);
});
