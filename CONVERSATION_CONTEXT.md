# GolfPro Tracker - Conversation Context & Development Notes

**Last Updated**: June 9, 2026 (AI summary persisted per round in Firestore)

---

## Project Overview

**GolfPro Tracker** is a React PWA for golf tracking with Google OAuth, Firestore cloud sync, GPS shot mapping, scorekeeping, and a customizable club bag system.

**Tech Stack**:
- React with Hooks
- Tailwind CSS + Lucide React icons
- Firebase (Firestore + Google OAuth) — free tier
- Mapbox — GPS satellite shot tracking
- PWA manifest + custom app icon (installable on home screen)

**Hosting**: Free tier only — user pays for Claude, nothing else.

**Deployment**: Always `npm run build && firebase deploy` from `main`. Never run `firebase deploy` alone — it would ship stale `dist` contents. This has caused bugs in the past (e.g. a model name change not making it to production because build was skipped). Feature branches are tested locally only (`npm run dev`).

---

## What's Been Built

### Authentication
- Google OAuth sign-in
- Firestore data sync on sign-in (race condition fixed — local data no longer overwrites Firestore on load)

### Club Distance Tracking
- Personalized base distances per club, blended with logged shots using weighted averaging
- Range shot type with 1/10th weighting (range shots count less than on-course shots)
- Smart club recommendations — only suggests clubs that can reach the target distance
- Outlier filtering — once 15+ shots are logged for a club, shots below 60% of the raw mean are excluded from both the weighted blended distance and the displayed average; only low outliers (mishits) are trimmed, not long shots; applies regardless of shot type (course, range, tracked)
- IQR range display — Q1–Q3 typical range shown below the distance in both the Log and Bag tabs; uses outlier-filtered shots; requires 4+ shots to display; computed via linear interpolation
- Max toggle — button in Log tab (above distance history) and Bag tab header; swaps weighted average for all-time raw max per club; max uses unfiltered shots across all types
- Shot count displayed under club name in both Log and Bag tabs
- "Update Base Distances" button moved to bottom of Bag tab club list

### My Bag
- 13-slot customizable bag setup
- Clubs have editable base distances
- Bag sorted by distance descending on save (clubs with no distance preserve entered order)
- Sort applied on both load and save

### Scorekeeping
- Per-hole stat tracking tab
- Hole yardage field on scorecard
- Course name, rating, and slope recorded at round start (all optional)
- Past courses shown as a dropdown select on the start screen
- Course name autocomplete via Photon (photon.komoot.io) — OSM-based, free, no API key; queries fire after 3 characters with a 400ms debounce; results biased toward user's GPS location when available; dropdown dismisses on blur or selection
- **Tees field** on start screen (below rating/slope, above date) — optional text input (e.g. "Blue", "White"); saved as `round.tees` (null if blank)
- **Hole preload**: when both course name and tees match a past round (case-insensitive trim), that round's `par` and `yards` per hole are preloaded into the new round; `rating` and `slope` also carried over if not manually entered; green hint "Hole data from [date] will load" appears when match found; 9/18 mismatch handled gracefully
- Delete button on each round in history view (removes from Firestore + UI instantly)
- GIR is auto-derived from score and putts using `(score - putts) <= (par - 2)`; no manual toggle — computed whenever both values are set

### Round Summary
- Shown immediately after finishing a round and when selecting any past round from history
- Displays total score vs par, handicap differential (when rating + slope are present), scoring breakdown (Eagle/Birdie/Par/Bogey/Double/Triple+), and performance by par type (3/4/5)
- Stat tiles arranged in three rows: Row 1 — FIR, GIR, Scrambling; Row 2 — Bounce Back %, Putts, Avg Putts; Row 3 — Hazards, Bunkers, 3-Putts
- FIR, GIR, and Scrambling display as a percentage (e.g. `75%`) with the raw fraction shown to the right in lighter text (e.g. `7/9`)
- Bounce Back %: percentage of holes where player made par or better immediately after a bogey or worse; shown as N/A when no opportunities exist
- Course comparison: when other rounds exist at the same course, each stat shows a historical average below it for context
- Full hole-by-hole table with score circles, FIR, GIR, putts, and penalties
- **Inline tees editor** in the summary header (below course name) — editable input field; saves to Firestore on blur; allows adding/editing tees for rounds already entered; shows "Add tees…" placeholder when blank

