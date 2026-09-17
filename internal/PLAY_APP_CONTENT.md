# Play Console — "App content" answers (Evulto)

Prepared 2026-09-17 from the shipping code. Package `com.madsales.atleato`, app name **Evulto**.
Answers are grounded in files cited inline. **⚠️ = a decision or action only you can take.**
Nothing here is legal advice; it reflects what the code actually does.

---

## 1. Privacy policy
- **URL to enter:** `https://evulto.com/privacy`
- ⚠️ **Redeploy evulto.com FIRST.** The corrected policy is committed (`docs/privacy.html`, discloses photos→Anthropic, no location section, names PostHog + Sentry) but the **live page still serves the old "Territory game / GPS" policy**. Entering the URL while it's stale = a privacy policy that doesn't match the app → rejection. Verify after deploy: `curl -s https://evulto.com/privacy | grep -i "unencrypted, over an encrypted connection"` should return a line.

## 2. App access (sign-in details)
- The app is **fully gated behind login** — Supabase email/password + Google OAuth (`app/(auth)/signup.tsx`, `lib/socialAuth.ts`, `app/_layout.tsx`). Reviewers cannot see anything without an account.
- Choose **"All or some functionality is restricted"** → provide credentials.
- ⚠️ **Create a dedicated review account** (email/password — do NOT give reviewers a Google-OAuth-only login, they can't complete it). Suggested:
  - Instructions for reviewer: "Open the app → Sign in with the email and password below → you land on the dashboard. All features are available on this account."
  - Provide a working **email + password** for that account. The owner "Demo Account" is a comped Legend, which is ideal (reviewers see every paid feature). Paid CTAs read "coming soon" so no purchase is needed to review.
- No OTP/2FA on the account (so no "additional instructions" needed).

## 3. Ads
- **No ads.** No AdMob or any ad SDK (`package.json` has no `google-mobile-ads`/ad network; no `AD_ID` permission in the manifest).
- Answer: **"No, my app does not contain ads."**

## 4. Content rating (IARC questionnaire)
- **Category:** Utility / Productivity / Communication → choose **Health & Fitness** if offered, else Reference.
- Answers (all grounded in the app):
  - Violence / scary content: **No**
  - Sexual content / nudity: **No** — physique progress photos are the user's own fitness photos in gym wear, non-sexual; they are private to the user and their AI coach, never shared to other users.
  - Profanity: **No**
  - Controlled substances (drugs/alcohol/tobacco): **No**
  - Gambling / simulated gambling: **No** (the "stake" feature is disabled/"coming soon" and takes no money — see §8)
  - **Users can interact / user-generated content shared with others: No.** There is no user-to-user messaging and no public UGC. The only chat is user↔AI coach (`app/(tabs)/coach.tsx`); it is not shared with other users.
  - Shares user's location: **No** (no location code or permission)
  - Digital purchases: **Yes** (subscriptions — even though billing is currently off, the products exist)
  - **AI-generated content: Yes** — the app has an AI coach chat and AI photo analysis, with an in-app "Report response" control (added in `app/(tabs)/coach.tsx`) and AI labelling.
- Expected result: **Everyone / PEGI 3** (or **Teen** if the AI-interaction questions push it up). Let IARC compute it from honest answers — do not hand-pick a rating.

## 5. Target audience & content
- ⚠️ **Decision — recommended: 18 and over** (or 16–17 + 18+). Rationale: the app has AI-generated coaching and body-image/physique analysis; excluding under-18 avoids the Families policy obligations and reduces scrutiny on body photos + open AI chat. 13+ is defensible but pulls in more requirements.
- ⚠️ The Terms (`docs/terms.html`) do **not currently state a minimum age** — add one that matches whatever you pick here.
- "Appeals to children" / store presence targeting children: **No.**
- "Designed for Families": **No.**

## 6. Data safety
Reviewers cross-check this against runtime behaviour, so it must match the SDK inventory below. **Key rule:** Anthropic, ElevenLabs, Sentry, PostHog, Supabase and RevenueCat are **service providers processing on Evulto's behalf** → under Play's definition this is **"Collected", NOT "Shared".** Nothing is sold or shared for ads.

**Global answers:**
- Is data encrypted in transit? **Yes** (HTTPS/TLS everywhere; physique photos also AES-256-GCM at rest, `lib/physiqueEncryption.ts`).
- Can users request deletion? **Yes** — in-app "Delete account" (`app/profile.tsx:213` → `supabase/functions/delete-account`) plus email to hello@evulto.com.
- Committed to Play's Families policy: only if you include under-13 (you won't) → **No**.

