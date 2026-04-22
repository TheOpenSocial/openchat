import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConnectionType, RequestStatus } from "@opensocial/types";
import { RealtimeGateway } from "./realtime.gateway.js";

@Injectable()
export class RealtimeEventsService {
  private readonly logger = new Logger(RealtimeEventsService.name);

  constructor(@Optional() private readonly realtimeGateway?: RealtimeGateway) {}

  emitRequestCreated(
    recipientUserId: string,
    payload: { requestId: string; intentId: string },
  ) {
    return this.safePublish("request.created", () =>
      this.realtimeGateway?.publishUserEvent(
        recipientUserId,
        "request.created",
        payload,
      ),
    );
  }

  emitRequestUpdated(
    userIds: string[],
    payload: { requestId: string; status: RequestStatus },
  ) {
    for (const userId of userIds) {
      this.safePublish("request.updated", () =>
        this.realtimeGateway?.publishUserEvent(
          userId,
          "request.updated",
          payload,
        ),
      );
    }
  }

  emitIntentUpdated(
    userId: string,
    payload: { intentId: string; status: string },
  ) {
    return this.safePublish("intent.updated", () =>
      this.realtimeGateway?.publishUserEvent(userId, "intent.updated", payload),
    );
  }

  emitConnectionCreated(
    userIds: string[],
    payload: { connectionId: string; type: ConnectionType | "dm" | "group" },
  ) {
    for (const userId of userIds) {
      this.safePublish("connection.created", () =>
        this.realtimeGateway?.publishUserEvent(
          userId,
          "connection.created",
          payload,
        ),
      );
    }
  }

  emitModerationNotice(userId: string, reason: string) {
    return this.safePublish("moderation.notice", () =>
      this.realtimeGateway?.publishUserEvent(userId, "moderation.notice", {
        userId,
        reason,
      }),
    );
  }

  emitChatMessageUpdated(
    roomId: string,
    payload: { roomId: string; message: unknown },
  ) {
    return this.safePublish("chat.message.updated", () =>
      this.realtimeGateway?.publishRoomEvent(
        roomId,
        "chat.message.updated",
        payload,
      ),
    );
  }

  private safePublish(eventName: string, publish: () => unknown) {
    if (!this.realtimeGateway) {
      return false;
    }
    try {
      publish();
      return true;
    } catch (error) {
      this.logger.warn(
        `failed to publish realtime event ${eventName}: ${String(error)}`,
      );
      return false;
    }
  }
}
