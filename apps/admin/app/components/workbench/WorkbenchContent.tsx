"use client";

import { type ComponentProps } from "react";

import { Notice } from "../Notice";
import { AgentTab } from "./AgentTab";
import { ChatsTab } from "./ChatsTab";
import { IntentsTab } from "./IntentsTab";
import { ModerationTab } from "./ModerationTab";
import { OverviewTab } from "./OverviewTab";
import { PersonalizationTab } from "./PersonalizationTab";
import { UserInspectorTab } from "./UserInspectorTab";
import { type AdminTab, type Banner } from "./workbench-config";

interface WorkbenchContentProps {
  activeTab: AdminTab;
  banner: Banner | null;
  tabSubtitle: (tab: AdminTab) => string;
  overviewProps: ComponentProps<typeof OverviewTab>;
  userInspectorProps: ComponentProps<typeof UserInspectorTab>;
  intentsProps: ComponentProps<typeof IntentsTab>;
  chatsProps: ComponentProps<typeof ChatsTab>;
  moderationProps: ComponentProps<typeof ModerationTab>;
  personalizationProps: ComponentProps<typeof PersonalizationTab>;
  agentProps: ComponentProps<typeof AgentTab>;
}

export function WorkbenchContent({
  activeTab,
  banner,
  tabSubtitle,
  overviewProps,
  userInspectorProps,
  intentsProps,
  chatsProps,
  moderationProps,
  personalizationProps,
  agentProps,
}: WorkbenchContentProps) {
  return (
    <>
      {banner ? (
        <div className="mb-4">
          <Notice text={banner.text} tone={banner.tone} />
        </div>
      ) : null}

      <p className="mb-4 text-xs text-muted-foreground md:hidden">
        {tabSubtitle(activeTab)}
      </p>

      {activeTab === "overview" ? <OverviewTab {...overviewProps} /> : null}
      {activeTab === "users" ? (
        <UserInspectorTab {...userInspectorProps} />
      ) : null}
      {activeTab === "intents" ? <IntentsTab {...intentsProps} /> : null}
      {activeTab === "chats" ? <ChatsTab {...chatsProps} /> : null}
      {activeTab === "moderation" ? (
        <ModerationTab {...moderationProps} />
      ) : null}
      {activeTab === "personalization" ? (
        <PersonalizationTab {...personalizationProps} />
      ) : null}
      {activeTab === "agent" ? <AgentTab {...agentProps} /> : null}
    </>
  );
}
