# GolfPro Tracker - Conversation Context & Development Notes

**Last Updated**: May 30, 2026

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

### GPS Shot Tracking
- Mapbox satellite map
- Log shot locations with GPS

### PWA
- Installable from browser to home screen
- Custom golf flag app icon
- PWA manifest configured

---

## Next Possible Features

### Phase 2:
- Course name/date tracking
- Round summary view
- Chart visualization of distances per club
- Export round data to CSV

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
