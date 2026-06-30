# Manual Test Checklist

## A. Android Device Setup (do this once)

1. Enable Developer Options on your phone (tap "Build Number" 7 times in Settings -> About)
2. Enable USB Debugging in Developer Options
3. Connect phone via USB
4. Trust the computer when prompted

## B. Run the build

```bash
cd C:\Dev\fitai-pro-app
npx expo run:android
```

First build takes 5-10 minutes. Subsequent builds are faster.

## C. Test all 5 sprints + paywall

### Sprint 1 — Workout UX
- [ ] Open Workouts tab -> tap today's workout
- [ ] Workout lobby loads with exercises
- [ ] Start workout -> session screen opens
- [ ] Complete a set -> rest timer starts + coach speaks
- [ ] Finish workout -> post-workout screen shows
- [ ] XP badge appears (+50 XP)

### Sprint 2 — Retention
- [ ] Streak counter on dashboard shows
- [ ] Chain calendar shows completed days
- [ ] Streak freezes work (use/save streak)

### Sprint 3 — AI Food + Referral + Squads
- [ ] Nutrition tab -> tap "SCAN" button
  - With FREE tier -> paywall appears
  - Set EXPO_PUBLIC_DEV_TIER=pro in .env.local -> restart -> camera opens
- [ ] Profile -> COMMUNITY -> Squads -> 5 coach teams display
- [ ] Profile -> COMMUNITY -> Referral -> unique code shows + share works

### Sprint 4 — Progression + Health + Avatar
- [ ] Profile -> PROGRESSION -> Legend Progress -> XP ring + persona title shows
- [ ] Profile -> PROGRESSION -> My Avatar -> emoji avatar with motivation line
- [ ] Profile -> PROGRESSION -> Health Dashboard -> steps counter, HRV input, sleep selector

### Sprint 5 — Behavioral mechanics
- [ ] Dashboard -> Daily Tip card -> countdown shows
- [ ] Profile -> ACCOUNTABILITY -> Anti-Charity Stake -> can opt in
- [ ] Profile -> ACCOUNTABILITY -> Daily Selfie -> camera opens
- [ ] Profile -> ACCOUNTABILITY -> Friend Scoreboard -> can add friend by code

### Paywall (PRO/LEGEND gates)
- [ ] FREE user tapping Form Coach -> paywall appears
- [ ] FREE user tapping Physique Check-in -> paywall appears
- [ ] FREE user tapping Ringtone Picker -> paywall appears
- [ ] FREE user tapping Leaderboard -> paywall appears
- [ ] PRO user can access all PRO features
- [ ] LEGEND user can access voice settings + video review + snooze recalls

## D. Common Bugs to Watch For

- White screen on launch -> check Metro bundler logs (in terminal)
- Camera permission denied -> re-grant in phone Settings -> Apps -> Evulto
- Notifications not arriving -> ensure notifications enabled
- Wake-up calls not ringing -> check Do Not Disturb is OFF
- Supabase data not loading -> check internet, check .env.local has SUPABASE_URL/KEY

## E. Report bugs to AI

Open the chat with Claude and paste:
- The screen name
- What you tapped
- What happened (vs what should happen)
- Any error in red on the screen
