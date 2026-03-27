import { type ComponentProps } from "react";

import { AgentTab } from "./AgentTab";
import { ChatsTab } from "./ChatsTab";
import { IntentsTab } from "./IntentsTab";
import { ModerationTab } from "./ModerationTab";
import { OverviewTab } from "./OverviewTab";
import { PersonalizationTab } from "./PersonalizationTab";
import { UserInspectorTab } from "./UserInspectorTab";

export interface BuildWorkbenchTabPropsArgs {
  agentProps: ComponentProps<typeof AgentTab>;
  chatsProps: ComponentProps<typeof ChatsTab>;
  intentsProps: ComponentProps<typeof IntentsTab>;
  moderationProps: ComponentProps<typeof ModerationTab>;
  overviewProps: ComponentProps<typeof OverviewTab>;
  personalizationProps: ComponentProps<typeof PersonalizationTab>;
  userInspectorProps: ComponentProps<typeof UserInspectorTab>;
}

export function buildWorkbenchTabProps({
  agentProps,
  chatsProps,
  intentsProps,
  moderationProps,
  overviewProps,
  personalizationProps,
  userInspectorProps,
}: BuildWorkbenchTabPropsArgs): BuildWorkbenchTabPropsArgs {
  return {
    agentProps,
    chatsProps,
    intentsProps,
    moderationProps,
    overviewProps,
    personalizationProps,
    userInspectorProps,
  };
}
