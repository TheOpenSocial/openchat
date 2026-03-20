# OpenSocial — Technical Product Spec (TypeScript + OpenAI API)

## 1. Objective

Build an intent-driven social product where users describe what they want to do or talk about in natural language and the system routes that intent to the right humans.

Examples:
- “I want to talk about yesterday’s match.”
- “Anyone to play table tennis today?”
- “Looking for chill Valorant players now.”
- “I want 4 people for poker tonight.”

The system should:
1. Parse the intent.
2. Classify it.
3. Retrieve relevant users.
4. Ask those users to opt in.
5. Open a direct human-to-human chat once accepted.

The system should **not** impersonate users or auto-chat on their behalf.

---

## 2. Product Scope

### In scope for V1
- User profiles
- Natural-language intent submission
- Intent parsing with OpenAI
- Semantic matching against user profiles
- Opt-in match requests
- 1:1 chat after acceptance
- Post-interaction feedback

### Out of scope for V1
- Feed / posts / followers
- Public communities
- Autonomous agents chatting as users
- External social-network APIs
- External recommendation APIs

---

## 3. Technical Principles

1. **TypeScript end-to-end**
   - Frontend: React / Next.js or React Native
   - Backend: Node.js + TypeScript
2. **OpenAI only for AI workloads**
   - Responses API for intent parsing and classification
   - Structured Outputs for guaranteed JSON
   - Embeddings for semantic similarity
3. **No external APIs required for core product**
   - All social graph and matching data lives in our own database
4. **Human-authenticity first**
   - AI interprets and routes
   - Humans converse
5. **Consent-first**
   - No direct unsolicited chat opens
   - Every connection requires recipient opt-in

---

## 4. Recommended Architecture

```text
Client Apps
  ├─ Web App (Next.js)
  └─ Mobile App (React Native)

Backend (Node.js + TypeScript)
  ├─ API Gateway / BFF
  ├─ Auth Service
  ├─ User/Profile Service
  ├─ Intent Service
  ├─ Matching Service
  ├─ Outreach Service
  ├─ Chat Service
  ├─ Feedback Service
  └─ AI Service (OpenAI wrapper)

Storage
  ├─ PostgreSQL
  ├─ Redis
  └─ Vector store (pgvector in PostgreSQL)
```

### Why this architecture
- PostgreSQL gives strong transactional guarantees for users, intents, match requests, chats, and feedback.
- Redis is useful for ephemeral state, throttling, queues, and presence.
- `pgvector` keeps semantic matching in the same persistence layer without introducing another external dependency.

---

## 5. OpenAI API Role in the System

### Use OpenAI for
1. Intent parsing
2. Intent classification
3. Topic extraction
4. Constraint extraction
5. Embeddings for semantic matching
6. Optional summarization / moderation support later

### Do **not** use OpenAI for
1. Sending messages on behalf of users
2. Simulating human chat without user approval
3. Core transactional system logic
4. Deterministic authorization or security decisions

---

## 6. OpenAI API Choices

### 6.1 Primary API surface
Use the **Responses API** as the main integration surface.

Why:
- It is the unified API for agent-like and multi-turn applications.
- It supports multi-turn conversation patterns.
- It works well with tool use and structured outputs.

### 6.2 Structured output
Use **Structured Outputs** so intent parsing returns strict JSON, not free text.

### 6.3 Embeddings
Use **Embeddings API** to embed:
- user bios
- user interests
- activity preferences
- intent text
- optional historical successful interactions

### 6.4 Function tools
Use **function calling** only where the model must request internal actions such as:
- search candidate users
- create match requests
- fetch user availability

For V1, much of this can remain in deterministic backend code, with OpenAI primarily used for interpretation and ranking inputs.

---

## 7. Core Domain Model

```ts
export type AvailabilityWindow = 'now' | 'today' | 'tonight' | 'this_week' | 'flexible';
export type IntentType = 'chat' | 'activity' | 'group';
export type MatchRequestStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type ConnectionStatus = 'open' | 'closed';
```

### 7.1 User

```ts
export interface User {
  id: string;
  username: string;
  displayName: string;
  age?: number;
  language: string;
  city?: string;
  isActive: boolean;
  reputationScore: number;
  createdAt: string;
  updatedAt: string;
}
```

### 7.2 UserProfile

```ts
export interface UserProfile {
  userId: string;
  bio: string;
  interests: string[];
  topics: string[];
  activityPreferences: string[];
  availability: AvailabilityWindow[];
  profileEmbedding?: number[];
  visibility: 'public' | 'limited';
  updatedAt: string;
}
```

