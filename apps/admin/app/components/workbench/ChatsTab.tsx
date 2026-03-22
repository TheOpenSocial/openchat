import { JsonView } from "@/app/components/JsonView";
import { Panel } from "@/app/components/Panel";

export function ChatsTab({
  actingUserId,
  adminButtonClass,
  adminButtonDangerClass,
  adminButtonGhostClass,
  adminInputClass,
  adminLabelClass,
  chatId,
  chatMessagesSnapshot,
  chatMetadataSnapshot,
  chatSyncSnapshot,
  hideReason,
  messageId,
  moderatorUserId,
  syncAfter,
  inspectChat,
  leaveChat,
  hideChatMessage,
  repairChatFlow,
  setActingUserId,
  setChatId,
  setHideReason,
  setMessageId,
  setModeratorUserId,
  setSyncAfter,
  syncChat,
}: {
  actingUserId: string;
  adminButtonClass: string;
  adminButtonDangerClass: string;
  adminButtonGhostClass: string;
  adminInputClass: string;
  adminLabelClass: string;
  chatId: string;
  chatMessagesSnapshot: unknown;
  chatMetadataSnapshot: unknown;
  chatSyncSnapshot: unknown;
  hideReason: string;
  messageId: string;
  moderatorUserId: string;
  syncAfter: string;
  inspectChat: () => Promise<unknown>;
  leaveChat: () => Promise<unknown>;
  hideChatMessage: () => Promise<unknown>;
  repairChatFlow: () => Promise<unknown>;
  setActingUserId: (value: string) => void;
  setChatId: (value: string) => void;
  setHideReason: (value: string) => void;
  setMessageId: (value: string) => void;
  setModeratorUserId: (value: string) => void;
  setSyncAfter: (value: string) => void;
  syncChat: () => Promise<unknown>;
}) {
  return (
    <section className="mt-4 space-y-4">
      <Panel
        subtitle="Inspect chat health and recover flows with sync and membership actions."
        title="Chat Controls"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className={adminLabelClass}>
            chat id
            <input
              className={adminInputClass}
              onChange={(event) => setChatId(event.currentTarget.value)}
              placeholder="chat uuid"
              value={chatId}
            />
          </label>
          <label className={adminLabelClass}>
            acting user id
            <input
              className={adminInputClass}
              onChange={(event) => setActingUserId(event.currentTarget.value)}
              value={actingUserId}
            />
          </label>
          <label className={adminLabelClass}>
            sync after (ISO)
            <input
              className={adminInputClass}
              onChange={(event) => setSyncAfter(event.currentTarget.value)}
              placeholder="2026-03-19T20:00:00.000Z"
              value={syncAfter}
            />
          </label>
          <label className={adminLabelClass}>
            message id (hide action)
            <input
              className={adminInputClass}
              onChange={(event) => setMessageId(event.currentTarget.value)}
              placeholder="message uuid"
              value={messageId}
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className={adminLabelClass}>
            moderator user id
            <input
              className={adminInputClass}
              onChange={(event) =>
                setModeratorUserId(event.currentTarget.value)
              }
              value={moderatorUserId}
            />
          </label>
          <label className={adminLabelClass}>
            hide reason
            <input
              className={adminInputClass}
              onChange={(event) => setHideReason(event.currentTarget.value)}
              value={hideReason}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={adminButtonClass}
            onClick={inspectChat}
            type="button"
          >
            Inspect messages + metadata
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={syncChat}
            type="button"
          >
            Reconnect sync
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={leaveChat}
            type="button"
          >
            Leave participant
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={repairChatFlow}
            type="button"
          >
            Repair stuck flow
          </button>
          <button
            className={adminButtonDangerClass}
            onClick={hideChatMessage}
            type="button"
          >
            Hide message
          </button>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Messages">
          <JsonView value={chatMessagesSnapshot} />
        </Panel>
        <Panel title="Metadata (connection view)">
          <JsonView value={chatMetadataSnapshot} />
        </Panel>
        <Panel title="Sync Snapshot">
          <JsonView value={chatSyncSnapshot} />
        </Panel>
      </div>
    </section>
  );
}
