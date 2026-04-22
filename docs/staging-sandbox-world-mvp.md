# Staging Sandbox World MVP

This helper is for staging operators who want a persistent synthetic world to test matching, chats, notifications, and home-thread behavior without hand-crafting `curl` calls.

## Command

```bash
pnpm staging:sandbox-world -- --action=all
```

## Required environment

- `SMOKE_BASE_URL` or `STAGING_API_BASE_URL`
- `SMOKE_ADMIN_USER_ID` or `STAGING_SMOKE_ADMIN_USER_ID`
- `SMOKE_ADMIN_ROLE` or `STAGING_SMOKE_ADMIN_ROLE`
- `SMOKE_ADMIN_API_KEY` or `STAGING_SMOKE_ADMIN_API_KEY` when the admin API key is enforced

## Default world

- `design-sandbox-v1`
- focal user: the resolved admin user id unless you pass `--focal-user-id`

## Supported actions

- `create`
- `get`
- `join`
- `tick`
- `reset`
- `all` runs the full lifecycle in order

## Examples

Create the world and print the resulting record:

```bash
pnpm staging:sandbox-world -- --action=create
```

Join your staging user into the world:

```bash
pnpm staging:sandbox-world -- --action=join --focal-user-id=11111111-1111-4111-8111-111111111111
```

Advance one synthetic tick:

```bash
pnpm staging:sandbox-world -- --action=tick
```

Reset the world:

```bash
pnpm staging:sandbox-world -- --action=reset
```

Dry-run the requests without touching staging:

```bash
pnpm staging:sandbox-world -- --action=all --dry-run=1
```

## Output

The helper prints each response as formatted JSON and writes an artifact to:

```text
.artifacts/staging-sandbox-world/<timestamp>.json
```

That artifact is useful for sharing the exact world state with frontend and mobile work.