### 7.3 Intent

```ts
export interface Intent {
  id: string;
  userId: string;
  rawText: string;
  type: IntentType;
  topics: string[];
  intentLabel: string;
  urgency: AvailabilityWindow;
  city?: string;
  constraints: Record<string, string | number | boolean | string[]>;
  embedding?: number[];
  status: 'open' | 'matched' | 'expired' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}
```

### 7.4 MatchRequest

```ts
export interface MatchRequest {
  id: string;
  intentId: string;
  sourceUserId: string;
  targetUserId: string;
  messagePreview: string;
  status: MatchRequestStatus;
  score: number;
  createdAt: string;
  respondedAt?: string;
}
```

### 7.5 Connection

```ts
export interface Connection {
  id: string;
  intentId: string;
  userAId: string;
  userBId: string;
  status: ConnectionStatus;
  createdAt: string;
}
```

### 7.6 PostInteractionFeedback

```ts
export interface PostInteractionFeedback {
  id: string;
  connectionId: string;
  fromUserId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  wouldReconnect: boolean;
  tags: string[];
  freeText?: string;
  createdAt: string;
}
```

---

## 8. Intent Processing Pipeline

### Step 1 — User submits intent
Input example:
```text
I want to talk about yesterday's match
```

### Step 2 — Normalize
- trim
- language detect if needed
- remove empty / invalid input
- store raw text immediately

### Step 3 — Parse with OpenAI
Use Responses API + Structured Outputs to return:
- `type`
- `topics`
- `intentLabel`
- `urgency`
- `constraints`
- `safetyFlags`

### Step 4 — Embed intent
Create an embedding for semantic similarity.

### Step 5 — Candidate retrieval
Use deterministic filters first:
- active users
- same language
- same city if location-bound
- available in matching window
- not blocked / already denied recently

Then use semantic ranking:
- cosine similarity between intent embedding and profile embedding

### Step 6 — Final score
Combine:
- semantic similarity
- availability fit
- topic overlap
- reputation score
- freshness / recent activity
- prior positive outcomes

### Step 7 — Send opt-in requests
Recipients get a prompt like:
> Jeff wants to talk about yesterday’s match. Interested?

### Step 8 — Open chat on acceptance
If accepted, create a `Connection` and a direct chat thread.

---

## 9. Structured Output Schema for Intent Parsing

```ts
export interface ParsedIntent {
  type: 'chat' | 'activity' | 'group';
  intentLabel: string;
  topics: string[];
  urgency: 'now' | 'today' | 'tonight' | 'this_week' | 'flexible';
  city?: string;
  constraints: Record<string, string | number | boolean | string[]>;
  safetyFlags: string[];
  confidence: number;
}
```

### Example JSON Schema

```ts
export const parsedIntentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'intentLabel', 'topics', 'urgency', 'constraints', 'safetyFlags', 'confidence'],
  properties: {
    type: {
      type: 'string',
      enum: ['chat', 'activity', 'group'],
    },
    intentLabel: {
      type: 'string',
    },
    topics: {
      type: 'array',
      items: { type: 'string' },
    },
    urgency: {
      type: 'string',
      enum: ['now', 'today', 'tonight', 'this_week', 'flexible'],
    },
    city: {
      type: 'string',
    },
    constraints: {
      type: 'object',
      additionalProperties: {
        anyOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'boolean' },
          {
            type: 'array',
            items: { type: 'string' },
          },
        ],
      },
    },
    safetyFlags: {
      type: 'array',
      items: { type: 'string' },
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
  },
} as const;
```

---

## 10. OpenAI Integration — TypeScript Example

## 10.1 SDK setup

```bash
npm install openai zod
```

