# Environment Variable Policy

- Required: `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Required for OAuth callback correctness: `GOOGLE_REDIRECT_URI`.
- Optional local defaults can exist only in `.env.example`.
- Optional media variables: `MEDIA_CDN_BASE_URL`, `MEDIA_UPLOAD_SIGNING_SECRET`.
- Optional operational hardening variables:
  - `INBOX_EXPIRE_STALE_CRON_KEY` (required in production to enable `POST /api/inbox/requests/expire-stale`)
  - `REALTIME_ALLOW_INSECURE_USER_ID` (dev/test only; ignored in production)
- Optional OpenAI routing variables:
  - `OPENAI_DEFAULT_MODEL`
  - `OPENAI_MODEL_INTENT_PARSING`
  - `OPENAI_MODEL_FOLLOW_UP_QUESTION`
  - `OPENAI_MODEL_SUGGESTION_GENERATION`
  - `OPENAI_MODEL_RANKING_EXPLANATION`
  - `OPENAI_MODEL_NOTIFICATION_COPY`
  - `OPENAI_MODEL_MODERATION_ASSIST`
- The per-task routing policy is documented in `docs/openai-model-policy.md`.
- Secret rotation is required every 90 days in production.
