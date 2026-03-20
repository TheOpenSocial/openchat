# 12 — Realtime, Chat, and Presence

## Transport
WebSockets via NestJS gateways.

## Why not polling
This product relies on low-latency state transitions:
- request received
- request accepted
- connection created
- new messages
- presence
- typing indicators

## Presence model
States:
- online
- away
- invisible
- available_now
- available_today

Presence is advisory, not authoritative.

## Chat guarantees
- durable message persistence before ack where possible
- clientMessageId for dedupe
- ordered by server timestamp + tie-breaker id
- unread counts eventually consistent but convergent
- reconnect replay supported via last_seen_message cursor

## Delivery flow
1. client sends `chat.send`
2. server validates membership and policy
3. message persisted
4. message fanout via gateway and/or pubsub
5. receipts updated asynchronously

## Multi-instance support
Use Redis pub/sub or adapter strategy so realtime events reach clients regardless of gateway node.

## Chat constraints
- no AI in-band messages by default
- content moderation can hide/flag messages asynchronously
- blocked users cannot continue messaging
