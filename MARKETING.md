# Atleato — Marketing Copy & Campaign Kit

The single source of truth for how we describe Atleato. Everything downstream
(ads, posts, emails, video, DMs) reuses these. Don't reinvent the pitch per
channel — adapt tone, keep the substance identical.

---

## 1. The Hook (1 line)

> **An AI fitness coach that actually calls your phone — and corrects your form in real time.**

Use this as: video opener, ad headline, Reddit/PH title, X bio line, the first
sentence of any DM. If you only get one sentence, it's this one.

**Shorter variants (for tight character limits):**
- "Your AI coach literally calls you. And watches your form."
- "The fitness app that calls you like a real coach."

---

## 2. The Pitch (3 lines)

> Most fitness apps are silent checklists you ignore.
> Atleato gives you an AI coach with a personality who calls your phone to get you training, corrects your form live through your camera, and turns your runs into a map you conquer.
> One-time $1.99 for a founding Vanguard pass — first 500 only, then it's gone.

Use this as: landing sub-headline, Product Hunt tagline, the body of a cold DM,
the "what is this" reply when someone asks.

---

## 3. The 60-Second Script (video / showreel / voiceover)

**[0:00–0:05] — Hook over a black screen, phone rings on camera**
"What if your fitness coach actually called you?"
*(phone screen lights up: incoming call from "The Commander")*

**[0:05–0:15] — The call**
"Not a notification you swipe away. A real call. You answer — and your coach is
already on you. Pick from five legends, each with their own voice, philosophy,
and attitude."

**[0:15–0:30] — Form correction (screen-record the form coach)**
"Start your set. Atleato watches through your camera and corrects your form in
real time — knees caving, depth, bar path — the stuff a $80/hour trainer
charges for. Free, in your pocket."

**[0:30–0:45] — Territory + streaks (screen-record the map)**
"Every run claims territory on a live map. Every workout builds your streak and
levels up your rank. It's not a log. It's a game you're addicted to winning."

**[0:45–0:60] — Close + CTA**
"Five coaches. Real calls. Live form AI. A world to conquer. The first 500
founding members get in for a one-time $1.99 — lifetime founder status, a free
month of Legend at launch. After that, it's gone. Link in bio. Claim your pass."

**Production notes:**
- The two money shots are the **incoming call** and the **live skeleton form
  overlay**. Lead with whichever you can record cleanest. They're what nobody
  else has.
- Keep cuts fast (≤2.5s each). Vertical 9:16 for TikTok/Reels/Shorts, 16:9 for
  the site/PH.
- End card: logo + "atleato.com" + "500 founding passes".

---

## 4. UTM Campaign Links (ready to paste)

The landing page now records `utm_source` / `utm_medium` / `utm_campaign` into
the signup's `source` column, so the admin dashboard shows which channel
actually converts (not just clicks). **Always use a tagged link** when you post
anywhere — an untagged link shows up as plain `hero` and you lose attribution.

Format: `https://atleato.com?utm_source=SOURCE&utm_medium=MEDIUM&utm_campaign=CAMPAIGN`

| Where you're posting | Paste this link |
|---|---|
| Reddit post | `https://atleato.com?utm_source=reddit&utm_medium=post&utm_campaign=launch` |
| Reddit comment | `https://atleato.com?utm_source=reddit&utm_medium=comment&utm_campaign=launch` |
| TikTok bio/video | `https://atleato.com?utm_source=tiktok&utm_medium=video&utm_campaign=launch` |
| Instagram Reels | `https://atleato.com?utm_source=instagram&utm_medium=reel&utm_campaign=launch` |
| YouTube Shorts | `https://atleato.com?utm_source=youtube&utm_medium=short&utm_campaign=launch` |
| X / Twitter | `https://atleato.com?utm_source=twitter&utm_medium=post&utm_campaign=launch` |
| Product Hunt | `https://atleato.com?utm_source=producthunt&utm_medium=launch&utm_campaign=launch` |
| Influencer (per person) | `https://atleato.com?utm_source=influencer&utm_medium=ig&utm_campaign=NAME` |
| Discord | `https://atleato.com?utm_source=discord&utm_medium=community&utm_campaign=launch` |

Rules:
- Lowercase, no spaces (the site sanitizes them anyway, but keep it clean).
- Change `utm_campaign` per campaign wave (e.g. `launch`, `blackfriday`, `q3push`)
  so you can compare waves over time.
- For influencers, set `utm_campaign` to their handle so you see exactly who drove signups.
- **Referral links** (from inside the app) use `?ref=CODE` instead — that's the
  user-to-user loop and is tracked separately. A link can carry both if needed.

---

## 5. Channel One-Liners (adapt the hook per platform)

- **Reddit (r/fitness, r/naturalbodybuilding):** Lead with the build story, not
  the sell. "I got tired of fitness apps I ignore, so I built one that calls me
  and corrects my form through the camera. 30-sec demo:" + tagged link.
- **TikTok/Reels:** No words needed up front — open on the phone ringing. Caption
  is the hook.
- **Product Hunt:** Tagline = the 3-line pitch, condensed. First comment = the
  build story + what's genuinely novel (real calls + live form AI).
- **X build-in-public:** Post the form-AI clip. "Spent months getting on-device
  pose detection to correct lifting form in real time. Here's it catching knee
  valgus on a squat:" + clip.

---

## 6. What NOT to say

- No "lifetime free" / "lifetime premium" language. The promise is one-time
  $1.99 + 1 month free Legend at launch, then Free tier or $19.99/mo by choice.
- Don't name real fitness celebrities. The five coaches are original personas
  (The Sculptor, The Monument, The Analyst, The Commander, The Architect).
- Don't promise medical/clinical outcomes. It's coaching + form guidance, not
  physiotherapy.
