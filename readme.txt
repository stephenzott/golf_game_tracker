GolfPro Tracker
===============

A React PWA for personal golf tracking with GPS shot mapping, scorekeeping,
and a customizable club bag system.

Tech Stack
----------
- React with Hooks
- Tailwind CSS + Lucide React icons
- Firebase (Firestore + Google OAuth) — free tier
- Mapbox — GPS satellite shot tracking
- PWA manifest + custom app icon (installable to home screen)

Core Features
-------------
Authentication
  - Google OAuth sign-in
  - Firestore cloud sync

Club Distance Tracking
  - Personalized base distances per club, blended with logged shots via
    weighted averaging
  - Range shot type with reduced weighting (1/10th vs on-course shots)
  - Outlier filtering — shots below 60% of a club's mean are excluded once
    15+ shots are logged, keeping mishits from skewing recommendations
  - IQR range display — Q1–Q3 typical range shown in Log and Bag tabs once
    4+ shots are logged for a club
  - Max toggle — swaps weighted average for all-time raw max per club;
    available in both Log and Bag tabs
  - Smart club recommendations based on target distance

My Bag
  - 13-slot customizable bag setup with editable base distances
  - Sorted by distance descending on save

Scorekeeping
  - Per-hole stat tracking: score, putts, fairway, GIR, hazard, bunker, yardage
  - GIR auto-derived from score and putts — no manual toggle needed
  - Course name, rating, and slope recorded at round start (all optional)
  - Course name autocomplete via Photon (OSM-based, free, no API key)
  - Past courses shown as quick-select chips
  - Round history with delete support
  - Date picker at round start — defaults to today, supports logging past rounds

Round Summary
  - Shown after finishing a round and when viewing any past round from history
  - Score vs par, handicap differential (when rating + slope present)
  - Scoring breakdown: Eagle, Birdie, Par, Bogey, Double, Triple+
  - Stat tiles in three rows:
      Row 1: FIR %, GIR %, Scrambling % (each shown as % with raw fraction)
      Row 2: Bounce Back %, Total Putts, Avg Putts
      Row 3: Hazards, Bunkers, 3-Putts
  - Bounce Back %: par or better immediately following a bogey or worse
  - Performance by par type (Par 3 / 4 / 5)
  - Course history comparison: when past rounds exist at the same course,
    each stat shows a historical average below it
  - Full hole-by-hole table with score circles, FIR, GIR, putts, penalties

Edit Round
  - "Edit Round" button on the round summary
  - Opens hole editor in edit mode (navy header to distinguish from live play)
  - Starts on the last hole; mini scorecard lets you jump to any hole
  - Save persists to Firestore; Cancel restores the original round

Ghost Rounds
  - When starting a round at a previously played course, choose a ghost mode:
      None       — no ghost (default)
      Best Round — shows scores from your lowest-scoring round at that course
      Best Hole  — shows your best-ever score on each individual hole
  - Ghost score displayed in the header during play as 👻 + score
  - Matches by course name only, not by tees

GPS Shot Tracker
  - Mapbox satellite map with GPS shot logging
  - Club selector appears immediately after marking shot
  - Distance auto-calculated once ball position is recorded

PWA
  - Installable from browser to home screen
  - Custom golf flag app icon

Planned Features
----------------
Phase 2 (Near-term):
  - Knockdown shot type — log partial swings separately from full swings,
    with knockdown yardages available in the club suggestion tab
  - Club distance chart visualization
  - Export round data to CSV
  - "Post to GHIN" button — deep links to ghin.com for manual posting after
    round completion (no official API without USGA partnership)

Phase 3:
  - Multiple rounds comparison
  - Handicap calculation
  - Course difficulty tracking
  - Weather data integration

Phase 4:
  - Full backend user accounts
  - Social features
  - Native mobile app
