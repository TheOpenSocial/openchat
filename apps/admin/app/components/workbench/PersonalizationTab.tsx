import { JsonView } from "@/app/components/JsonView";
import { Panel } from "@/app/components/Panel";

type PolicyFlagsState = {
  safetyAllowed: boolean;
  hardRuleAllowed: boolean;
  productPolicyAllowed: boolean;
  overrideAllowed: boolean;
  learnedPreferenceAllowed: boolean;
  rankingAllowed: boolean;
};

export function PersonalizationTab({
  adminButtonClass,
  adminButtonGhostClass,
  adminInputClass,
  adminLabelClass,
  lifeGraphSnapshot,
  memoryResetSnapshot,
  policyContextInput,
  policyExplainSnapshot,
  policyFlags,
  userId,
  explainPolicy,
  inspectLifeGraph,
  resetLearnedMemory,
  setPolicyContextInput,
  setPolicyFlags,
  setUserId,
}: {
  adminButtonClass: string;
  adminButtonGhostClass: string;
  adminInputClass: string;
  adminLabelClass: string;
  lifeGraphSnapshot: unknown;
  memoryResetSnapshot: unknown;
  policyContextInput: string;
  policyExplainSnapshot: unknown;
  policyFlags: PolicyFlagsState;
  userId: string;
  explainPolicy: () => Promise<unknown>;
  inspectLifeGraph: () => Promise<unknown>;
  resetLearnedMemory: () => Promise<unknown>;
  setPolicyContextInput: (value: string) => void;
  setPolicyFlags: (
    updater: (current: PolicyFlagsState) => PolicyFlagsState,
  ) => void;
  setUserId: (value: string) => void;
}) {
  return (
    <section className="mt-4 space-y-4">
      <Panel
        subtitle="Inspect profile graph and explain evaluation gates in order."
        title="Personalization Inspector"
      >
        <label className={adminLabelClass}>
          user id
          <input
            className={adminInputClass}
            onChange={(event) => setUserId(event.currentTarget.value)}
            value={userId}
          />
        </label>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(policyFlags).map(([flag, enabled]) => (
            <label
              className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground"
              key={flag}
            >
              <input
                checked={enabled}
                onChange={(event) =>
                  setPolicyFlags((current) => ({
                    ...current,
                    [flag]: event.currentTarget.checked,
                  }))
                }
                type="checkbox"
              />
              {flag}
            </label>
          ))}
        </div>

        <label className={`${adminLabelClass} mt-3`}>
          policy context (json object)
          <textarea
            className={`${adminInputClass} min-h-24`}
            onChange={(event) =>
              setPolicyContextInput(event.currentTarget.value)
            }
            value={policyContextInput}
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={adminButtonClass}
            onClick={inspectLifeGraph}
            type="button"
          >
            Inspect life graph
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={explainPolicy}
            type="button"
          >
            Explain policy
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={resetLearnedMemory}
            type="button"
          >
            Reset learned memory
          </button>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Life Graph Snapshot">
          <JsonView value={lifeGraphSnapshot} />
        </Panel>
        <Panel title="Policy Explanation">
          <JsonView value={policyExplainSnapshot} />
        </Panel>
        <Panel title="Memory Reset Result">
          <JsonView value={memoryResetSnapshot} />
        </Panel>
      </div>
    </section>
  );
}
