import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LoadingModal } from "../components/LoadingModal";

type UseLoadingModalOptions = {
  initialMessage?: string;
  minVisibleMs?: number;
};

export function useLoadingModal(options: UseLoadingModalOptions = {}) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState(
    options.initialMessage ?? "Loading...",
  );
  const shownAtRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((nextMessage?: string) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (nextMessage) {
      setMessage(nextMessage);
    }
    shownAtRef.current = Date.now();
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    const minVisibleMs = options.minVisibleMs ?? 0;
    const shownAt = shownAtRef.current;

    if (!shownAt || minVisibleMs <= 0) {
      setVisible(false);
      return;
    }

    const remainingMs = Math.max(0, minVisibleMs - (Date.now() - shownAt));

    if (remainingMs === 0) {
      setVisible(false);
      return;
    }

    hideTimeoutRef.current = setTimeout(() => {
      hideTimeoutRef.current = null;
      setVisible(false);
    }, remainingMs);
  }, [options.minVisibleMs]);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const loadingModal = useMemo(
    () => <LoadingModal message={message} visible={visible} />,
    [message, visible],
  );

  return {
    hide,
    loadingModal,
    message,
    setMessage,
    show,
    visible,
  };
}
