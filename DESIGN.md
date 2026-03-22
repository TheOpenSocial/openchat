# OpenSocial Design Canon

## Purpose
`DESIGN.md` is the canonical frontend design reference for OpenSocial.

Use it when building or reviewing:
- `apps/web`
- `apps/admin`
- future shared frontend primitives

Legacy numbered design docs remain as product-spec references, but this file is the source of truth for implementation-facing design decisions.

## Product Posture
OpenSocial is not a feed, a community browser, or a social graph explorer.

It is:
- intent-first
- conversational
- transparent about system activity
- explicit-consent-only for human connection
- calm under uncertainty
- operationally trustworthy

Core rule:
- AI interprets, routes, explains, and safeguards
- AI never impersonates the user in human chat

## Design North Star
The visual reference is strict OpenAI / ChatGPT-style restraint adapted to OpenSocial's product.

That means:
- soft but disciplined surfaces
- strong hierarchy without loud decoration
- minimal chrome
- utility-first product layout
- sparse accent usage
- short, concrete copy
- interfaces that feel confident because they remove noise

This does not mean cloning OpenAI brand assets or reproducing exact page structures.

## Surface Families
### 1. Public Web / Auth
Goal:
- make the product understandable in one screen
- make the brand unmistakable
- preserve a premium, calm first impression

Rules:
- hero may be full-bleed
- constrain the copy/action column, not the hero plane
- one dominant visual idea
- no boxed auth-card composition as the primary impression
- supporting proof should be quiet and secondary
- avoid stacked frosted cards in the first viewport

### 2. Product App Surfaces
Goal:
- feel like a primary workspace, not a dashboard

Rules:
- one dominant working area per screen
- secondary context appears as a side rail, section, or inline detail
- cards are not the default container
- transcript, composer, status, and actions should read as one flow
- avoid dashboard-card mosaics and repeated bordered sub-panels

### 3. Admin / Operator Surfaces
Goal:
- support monitoring, inspection, and action with low cognitive drag

Rules:
- neutral internal-tool tone
- denser than the consumer product, but still readable
- section headers and dividers before cards
- cards only when they define a true interaction boundary
- use operational copy, not marketing copy
- no decorative gradients or branded theatrics behind routine workbench UI

## Typography
Use two roles at most:
- heading font for titles, screen labels, and emphasized product moments
- body font for controls, body copy, and dense operational content

Typography rules:
- the product or screen name should be the loudest text in its region
- headings should be short and scannable
- supporting copy should usually be one sentence
- operational labels should prioritize clarity over voice
- do not create hierarchy with color alone; use scale, weight, and spacing first

## Color and Accent
Color system priorities:
- dark neutral foundation for current web and admin surfaces
- one primary accent family
- status colors only for real state: success, warning, destructive, info

Rules:
- accents should direct attention, not decorate empty space
- avoid competing accent colors in the same area
- routine UI should stand on layout and contrast, not chroma
- use backgrounds and borders sparingly; do not outline every region

## Spacing, Shape, and Elevation
Defaults:
- generous outer spacing
- tighter inner spacing on dense admin controls
- rounded corners should feel modern but not inflated
- shadows should be soft and secondary

Rules:
- prefer separation by spacing and alignment before adding borders
- if removing a border keeps the meaning intact, remove it
- nested bordered containers should be rare
- repeated identical cards usually indicate the wrong layout primitive

## Layout Rules
### Shell anatomy
Public/product shells should generally be:
- top identity / nav
- primary workspace
- secondary context

Admin shells should generally be:
- left nav or persistent section nav
- top context / session strip
- content regions grouped by task

### Width strategy
- public hero: full-bleed allowed
- product workspace: readable max width, but do not over-box the main experience
- admin: wide working canvas with clear section grouping

### Cards
Cards are allowed only when:
- the region is independently actionable
- the region must be visually lifted from surrounding content
- the region represents a discrete object, snapshot, or result

Cards are forbidden when:
- they merely replace ordinary sections
- they create dashboard-card mosaics
- they box the main transcript/composer flow
- they are used only because spacing feels unresolved

## Component Guidance
### Buttons
- primary button is reserved for the next best action
- secondary and outline buttons support adjacent actions
- button groups should be short and obvious

### Inputs
- inputs should feel quiet and stable
- labels should be explicit, never clever
- avoid oversized field chrome

### Tabs and navigation
- navigation should be obvious without looking ornamental
- active state should rely on contrast and position more than bright fills

### Alerts and notices
- use for state changes, failures, or important confirmations
- keep copy short and specific

### Lists and rows
- prefer list rows for requests, chats, runs, sessions, and queue items
- use dividers and spacing before boxed row cards

### Transcript items
- transcript should feel like a continuous conversation
- user, system, workflow, and error states should be distinguishable without becoming colorful noise

### Panels
- admin panels should have clear responsibilities
- if a panel contains multiple unrelated jobs, split it
- if a panel is just a wrapper around ordinary form rows, flatten it

## Copy Rules
Write like a reliable system, not a character.

Prefer:
- direct
- concrete
- transparent
- low-ego
- high-signal

Avoid:
- anthropomorphic AI claims
- hype language
- pseudo-psychology
- vague marketing filler
- “magic” framing

Examples:
- good: "2 compatible candidates were notified."
- good: "No strong matches are available right now."
- bad: "Our AI found your perfect vibe."

## Motion
Motion should create clarity and presence, not novelty.

Allowed:
- subtle entrance sequences
- smooth state transitions
- restrained emphasis on focus, navigation, and loading

Avoid:
- ornamental floating effects
- repeated pulse animations for non-critical UI
- motion that competes with reading or input

Reduced motion:
- all meaningful flows must remain understandable with reduced motion enabled

## Responsiveness and Accessibility
Required:
- keyboard navigation
- visible focus states
- WCAG AA contrast targets
- reduced motion support
- readable mobile layout without horizontal scrolling
- dynamic text tolerance where possible

Responsive rules:
- product screens should preserve one dominant area on mobile, not collapse into a card pile
- admin may stack more aggressively on narrow widths, but hierarchy must remain obvious
- sticky headers/sidebars must not consume the full first viewport

## Implementation Guidance
When refactoring or adding UI:
- derive decisions from this file first
- introduce shared layout primitives before inventing bespoke one-off wrappers
- prefer semantic tokens and reusable spacing patterns
- keep `packages/ui` minimal unless a primitive is truly shared

## Reject These Failures
- boxed landing hero with a narrow auth-column first impression
- product home built from large stacked cards
- dashboard-card mosaics for conversational flows
- decorative admin chrome that weakens scanning
- repeated bordered sub-panels inside bordered panels
- pages that feel like generic SaaS templates
- support copy that repeats the headline without adding meaning
- multiple accents fighting for attention in one viewport
