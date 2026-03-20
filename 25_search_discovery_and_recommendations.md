# Search, Discovery & Recommendations

## Goal

Support two complementary modes:
1. **Intent-driven routing** (core)
2. **Passive discovery** (secondary)

The product is not feed-first, but users still need:
- people discovery
- topic discovery
- recommended circles/groups later
- nearby activity opportunities
- search by topic or activity

---

## Modes

### A. Explicit Intent Mode
User types:
- "I want to talk about the match"
- "Anyone for table tennis tonight?"

System routes immediately.

### B. Passive Discovery Mode
User browses:
- people you may want to connect with
- topics active now
- nearby activities today
- groups forming soon

This must stay sparse and high-signal.

---

## Search Surfaces

### Topic Search
- football
- startup
- Valorant
- table tennis

### Activity Search
- gaming
- sports
- coworking
- conversation

### User Search
- by handle, name, or shared interests

### Future Group Search
- circles
- planned activities
- recurring clusters

---

## Recommendation Types

- candidate people for a given intent
- people likely to accept current user's intent
- high-probability group combinations
- dormant connections worth reviving
- topic/activity opportunities based on rules

---

## Recommendation Inputs

- semantic similarity
- availability overlap
- historical acceptance rate
- topic affinity
- group compatibility
- trust score
- personalization rules
- location proximity (coarse)
- recency/activity freshness

---

## Retrieval Architecture

### Primary Retrieval
- pgvector similarity on user/profile embeddings
- full-text search for topics/interests/bios
- SQL filters for trust, availability, geography

### Secondary Re-Ranking
Use model-assisted re-ranking for:
- top N candidates only
- explanation generation
- group composition quality

Do not use a reasoning model on the full corpus.

---

## Discovery Guardrails

- never expose users who opted out of discovery
- do not surface blocked/muted users
- respect age/location policy
- avoid infinite scroll
- cap novelty rate

---

## Explanation Layer

Users should see lightweight reasons:
- shared football interest
- active now
- nearby tonight
- usually accepts gaming requests
- you both prefer 1:1 chats

This explanation should come from deterministic features first, model wording second.

---

## Metrics

- discovery to request conversion
- passive recommendation acceptance rate
- time to first successful connection
- repeat connection rate
- exploration acceptance rate
