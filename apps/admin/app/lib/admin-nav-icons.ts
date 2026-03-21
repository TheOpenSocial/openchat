import type { LucideIcon } from "lucide-react";
import {
  Bot,
  LayoutDashboard,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";

/** Matches consumer app information architecture; used in the operator sidebar. */
export function adminNavIconFor(id: string): LucideIcon {
  switch (id) {
    case "overview":
      return LayoutDashboard;
    case "users":
      return Users;
    case "intents":
      return Workflow;
    case "chats":
      return MessageSquare;
    case "moderation":
      return ShieldAlert;
    case "personalization":
      return Sparkles;
    case "agent":
      return Bot;
    default:
      return LayoutDashboard;
  }
}
