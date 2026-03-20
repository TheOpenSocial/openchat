# 04 — Design System

## Product posture
The UI should feel:
- calm
- minimal
- direct
- low-friction
- high-signal
- confidence-building

## Information hierarchy
1. what the user wants
2. whether the system understood it
3. what is happening right now
4. whether anyone accepted
5. what the next action is

## Primary surfaces
### Home / Composer
Single high-priority input:
“What do you want to do or talk about?”

Supporting affordances:
- suggested prompts
- recent intents
- availability state
- trust / safety cues

### Routing status
Show:
- parsed intent summary
- number of requests sent
- pending / accepted / expired states
- estimated next steps

### Requests inbox
For recipients:
- compact summary card
- why this reached them
- accept / decline / snooze
- abuse / mute actions

### Chat
- direct human-to-human messaging
- clear profile context
- trust and report affordances
- optional plan context header

### Profile
- display name
- avatar
- optional bio
- interests/topics
- activities
- availability defaults
- privacy settings

## Tone
- concrete
- never overclaiming
- transparent about what the system is doing
- not anthropomorphized as a fake friend
- not “AI magic” copy

## Copy rules
Avoid:
- “our AI found your soulmate”
- “the agent thinks you two will vibe”
- hidden certainty or pseudo-psychology

Prefer:
- “We found people currently open to this topic.”
- “3 compatible candidates were notified.”
- “Lucas accepted your request.”

## Accessibility
- keyboard navigable
- semantic HTML where applicable
- WCAG AA contrast targets
- reduced-motion support
- readable state transitions
- screen-reader-friendly real-time updates

## Mobile priority
This product is fundamentally conversational and notification-driven; mobile UX should be first-class.
