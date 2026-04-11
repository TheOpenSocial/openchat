export type ActivityItem =
  | {
      id: string;
      kind: "request";
      priority: number;
      eyebrow: string;
      title: string;
      body: string;
      timestamp: string;
      status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
      requestId: string;
      intentId: string;
    }
  | {
      id: string;
      kind: "intent";
      priority: number;
      eyebrow: string;
      title: string;
      body: string;
      intentId: string;
      status: string;
    }
  | {
      id: string;
      kind: "discovery";
      priority: number;
      eyebrow: string;
      title: string;
      body: string;
      scoreLabel: string;
    }
  | {
      id: string;
      kind: "summary";
      priority: number;
      eyebrow: string;
      title: string;
      body: string;
    };

export function compareActivityItems(
  left: ActivityItem,
  right: ActivityItem,
): number {
  if (right.priority !== left.priority) {
    return right.priority - left.priority;
  }

  const leftTime = left.kind === "request" ? Date.parse(left.timestamp) : 0;
  const rightTime = right.kind === "request" ? Date.parse(right.timestamp) : 0;
  return rightTime - leftTime;
}
