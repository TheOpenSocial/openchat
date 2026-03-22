import { Panel } from "@/app/components/Panel";

import type {
  ModerationFlagRow,
  ModerationSettingsSnapshot,
  ModerationSummarySnapshot,
} from "./moderation-shared";

export function ModerationSummaryPanel({
  adminButtonClass,
  adminButtonGhostClass,
  loadModerationSettings,
  loadModerationSummary,
  moderationSettingsSnapshot,
  moderationSummarySnapshot,
  primeTriageFromFlag,
}: {
  adminButtonClass: string;
  adminButtonGhostClass: string;
  loadModerationSettings: () => Promise<unknown>;
  loadModerationSummary: () => Promise<unknown>;
  moderationSettingsSnapshot: ModerationSettingsSnapshot | null;
  moderationSummarySnapshot: ModerationSummarySnapshot | null;
  primeTriageFromFlag: (flag: ModerationFlagRow) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <Panel
        subtitle="Backlog, enforcement, and recent safety activity."
        title="Moderation Command Center"
      >
        <div className="flex flex-wrap gap-2">
          <button
            className={adminButtonClass}
            onClick={() => void loadModerationSummary()}
            type="button"
          >
            Refresh summary
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={() => void loadModerationSettings()}
            type="button"
          >
            Refresh settings
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            {
              label: "Open flags",
              value: moderationSummarySnapshot?.queue.openFlags ?? "—",
            },
            {
              label: "Agent risk open",
              value: moderationSummarySnapshot?.queue.agentRiskOpenFlags ?? "—",
            },
            {
              label: "Open reports",
              value: moderationSummarySnapshot?.queue.reportsOpen ?? "—",
            },
            {
              label: "Reports (24h)",
              value: moderationSummarySnapshot?.actions24h.reports24h ?? "—",
            },
            {
              label: "Blocked profiles",
              value:
                moderationSummarySnapshot?.enforcement.blockedProfiles ?? "—",
            },
            {
              label: "Suspended users",
              value:
                moderationSummarySnapshot?.enforcement.suspendedUsers ?? "—",
            },
          ].map((item) => (
            <div
              className="rounded-lg border border-border bg-muted/40 p-4"
              key={item.label}
            >
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
                {item.value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Avg assign mins",
              value:
                moderationSummarySnapshot?.analytics
                  .avgTimeToAssignmentMinutes ?? "—",
            },
            {
              label: "Avg decision mins",
              value:
                moderationSummarySnapshot?.analytics.avgTimeToDecisionMinutes ??
                "—",
            },
            {
              label: "Dismissal rate",
              value:
                moderationSummarySnapshot?.analytics.dismissalRate24h ?? "—",
            },
            {
              label: "Repeat offenders (24h)",
              value:
                moderationSummarySnapshot?.analytics.repeatOffenders24h ?? "—",
            },
          ].map((item) => (
            <div
              className="rounded-lg border border-border bg-muted/40 p-4"
              key={item.label}
            >
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                {item.value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Recent flags
            </p>
            <div className="mt-3 space-y-2">
              {(moderationSummarySnapshot?.recent.flags ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recent flags loaded yet.
                </p>
              ) : (
                moderationSummarySnapshot?.recent.flags.map((flag) => (
                  <button
                    className="w-full rounded-lg border border-border bg-muted px-3 py-3 text-left text-sm text-foreground transition hover:border-muted-foreground/40"
                    key={flag.id}
                    onClick={() => primeTriageFromFlag(flag)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">
                        {flag.entityType}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {flag.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {flag.reason}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Recent reports
            </p>
            <div className="mt-3 space-y-2">
              {(moderationSummarySnapshot?.recent.reports ?? []).length ===
              0 ? (
                <p className="text-sm text-muted-foreground">
                  No recent reports loaded yet.
                </p>
              ) : (
                moderationSummarySnapshot?.recent.reports.map((report) => (
                  <div
                    className="rounded-lg border border-border bg-muted px-3 py-3"
                    key={report.id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">
                        {report.reason}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {report.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      reporter {report.reporterUserId}
                      {report.targetUserId
                        ? ` -> target ${report.targetUserId}`
                        : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Top reasons
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(moderationSummarySnapshot?.analytics.topReasons ?? []).map(
              (item) => (
                <span
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                  key={`${item.reason}-${item.count}`}
                >
                  {item.reason} ({item.count})
                </span>
              ),
            )}
          </div>
        </div>
      </Panel>

      <Panel
        subtitle="Configured provider, switches, and alert thresholds."
        title="Policy Settings"
      >
        <div className="space-y-4 text-sm text-foreground">
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Provider
            </p>
            <p className="mt-2 text-xl font-semibold text-foreground">
              {moderationSettingsSnapshot?.provider ?? "Not loaded"}
            </p>
            <div className="mt-3 grid gap-2">
              {[
                [
                  "Provider key configured",
                  moderationSettingsSnapshot?.keys.moderationProviderConfigured,
                ],
                [
                  "OpenAI configured",
                  moderationSettingsSnapshot?.keys.openaiConfigured,
                ],
                [
                  "Custom provider configured",
                  moderationSettingsSnapshot?.keys.customProviderConfigured,
                ],
              ].map(([label, enabled]) => (
                <div
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
                  key={String(label)}
                >
                  <span>{label}</span>
                  <span
                    className={
                      enabled ? "text-foreground" : "text-muted-foreground"
                    }
                  >
                    {enabled ? "yes" : "no"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Toggles
            </p>
            <div className="mt-3 grid gap-2">
              {Object.entries(moderationSettingsSnapshot?.toggles ?? {}).map(
                ([label, enabled]) => (
                  <div
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
                    key={label}
                  >
                    <span>{label}</span>
                    <span
                      className={
                        enabled ? "text-foreground" : "text-muted-foreground"
                      }
                    >
                      {enabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Thresholds
            </p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                <span>Moderation backlog alert</span>
                <span>
                  {moderationSettingsSnapshot?.thresholds
                    .moderationBacklogAlert ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                <span>DB latency alert</span>
                <span>
                  {moderationSettingsSnapshot?.thresholds.dbLatencyAlertMs ??
                    "—"}{" "}
                  ms
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                <span>OpenAI error-rate alert</span>
                <span>
                  {moderationSettingsSnapshot?.thresholds
                    .openAiErrorRateAlert ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