```ts
import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### Environment

```bash
OPENAI_API_KEY=...
```

---

## 10.2 Intent parsing with Responses API

```ts
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function parseIntent(rawText: string) {
  const response = await client.responses.create({
    model: 'gpt-5.4',
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: [
              'You classify social intent for a social routing product.',
              'Return only valid JSON matching the provided schema.',
              'Do not invent unavailable facts.',
            ].join(' '),
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: rawText }],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'parsed_intent',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'intentLabel', 'topics', 'urgency', 'constraints', 'safetyFlags', 'confidence'],
          properties: {
            type: { type: 'string', enum: ['chat', 'activity', 'group'] },
            intentLabel: { type: 'string' },
            topics: { type: 'array', items: { type: 'string' } },
            urgency: {
              type: 'string',
              enum: ['now', 'today', 'tonight', 'this_week', 'flexible'],
            },
            city: { type: 'string' },
            constraints: {
              type: 'object',
              additionalProperties: {
                anyOf: [
                  { type: 'string' },
                  { type: 'number' },
                  { type: 'boolean' },
                  { type: 'array', items: { type: 'string' } },
                ],
              },
            },
            safetyFlags: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    },
  });

  return JSON.parse(response.output_text);
}
```

---

## 10.3 Embeddings for semantic matching

```ts
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function embedText(text: string): Promise<number[]> {
  const result = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return result.data[0].embedding;
}
```

### Recommended embedding inputs

#### Profile embedding input
```text
Bio: Loves football, startups, and coffee.
Interests: football, startups, table tennis
Topics: Champions League, founders, AI
Activities: table tennis, coworking
Availability: tonight, weekend
```

#### Intent embedding input
```text
I want to talk about yesterday's football match tonight
```

---

## 10.4 Cosine similarity utility

```ts
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vector length mismatch');

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}
```

---

## 11. Matching Strategy

### 11.1 Deterministic filters first
Before vector ranking, exclude users who:
- are the same user
- are blocked
- opted out
- are inactive
- have incompatible language
- are unavailable for time-sensitive intents
- recently rejected similar requests

### 11.2 Semantic scoring
Example scoring model:

```ts
export interface CandidateScore {
  semanticSimilarity: number; // 0..1
  topicOverlap: number;       // 0..1
  availabilityFit: number;    // 0..1
  reputationScore: number;    // 0..1
  freshnessScore: number;     // 0..1
  priorAffinityScore: number; // 0..1
}

export function finalScore(score: CandidateScore): number {
  return (
    score.semanticSimilarity * 0.40 +
    score.topicOverlap * 0.15 +
    score.availabilityFit * 0.20 +
    score.reputationScore * 0.10 +
    score.freshnessScore * 0.10 +
    score.priorAffinityScore * 0.05
  );
}
```

### 11.3 Ranking rule
- select top N candidates (for example 3–10)
- send opt-in requests gradually, not all at once
- stop outreach once enough accepts are received

---

## 12. API Design (Internal Backend)

### REST or tRPC / RPC equivalent

#### POST `/intents`
Create a new intent.

Request:
```json
{
  "text": "I want to talk about yesterday's match"
}
```

Response:
```json
{
  "intentId": "intent_123",
  "status": "open"
}
```

#### GET `/intents/:id`
Return intent status and candidate progress.

#### POST `/match-requests/:id/respond`
Accept or reject a request.

Request:
```json
{
  "status": "accepted"
}
```

#### GET `/connections/:id`
Open or fetch the user-to-user chat thread.

#### POST `/feedback`
Submit post-chat feedback.

---

## 13. Suggested PostgreSQL Tables

### users
- id
- username
- display_name
- language
- city
- is_active
- reputation_score
- created_at
- updated_at

### user_profiles
- user_id (pk/fk)
- bio
- interests_jsonb
- topics_jsonb
- activity_preferences_jsonb
- availability_jsonb
- profile_embedding vector
- visibility
- updated_at

### intents
- id
- user_id
- raw_text
- type
- intent_label
- topics_jsonb
- urgency
- city
- constraints_jsonb
- embedding vector
- status
- created_at
- updated_at

### match_requests
- id
- intent_id
- source_user_id
- target_user_id
- message_preview
- score
- status
- created_at
- responded_at

### connections
- id
- intent_id
- user_a_id
- user_b_id
- status
- created_at

### feedback
- id
- connection_id
- from_user_id
- rating
- would_reconnect
- tags_jsonb
- free_text
- created_at

---

## 14. Conversation / Chat Design

### V1 recommendation
Use deterministic chat infrastructure:
- message table
- websocket or realtime layer
- unread counters
- push notifications

AI is **not required** for core chat.

### Optional later uses of OpenAI in chat
- thread summary
- abuse detection assistance
- suggested icebreaker drafts
- conversation recap

None of these should send messages automatically.

---

## 15. Safety and Abuse Prevention

### Product rules
1. AI never impersonates users.
2. Connections are opt-in only.
3. Users can block/report.
4. Rate-limit intent creation.
5. Rate-limit outgoing match requests.
6. Keep reputation signals internal.

### AI-specific safeguards
- Parse and classify, but do not let the model make final safety decisions alone.
- Use deterministic policy checks for disallowed content.
- Log raw input, parsed output, and model confidence for debugging.

---

## 16. Observability

Track:
- intent creation volume
- parse failures
- embedding generation failures
- average candidate count
- match acceptance rate
- median time from intent → first request
- median time from intent → accepted connection
- conversation started rate
- positive feedback rate

Log per request:
- user id
- intent id
- parse result
- retrieval count
- final selected candidates
- OpenAI request id if available

---

## 17. Caching and Cost Control

### Cache candidates when possible
- short TTL for identical or near-identical intents
- precompute profile embeddings

### Cost optimization rules
1. Only embed profile fields when changed.
2. Only re-embed intents once.
3. Use deterministic filters before expensive ranking steps.
4. Avoid multi-call chains for simple intents.
5. Use the model for interpretation, not for every ranking decision.

---

## 18. Suggested Monorepo Structure

```text
/apps
  /web
  /mobile
  /api
