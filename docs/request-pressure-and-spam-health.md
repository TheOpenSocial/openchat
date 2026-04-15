---
title: Request Pressure and Spam Health
description: Audit of fanout limits, spam controls, recipient pressure, and the next guardrails needed to keep matching healthy.
---

# Request Pressure and Spam Health

This audit answers a very practical product question:

> If someone says they are up to meet someone right now, how do we avoid blasting them or everyone else with too many requests?

Short answer:

- we already have meaningful **sender-side fanout caps**
- we already have **API abuse throttles**
- we already have some **recipient choice controls**
- we now have a **recipient inbound pressure guard** in matching
- we still do **not yet have broader market-balancing and operator visibility**

That means the system will not send "thousands of options" immediately, and it now suppresses recipients who are already carrying too much inbound request load. The remaining risk is slower market skew over time, not immediate pile-on fanout.

## Current Guardrails

### 1. First-wave fanout is capped

The current matcher does not fan out to every candidate it finds.

In [/Users/cruciblelabs/Documents/openchat/apps/api/src/intents/intents.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/intents/intents.service.ts):

- `BASE_ONE_TO_ONE_FANOUT_CAP = 3`
- `BASE_GROUP_FANOUT_CAP = 5`

This means:

- a one-to-one intent sends at most **3** first-wave requests
- a group intent sends at most **5**, and also respects the requested group size

So for the specific example:

- a woman says she is open to meeting someone
- the system ranks candidates
- it sends **up to 3** first-wave requests, not hundreds or thousands

### 2. Sender-side quota protects the market from over-broadcasting

Also in [/Users/cruciblelabs/Documents/openchat/apps/api/src/intents/intents.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/intents/intents.service.ts):

- `MAX_PENDING_OUTGOING_REQUESTS_PER_SENDER = 12`
- `MAX_DAILY_OUTGOING_REQUESTS_PER_SENDER = 30`

`computeFanoutCap(...)` clamps outreach by:

- candidate count
- first-wave cap
- remaining pending quota
- remaining daily quota

This is a strong protection against one sender flooding the network.

### 3. The matcher suppresses re-sending to recent rejects and already-pending recipients

In [/Users/cruciblelabs/Documents/openchat/apps/api/src/matching/matching.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/matching/matching.service.ts):

- recent rejected recipients for the same sender are suppressed
- already-pending recipients for the same sender are suppressed

So the sender does not keep cycling the same targets during active outreach.

### 4. Duplicate request creation is prevented during fanout

In [/Users/cruciblelabs/Documents/openchat/apps/api/src/intents/intents.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/intents/intents.service.ts):

- existing requests for the same `intentId` + `recipientUserId` are loaded
- only non-existing rows are inserted into `intentRequest`

That reduces accidental replay spam during retries and queue reprocessing.

### 5. Recipients already have some control

In [/Users/cruciblelabs/Documents/openchat/apps/api/src/inbox/inbox.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/inbox/inbox.service.ts):

- pending requests can be declined in bulk
- pending requests can be snoozed
- snoozed requests are hidden while the snooze is active

In [/Users/cruciblelabs/Documents/openchat/apps/api/src/matching/matching.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/matching/matching.service.ts):

- global contact preferences are respected
- `verified_only` / `trusted_only` is respected
- `available_only` / `do_not_disturb` reachability preferences are respected
- intent mode compatibility is respected

This helps recipients avoid unwanted contact patterns, but it is not the same as load balancing.

### 6. API abuse throttling is already present

In [/Users/cruciblelabs/Documents/openchat/apps/api/src/common/request-security.middleware.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/common/request-security.middleware.ts):

- global request limits exist
- write-path limits exist
- auth-path limits exist
- abuse scoring and temporary blocks exist

This helps with scripted or burst abuse, especially on high-risk write routes like:

- `/api/intents`
- `/api/inbox/requests`
- `/api/chats`

## Newly Added Guardrail

### Recipient inbound pressure is now bounded in matching

The matcher now applies recipient-side load protection before ranking can keep recycling the same overloaded people.

In [/Users/cruciblelabs/Documents/openchat/apps/api/src/matching/matching.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/matching/matching.service.ts):

- recipients are suppressed when pending inbound requests reach the configured cap
- recipients are suppressed when rolling daily inbound requests reach the configured cap
- recipients below those hard caps still receive a soft score penalty as they get closer to saturation

