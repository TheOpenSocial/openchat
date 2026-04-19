import { useCallback, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";

import { RouteTransition } from "../../../components/RouteTransition";
import type { MobileSession, UserProfileDraft } from "../../../types";
import { ConnectionsScreen } from "../../ConnectionsScreen";
import { DiscoveryScreen } from "../../DiscoveryScreen";
import { InboxScreen } from "../../InboxScreen";
import { IntentDetailScreen } from "../../IntentDetailScreen";
import { RecurringCirclesScreen } from "../../RecurringCirclesScreen";
import { SavedSearchesScreen } from "../../SavedSearchesScreen";
import { ScheduledTasksScreen } from "../../ScheduledTasksScreen";
import {
  OtherUserProfileScreen,
  type OtherProfileContext,
} from "../../OtherUserProfileScreen";
import { SettingsScreen } from "../../SettingsScreen";
import type { HomeTab } from "../../../types";
import type { PushRouteIntent } from "../../../features/notifications/hooks/usePushLifecycle";

const HOME_SHELL_BACKGROUND_COLOR = "#212121";
const HOME_SHELL_CONTAINER_STYLE = {
  flex: 1,
  backgroundColor: HOME_SHELL_BACKGROUND_COLOR,
} as const;

type OtherProfileTarget = {
  context: OtherProfileContext;
  userId: string;
};

type UseHomeTransientRoutesInput = {
  initialProfile: UserProfileDraft;
  onProfileUpdated: (profile: UserProfileDraft) => void;
  session: MobileSession;
  setActiveTab: (tab: HomeTab) => void;
  setSelectedChatId: (value: string | null) => void;
};

type FullScreenRouteOptions = {
  animated?: boolean;
};

function renderTransientScreen(
  routeKey: string,
  screen: ReactNode,
  options?: FullScreenRouteOptions,
) {
  return (
    <View className="flex-1 bg-canvas" style={HOME_SHELL_CONTAINER_STYLE}>
      <RouteTransition
        animated={options?.animated !== false}
        routeKey={routeKey}
      >
        {screen}
      </RouteTransition>
    </View>
  );
}

export function useHomeTransientRoutes({
  initialProfile,
  onProfileUpdated,
  session,
  setActiveTab,
  setSelectedChatId,
}: UseHomeTransientRoutesInput) {
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [intentDetailIntentId, setIntentDetailIntentId] = useState<
    string | null
  >(null);
  const [otherProfileTarget, setOtherProfileTarget] =
    useState<OtherProfileTarget | null>(null);
  const [recurringCirclesOpen, setRecurringCirclesOpen] = useState(false);
  const [savedSearchesOpen, setSavedSearchesOpen] = useState(false);
  const [scheduledTasksOpen, setScheduledTasksOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const closeTransientRoutes = useCallback(() => {
    setConnectionsOpen(false);
    setDiscoveryOpen(false);
    setInboxOpen(false);
    setRecurringCirclesOpen(false);
    setSavedSearchesOpen(false);
    setScheduledTasksOpen(false);
    setIntentDetailIntentId(null);
    setSettingsOpen(false);
    setOtherProfileTarget(null);
  }, []);

  const openActivity = useCallback(() => {
    closeTransientRoutes();
    setActiveTab("activity");
  }, [closeTransientRoutes, setActiveTab]);

  const openConnections = useCallback(() => {
    closeTransientRoutes();
    setConnectionsOpen(true);
  }, [closeTransientRoutes]);

  const openDiscovery = useCallback(() => {
    closeTransientRoutes();
    setDiscoveryOpen(true);
  }, [closeTransientRoutes]);

  const openInbox = useCallback(() => {
    closeTransientRoutes();
    setInboxOpen(true);
  }, [closeTransientRoutes]);

  const openRecurringCircles = useCallback(() => {
    closeTransientRoutes();
    setRecurringCirclesOpen(true);
  }, [closeTransientRoutes]);

  const openSavedSearches = useCallback(() => {
    closeTransientRoutes();
    setSavedSearchesOpen(true);
  }, [closeTransientRoutes]);

  const openScheduledTasks = useCallback(() => {
    closeTransientRoutes();
    setScheduledTasksOpen(true);
  }, [closeTransientRoutes]);

  const openSettings = useCallback(() => {
    closeTransientRoutes();
    setSettingsOpen(true);
  }, [closeTransientRoutes]);

  const openIntentDetail = useCallback(
    (intentId: string) => {
      closeTransientRoutes();
      setIntentDetailIntentId(intentId);
    },
    [closeTransientRoutes],
  );

  const openProfileFromChat = useCallback(
    (target: OtherProfileTarget) => {
      closeTransientRoutes();
      setOtherProfileTarget(target);
    },
    [closeTransientRoutes],
  );

  const openProfileFromConnections = useCallback(
    (targetUserId: string) => {
      closeTransientRoutes();
      setOtherProfileTarget({
        userId: targetUserId,
        context: {
          source: "chat",
          reason: "You are connected through an existing direct chat.",
        },
      });
    },
    [closeTransientRoutes],
  );

  const openProfileFromDiscovery = useCallback(
    (targetUserId: string) => {
      closeTransientRoutes();
      setOtherProfileTarget({
        userId: targetUserId,
        context: {
          source: "request",
          reason:
            "Suggested from discovery as a strong match for your current intent.",
        },
      });
    },
    [closeTransientRoutes],
  );

  const openProfileFromInbox = useCallback(
    (targetUserId: string) => {
      closeTransientRoutes();
      setOtherProfileTarget({
        userId: targetUserId,
        context: {
          source: "request",
          reason: "Opened from an incoming request waiting on your response.",
        },
      });
    },
    [closeTransientRoutes],
  );

  const openChatFromConnections = useCallback(
    (chatId: string) => {
      closeTransientRoutes();
      setActiveTab("chats");
      setSelectedChatId(chatId);
    },
    [closeTransientRoutes, setActiveTab, setSelectedChatId],
  );

  const handlePushRouteIntent = useCallback(
    (intent: PushRouteIntent) => {
      closeTransientRoutes();

      switch (intent.kind) {
        case "activity":
          setActiveTab("activity");
          break;
        case "connections":
          setConnectionsOpen(true);
          break;
        case "discovery":
          setDiscoveryOpen(true);
          break;
        case "home":
          setActiveTab("home");
          break;
        case "inbox":
          setInboxOpen(true);
          break;
        case "intent":
          setIntentDetailIntentId(intent.intentId);
          break;
        case "profile":
          if (intent.userId === session.userId) {
            setActiveTab("profile");
            break;
          }
          setOtherProfileTarget({
            userId: intent.userId,
            context: {
              source: "chat",
              reason: "Opened from a notification.",
            },
          });
          break;
        case "recurringCircles":
          setRecurringCirclesOpen(true);
          break;
        case "savedSearches":
          setSavedSearchesOpen(true);
          break;
        case "scheduledTasks":
          setScheduledTasksOpen(true);
          break;
        case "settings":
          setSettingsOpen(true);
          break;
        case "chat":
          setActiveTab("chats");
          setSelectedChatId(intent.chatId);
          break;
        default:
          break;
      }
    },
    [closeTransientRoutes, session.userId, setActiveTab, setSelectedChatId],
  );

  const transientScreen = useMemo(() => {
    if (settingsOpen) {
      return renderTransientScreen(
        "settings",
        <SettingsScreen
          accessToken={session.accessToken}
          displayName={session.displayName}
          email={session.email}
          initialDraft={initialProfile}
          onClose={closeTransientRoutes}
          onProfileUpdated={onProfileUpdated}
          userId={session.userId}
        />,
      );
    }

    if (connectionsOpen) {
      return renderTransientScreen(
        "connections",
        <ConnectionsScreen
          accessToken={session.accessToken}
          onClose={closeTransientRoutes}
          onOpenChat={openChatFromConnections}
          onOpenProfile={openProfileFromConnections}
          userId={session.userId}
        />,
      );
    }

    if (discoveryOpen) {
      return renderTransientScreen(
        "discovery",
        <DiscoveryScreen
          accessToken={session.accessToken}
          onClose={closeTransientRoutes}
          onOpenProfile={openProfileFromDiscovery}
          userId={session.userId}
        />,
        { animated: false },
      );
    }

    if (inboxOpen) {
      return renderTransientScreen(
        "inbox",
        <InboxScreen
          accessToken={session.accessToken}
          onClose={closeTransientRoutes}
          onOpenIntentDetail={openIntentDetail}
          onOpenProfile={openProfileFromInbox}
          userId={session.userId}
        />,
      );
    }

    if (recurringCirclesOpen) {
      return renderTransientScreen(
        "recurring-circles",
        <RecurringCirclesScreen
          accessToken={session.accessToken}
          onClose={closeTransientRoutes}
          userId={session.userId}
        />,
      );
    }

    if (savedSearchesOpen) {
      return renderTransientScreen(
        "saved-searches",
        <SavedSearchesScreen
          accessToken={session.accessToken}
          onClose={closeTransientRoutes}
          userId={session.userId}
        />,
      );
    }

    if (scheduledTasksOpen) {
      return renderTransientScreen(
        "scheduled-tasks",
        <ScheduledTasksScreen
          accessToken={session.accessToken}
          onClose={closeTransientRoutes}
          userId={session.userId}
        />,
      );
    }

    if (intentDetailIntentId) {
      return renderTransientScreen(
        `intent:${intentDetailIntentId}`,
        <IntentDetailScreen
          accessToken={session.accessToken}
          intentId={intentDetailIntentId}
          onClose={closeTransientRoutes}
          userId={session.userId}
        />,
      );
    }

    if (otherProfileTarget) {
      return renderTransientScreen(
        `profile:${otherProfileTarget.userId}`,
        <OtherUserProfileScreen
          accessToken={session.accessToken}
          currentUserId={session.userId}
          onClose={closeTransientRoutes}
          targetUserId={otherProfileTarget.userId}
          context={otherProfileTarget.context}
        />,
      );
    }

    return null;
  }, [
    closeTransientRoutes,
    connectionsOpen,
    discoveryOpen,
    inboxOpen,
    initialProfile,
    intentDetailIntentId,
    onProfileUpdated,
    openChatFromConnections,
    openConnections,
    openDiscovery,
    openInbox,
    openIntentDetail,
    openProfileFromConnections,
    openProfileFromDiscovery,
    openProfileFromInbox,
    openRecurringCircles,
    openSavedSearches,
    openScheduledTasks,
    otherProfileTarget,
    recurringCirclesOpen,
    savedSearchesOpen,
    scheduledTasksOpen,
    session.accessToken,
    session.displayName,
    session.email,
    session.userId,
    settingsOpen,
  ]);

  return {
    actions: {
      handlePushRouteIntent,
      openActivity,
      openConnections,
      openDiscovery,
      openInbox,
      openIntentDetail,
      openProfileFromChat,
      openProfileFromConnections,
      openProfileFromDiscovery,
      openProfileFromInbox,
      openRecurringCircles,
      openSavedSearches,
      openScheduledTasks,
      openSettings,
    },
    transientScreen,
  };
}
