import { useEffect, useMemo, useState } from "react";
import { Text, type TextProps } from "react-native";

type TypingTextProps = TextProps & {
  text: string;
  typingDelayMs?: number;
  startDelayMs?: number;
  holdDelayMs?: number;
  loop?: boolean;
  cursor?: boolean;
};

export function TypingText({
  text,
  typingDelayMs = 42,
  startDelayMs = 120,
  holdDelayMs = 900,
  loop = true,
  cursor = true,
  ...props
}: TypingTextProps) {
  const [visibleLength, setVisibleLength] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    setVisibleLength(0);
  }, [text]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const schedule = (fn: () => void, delayMs: number) => {
      timeoutId = setTimeout(() => {
        if (!cancelled) {
          fn();
        }
      }, delayMs);
    };

    const typeNext = (index: number) => {
      schedule(
        () => {
          setVisibleLength(index);
          if (index < text.length) {
            typeNext(index + 1);
            return;
          }
          if (loop && text.length > 0) {
            schedule(() => {
              setVisibleLength(0);
              typeNext(1);
            }, holdDelayMs);
          }
        },
        index === 0 ? startDelayMs : typingDelayMs,
      );
    };

    if (text.length > 0) {
      typeNext(1);
    }

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [holdDelayMs, loop, startDelayMs, text, typingDelayMs]);

  useEffect(() => {
    if (!cursor) {
      return;
    }

    const intervalId = setInterval(() => {
      setShowCursor((current) => !current);
    }, 480);

    return () => clearInterval(intervalId);
  }, [cursor]);

  const renderedText = useMemo(() => {
    const base = text.slice(0, visibleLength);
    if (!cursor) {
      return base;
    }
    return `${base}${showCursor ? "|" : " "}`;
  }, [cursor, showCursor, text, visibleLength]);

  return <Text {...props}>{renderedText}</Text>;
}
