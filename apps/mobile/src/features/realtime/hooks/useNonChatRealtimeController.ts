import { useCallback, useEffect, useMemo, useRef } from "react";

import type { RealtimeCallbacks } from "../../../lib/realtime";
import { useInboxStore } from "../../../store/inbox-store";

type BannerTone = "error" | "info" | "success";

type UseNonChatRealtimeControllerArgs = {
  setBanner: (banner: { text: string; tone: BannerTone } | null) => void;
};

export function useNonChatRealtimeController({
  setBanner,
}: UseNonChatRealtimeControllerArgs): Pick<
  RealtimeCallbacks,
  | "onConnectionCreated"
  | "onIntentUpdated"
  | "onModerationNotice"
  | "onRequestCreated"
  | "onRequestUpdated"
> {
  const pendingRequestCount = useInboxStore(
    (store) => store.pendingRequestCount,
  );
  const setPendingRequestCount = useInboxStore(
    (store) => store.setPendingRequestCount,
  );
  const pendingRequestCountRef = useRef(pendingRequestCount);

  useEffect(() => {
    pendingRequestCountRef.current = pendingRequestCount;
  }, [pendingRequestCount]);

  const onRequestCreated = useCallback<
    NonNullable<RealtimeCallbacks["onRequestCreated"]>
  >(() => {
    const nextCount = pendingRequestCountRef.current + 1;
    pendingRequestCountRef.current = nextCount;
    setPendingRequestCount(nextCount);
    setBanner({
      text: "A new request just arrived.",
      tone: "info",
    });
  }, [setBanner, setPendingRequestCount]);

  const onRequestUpdated = useCallback<
    NonNullable<RealtimeCallbacks["onRequestUpdated"]>
  >(
    ({ status }) => {
      const nextCount =
        status === "pending"
          ? pendingRequestCountRef.current
          : Math.max(0, pendingRequestCountRef.current - 1);
      pendingRequestCountRef.current = nextCount;
      setPendingRequestCount(nextCount);
    },
    [setPendingRequestCount],
  );

  const onIntentUpdated = useCallback<
    NonNullable<RealtimeCallbacks["onIntentUpdated"]>
  >(
    ({ status }) => {
      setBanner({
        text: `Intent status updated: ${status}.`,
        tone: "info",
      });
    },
    [setBanner],
  );

  const onConnectionCreated = useCallback<
    NonNullable<RealtimeCallbacks["onConnectionCreated"]>
  >(
    ({ type }) => {
      setBanner({
        text:
          type === "group"
            ? "A new group connection is ready."
            : "A new direct connection is ready.",
        tone: "success",
      });
    },
    [setBanner],
  );

  const onModerationNotice = useCallback<
    NonNullable<RealtimeCallbacks["onModerationNotice"]>
  >(
    ({ reason }) => {
      setBanner({
        text: reason,
        tone: "error",
      });
    },
    [setBanner],
  );

  return useMemo(
    () => ({
      onConnectionCreated,
      onIntentUpdated,
      onModerationNotice,
      onRequestCreated,
      onRequestUpdated,
    }),
    [
      onConnectionCreated,
      onIntentUpdated,
      onModerationNotice,
      onRequestCreated,
      onRequestUpdated,
    ],
  );
}
