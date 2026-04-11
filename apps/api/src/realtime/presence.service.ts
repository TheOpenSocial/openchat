import { Injectable } from "@nestjs/common";
import { type RealtimePresenceState } from "@opensocial/types";

export interface PresenceSnapshot {
  userId: string;
  online: boolean;
  state: RealtimePresenceState;
  lastSeenAt: string | null;
  activeConnections: number;
}

@Injectable()
export class PresenceService {
  private readonly presenceByUserId = new Map<string, PresenceSnapshot>();

  getPresenceSnapshot(userId: string): PresenceSnapshot {
    return (
      this.presenceByUserId.get(userId) ?? {
        userId,
        online: false,
        state: "invisible",
        lastSeenAt: null,
        activeConnections: 0,
      }
    );
  }

  getPresenceSnapshots(userIds: string[]) {
    return new Map(
      userIds.map((userId) => [userId, this.getPresenceSnapshot(userId)]),
    );
  }

  markOnline(userId: string, state: RealtimePresenceState = "online") {
    const current = this.getPresenceSnapshot(userId);
    const next: PresenceSnapshot = {
      ...current,
      userId,
      online: true,
      state,
      lastSeenAt: current.lastSeenAt,
      activeConnections: current.activeConnections + 1,
    };
    this.presenceByUserId.set(userId, next);
    return next;
  }

  markState(userId: string, state: RealtimePresenceState) {
    const current = this.getPresenceSnapshot(userId);
    const next: PresenceSnapshot = {
      ...current,
      userId,
      online: true,
      state,
      lastSeenAt: current.lastSeenAt,
      activeConnections: Math.max(current.activeConnections, 1),
    };
    this.presenceByUserId.set(userId, next);
    return next;
  }

  markOffline(userId: string) {
    const current = this.getPresenceSnapshot(userId);
    const activeConnections = Math.max(current.activeConnections - 1, 0);
    const next: PresenceSnapshot =
      activeConnections > 0
        ? {
            ...current,
            userId,
            online: true,
            activeConnections,
          }
        : {
            userId,
            online: false,
            state: "invisible",
            lastSeenAt: new Date().toISOString(),
            activeConnections: 0,
          };
    this.presenceByUserId.set(userId, next);
    return next;
  }
}
