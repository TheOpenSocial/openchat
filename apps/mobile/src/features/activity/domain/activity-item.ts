import type {
  ExperienceActivitySectionId,
  InboxRequestRecord,
} from "../../../lib/api";

type ActivityItemBase = {
  id: string;
  body: string;
  eyebrow: string;
  priority: number;
  sectionId: ExperienceActivitySectionId;
  timestamp?: string | null;
  title: string;
};

export type ActivityItem =
  | (ActivityItemBase & {
      kind: "request";
      status: InboxRequestRecord["status"];
      requestId: string;
      intentId: string;
    })
  | (ActivityItemBase & {
      kind: "notification";
      isRead: boolean;
      notificationType: string;
    })
  | (ActivityItemBase & {
      kind: "intent";
      intentId: string;
      status: string;
    })
  | (ActivityItemBase & {
      kind: "discovery";
      scoreLabel: string;
    })
  | (ActivityItemBase & {
      kind: "summary";
    });

export type ActivitySection = {
  id: ExperienceActivitySectionId;
  title: string;
  subtitle: string;
  emphasis: "urgent" | "active" | "passive";
  items: ActivityItem[];
};

export function compareActivityItems(
  left: ActivityItem,
  right: ActivityItem,
): number {
  if (right.priority !== left.priority) {
    return right.priority - left.priority;
  }
  const leftTime = left.timestamp ? Date.parse(left.timestamp) : 0;
  const rightTime = right.timestamp ? Date.parse(right.timestamp) : 0;
  return rightTime - leftTime;
}
