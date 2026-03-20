# Database ERD (Core Runtime)

The diagram below is intentionally focused on high-value runtime entities. Full column details remain in `prisma/schema.prisma`.

```mermaid
erDiagram
  users ||--o| user_profiles : has
  users ||--o{ user_sessions : owns
  users ||--o{ intents : creates
  users ||--o{ agent_threads : owns
  users ||--o{ notifications : receives
  users ||--o{ blocks : blocks
  users ||--o{ user_reports : reports

  user_profiles ||--o{ user_interests : has
  user_profiles ||--o{ user_topics : has
  user_profiles ||--o{ user_availability_windows : has
  user_profiles ||--o{ user_profile_images : uploads

  agent_threads ||--o{ agent_messages : contains

  intents ||--o{ intent_candidates : ranks
  intents ||--o{ intent_requests : fans_out

  intent_requests ||--o{ request_responses : receives
  intent_requests }o--|| users : sender
  intent_requests }o--|| users : recipient

  intents ||--o{ connections : origin
  connections ||--o{ connection_participants : includes
  connections ||--o{ chats : opens

  chats ||--o{ chat_memberships : has
  chats ||--o{ chat_messages : stores
  chat_messages ||--o{ message_receipts : tracks

  moderation_flags }o--|| users : targets_optional
  audit_logs }o--|| users : actor_optional
  admin_actions }o--|| users : admin_actor

  users ||--o{ user_preferences : stores
  users ||--o{ inferred_preferences : infers
  users ||--o{ explicit_preferences : sets
  users ||--o{ preference_feedback_events : emits

  users ||--o{ life_graph_nodes : owns
  users ||--o{ life_graph_edges : owns

  users ||--o{ retrieval_documents : owns
  retrieval_documents ||--o{ retrieval_chunks : chunks

  embeddings }o--|| users : owner_optional
```

## Notes
- Some relations are logical (by foreign-key ID fields) even if Prisma does not declare every relation object.
- Archive tables (`chat_messages_archive`, `audit_logs_archive`) are omitted from the diagram for readability.
