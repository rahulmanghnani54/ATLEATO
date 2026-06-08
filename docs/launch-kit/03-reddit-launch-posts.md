# Reddit Launch Posts — Atleato

⚠️ **Critical Reddit rules:** No "Show HN" style hard pitches. No naked links. Lead with VALUE, mention product at the end. Each subreddit has rules — read them. Tag posts correctly. Don't repost across subreddits same day.

---

## POST 1 — r/Fitness (Self-promo Friday only)

**Title:** I built an AI fitness app where 5 coaches each speak with their own training philosophy. Wanted to share what I learned.

**Body:**
```
Hey r/Fitness,

After a year of building, I just launched Atleato — an AI coaching app that turned out way different from what I planned. Sharing what I learned because the lessons might be useful even if the app isn't for you.

The big insight: people don't quit fitness apps because the app is bad. They quit because every fitness app feels the same. So I built five completely different coaches, each modeled on a different training philosophy:

🟢 Classic physique style (PPL, controlled tempo, "quality reps")
🟠 Golden era volume (double splits, "stop being a couch potato")
🔵 Evidence-based (RIR programming, "scientifically speaking...")
🔴 Raw intensity (heavy sets, "I COMMAND YOU TO GROW")
🟢 RP-style periodization (MEV→MAV→MRV, "your gains will literally shrink")

The wild part: switching coaches actually changes the ENTIRE app — colors, programs, nutrition philosophy, even the voice that talks to you mid-set. Five distinct experiences in one app.

Things that worked:
1. Persona-driven UX > generic friendly tone. Users either LOVE or HATE each coach. That polarization drives engagement.
2. Voice coaching during sets >> visual coaching. People look at form, not screens.
3. Real wake-up calls (the app rings your phone like an actual call) crushed snooze rates vs notifications.

Things that didn't work:
1. Too many features at first. Cut from 14 → 6 core features in v1.
2. AI-generated coach voices sounded uncanny. Pivoted to TTS with hand-tuned pitch/rate per persona.
3. Anti-charity stake gimmick (deposit $5, lose to a charity you hate if you skip) — felt manipulative, made it 100% opt-in instead of default.

If you're curious or want to be a beta tester:
🔗 atleato.com

Happy to answer any questions about the build, the science behind the persona switching, or the AI form detection (uses MoveNet 17-joint tracking on-device).

— Rahul, solo dev
```

**Best time to post:** Friday 9am-11am EST (Self-promo Friday)
**Flair:** Discussion
**Engage:** Reply to every comment within 1 hour for first 4 hours

---

## POST 2 — r/bodybuilding

**Title:** Built an AI trainer that lets you pick from 5 coach philosophies (classic, golden era, evidence-based, raw intensity, RP-style). Looking for feedback.

**Body:**
```
Long-time lurker, first-time poster.

After getting frustrated with how generic every fitness app feels, I spent a year building Atleato. It's an AI coaching app where you literally pick which training philosophy you want to follow:

- Classic Physique style: PPL, controlled eccentrics, posing practice baked in
- Golden Era: high volume double splits, lots of pump work, focus on mass
- Evidence-Based: RIR-based intensity, periodization per muscle group
- Raw Intensity: heavy compound focus, strict form, low rep schemes
- RP-style: mesocycle periodization, MEV/MAV/MRV tracking, deload weeks

The app TRANSFORMS based on your pick. Different color schemes, different exercise libraries, different rest timer voice cues. The "Classic" coach speaks calmly about quality reps. The "Raw" coach yells "I COMMAND YOU TO GROW" at the top of each set.

Free tier gives you 1 coach. Pro ($9.99/mo) gives you 3. Legend ($19.99/mo) gives all 5.

Other features I'd love feedback on:
- Live AI form check using your phone camera (17 skeletal joints, real-time)
- Wake-up calls that actually ring your phone like a real call
- Territory conquest map (Splatoon for runners)
- Physique check-in photos with weekly comparison

Site: atleato.com

What persona would YOU pick? And what's missing from current fitness apps that you'd want in this one?
```

**Best time:** Sunday 7-9pm EST (peak r/bodybuilding traffic)
**Flair:** Discussion / Equipment & Apps (if exists)

---

## POST 3 — r/leangains (or r/PEDs cautious or r/naturalbodybuilding)

**Title:** Built an app that adapts workout volume based on your daily mood/recovery — looking for serious lifters to beta test the algorithm

