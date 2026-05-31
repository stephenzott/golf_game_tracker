# GolfPro Tracker - Conversation Context & Development Notes

**Last Updated**: May 31, 2026

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

---

## What's Been Built

### Authentication
- Google OAuth sign-in
- Firestore data sync on sign-in (race condition fixed — local data no longer overwrites Firestore on load)

### Club Distance Tracking
- Personalized base distances per club, blended with logged shots using weighted averaging
- Range shot type with 1/10th weighting (range shots count less than on-course shots)
- Smart club recommendations — only suggests clubs that can reach the target distance

### My Bag
- 13-slot customizable bag setup
- Clubs have editable base distances
- Bag sorted by distance descending on save (clubs with no distance preserve entered order)
- Sort applied on both load and save

### Scorekeeping
- Per-hole stat tracking tab
- Hole yardage field on scorecard
- Course name, rating, and slope recorded at round start (all optional)
- Past courses shown as quick-select chips on the start screen
- Delete button on each round in history view (removes from Firestore + UI instantly)

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

---

## Next Possible Features

### Phase 2:
- Round summary view (next priority)
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
