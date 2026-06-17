# Caddy Feature — Implementation Notes

A mid-round AI caddy accessible from the Score tab (or any tab) that answers
shot and strategy questions with full context automatically injected — no setup
typing required on the course.

---

## Where to build it

**This app (golf-game-tracker), not golf-advisor-app.** The advisor app is
post-round analytics. This app has the live context a caddy needs: current
hole, score so far, bag distances, weather, GPS data.

---

## What it does

A floating chat button (fixed, bottom-right) opens a drawer or modal. The user
types a question — "what club from 165 uphill into wind?" — and gets a fast,
context-aware answer. Claude knows their bag, current round state, and
conditions without the user having to explain any of it.

---

## Tech approach

### API
Use the **Anthropic SDK** directly from the frontend, same pattern as the
existing Gemini call in `src/userGating.js`. Store the key in `.env.local` as
`VITE_ANTHROPIC_API_KEY`.

**Model**: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) for speed and cost.
Upgrade to Sonnet if richer reasoning is needed.

**Mode**: Streaming responses via `client.messages.stream()` so the answer
appears word-by-word — important for perceived speed on the course.

### Conversation style
Two options — pick one before building:

- **Single-turn Q&A** (simpler): each question is independent, no history.
  Fast to build, fine for most caddy queries.
- **Persistent thread per round** (more powerful): maintains conversation
  history within the round so follow-ups work ("what about laying up instead?").
  Requires storing `messages[]` in component state and passing the array each
  call.

Recommend starting with single-turn and upgrading if needed.

---

## Context to auto-inject (system prompt)

Pull from existing app state — the user types only their question:

```
You are a golf caddy. Answer concisely — the user is on the course on a phone.

BAG (club → avg distance):
{bag clubs mapped to avgDistance from distanceLogs}

CURRENT ROUND:
- Course: {courseName}
- Hole: {currentHole} | Par: {par} | Yardage: {holeYardage}
- Score so far: {score relative to par through N holes}
- Conditions: {windSpeed} mph {windDirection}, {skyCondition}

Answer the user's question with this context in mind.
```

All of this is already in component state — `distanceLogs`, `currentRound`,
`holes`, weather fields pulled from Open-Meteo.

---

## Files to create / modify

| File | Change |
|------|--------|
| `src/ChatCaddy.jsx` | New component — drawer UI, input, streaming response display |
| `GolfTrackerApp.jsx` | Add `<ChatCaddy />` at root level, pass relevant state as props |
| `src/userGating.js` | Add Anthropic API call alongside existing Gemini function |
| `.env.local` | Add `VITE_ANTHROPIC_API_KEY` |
| `package.json` | Add `@anthropic-ai/sdk` dependency |

---

## UI notes

- **Trigger**: floating button fixed bottom-right, always visible (same z-layer
  as any existing FABs — check for conflicts with Mapbox on the Track tab)
- **Container**: full-screen modal on mobile (drawer feels cramped); slide up
  from bottom
- **Input**: large tap target, send on Enter or button tap
- **Response**: stream text into a single message bubble; show a spinner until
  first token arrives
- **Dismiss**: tap outside or an X button clears and closes (don't persist chat
  between opens unless building thread mode)

---

## Access gating

Reuse the existing `ALLOWED_AI_USERS` check in `src/userGating.js` —
`['szott19@gmail.com', 'mfarotte@gmail.com']`. Hide the caddy button entirely
for ungated users.

---

## Estimated effort

| Task | Time |
|------|------|
| `ChatCaddy.jsx` component + drawer UI | 3–5 hrs |
| Anthropic API call + streaming | 1 hr |
| Context/state plumbing from parent | 2 hrs |
| Mobile UX polish + FAB placement | 2–3 hrs |
| Testing on-device | 1–2 hrs |
| **Total** | **~10–13 hrs** |
