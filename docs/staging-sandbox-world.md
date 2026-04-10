# Staging Sandbox World

The staging sandbox world is a persistent, product-visible fixture for end-to-end testing. It is separate from the eval-only social simulation lane.

## World

- `design-sandbox-v1`

It seeds:

- synthetic users with stable identities
- direct and group chats
- a focal home-thread conversation
- notifications
- one active intent with requests

## Requirements

Set one of these base URL variables:

- `PLAYGROUND_BASE_URL`
- `SMOKE_BASE_URL`
- `STAGING_API_BASE_URL`

Set admin credentials with one of these variable families:

- `PLAYGROUND_ADMIN_USER_ID` / `PLAYGROUND_ADMIN_API_KEY`
- `SMOKE_ADMIN_USER_ID` / `SMOKE_ADMIN_API_KEY`
- `STAGING_SMOKE_ADMIN_USER_ID` / `STAGING_SMOKE_ADMIN_API_KEY`

Optional:

- `PLAYGROUND_ADMIN_ROLE` or `SMOKE_ADMIN_ROLE`

## Commands

Create the world:

```bash
pnpm playground:sandbox -- --action=create --world-id=design-sandbox-v1 --reset=1
```

Attach your real staging user:

```bash
pnpm playground:sandbox -- --action=join --world-id=design-sandbox-v1 --focal-user-id=<your-staging-user-uuid>
```

Inspect current state:

```bash
pnpm playground:sandbox -- --action=get --world-id=design-sandbox-v1
```

Inspect the current daily-loop read models for the joined focal user:

```bash
pnpm playground:sandbox -- --action=inspect --world-id=design-sandbox-v1
```

Advance the world by one synthetic step:

```bash
pnpm playground:sandbox -- --action=tick --world-id=design-sandbox-v1 --note="Maya confirmed Thursday evening works."
```

Jump to a named scenario:

```bash
pnpm playground:sandbox -- --action=scenario --world-id=design-sandbox-v1 --scenario=baseline
pnpm playground:sandbox -- --action=scenario --world-id=design-sandbox-v1 --scenario=waiting_replies
pnpm playground:sandbox -- --action=scenario --world-id=design-sandbox-v1 --scenario=activity_burst
pnpm playground:sandbox -- --action=scenario --world-id=design-sandbox-v1 --scenario=stalled_search
```

Validate a named scenario against the daily-loop contract:

```bash
pnpm playground:sandbox:validate -- --world-id=design-sandbox-v1 --scenario=baseline
pnpm playground:sandbox:validate -- --world-id=design-sandbox-v1 --scenario=waiting_replies
pnpm playground:sandbox:validate -- --world-id=design-sandbox-v1 --scenario=activity_burst
pnpm playground:sandbox:validate -- --world-id=design-sandbox-v1 --scenario=stalled_search
```

Run the full staging validation lane in GitHub Actions:

- Workflow: `Staging Sandbox Validation`
- Validates:
  - `baseline`
  - `waiting_replies`
  - `activity_burst`
  - `stalled_search`
- Optional:
  - `prepare_world=true`
  - `focal_user_id=<your-staging-user-uuid>`

This workflow uploads one JSON artifact per scenario plus a combined markdown summary.

Reset the world:

```bash
pnpm playground:sandbox -- --action=reset --world-id=design-sandbox-v1
```

## Practical flow

1. Deploy the API to staging.
2. Create or reset the world.
3. Join your real staging user into the world.
4. Open mobile or web on staging.
5. Use `tick` to generate more activity while testing notifications, chats, and home-thread behavior.
6. Use `scenario` to jump directly between baseline, waiting, burst, and stalled-search states.
