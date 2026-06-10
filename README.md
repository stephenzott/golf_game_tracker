# GolfPro Tracker

A React PWA for personal golf tracking with GPS shot mapping, scorekeeping, smart club recommendations, and an AI coaching summary.

## Tech Stack

- React with Hooks
- Tailwind CSS + Lucide React icons
- Firebase (Firestore + Google OAuth) — free tier
- Mapbox — GPS satellite shot tracking
- Gemini 2.5 Flash — AI coaching summaries (gated to authorized users)
- PWA manifest + custom app icon (installable to home screen)

---

## Features

### Authentication
- Google OAuth sign-in
- Firestore cloud sync

### Club Distance Tracking
- Personalized base distances per club, blended with logged shots via weighted averaging
- Course and Range shot types — range shots count at 1/10th weight so they don't skew on-course averages
- **Knockdown shot type** — Full Swing / Knockdown toggle in both Log and Track tabs; knockdown shots are tracked separately from full swings and excluded from full-swing averages and IQR
- Outlier filtering — shots below 60% of a club's mean are excluded once 15+ full-swing shots are logged, keeping mishits from skewing recommendations
- IQR range display — Q1–Q3 typical range shown in Log and Bag tabs once 4+ shots are logged
- Max toggle — swaps weighted average for all-time raw max per club; available in Log and Bag tabs
- **Knockdown base distances** — set a knockdown base yardage per club in the bag edit form alongside the full-swing base distance
- **Plays As framing** — when wind or elevation is set, the Club tab shows the effective hole distance (headwind/uphill plays longer, tailwind/downhill plays shorter) and selects the club for that effective distance
- **Knockdown club suggestion** — after the full-swing recommendation, a "Suggest knockdown?" button appears when a club's knockdown average lands within 5 yards of the target

### My Bag
- 13-slot customizable bag setup with editable full-swing and knockdown base distances
- Sorted by distance descending on save
- **Knockdown toggle** — Bag tab header button shows knockdown distances per club (or — for clubs with no knockdown data), alongside the existing Max toggle

### Weather Integration
- On app load, fetches live wind speed from Open-Meteo (free, no API key) using device GPS
- Wind displayed via a **clock face picker** — tap a clock position to set wind direction relative to your shot (12 = headwind, 6 = tailwind); effective headwind/tailwind component fed into club recommendations
- Falls back to a manual wind slider if location is denied or unavailable
- Full weather (temp °F, wind mph, wind direction, sky condition) captured at round start for today's rounds and stored with the round for AI summary use

### Scorekeeping
- Per-hole stat tracking: score, putts, fairway, GIR, hazard, bunker, yardage
- GIR auto-derived from score and putts — no manual toggle needed
- Course name, rating, slope, and tees recorded at round start (all optional)
- Course name autocomplete via Photon (OSM-based, free, no API key)
- **Hole preload** — when course name and tees match a past round, that round's par and yardage per hole are pre-filled into the new round
- Past courses shown as a quick-select dropdown
- Date picker — defaults to today, supports logging past rounds after the fact
- Round history with per-round delete support

### Round Summary
- Score vs par, handicap differential (when rating + slope are present)
- Scoring breakdown: Eagle, Birdie, Par, Bogey, Double, Triple+
- Performance by par type (Par 3 / 4 / 5)
- Stat tiles: FIR %, GIR %, Scrambling %, Bounce Back %, Putts, Avg Putts, Hazards, Bunkers, 3-Putts
- Course history comparison — when past rounds exist at the same course, each stat shows a historical average below it
- Full hole-by-hole table with score circles, FIR, GIR, putts, penalties
- Inline tees editor on the summary header (add or edit tees for rounds already entered)
- **Post to GHIN** button — appears after finishing a round; opens ghin.com in a new tab for manual posting (no official GHIN API exists)

### Ghost Rounds
- When starting a round at a previously played course, choose a ghost mode:
  - **None** — no ghost (default)
  - **Best Round** — shows scores from your lowest-scoring round at that course
  - **Best Hole** — shows your best-ever score on each individual hole
- Ghost score shown in the hole header during play as 👻 + score

### AI Coaching Summary
- "✨ AI Coaching Summary" button at the bottom of the round summary
- Calls Gemini 2.5 Flash with full hole-by-hole data; responds as a golf coach in under 300 words
- Summary persisted in Firestore — survives reloads and is tied to the specific round
- Currently gated to authorized users only

### Edit Round
- "Edit Round" on the round summary opens the hole editor in edit mode (navy header)
- Starts on the last hole; mini scorecard lets you jump to any hole
- Save persists to Firestore; Cancel restores the original without writing

### GPS Shot Tracker
- Mapbox satellite map with GPS shot logging
- Club selector and Full Swing / Knockdown toggle appear immediately after marking a shot
- Distance auto-calculated once ball position is recorded

### PWA
- Installable from browser to home screen
- Custom golf flag app icon
- Silent auto-updates via service worker — no manual reinstall needed when a new version is deployed

---

## Planned Features

### Phase 2 — Quick wins
- ~~Knockdown shot type~~ — shipped
- Club distance chart visualization
- Handicap index calculation

### Phase 3 — GPS & data import
- GPS shot coordinate persistence — save lat/lng for each shot origin and landing; enables dispersion analysis and AI spatial context
- SVG shot path visualization — render per-hole shot chains on a plain background; no Mapbox dependency, zero cost; depends on coordinate persistence above
- Launch monitor data integration — import session CSV/JSON exports from consumer launch monitors (Garmin Approach R10, Rapsodo MLM2PRO, SkyTrak, etc.) to auto-populate club shot history; reduces manual entry for range sessions

### Phase 4 — Multi-round analytics
- AI season/trend summary — analyze all completed rounds together for long-term patterns
- Multiple rounds comparison
- Handicap calculation
- Course difficulty tracking
- Export round data to CSV

### Phase 5 — Social
- Social features

---

## Local Development

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run build && firebase deploy
```

Always run as a single chained command — never `firebase deploy` alone.
