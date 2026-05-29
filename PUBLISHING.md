# Atleato — Publishing Checklist

Everything we need when we hit "Submit" on Google Play Console.

---

## 🏷️ Store identity

| Field | Value |
|---|---|
| **Play Store title** | `Atleato™ — Your Coach Calls` *(28 chars)* |
| **App label (under icon)** | `Atleato` *(short, clean)* |
| **Package name** | `com.madsales.atleato` |
| **Category** | Health & Fitness *(NOT Sports — better discovery)* |
| **Pricing** | Free *(with in-app purchases later)* |

> Why the title works: "Your Coach Calls" reads two ways:
> 1. Literal — your coach rings your phone (the wake-up call feature)
> 2. Figurative — your coach makes the calls / decisions
> Both meanings sell the app.

---

## 📝 Short description *(80 char max)*

> `AI workout coach, form check, run conquest — and a coach who actually calls.`

*(78 characters — fits)*

---

## 📝 Long description *(SEO-optimised)*

Below is a draft long description. Tweak before submitting.

```
ATLEATO — YOUR COACH CALLS.

This isn't another fitness tracker. This is a coaching system that calls
you out, calls you up, and calls the shots.

5 WORLD-CLASS COACHES IN YOUR POCKET
Train under the protocols of Chris Bumstead (Classic Physique), Arnold
Schwarzenegger (Golden Era), Jeff Nippard (evidence-based), CT Fletcher
(strict-curl monster), or Dr. Mike Israetel (MEV/MAV/MRV). Pick one.
Their voice, their workouts, their nutrition philosophy — applied to your
body.

AI FORM COACH
Point your phone at yourself and lift. Atleato analyses your form in real
time using on-device pose detection and tells you what to fix. No more
guessing if you're squatting deep enough.

YOUR COACH ACTUALLY CALLS YOU
Set a wake-up time. At that exact minute, your phone rings like a real
incoming call — full ringtone, full screen, vibration. Answer and your
coach's voice pushes you up. No more sleeping through alarms.

TERRITORY CONQUEST FOR RUNNERS
Every 200×200m grid cell you run through becomes yours. Anyone who runs
through it next steals it. Global and city leaderboards. Splatoon meets
Strava.

GLOBAL NUTRITION (not just American foods)
1.2 million packaged foods + 200+ global dishes + Indian dishes + custom
foods. Find biryani, paneer, sushi, pizza, anything.

PROVEN RETENTION MECHANICS
- Streak Freezes (Duolingo-style — auto-save a missed day)
- Implementation Intentions (Gollwitzer research — 2x adherence)
- Social Stake (your accountability witness gets a text if you skip)
- Chain calendar ("don't break the chain")
- Reward chests (variable-reward post-workout)

NO EXCUSES.
This is for the hungry. Not the curious.

#1 CHOICE OF SERIOUS LIFTERS
Built by an athlete, for athletes. Privacy-first (your physique photos
stay encrypted on your device). Zero ads. Zero noise.

Download Atleato. Your coach is calling.
```

---

## 🎨 Visual assets needed

- **Feature graphic** *(1024×500)*: hero image of the home dashboard + persona accent
- **Phone screenshots** *(min 2, ideally 6-8)*:
  1. Home dashboard with rings + persona greeting
  2. Form Coach in action with skeleton overlay
  3. Coach Hub with one persona
  4. Territory map with colored cells
  5. /add-food search results
  6. Streak Hero + chain calendar
  7. The incoming-call screen mid-ring
  8. Profile with founding member badge
- **App icon** *(1024×1024)*: ✅ already generated (`assets/icon.png`)
- **Adaptive icon** *(1024×1024 fg)*: ✅ already generated (`assets/adaptive-icon.png`)

---

## ⚖️ Legal pre-requisites

- [ ] Privacy Policy URL (Play Console requires one) — host on `atleato.com/privacy`
- [ ] Terms of Service URL — host on `atleato.com/terms`
- [ ] Data Safety form (Play Console) — declare what data we collect:
    - Email, name (Supabase auth)
    - Body stats (height, weight, age, gender)
    - Workout logs
    - Nutrition logs
    - GPS location (territory game — declare as "Location > Precise location")
    - Push tokens (FCM)
    - Phone number? Only if smartwatch / SMS features ship
- [ ] Content rating: Health & Fitness, no violence, no gambling → likely **Everyone 10+** or **Teen**

---

## 🔑 Signing & keystore

- [ ] Generate upload keystore (one-time):
  ```
  keytool -genkeypair -v -keystore atleato-upload.keystore \
    -alias atleato-upload -keyalg RSA -keysize 2048 -validity 25000
  ```
- [ ] Store keystore file + passwords in **password manager** (NOT git)
- [ ] Enrol in Google Play App Signing (Google holds the signing key, we hold upload key)

---

## ✅ Pre-launch tests

- [ ] Reload app on phone (USB), run through the test checklist in `docs/`
- [ ] Hit every tab + every CTA
- [ ] Test the actual wake-up ring (after CallKeep rebuild)
- [ ] Confirm push notifications arrive (after FCM wiring)
- [ ] Confirm AI Coach replies (after `ANTHROPIC_API_KEY` Supabase secret)

---

## 🚀 Submission day

1. Build a **release AAB** (not APK):
   ```
   eas build --platform android --profile production
   ```
   *(or the Expo equivalent for managed-workflow signing)*
2. Upload AAB to Play Console → **Internal testing** track first
3. Add yourself + 2 trusted friends as testers
4. Test for 48 hours
5. Promote to **Closed testing** (up to 100 testers)
6. Run for 14 days minimum (Google's open testing minimum for new accounts)
7. Promote to **Production** → public launch

---

## 🎯 Launch-day tagline (for socials, press)

> **"Your coach just called. Don't miss it."**

---

*Last updated: title locked to `Atleato™ — Your Coach Calls`.*