### AI Coaching Summary
- "✨ AI Coaching Summary" button appears at the bottom of the round summary screen, above the Edit/Start New Round buttons
- Gated to `szott19@gmail.com` only via `ALLOWED_AI_USERS` in `src/geminiSummary.js` — invisible to other users
- Calls Gemini 2.5 Flash (`gemini-2.5-flash`) directly from the browser using `VITE_GEMINI_API_KEY` stored in `.env.local` (gitignored)
- Prompt sends full hole-by-hole data (score, putts, FIR, GIR, hazard, bunker) plus round-level stats; asks Gemini to respond as a golf coach in under 300 words
- Response displays inline; "Regenerate" link overwrites the existing summary and re-saves
- **AI summary is persisted**: stored as `round.aiSummary` in the Firestore round document; survives page reloads and app restarts; tied to the specific round so switching between rounds/courses shows the correct summary (or the generate button if none exists yet)
- `aiError` state resets automatically when the active round changes (via `useEffect` on `round?.id`)
- API key stored in `.env.local` as `VITE_GEMINI_API_KEY`; key is visible in the client bundle — quota cap on the key in Google Cloud Console is recommended
- Before expanding to beta testers, check rate usage at: https://aistudio.google.com/rate-limit?timeRange=last-28-days&project=gen-lang-client-0026826837

### Edit Round
- "Edit Round" button on the round summary (outlined green, above "Start New Round")
- Opens the existing hole editor UI in edit mode — header turns navy with "EDITING · HOLE" label to distinguish from a live round
- Starts on the last hole (common case: fixing the final hole); mini scorecard at the bottom lets you jump to any hole
- Navigating between holes in edit mode does not apply score/putts defaults
- "Save Changes ✓" on the last hole persists edits to Firestore and updates in-memory history
- "Cancel Edit" restores the original round without writing to Firestore

### Round Date Selection
- Date picker on the start screen defaults to today, capped at today (no future dates)
- Allows logging rounds played in the past after the fact

### Ghost Rounds
- When starting a round at a previously played course, a Ghost Round selector appears
- Three modes: **None** (default), **Best Round** (lowest total score round at that course), **Best Hole** (best score ever on each individual hole at that course)
- Ghost score displayed during the round in the header as 👻 + score beneath the hole number
- Matches by course name only, not by tees (noted on start screen)
- Holes with no ghost data (e.g. past round was 9 holes, current is 18) show nothing

### GPS Shot Tracking
- Mapbox satellite map
- Log shot locations with GPS
- Club selector appears immediately after marking shot (can select while walking to ball)
- Log It button only appears once ball position is recorded and distance calculated

### PWA
- Installable from browser to home screen
- Custom golf flag app icon
- PWA manifest configured
- Service worker (`public/sw.js`) handles silent auto-updates: new SW calls `skipWaiting()` on install, claims clients on activate, and the app reloads silently when a new version is deployed — no manual delete-and-reinstall needed
- Navigation requests use network-first (always fresh HTML); hashed assets use cache-first; Firebase/Google API requests are bypassed entirely

---

## Next Possible Features

### Phase 2:
- **AI season/trend summary** — extend the Gemini coaching agent to analyze all completed rounds together, not just a single round; identify trends over time (e.g. improving GIR, recurring bogey patterns, best courses)
- Knockdown shot type — differentiate full swings from intentional partial/knockdown shots; knockdown data to be available in the club suggestion tab alongside full-swing yardages
- Chart visualization of distances per club
- Export round data to CSV
- Handicap differential calculation (uses rating + slope now stored on rounds)
- "Post to GHIN" button after round completion — deep links to ghin.com for manual posting (no official API without USGA partnership)

### Phase 3:
- Multiple rounds comparison
- Handicap calculation
- Course difficulty tracking
- Weather data integration

### Phase 4:
- User accounts (backend)
- Cloud sync
- Mobile app
- Social features
