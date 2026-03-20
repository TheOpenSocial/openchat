# OpenSocial — Design Specification

## 1. Design Philosophy

OpenSocial is not a social feed.

It is a conversation-driven system where:
- the primary interface is a chat with your agent
- the system executes intent in the background
- humans interact only when connection is established

## Core Principles

### 1. Intent First
The UI always starts with:
> “What do you want to do or talk about?”

No browsing.

### 2. Zero Noise
No:
- feeds
- posts
- likes
- endless scroll

Only:
- actions
- results
- conversations

### 3. System Transparency
The system explains what it is doing:
- “Searching for people…”
- “Found 3 candidates”
- “2 accepted”
- “Creating group…”

### 4. Human Conversations Only
- AI never participates in human chats
- AI only coordinates

### 5. Fast Feedback
User must always see:
- progress
- status
- outcome

## 2. App Structure

### Navigation Tabs
1. Home (Agent)
2. Inbox
3. Chats
4. Profile

## 3. Home Screen (Agent Interface)

### Layout
- Full-screen chat UI
- Input at bottom
- Messages scroll vertically

### Empty State
Text:
“What do you want to do or talk about?”

Suggestions:
- Talk about something
- Play a game
- Meet people
- Find a group

### User Input
Free text:
- “I want to talk about football”
- “Play Apex now”
- “Find people for poker”

### System Responses
1. Acknowledgment — “Got it. Looking for people…”
2. Progress — searching, matching, sending requests
3. Results — “I found 4 people. Sent requests to the best 3.”
4. Updates — “2 people accepted. Creating chat…”

## 4. Inbox
Cards with:
- user name
- intent summary
- time
- Accept / Reject

Example:
“Jeff wants to play Apex now”
[Accept] [Decline]

## 5. Chat System

### Chat Types
- 1:1 Chat
- Group Chat (max 4 participants)

### Features
- real-time messaging
- read receipts
- typing indicators
- participant list
- join/leave system messages

Important rule:
AI is NOT present in these chats.

## 6. Group Formation UX

Trigger:
“Need 4 people for poker tonight”

System flow:
1. Send requests
2. Track acceptances
3. When threshold reached, create group and notify users

UI feedback:
- “3/4 players found”
- “Group ready”

## 7. Profile Screen
Sections:
- profile picture
- name
- interests
- availability
- preferences

Editable fields:
- interests
- activity types
- availability windows
- social preferences
- matching preferences

## 8. Personalization UI
Sections:
- Availability
- Matching Preferences
- Agent Behavior
- Notifications

## 9. States & Feedback
Every action must show:
- Loading
- Progress
- Success
- Failure

## 10. Empty States
### No Matches
“No one available right now”
Suggestions:
- try later
- expand filters

### No Chats
“You don’t have any conversations yet”

## 11. Notifications
Types:
- request received
- request accepted
- group ready
- agent update

Tone:
- “2 people are ready to play”
- “Someone accepted your request”

## 12. Admin Dashboard
Screens:
- Users
- Intents
- Matches
- Queues
- Chats
- Moderation

## 13. Mobile vs Web
- Mobile: primary platform, optimized for chat
- Web: admin and power users

## 14. Visual Style
- minimal
- calm
- fast
- neutral
- clean sans-serif
- clear action states

## 15. Interaction Patterns
Always:
- immediate feedback
- clear next step
- reversible actions

Never:
- silent failures
- hidden processes
- confusing states

## 16. Core Experience Summary
User types intent.
System acts, updates, and connects.
User talks.

This is not a browsing app.
This is an execution interface for social intent.
