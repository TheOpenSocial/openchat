# 07 — Matching and Routing

## Matching philosophy
Semantic similarity is necessary but insufficient. Routing must combine embeddings with deterministic product constraints and trust controls.

## Candidate retrieval pipeline
1. coarse filters
   - account active
   - not blocked
   - visibility permits
   - availability permits
   - locale / region constraints
2. embedding similarity
3. heuristic features
4. trust and abuse filters
5. diversity / saturation logic
6. fanout wave selection

## Retrieval features
- topic embedding similarity
- activity embedding similarity
- direct interest overlap
- recent responsiveness
- availability overlap
- timezone compatibility
- prior successful interaction adjacency
- trust score floor
- report/block exclusions
- recipient saturation / cooldown
- candidate freshness

## Ranking model v1
Weighted blend:
- semantic score
- availability score
- trust score
- responsiveness score
- novelty / fatigue adjustment
- distance score if location relevant

## Fanout strategy
Use waves:
- Wave 1: top 3–5 high-confidence candidates
- Wave 2: next tranche if no response in X minutes
- Wave 3: broaden scope if user allows

## Rate controls
- per-sender daily request caps
- per-recipient exposure caps
- per-topic spam throttles
- abnormal intent repetition detection

## Group matching
Group formation is not just N parallel 1:1 requests.
Need:
- minimum viable group size
- fallback thresholds
- expiry window
- quorum logic
- reserve candidates
- invite replacement strategy

## Cold-start handling
Use explicit profile interests + onboarding prompts + light embeddings until behavior data matures.

## Feedback loop
Post-connection feedback updates:
- trust score
- routing priors
- candidate responsiveness
- optional topic affinity
Never let feedback become opaque social credit. Keep it bounded and interpretable.
