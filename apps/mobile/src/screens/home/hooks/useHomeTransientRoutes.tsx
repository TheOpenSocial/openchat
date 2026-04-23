import { useCallback, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";

import { RouteTransition } from "../../../components/RouteTransition";
import type { MobileSession, UserProfileDraft } from "../../../types";
import { ActivityScreen } from "../../ActivityScreen";
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

type TransientRoute =
  | { kind: "activity" }
  | { kind: "connections" }
  | { kind: "discovery" }
  | { kind: "inbox" }
  | { kind: "intent"; intentId: string }
  | { kind: "otherProfile"; target: OtherProfileTarget }
  | { kind: "recurringCircles" }
  | { kind: "savedSearches" }
  | { kind: "scheduledTasks" }
  | { kind: "settings" };

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
  const [route, setRoute] = useState<TransientRoute | null>(null);

  const closeTransientRoutes = useCallback(() => {
    setRoute(null);
  }, []);

  const openActivity = useCallback(() => {
    setRoute({ kind: "activity" });
  }, []);

  const openConnections = useCallback(() => {
    setRoute({ kind: "connections" });
  }, []);

  const openDiscovery = useCallback(() => {
    setRoute({ kind: "discovery" });
  }, []);

  const openInbox = useCallback(() => {
    setRoute({ kind: "inbox" });
  }, []);

  const openRecurringCircles = useCallback(() => {
    setRoute({ kind: "recurringCircles" });
  }, []);

  const openSavedSearches = useCallback(() => {
    setRoute({ kind: "savedSearches" });
  }, []);

  const openScheduledTasks = useCallback(() => {
    setRoute({ kind: "scheduledTasks" });
  }, []);

  const openSettings = useCallback(() => {
    setRoute({ kind: "settings" });
  }, []);

  const openIntentDetail = useCallback((intentId: string) => {
    setRoute({ kind: "intent", intentId });
  }, []);

  const openProfileFromChat = useCallback((target: OtherProfileTarget) => {
    setRoute({ kind: "otherProfile", target });
  }, []);

  const openProfileFromConnections = useCallback((targetUserId: string) => {
    setRoute({
      kind: "otherProfile",
      target: {
        userId: targetUserId,
        context: {
          source: "chat",
          reason: "You are connected through an existing direct chat.",
        },
      },
    });
  }, []);

  const openProfileFromDiscovery = useCallback((targetUserId: string) => {
    setRoute({
      kind: "otherProfile",
      target: {
        userId: targetUserId,
        context: {
          source: "request",
          reason:
            "Suggested from discovery as a strong match for your current intent.",
        },
      },
    });
  }, []);

  const openProfileFromInbox = useCallback((targetUserId: string) => {
    setRoute({
      kind: "otherProfile",
      target: {
        userId: targetUserId,
        context: {
          source: "request",
          reason: "This person sent you a connection request.",
        },
      },
    });
  }, []);

  const openChatFromConnections = useCallback(
    (chatId: string) => {
      setRoute(null);
      setActiveTab("chats");
      setSelectedChatId(chatId);
    },
    [setActiveTab, setSelectedChatId],
  );

  const handlePushRouteIntent = useCallback(
    (intent: PushRouteIntent) => {
      switch (intent.kind) {
        case "activity":
          setRoute({ kind: "activity" });
          break;
        case "connections":
          setRoute({ kind: "connections" });
          break;
        case "discovery":
          setRoute({ kind: "discovery" });
          break;
        case "home":
          setRoute(null);
          setActiveTab("home");
          break;
        case "inbox":
          setRoute({ kind: "inbox" });
          break;
        case "intent":
          setRoute({ kind: "intent", intentId: intent.intentId });
          break;
        case "profile":
          if (intent.userId === session.userId) {
            setRoute(null);
            setActiveTab("profile");
            break;
          }
          setRoute({
            kind: "otherProfile",
            target: {
              userId: intent.userId,
              context: {
                source: "chat",
                reason: "Opened from a notification.",
              },
            },
          });
          break;
        case "recurringCircles":
          setRoute({ kind: "recurringCircles" });
          break;
        case "savedSearches":
          setRoute({ kind: "savedSearches" });
          break;
        case "scheduledTasks":
          setRoute({ kind: "scheduledTasks" });
          break;
        case "settings":
          setRoute({ kind: "settings" });
          break;
        case "chat":
          setRoute(null);
          setActiveTab("chats");
          setSelectedChatId(intent.chatId);
          break;
        default:
          break;
      }
    },
    [session.userId, setActiveTab, setSelectedChatId],
  );

  const transientScreen = useMemo(() => {
    if (route?.kind === "settings") {
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

    if (route?.kind === "activity") {
      return renderTransientScreen(
        "activity",
        <ActivityScreen
          accessToken={session.accessToken}
          onClose={closeTransientRoutes}
          onOpenConnections={openConnections}
          onOpenDiscovery={openDiscovery}
          onOpenInbox={openInbox}
          onOpenIntentDetail={openIntentDetail}
          onOpenRecurringCircles={openRecurringCircles}
          onOpenSavedSearches={openSavedSearches}
          onOpenScheduledTasks={openScheduledTasks}
          userId={session.userId}
        />,
      );
    }

    if (route?.kind === "connections") {
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

    if (route?.kind === "discovery") {
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

    if (route?.kind === "recurringCircles") {
      return renderTransientScreen(
        "recurring-circles",
        <RecurringCirclesScreen
          accessToken={session.accessToken}
          onClose={closeTransientRoutes}
          userId={session.userId}
        />,
      );
    }

    if (route?.kind === "savedSearches") {
      return renderTransientScreen(
        "saved-searches",
        <SavedSearchesScreen
          accessToken={session.accessToken}
          onClose={closeTransientRoutes}
          userId={session.userId}
        />,
      );
    }

    if (route?.kind === "scheduledTasks") {
      return renderTransientScreen(
        "scheduled-tasks",
        <ScheduledTasksScreen
          accessToken={session.accessToken}
          onClose={closeTransientRoutes}
          userId={session.userId}
        />,
      );
    }

    if (route?.kind === "intent") {
      return renderTransientScreen(
        `intent:${route.intentId}`,
        <IntentDetailScreen
          accessToken={session.accessToken}
          intentId={route.intentId}
          onClose={closeTransientRoutes}
          userId={session.userId}
        />,
      );
    }

    if (route?.kind === "inbox") {
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

    if (route?.kind === "otherProfile") {
      return renderTransientScreen(
        `profile:${route.target.userId}`,
        <OtherUserProfileScreen
          accessToken={session.accessToken}
          currentUserId={session.userId}
          onClose={closeTransientRoutes}
          targetUserId={route.target.userId}
          context={route.target.context}
        />,
      );
    }

    return null;
  }, [
    closeTransientRoutes,
    initialProfile,
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
    route,
    session.accessToken,
    session.displayName,
    session.email,
    session.userId,
  ]);

  return {
    actions: {
      closeAll: closeTransientRoutes,
      handlePushRouteIntent,
      openActivity,
      openConnections,
      openDiscovery,
      openInbox,
      openProfileFromChat,
      openProfileFromConnections,
      openProfileFromDiscovery,
      openProfileFromInbox,
      openRecurringCircles,
      openSavedSearches,
      openScheduledTasks,
      openSettings,
    },
    routeKind: route?.kind ?? null,
    transientScreen,
  };
}