**Data types — declare Collected = Yes, Shared = No for each, encrypted in transit, deletable:**

| Data type (Play category) | Collected | Why / evidence | Purpose | Required? |
|---|---|---|---|---|
| Email address (Personal info) | Yes | Supabase auth | Account management | Required |
| Name (Personal info) | Yes | profile display name | App functionality | Optional |
| User IDs (Personal info) | Yes | Supabase uid passed to Sentry/PostHog/RevenueCat | Analytics, crash, entitlement | Required |
| Health info (Health & fitness) | Yes | weight/height/age, physique scores, recovery/HRV manual inputs | App functionality | Optional |
| Fitness info (Health & fitness) | Yes | workouts, sets, activity | App functionality | Required |
| Photos (Photos & videos) | Yes | physique + food photos; sent to Anthropic (service provider) for analysis; physique encrypted at rest | App functionality | Optional |
| Voice or sound recordings (Audio) | Yes | mic audio streamed to ElevenLabs during a coach call; ephemeral, not stored | App functionality (the call) | Optional |
| App interactions (App activity) | Yes | PostHog product events (counts/durations/flags only) | Analytics | — |
| Crash logs (App info & performance) | Yes | Sentry | Crash reporting / diagnostics | — |
| Diagnostics (App info & performance) | Yes | Sentry/PostHog perf | Diagnostics | — |
| Device or other IDs | Yes | analytics/crash instance ids | Analytics, crash | — |

**Explicitly NOT collected (answer No):** Precise/approximate **location** (no location code or permission), **Financial info** (no payments taken yet; when Play Billing goes live, purchase history is handled by Google Play, declare then), **Contacts, Messages, Calendar, Browsing history, Installed apps**, and **Advertising ID** (no `AD_ID`).
- Coach **chat text**: sent to Anthropic to generate a reply; not shared, not sold. If stored, declare under "Other user-generated content"; if only processed transiently, you may omit — confirm your retention. (Currently the chat is not persisted server-side beyond the request.)

## 7. Government apps
- **No.** Evulto is not a government app and is not affiliated with or endorsed by any government.

## 8. Financial features
- **None apply.** Evulto is not a lending, banking, crypto, insurance, investment, or real-money-gambling app.
- Subscriptions are **digital in-app goods** via Google Play Billing (currently off) — that is not a "financial feature" in this section.
- ⚠️ **Future flag:** the Anti-Charity / Social **Stake** feature (`app/charity-stake.tsx`) is currently disabled ("coming soon", takes no money). If it ever launches holding refundable real money, revisit this section and the gambling question before enabling.

## 9. Health
- **Health Connect: No / not integrated.** The build declares **no Health Connect read permissions** — the `androidx.health` entries in the merged manifest are the SDK's service-binding boilerplate, not permissions. The Health/wearable sync in `app/health-dashboard.tsx` shows "sync coming soon" and uses **manual inputs only**; `lib/wearableHealth.ts` cannot read data without the permissions.
- **Not a medical app / device.** It provides general fitness, wellness, and nutrition coaching and AI body-composition *estimates* — it does not diagnose, treat, or prescribe. The AI surfaces now carry "AI estimate — not medical/professional advice" disclaimers (coach chat, physique, food) and nutrition no longer poses as a "registered dietitian".
- If asked whether the app targets medical/clinical use: **No — consumer fitness & wellness.**

---

## Blocking order before you can submit
1. **Redeploy evulto.com** (privacy policy) — §1.
2. Create the **reviewer account** and enter it — §2.
3. Fill **§3–§9** as above; pick **target age** (§5) and add a matching age line to the Terms.
4. Upload the **AAB** (building now), pick the Play-generated app-signing key, then add the **Play app-signing SHA-256** to `docs/.well-known/assetlinks.json` (App Links + magic-link sign-in) and redeploy.
