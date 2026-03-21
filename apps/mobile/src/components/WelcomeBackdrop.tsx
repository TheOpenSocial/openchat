import { useEvent } from "expo";
import { LinearGradient } from "expo-linear-gradient";
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
// Metro resolves video assets via `require()` (not ESM `import`).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- asset bundle
const WELCOME_VIDEO_BUNDLED =
  require("../../assets/video/welcome-bg.mp4") as number;

type WelcomeBackdropProps = {
  /** Extra style on the root (e.g. absolute fill). */
  style?: StyleProp<ViewStyle>;
  /**
   * Rendered above image/video/scrim. Keep interactive UI here: native video surfaces often draw
   * over sibling views outside this container (auth used to show only video + gradient).
   */
  children?: ReactNode;
};

/**
 * Full-bleed social mood: looping MP4 (bundled by default, or CDN via env) over an Unsplash still,
 * with a bottom-heavy scrim so copy and CTAs stay readable.
 */
export function WelcomeBackdrop({ children, style }: WelcomeBackdropProps) {
  const [videoFailed, setVideoFailed] = useState(false);

  const videoSource = useMemo<VideoSource>(
    () =>
      WELCOME_VIDEO_URI.length > 0 ? WELCOME_VIDEO_URI : WELCOME_VIDEO_BUNDLED,
    [WELCOME_VIDEO_URI],
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

  const showVideo = !videoFailed;

  return (
    <View pointerEvents="box-none" style={[styles.root, style]}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
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
          {...(Platform.OS === "android"
            ? { surfaceType: "textureView" as const }
            : {})}
        />
      ) : null}
      <LinearGradient
        accessibilityElementsHidden
        colors={["rgba(0,0,0,0.2)", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.88)"]}
        importantForAccessibility="no-hide-descendants"
        locations={[0, 0.42, 1]}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
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
