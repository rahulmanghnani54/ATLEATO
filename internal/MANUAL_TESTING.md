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

### Technique flow + Form Coach (release smoke test, ~10 min)

`app/` has no jest coverage, so these are the only test these paths get.
Install the **release** APK (`scripts/build-evulto-js.sh` → `android/app/build/outputs/apk/release/`),
not a dev build: R8 and the release bundle are what ship.

**Technique screen** (Workouts → today's session → any exercise's "Form" chip)
- [ ] Bench Press: card says **film from the front / front_45**, not the side
- [ ] Clip plays a real pictogram — **never colour bars or a test pattern**. If you
      see colour bars, the bucket manifest is wrong (see `stock/manifest.js`)
- [ ] Airplane mode ON, open a clip you have not watched → poster + CONTINUE
      appear (no endless shimmer); **WATCH AGAIN is absent**
- [ ] Airplane mode OFF, BACK, reopen the same card → clip downloads and plays
- [ ] Watch to the end → WATCH AGAIN + CONTINUE both present; WATCH AGAIN replays
- [ ] Open the same clip, BACK immediately, reopen → plays from cache, no second
      download spinner
- [ ] Barbell Row / Push-Up / Dips chips say **Coming soon** with the book icon;
      tapping opens key points with **no camera step and no paywall**
- [ ] Entering Technique from a finished set ("review") → exit label matches
      where you came from, and **no paywall** is shown in review mode

**Form Coach pill** (Bench Press card → CONTINUE → camera; a FREE account must
hit the paywall first, use PRO/LEGEND or `EXPO_PUBLIC_DEV_TIER`)
- [ ] Only your head in frame → **SETTING UP**, checklist names the missing joints
- [ ] Step back so the checklist clears but keep one wrist hidden behind your
      torso → **NO CLEAR VIEW** (amber), not LIVE, not POSITION GOOD
- [ ] Show both arms fully → **POSITION GOOD** (green) for ~1.5 s → **READY**
- [ ] Hide a wrist for half a second and show it again while still standing →
      pill goes NO CLEAR VIEW → **READY**, and does **not** flash POSITION GOOD again
- [ ] Do rep 1 slowly. During the rep the pill reads **LIVE · ECCENTRIC/CONCENTRIC**;
      it must never say POSITION GOOD mid-rep, even if a joint drops out briefly
- [ ] Lying press (bench): rep 1 with a normal arch → **no "shoulders over hips"
      warning**. Same set with elbows flared wide → **elbow flare fires**
- [ ] Overhead press: lean back hard on rep 1 → the shoulders-over-hips check
      **does** fire (upright profile is still live)
- [ ] After 3 reps: rep counter = 3, last-rep score shown, no spoken line
      belongs to a different rep than the one it appeared on

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