**Body:**
```
Working on something I've wanted for years: a fitness app that actually adjusts your workout intensity based on how recovered you are TODAY, not just what's on your program.

The system:
1. Pre-workout 30-second check-in: mood (4 emojis), sleep quality (1-5), optional HRV input
2. Algorithm calculates recovery score (0-100)
3. Auto-suggests volume modifier:
   - 90-100: full volume + add 1 set on compounds
   - 70-89: standard volume
   - 50-69: 0.85× volume, prioritize quality
   - <50: 0.7× volume + coach voiceover "we're going easy today, recovery is growth"
4. Tracks how well the modifier predicted next-day soreness/performance

Logic is based on Dr. Growth-style MRV principles + Apple Watch HRV correlations.

Looking for 50 serious lifters (3+ years training, currently on a structured program) to beta test the modifier accuracy over 4 weeks. You'll log standard sets/reps + the recovery score, and I'll send you weekly correlations.

In exchange:
- 6 months Atleato LEGEND tier free
- Direct line to me for feature requests
- Your name in the launch credits

DM me your training background + program if interested. Or just reply with questions.

Project link if you want context: atleato.com
```

**Best time:** Tuesday/Thursday 10am EST
**Why it works:** Specific ask, specific compensation, niche audience, you're giving them something

---

## POST 4 — r/SideProject

**Title:** I shipped Atleato — an AI fitness coach app with 5 distinct coach personalities. Open to honest feedback.

**Body:**
```
After 12 months solo (React Native + Expo + Supabase), I launched Atleato today on Google Play.

The pitch: 5 AI coaching personas, each with their own training philosophy, voice, color scheme, and motivational style. Switch coaches → the whole app transforms.

Tech I used:
- React Native + Expo SDK 54
- MoveNet (17-joint pose detection, runs on-device)
- Supabase (auth, DB, storage)
- Notifee (notifications + system call escalation)
- Expo Speech (TTS with per-persona pitch/rate)
- Three.js for the website 3D landing demos

Hardest parts:
- Making wake-up calls ACTUALLY ring like a real phone call on Android (had to use Notifee's full-screen intent + AndroidCategory.CALL + bypassDnd flag — even then it took 3 weeks of edge case fixes)
- On-device pose detection at 30fps without killing the battery (ended up at 6fps detection + 60fps interpolation = looks identical, runs 5x more efficient)
- Persona theming that doesn't feel like a "skin" — built a full design token system per coach

Stack screenshots, demo videos, and waitlist at: atleato.com

What I'd love feedback on:
1. Onboarding flow — does the 5-step persona picker feel exciting or overwhelming?
2. Pricing — Free / $9.99 PRO / $19.99 LEGEND. Right ladder?
3. The "real wake-up calls" gimmick — would you use it or turn it off?

Roast me. I read every comment.
```

**Best time:** Monday/Wednesday 8-10am EST
**Why it works:** Other devs LOVE technical breakdown + honest "what didn't work" sections

---

## POST 5 — r/Entrepreneur or r/Indiehackers

**Title:** From idea to launched on Google Play in 12 months — solo, bootstrapped, $0 in funding. AMA about Atleato.

**Body:**
```
TL;DR: Bootstrapped solo founder, just shipped my first SaaS app. Atleato is an AI fitness coach with 5 personas. Live on Google Play today. Happy to answer anything.

The numbers so far:
- Days from idea to MVP: 47
- Days from MVP to public launch: 312
- Personal cost: $25 (Google Play developer fee) + $15 (domain) + my time
- Recurring cost: $0 (Supabase free tier, GitHub Pages, Lemon Squeezy free)
- Pre-launch waitlist: {WAITLIST_COUNT} emails
- Vanguard Passes sold pre-launch: {VANGUARD_COUNT} × $1.99 = ${REVENUE}

The strategy:
1. Build in public on Twitter (12 months, daily posts)
2. Free pre-launch waitlist + $1.99 "Vanguard Pass" with founder benefits
3. Refer-3-friends-get-it-free viral mechanic
4. Launch on Google Play first (way easier than App Store), iOS later

Things I'd do differently:
- Start collecting emails BEFORE writing any code
- Charge sooner — launched paid waitlist 6 months in, should have been month 1
- Pick a smaller niche initially — "fitness" is too broad

If you're building solo, my real takeaway: it's not about the code. It's about the consistency of shipping + telling people. Most of my time the last 3 months was content, not code.

Ask me anything — pricing, tech stack, marketing, mistakes, retention strategies, billing setup, anything.

App: atleato.com
```

**Best time:** Tuesday-Thursday 7-9am EST
**Why it works:** Founders LOVE behind-the-scenes numbers + AMA format. Be 100% honest about the numbers.

---

## Reddit Engagement Rules (CRITICAL)

1. **Never post the same content** — each subreddit gets its own variant
2. **First 2 hours = critical** — reply to every comment fast
3. **Don't get defensive** — if someone roasts the app, thank them genuinely
4. **Karma:** have at least 100 karma before posting (use existing account, don't create new)
5. **Don't crosspost** — Reddit's spam filter hates it
6. **Include screenshots** — Reddit posts with images perform 3x better
7. **Use the title formula:** [What you built] + [interesting hook] + [ask for feedback/AMA]

## What NOT to Post

❌ "Check out my new app!" → instant downvote spiral
❌ Anything that looks like a press release
❌ Multiple posts in a week on same subreddit
❌ Direct comparisons to existing products (e.g., "better than MyFitnessPal")
❌ Discount codes in title — looks like spam
