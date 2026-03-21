# Welcome screen backdrop (video + image)

## Default (no env)

- A **bundled** looping MP4 (`assets/video/welcome-bg.mp4`) — 15s, ~960px short side, H.264, no audio, ~500KB — derived from [Pexels #10610204](https://www.pexels.com/video/woman-closing-mobile-phone-and-sitting-with-women-10610204/) (respect Pexels license / attribution as required).
- Under it: a full-screen **Unsplash** still (friends scene) so there is always a frame if the video fails.
- Dark **gradient** on top for readable copy.

The app plays the video **muted**, **looped**, **cover** via [`expo-video`](https://docs.expo.dev/versions/latest/sdk/video/) (`VideoView` + `useVideoPlayer`). If loading fails, only the Unsplash image shows.

## Optional: replace with your own hosted file

**Do not hotlink `videos.pexels.com`** — many CDNs return **403** to mobile user agents.

1. Download or produce an MP4.
2. Host on **your** HTTPS origin (S3, R2, etc.).
3. Set:

```bash
EXPO_PUBLIC_WELCOME_VIDEO_URI=https://your-cdn.example.com/opensocial/welcome-loop.mp4
```

## Re-encoding the bundled asset

From a source `.mp4` (example: first 15s, portrait-friendly size, small bundle):

```bash
ffmpeg -y -i source.mp4 -t 15 -vf "scale=-2:960,fps=24" -an \
  -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -movflags +faststart \
  apps/mobile/assets/video/welcome-bg.mp4
```
