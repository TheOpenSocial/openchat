"use client";

import { useEffect, useState } from "react";

import {
  WorkspaceHeader,
  WorkspaceList,
  WorkspaceListItem,
  WorkspaceMutedPanel,
  WorkspacePanel,
} from "@/src/components/layout/workspace";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { useAppSession } from "@/src/features/app-shell/app-session";
import { api, type InboxRequestRecord } from "@/src/lib/api";

const MOCK_REQUESTS: InboxRequestRecord[] = [
  {
    id: "req_mock_1",
    intentId: "intent_mock_1",
    senderUserId: "user_maya",
    recipientUserId: "web-design-mock-user",
    status: "pending",
    wave: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: "req_mock_2",
    intentId: "intent_mock_2",
    senderUserId: "user_jordan",
    recipientUserId: "web-design-mock-user",
    status: "pending",
    wave: 2,
    createdAt: new Date(Date.now() - 32 * 60_000).toISOString(),
  },
];

export function RequestsScreen() {
  const { isDesignMock, session, setBanner } = useAppSession();
  const [requests, setRequests] = useState<InboxRequestRecord[]>([]);
  const [reportReason, setReportReason] = useState("spam_or_abuse");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      return;
    }
    if (isDesignMock) {
      setRequests(MOCK_REQUESTS);
      setLoading(false);
      return;
    }

    void api
      .listPendingRequests(session.userId, session.accessToken)
      .then((rows) => {
        setRequests(rows);
      })
      .catch((error) => {
        setBanner({
          tone: "error",
          text: `Could not load requests: ${String(error)}`,
        });
      })
      .finally(() => setLoading(false));
  }, [isDesignMock, session, setBanner]);

  const updateLocally = (
    requestId: string,
    status: InboxRequestRecord["status"],
  ) =>
    setRequests((current) =>
      current.map((row) => (row.id === requestId ? { ...row, status } : row)),
    );

  const actOnRequest = async (
    requestId: string,
    action: "accept" | "reject" | "snooze",
  ) => {
    if (!session) {
      return;
    }
    if (isDesignMock) {
      updateLocally(requestId, action === "accept" ? "accepted" : "pending");
      setBanner({
        tone: "success",
        text:
          action === "snooze"
            ? "Preview request snoozed for 30 minutes."
            : `Preview request ${action}ed.`,
      });
      return;
    }

    try {
      if (action === "accept") {
        await api.acceptRequest(requestId, session.accessToken);
        updateLocally(requestId, "accepted");
      } else if (action === "reject") {
        await api.rejectRequest(requestId, session.accessToken);
        updateLocally(requestId, "rejected");
      } else {
        await api.bulkInboxAction(
          session.userId,
          [requestId],
          { action: "snooze", snoozeMinutes: 30 },
          session.accessToken,
        );
      }
      setBanner({ tone: "success", text: `Request ${action} handled.` });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not ${action} request: ${String(error)}`,
      });
    }
  };

  const safetyAction = async (
    targetUserId: string,
    action: "report" | "block",
  ) => {
    if (!session) {
      return;
    }
    try {
      if (!isDesignMock) {
        if (action === "report") {
          await api.reportUser(
            session.userId,
            targetUserId,
            reportReason,
            "Submitted from web requests inbox.",
            session.accessToken,
          );
        } else {
          await api.blockUser(
            session.userId,
            targetUserId,
            session.accessToken,
          );
        }
      }
      setBanner({
        tone: "success",
        text: `${action === "report" ? "Report submitted" : "User blocked"}.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not ${action} user: ${String(error)}`,
      });
    }
  };

  return (
    <WorkspacePanel>
      <WorkspaceHeader
        description="Accept, decline, snooze, or escalate requests that match your standing rules."
        title="Incoming requests"
      />

      <div className="mt-4 max-w-xs">
        <Label htmlFor="report-reason">Report reason</Label>
        <Input
          id="report-reason"
          onChange={(event) => setReportReason(event.currentTarget.value)}
          value={reportReason}
        />
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-ash">Loading requests…</p>
        ) : requests.length === 0 ? (
          <WorkspaceMutedPanel>
            <p className="text-sm leading-6 text-ash">
              No pending requests right now. Discovery and routing will surface
              more when it finds them.
            </p>
          </WorkspaceMutedPanel>
        ) : (
          <WorkspaceList>
            {requests.map((request) => (
              <WorkspaceListItem key={request.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white/92">
                      Request {request.id.slice(0, 8)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-ash">
                      sender {request.senderUserId.slice(0, 8)} · wave{" "}
                      {request.wave} · {request.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        void actOnRequest(request.id, "accept");
                      }}
                      size="sm"
                      type="button"
                      variant="primary"
                    >
                      Accept
                    </Button>
                    <Button
                      onClick={() => {
                        void actOnRequest(request.id, "reject");
                      }}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      Decline
                    </Button>
                    <Button
                      onClick={() => {
                        void actOnRequest(request.id, "snooze");
                      }}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      Snooze 30m
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      void safetyAction(request.senderUserId, "report");
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Report
                  </Button>
                  <Button
                    onClick={() => {
                      void safetyAction(request.senderUserId, "block");
                    }}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    Block
                  </Button>
                </div>
              </WorkspaceListItem>
            ))}
          </WorkspaceList>
        )}
      </div>
    </WorkspacePanel>
  );
}
