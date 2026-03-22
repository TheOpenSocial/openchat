"use client";

import { useEffect, useMemo, useState } from "react";

import {
  WorkspaceHeader,
  WorkspaceMutedPanel,
  WorkspacePanel,
} from "@/src/components/layout/workspace";
import { Button } from "@/src/components/ui/button";
import { useAppSession } from "@/src/features/app-shell/app-session";
import {
  api,
  type RecurringCircleRecord,
  type RecurringCircleSessionRecord,
} from "@/src/lib/api";

export function CirclesScreen() {
  const { isDesignMock, profileDraft, session, setBanner } = useAppSession();
  const [circles, setCircles] = useState<RecurringCircleRecord[]>([]);
  const [sessions, setSessions] = useState<RecurringCircleSessionRecord[]>([]);
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedCircle = useMemo(
    () => circles.find((circle) => circle.id === selectedCircleId) ?? null,
    [circles, selectedCircleId],
  );

  useEffect(() => {
    if (!session) {
      return;
    }
    if (isDesignMock) {
      const mockCircle: RecurringCircleRecord = {
        id: "circle_mock_1",
        ownerUserId: session.userId,
        title: "Weekly design dinner",
        description:
          "A recurring small group for product and design conversation.",
        status: "active",
        visibility: "invite_only",
        nextSessionAt: new Date(
          Date.now() + 2 * 24 * 60 * 60_000,
        ).toISOString(),
      };
      setCircles([mockCircle]);
      setSelectedCircleId(mockCircle.id);
      setSessions([
        {
          id: "circle_session_1",
          circleId: mockCircle.id,
          status: "queued",
          scheduledFor: new Date().toISOString(),
          generatedIntentId: "intent_circle_1",
          summary: "Queued for small-group matching.",
        },
      ]);
      setLoading(false);
      return;
    }

    void api
      .listRecurringCircles(session.userId, session.accessToken)
      .then((rows) => {
        setCircles(rows);
        setSelectedCircleId(rows[0]?.id ?? null);
      })
      .catch((error) => {
        setBanner({
          tone: "error",
          text: `Could not load circles: ${String(error)}`,
        });
      })
      .finally(() => setLoading(false));
  }, [isDesignMock, session, setBanner]);

  useEffect(() => {
    if (!session || !selectedCircleId || isDesignMock) {
      return;
    }
    void api
      .listRecurringCircleSessions(selectedCircleId, session.accessToken)
      .then(setSessions)
      .catch((error) => {
        setBanner({
          tone: "error",
          text: `Could not load circle sessions: ${String(error)}`,
        });
      });
  }, [isDesignMock, selectedCircleId, session, setBanner]);

  const createCircleQuick = async () => {
    if (!session) {
      return;
    }
    if (isDesignMock) {
      setBanner({ tone: "success", text: "Preview recurring circle created." });
      return;
    }
    try {
      const created = await api.createRecurringCircle(
        session.userId,
        {
          title: "Weekly open circle",
          visibility: "invite_only",
          topicTags: profileDraft.interests.slice(0, 3),
          cadence: {
            kind: "weekly",
            days: ["thu"],
            hour: 20,
            minute: 0,
            timezone: "UTC",
            intervalWeeks: 1,
          },
          kickoffPrompt: "Find a small group for this week's recurring circle.",
        },
        session.accessToken,
      );
      setCircles((current) => [created, ...current]);
      setSelectedCircleId(created.id);
      setBanner({ tone: "success", text: "Recurring circle created." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not create circle: ${String(error)}`,
      });
    }
  };

  const runNow = async () => {
    if (!session || !selectedCircleId) {
      return;
    }
    try {
      if (isDesignMock) {
        setBanner({ tone: "success", text: "Preview circle session queued." });
        return;
      }
      const created = await api.runRecurringCircleSessionNow(
        selectedCircleId,
        session.accessToken,
      );
      setSessions((current) => [created, ...current]);
      setBanner({ tone: "success", text: "Circle session opened and queued." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not open circle session: ${String(error)}`,
      });
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <WorkspacePanel>
        <WorkspaceHeader
          description="Ongoing small-group flows for repeat behavior and continuity."
          title="Recurring circles"
        />
        <div className="mt-4">
          <Button
            onClick={() => void createCircleQuick()}
            type="button"
            variant="primary"
          >
            New circle
          </Button>

          <div className="mt-4 space-y-2">
            {loading ? (
              <p className="text-sm text-ash">Loading circles…</p>
            ) : circles.length === 0 ? (
              <WorkspaceMutedPanel>
                <p className="text-sm text-ash">
                  No circles yet. Create one to begin a recurring social loop.
                </p>
              </WorkspaceMutedPanel>
            ) : (
              circles.map((circle) => (
                <button
                  className={`w-full rounded-2xl border px-3 py-2 text-left text-sm ${
                    selectedCircleId === circle.id
                      ? "border-amber-300/30 bg-amber-300/12 text-amber-50"
                      : "border-[hsl(var(--border))] text-slate-200"
                  }`}
                  key={circle.id}
                  onClick={() => setSelectedCircleId(circle.id)}
                  type="button"
                >
                  <p className="font-semibold">{circle.title}</p>
                  <p className="text-xs text-ash">
                    {circle.status} · next{" "}
                    {circle.nextSessionAt
                      ? new Date(circle.nextSessionAt).toLocaleString()
                      : "not scheduled"}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel>
        <WorkspaceHeader
          description="Open a session when you want fresh fanout against the circle’s cadence and topic set."
          title={selectedCircle?.title ?? "Circle sessions"}
        />
        <div className="mt-4">
          <Button
            disabled={!selectedCircle}
            onClick={() => void runNow()}
            type="button"
            variant="primary"
          >
            Open session now
          </Button>

          <div className="mt-4 space-y-2">
            {sessions.length === 0 ? (
              <WorkspaceMutedPanel>
                <p className="text-sm text-ash">
                  No recent sessions for this circle.
                </p>
              </WorkspaceMutedPanel>
            ) : (
              sessions.map((sessionItem) => (
                <WorkspaceMutedPanel key={sessionItem.id}>
                  <p className="font-medium text-white/90">
                    {new Date(sessionItem.scheduledFor).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-ash">
                    {sessionItem.status}
                    {sessionItem.generatedIntentId
                      ? ` · intent ${sessionItem.generatedIntentId.slice(0, 8)}`
                      : ""}
                  </p>
                </WorkspaceMutedPanel>
              ))
            )}
          </div>
        </div>
      </WorkspacePanel>
    </div>
  );
}
