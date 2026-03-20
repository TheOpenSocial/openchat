# 03 — User Flows

## Flow A — Topic chat
1. User enters: “I want to talk about yesterday’s football match.”
2. System parses:
   - type: chat
   - topic: football / specific match
   - urgency: now
3. System retrieves candidates:
   - users interested in football
   - active recently
   - accepting chat intents
4. System ranks candidates.
5. System sends opt-in requests to top N.
6. Candidate accepts.
7. Direct chat opens.
8. Post-chat lightweight feedback is captured.

## Flow B — Activity pairing
1. User enters: “Anyone for table tennis tonight after 7?”
2. System parses:
   - type: activity
   - activity: table tennis
   - time window: tonight / after 7
3. System applies location and availability constraints.
4. Top candidates receive request.
5. One or more accept.
6. User selects or confirms.
7. Connection opens; optional plan confirmation follows.

## Flow C — Group formation
1. User enters: “Need 4 people for poker tonight.”
2. System parses group intent.
3. Matching service finds candidate set.
4. Requests are sent in waves until minimum viable group is formed.
5. Temporary group room is created.
6. Expiry timers close stale requests automatically.

## Flow D — Passive availability
1. User toggles: “Open to talk about startups tonight.”
2. System converts this into a standing signal.
3. Incoming compatible intents can route to this user.
4. User can pause or scope this signal anytime.

## Flow E — Decline / ignore
1. Candidate receives request.
2. Candidate can:
   - accept
   - decline
   - snooze
   - mute topic / requester
3. System updates routing preferences and trust features accordingly.

## Flow F — Safety interruption
1. User reports or blocks during or after a connection.
2. Moderation workflow triggers.
3. Trust score updates.
4. Future routing excludes blocked parties.
5. Severe cases trigger suspension / review.

## Edge cases
### No candidates found
Return:
- no strong matches available now
- ask for wider time/location/topic scope
- optionally create a persistent intent for future matching

### No acceptances
- retry with second wave
- notify user of status
- allow edit/resubmit
- optionally suggest adjacent intents

### Candidate churn
- handle accept->cancel
- keep waitlist if available
- maintain audit trail for requests and connections