Current defaults:

- `MATCHING_MAX_PENDING_INBOUND_REQUESTS_PER_RECIPIENT = 6`
- `MATCHING_MAX_DAILY_INBOUND_REQUESTS_PER_RECIPIENT = 12`

This is the main direct safeguard against one highly responsive or highly visible person being hit over and over.

## What Is Still Missing

### Recipient-side load protection is better, but still basic

The matcher calculates recipient reliability in [/Users/cruciblelabs/Documents/openchat/apps/api/src/matching/matching.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/matching/matching.service.ts):

- response rate
- acceptance rate
- follow-through rate

That helps quality. Now, on top of that, the matcher also suppresses recipients with excessive inbound pressure and penalizes recipients who are approaching saturation.

In practice, this means:

- the system protects the sender from over-sending
- and it now protects recipients from the most obvious pile-on behavior
- but it still does not fully optimize for global market fairness over time

### There is no explicit diversity quota in fanout

The current system optimizes for best candidates and reliability, which is good, but it does not explicitly diversify away from:

- repeatedly selected top responders
- overloaded local clusters
- highly visible users who attract disproportionate demand

This is a health issue, not just a spam issue.

## Current Risk Assessment

### For the concrete example

If one woman says she is available to meet someone:

- the system will **not** send her thousands of options
- it will send **up to 3** one-to-one first-wave requests
- it will not exceed **12 pending outgoing** or **30 daily outgoing** requests for that sender

So the immediate "blast radius" is already bounded.

### But the broader market risk still exists

If many senders are active and the same recipient keeps ranking well:

- that recipient can still absorb too much inbound demand over time
- the system may remain "locally healthy" per sender while still becoming unhealthy per recipient

That is the core problem we still need to solve.

## Recommended Next Guardrails

These are the highest-confidence next controls.

### 1. Add an inbound pending cap per recipient

Add a matcher hard filter or strong suppression rule such as:

- exclude recipients with more than `N` pending inbound requests

Suggested starting point:

- `MAX_PENDING_INBOUND_REQUESTS_PER_RECIPIENT = 6`

Reason:

- simple
- easy to explain
- directly protects recipients from pile-on behavior

### 2. Add a rolling inbound daily cap per recipient

Add a second filter such as:

- suppress recipients who received more than `N` new requests in the last 24 hours

Suggested starting point:

- `MAX_DAILY_INBOUND_REQUESTS_PER_RECIPIENT = 12`

Reason:

- prevents slow-burn overload even when pending requests are quickly resolved

### 3. Add recipient cooldown weighting

Even below the hard cap, apply a score penalty for recipients with elevated recent inbound load.

Example:

- 0 to 2 recent inbound requests: no penalty
- 3 to 5: mild penalty
- 6+: heavy penalty or suppression

Reason:

- keeps matching healthy without making the market feel empty too early

### 4. Separate "high quality" from "currently available capacity"

Reliability is useful, but it should not be treated as infinite recipient availability.

The matcher should combine:

- quality
- compatibility
- trust
- current inbound capacity

Right now current inbound capacity is the missing dimension.

### 5. Surface recipient pressure in admin and ops views

This should show up in operator tooling as:

- pending inbound requests by recipient
- daily inbound requests by recipient
- recipients repeatedly selected in top fanout waves
- request pressure by geography / cohort / intent type

Without this, market-health problems are easy to miss until users complain.

## Recommendation for Manual Testing

Before changing ranking logic broadly, validate these cases manually:

1. A new one-to-one intent should fan out to at most 3 recipients.
2. A sender with many open requests should hit the pending/daily cap and stop fanout.
3. A recipient with snoozed requests should see those requests hidden.
4. Recent rejects should not be immediately retried for the same sender.
5. Replays and retries should not duplicate request rows for the same intent/recipient pair.

## Decision Summary

Current state:

- good sender-side protection
- good abuse throttling
- acceptable duplicate suppression
- recipient-side load protection is now present
- broader market-balancing is still limited

Recommended priority:

1. admin visibility on request pressure
2. recipient-load analytics and alerting
3. broader market-balancing and diversity controls
4. tuning the inbound caps from production behavior

If we do only one thing next, it should be:

- **add operator visibility for recipient pressure in admin and ops surfaces**

That is the highest-leverage next change for keeping the system healthy under real usage without flying blind.
