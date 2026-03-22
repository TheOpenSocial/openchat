import { JsonView } from "@/app/components/JsonView";
import { Panel } from "@/app/components/Panel";

export function UserInspectorTab({
  adminButtonClass,
  adminButtonDangerClass,
  adminButtonGhostClass,
  adminInputClass,
  adminLabelClass,
  continuityIntentExplainSnapshot,
  deactivateReason,
  discoveryInboxSnapshot,
  discoveryPassiveSnapshot,
  inboxSnapshot,
  interestSnapshot,
  pendingIntentSummarySnapshot,
  photoSnapshot,
  profileSnapshot,
  recurringCircleSessionSnapshot,
  recurringCircleSnapshot,
  restrictReason,
  ruleSnapshot,
  savedSearchSnapshot,
  scheduledTaskRunsSnapshot,
  scheduledTaskSnapshot,
  searchQuery,
  searchSnapshot,
  sessionSnapshot,
  revokeSessionId,
  topicSnapshot,
  trustSnapshot,
  availabilitySnapshot,
  userId,
  deactivateUser,
  inspectUser,
  revokeAllSessions,
  revokeSession,
  runSearch,
  sendDigest,
  restrictUser,
  setDeactivateReason,
  setRestrictReason,
  setRevokeSessionId,
  setSearchQuery,
  setUserId,
  summarizePendingIntents,
}: {
  adminButtonClass: string;
  adminButtonDangerClass: string;
  adminButtonGhostClass: string;
  adminInputClass: string;
  adminLabelClass: string;
  continuityIntentExplainSnapshot: unknown;
  deactivateReason: string;
  discoveryInboxSnapshot: unknown;
  discoveryPassiveSnapshot: unknown;
  inboxSnapshot: unknown;
  interestSnapshot: unknown;
  pendingIntentSummarySnapshot: unknown;
  photoSnapshot: unknown;
  profileSnapshot: unknown;
  recurringCircleSessionSnapshot: unknown;
  recurringCircleSnapshot: unknown;
  restrictReason: string;
  ruleSnapshot: unknown;
  savedSearchSnapshot: unknown;
  scheduledTaskRunsSnapshot: unknown;
  scheduledTaskSnapshot: unknown;
  searchQuery: string;
  searchSnapshot: unknown;
  sessionSnapshot: unknown;
  revokeSessionId: string;
  topicSnapshot: unknown;
  trustSnapshot: unknown;
  availabilitySnapshot: unknown;
  userId: string;
  deactivateUser: () => Promise<unknown>;
  inspectUser: () => Promise<unknown>;
  revokeAllSessions: () => Promise<unknown>;
  revokeSession: () => Promise<unknown>;
  runSearch: () => Promise<unknown>;
  sendDigest: () => Promise<unknown>;
  restrictUser: () => Promise<unknown>;
  setDeactivateReason: (value: string) => void;
  setRestrictReason: (value: string) => void;
  setRevokeSessionId: (value: string) => void;
  setSearchQuery: (value: string) => void;
  setUserId: (value: string) => void;
  summarizePendingIntents: () => Promise<unknown>;
}) {
  return (
    <section className="mt-4 space-y-4">
      <Panel
        subtitle="Inspect profile, trust, rules, sessions, and inbox from one action."
        title="User Inspector"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className={adminLabelClass}>
            user id
            <input
              className={adminInputClass}
              onChange={(event) => setUserId(event.currentTarget.value)}
              value={userId}
            />
          </label>
          <label className={adminLabelClass}>
            revoke session id
            <input
              className={adminInputClass}
              onChange={(event) =>
                setRevokeSessionId(event.currentTarget.value)
              }
              placeholder="session uuid"
              value={revokeSessionId}
            />
          </label>
          <label className={adminLabelClass}>
            search query
            <input
              className={adminInputClass}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder="tennis"
              value={searchQuery}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={adminButtonClass}
            onClick={inspectUser}
            type="button"
          >
            Inspect user
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={sendDigest}
            type="button"
          >
            Send digest
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={summarizePendingIntents}
            type="button"
          >
            Summarize pending intents
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={runSearch}
            type="button"
          >
            Run search
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={revokeSession}
            type="button"
          >
            Revoke one session
          </button>
          <button
            className={adminButtonDangerClass}
            onClick={revokeAllSessions}
            type="button"
          >
            Revoke all sessions
          </button>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <label className={adminLabelClass}>
            deactivate reason
            <input
              className={adminInputClass}
              onChange={(event) =>
                setDeactivateReason(event.currentTarget.value)
              }
              value={deactivateReason}
            />
          </label>
          <label className={adminLabelClass}>
            restrict reason
            <input
              className={adminInputClass}
              onChange={(event) => setRestrictReason(event.currentTarget.value)}
              value={restrictReason}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={adminButtonDangerClass}
            onClick={deactivateUser}
            type="button"
          >
            Deactivate account
          </button>
          <button
            className={adminButtonDangerClass}
            onClick={restrictUser}
            type="button"
          >
            Restrict / shadow-ban
          </button>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Profile">
          <JsonView
            emptyLabel="No profile data loaded."
            value={profileSnapshot}
          />
        </Panel>
        <Panel title="Trust">
          <JsonView emptyLabel="No trust data loaded." value={trustSnapshot} />
        </Panel>
        <Panel title="Global Rules">
          <JsonView emptyLabel="No rules loaded." value={ruleSnapshot} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Interests">
          <JsonView value={interestSnapshot} />
        </Panel>
        <Panel title="Topics">
          <JsonView value={topicSnapshot} />
        </Panel>
        <Panel title="Availability">
          <JsonView value={availabilitySnapshot} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Photos">
          <JsonView value={photoSnapshot} />
        </Panel>
        <Panel title="Sessions">
          <JsonView value={sessionSnapshot} />
        </Panel>
        <Panel title="Inbox Requests">
          <JsonView value={inboxSnapshot} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recurring Circles">
          <JsonView value={recurringCircleSnapshot} />
        </Panel>
        <Panel title="Circle Sessions (first circle)">
          <JsonView value={recurringCircleSessionSnapshot} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Saved Searches">
          <JsonView value={savedSearchSnapshot} />
        </Panel>
        <Panel title="Scheduled Tasks">
          <JsonView value={scheduledTaskSnapshot} />
        </Panel>
        <Panel title="Scheduled Task Runs (first task)">
          <JsonView value={scheduledTaskRunsSnapshot} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Passive Discovery">
          <JsonView value={discoveryPassiveSnapshot} />
        </Panel>
        <Panel title="Inbox Suggestions">
          <JsonView value={discoveryInboxSnapshot} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Pending Intent Summary">
          <JsonView value={pendingIntentSummarySnapshot} />
        </Panel>
        <Panel title="User Routing Explanation (first pending intent)">
          <JsonView value={continuityIntentExplainSnapshot} />
        </Panel>
      </div>

      <div className="grid gap-4">
        <Panel title="Search Snapshot">
          <JsonView value={searchSnapshot} />
        </Panel>
      </div>
    </section>
  );
}