/packages
  /core
  /db
  /ai
  /matching
  /auth
  /chat
  /types
```

### Package responsibilities
- `core`: shared utilities
- `db`: ORM schema and migrations
- `ai`: OpenAI wrapper, prompt templates, schemas
- `matching`: ranking logic
- `auth`: sessions / tokens / permissions
- `chat`: realtime and persistence
- `types`: shared domain interfaces

---

## 19. Example AI Service Layer

```ts
import OpenAI from 'openai';

export class OpenAIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async parseIntent(rawText: string) {
    const response = await this.client.responses.create({
      model: 'gpt-5.4',
      input: rawText,
      text: {
        format: {
          type: 'json_schema',
          name: 'parsed_intent',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'intentLabel', 'topics', 'urgency', 'constraints', 'safetyFlags', 'confidence'],
            properties: {
              type: { type: 'string', enum: ['chat', 'activity', 'group'] },
              intentLabel: { type: 'string' },
              topics: { type: 'array', items: { type: 'string' } },
              urgency: {
                type: 'string',
                enum: ['now', 'today', 'tonight', 'this_week', 'flexible'],
              },
              constraints: {
                type: 'object',
                additionalProperties: true,
              },
              safetyFlags: {
                type: 'array',
                items: { type: 'string' },
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
              },
            },
          },
        },
      },
    });

    return JSON.parse(response.output_text);
  }

  async embed(text: string) {
    const result = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return result.data[0].embedding;
  }
}
```

---

## 20. Matching Flow Example

### Input
```text
I want to talk about yesterday's match
```

### Parsed result
```json
{
  "type": "chat",
  "intentLabel": "discuss recent football match",
  "topics": ["football", "match analysis"],
  "urgency": "today",
  "constraints": {},
  "safetyFlags": [],
  "confidence": 0.96
}
```

### Candidate selection
1. Fetch users with `football` in interests or high semantic similarity.
2. Filter to active users available `today`.
3. Rank by similarity + availability + reputation.
4. Send request to top 3.
5. Open chat when one accepts.

---

## 21. V1 Delivery Plan

### Phase 1 — Core data model
- users
- profiles
- intents
- match requests
- connections
- feedback

### Phase 2 — AI interpretation
- Responses API parsing
- Structured Outputs schema
- Embeddings pipeline

### Phase 3 — Matching
- deterministic filters
- vector similarity
- score combiner

### Phase 4 — Outreach and chat
- request inbox
- accept/reject flow
- direct chat

### Phase 5 — Feedback loop
- post-interaction rating
- model-free ranking improvements first

---

## 22. Recommended Initial Prompting Rules

### System prompt for intent parsing
```text
You are an intent classifier for a social routing application.
Classify what the user wants to do or discuss.
Do not generate extra prose.
Return only valid JSON matching the provided schema.
Never invent facts not present in the request.
If the request is ambiguous, infer the minimal safe interpretation.
```

### Prompting guidelines
- keep prompts short and operational
- avoid long product context in every call
- rely on schema, not prose validation
- version prompts explicitly (`intent_parser_v1`)

---

## 23. Final Recommendation

For V1:
- Use OpenAI to interpret and structure user intent.
- Use embeddings to power semantic candidate retrieval.
- Keep routing, permissions, ranking weights, and chat infrastructure deterministic in your backend.
- Keep the user experience human-first: AI routes; people talk.

That architecture is the cleanest balance of:
- product authenticity
- speed to market
- low operational risk
- extensibility for future agentic features

