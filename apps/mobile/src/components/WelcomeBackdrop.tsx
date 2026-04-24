import { useEvent } from "expo";
import { useVideoPlayer, VideoView, type VideoSource } from "expo-video";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  WELCOME_IMAGE_FALLBACK_URI,
  WELCOME_VIDEO_URI,
} from "../constants/welcome-backdrop";

/** Bundled Pexels-derived loop (15s, ~960p short side, muted); see `docs/welcome-backdrop.md`. */
const WELCOME_VIDEO_BUNDLED =
  // Metro resolves video assets via `require()` (not ESM `import`).
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- asset bundle
  require("../../assets/video/welcome-bg.mp4") as number;

type WelcomeBackdropProps = {
  /** Extra style on the root (e.g. absolute fill). */
  style?: StyleProp<ViewStyle>;
  /** Stable selector for E2E coverage of the preserved video landing. */
  testID?: string;
  /** Optional onboarding/auth-specific local or remote video source override. */
  videoSourceOverride?: VideoSource;
  /**
   * Rendered above image/video/scrim. Keep interactive UI here: native video surfaces often draw
   * over sibling views outside this container (auth used to show only video + gradient).
   */
  children?: ReactNode;
};

/**
 * Full-bleed background: still + looping muted video (bundled or CDN). Gradient scrim lives in the
 * sign-in stack (`SignInGradientOverlay`) so the video stays the hero layer.
 */
export function WelcomeBackdrop({
  children,
  style,
  testID,
  videoSourceOverride,
}: WelcomeBackdropProps) {
  const [videoFailed, setVideoFailed] = useState(false);

  const videoSource = useMemo<VideoSource>(
    () =>
      videoSourceOverride ??
      (WELCOME_VIDEO_URI.length > 0
        ? WELCOME_VIDEO_URI
        : WELCOME_VIDEO_BUNDLED),
    [videoSourceOverride],
  );

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });

  useEffect(() => {
    if (status === "error") {
      setVideoFailed(true);
    }
  }, [status]);

  // Initial play() in useVideoPlayer setup can run before the asset is ready; ensure loop + autoplay
  // once buffered (especially for remote EXPO_PUBLIC_WELCOME_VIDEO_URI).
  useEffect(() => {
    if (status !== "readyToPlay") return;
    player.loop = true;
    player.muted = true;
    player.play();
  }, [status, player]);

  const showVideo = !videoFailed;

  return (
    <View pointerEvents="box-none" style={[styles.root, style]} testID={testID}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        testID={testID ? `${testID}-fallback-image` : undefined}
      >
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={{ uri: WELCOME_IMAGE_FALLBACK_URI }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {showVideo ? (
        <VideoView
          accessibilityElementsHidden
          contentFit="cover"
          importantForAccessibility="no-hide-descendants"
          nativeControls={false}
          player={player}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          testID={testID ? `${testID}-video` : undefined}
          {...(Platform.OS === "android"
            ? { surfaceType: "textureView" as const }
            : {})}
          {...(Platform.OS === "web" ? { playsInline: true as const } : {})}
        />
      ) : null}
      {children != null ? (
        <View
          collapsable={false}
          pointerEvents="box-none"
          style={styles.foreground}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    backgroundColor: "#0a0a0a",
  },
  foreground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    ...Platform.select({ android: { elevation: 8 } }),
  },
});
