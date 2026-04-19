# Video Transcripts Production Checklist

This checklist is for the public `https://app.opensocial.so/video` flow that:

1. uploads a video to object storage,
2. queues a background transcript job,
3. extracts audio with `ffmpeg`,
4. transcribes via OpenAI,
5. stores a `.md` transcript and returns a temporary download link.

## Required Runtime Dependencies

- API runtime image must include `ffmpeg` and `ffprobe`.
- `OPENAI_API_KEY` must be present in the production env file.
- `S3_BUCKET` must be configured and reachable from the API container.
- `S3_PRESIGNED_UPLOADS_ENABLED=true` should be enabled in production.
- `MEDIA_UPLOAD_SIGNING_SECRET` or `MEDIA_SIGNING_SECRET` must be set.
- Valkey/Redis must be healthy because transcript processing is queued through Bull.

## Required Bucket Behavior

- Browser `PUT` uploads must be allowed from `https://app.opensocial.so`.
- Object reads/writes for transcript artifacts must be allowed from the API service.
- The production bucket CORS should allow:
  - `PUT`
  - `GET`
  - `HEAD`
  - `content-type` header

## Required Deploy Wiring

- `VIDEO_TRANSCRIPTS_MAX_BYTES` should be synced into the runtime env file.
- Production deploy health checks should verify:
  - `https://app.opensocial.so/video` returns `200`
  - `https://api.opensocial.so/public/video-transcripts/upload-intent` returns `400` for an empty probe payload

## Capacity Guidance

- A `t3.small` is functional for low-volume testing but is not comfortable for sustained video transcription traffic.
- Recommended baseline for production traffic: `t3.medium` or larger.
- Keep at least `10 GB` of free disk for temporary video/audio artifacts and image rebuild headroom.
- If multiple concurrent transcripts are expected, move transcript jobs into a dedicated worker service or separate host.

## Timeout and Reliability Guidance

- The user-facing upload and job-creation requests should stay short.
- The long-running transcript work must remain in the queue worker path.
- Avoid putting a strict Bull job timeout on transcript jobs until real duration data is known.
- Add retries for transient OpenAI/storage failures, but avoid duplicate output writes.
- Monitor for:
  - low disk space
  - high memory pressure
  - long queue lag
  - repeated OpenAI transcript failures

## First Staging Verification

Before enabling broad production use:

1. Deploy the updated API image with `ffmpeg`.
2. Confirm `/video` loads publicly.
3. Upload a real `.mp4` through the web UI.
4. Confirm the upload reaches object storage.
5. Confirm the Bull job moves from `queued` to `processing` to `completed`.
6. Open the temporary `.md` link and verify transcript contents.
7. Test one large video that forces chunking.
8. Test one video with an audio format that forces conversion.
