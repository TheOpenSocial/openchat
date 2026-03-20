# 02 — Core Concepts

## Intent
A user-authored expression of what they want to do, talk about, or organize.

Examples:
- chat intent
- activity intent
- group formation intent
- availability signal
- recurring intent

## Candidate
A user who may be a good fit for an intent based on:
- topic similarity
- activity preference similarity
- availability
- location proximity if applicable
- trust score
- recent responsiveness
- prior interaction signals

## Match Request
A scoped opt-in prompt sent to candidate users. It is not a chat message. It is a product-level consent request.

Example:
“Jeff wants to talk about yesterday’s match. Interested?”

## Connection
A chat or group room created only after one or more candidates accept.

## Availability
User-configurable or inferred state indicating openness to incoming requests:
- now
- later today
- flexible
- away
- invisible / paused

## Trust Score
A composite score used for routing and safety, derived from:
- account maturity
- verified login status
- successful connections
- report history
- block history
- response patterns
- moderation outcomes

## Routing
The full process from raw user input to:
- parsed intent
- candidate retrieval
- ranking
- request fanout
- acceptance handling
- connection creation

## Human-only conversation boundary
Once a connection is created, messaging is user-to-user. AI may assist off to the side later, but not within the live conversation channel by default.

## Soft request vs hard request
- Soft request: candidate sees summary and can opt in or ignore
- Hard request: reserved for preexisting trust edges or special product contexts, not default V1

## Social graph
The product’s internal graph of:
- users
- interests
- activities
- prior interactions
- trust edges
- successful connection edges
- latent similarity via embeddings
