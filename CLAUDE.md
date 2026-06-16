# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Atleato — Project Guide

AI fitness coaching app. Pre-launch: collecting a waitlist while finishing the app. Five fictional AI "coach" personas; the hooks are **the coach calls your phone** and **live camera form correction**.

## Stack
- **App:** React Native 0.81.5 + Expo SDK 54 (expo-router, file-based) + TypeScript. New Architecture is ON (required by worklets/vision-camera).
- **Build:** EAS Build (cloud APK). Free plan has a monthly Android-build cap — don't burn builds debugging; verify locally first.
- **Backend:** Supabase — Postgres + RLS, Auth, Edge Functions (Deno), Storage.
- **Services:** Anthropic Claude (edge functions), Lemon Squeezy (payments), Resend (email), Expo Push, Notifee (calls).
- **Marketing site:** static `docs/` served by GitHub Pages at atleato.com (CNAME in `docs/`). Root `index.html`/`main.js` are stale duplicates — **edit `docs/`**.

## Build / deploy commands (run from C:\Dev\fitai-pro-app)
- App APK: `eas build -p android --profile preview`
- DB migrations: `supabase db push` (applies pending only)
- Edge function: `supabase functions deploy <name>` (cron ones add `--no-verify-jwt`)
- Secrets: `supabase secrets set NAME=value` · EAS env: `eas env:create --environment preview --name NAME --value V --visibility plaintext`

## Non-negotiable product constraints
1. **Honesty in copy.** Joining the waitlist grants NOTHING — it only sends an email. Never imply a plain signup is a confirmed Vanguard/founder/active pass. No fabricated counters/feeds ("X viewing", fake claimers) — show real data or nothing.
2. **No real celebrity names/catchphrases.** The 5 personas are original: The Sculptor, The Monument, The Analyst, The Commander, The Architect.
3. **Pricing — 3 tiers, cumulative:**
   - **Free** ($0): free features only
   - **Pro** ($9.99/mo): free + Pro features
   - **Legend** ($19.99/mo): free + Pro + Legend features
   The **Vanguard founding pass** (first 500 only) unlocks the **Legend tier**, earned EITHER by paying a one-time **$1.99** OR by **referring 3 friends** — with 1 month free Legend at launch. NEVER "lifetime".
4. **The anon Supabase key in client/site is safe ONLY because of RLS.** Waitlist/orders are locked to count-only RPCs (`waitlist_count`, `vanguard_claimed_count`, `referral_count`). Never add a permissive anon SELECT. Secrets (service role, Anthropic, Resend, LS, cron secrets) live only in Deno env.

## Architecture conventions
- **UI = "Direction C"** (Nike/Telegram): Plus Jakarta Sans (display) + Inter (body), Lucide icons (no emoji-as-icon, no JetBrains-mono labels), persona-accent theming via `lib/personaTheme.ts` (single source of truth — don't hardcode persona colors). Primitives in `components/ui/c/` (HeroBlock, Stat, RowCard, AnchorCTA).
- **Tier system:** `lib/subscriptionManager.ts` (effective tier = paid/cached, elevated by referral reward) + `lib/featureGates.ts`. Real IAP is stubbed (SDK-54 incompatible).
- **Native modules are lazy-loaded + fail-safe** (try/catch `require`): `react-native-callkeep`, `react-native-branch` (`lib/branchReferral.ts`), health (`lib/wearableHealth.ts`). Each is gated in `app.config.js` behind an env var (`EXPO_PUBLIC_BRANCH_KEY`, `EXPO_PUBLIC_ENABLE_HEALTH`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`) so builds stay green until configured. They only fully work on Play Store installs / real devices, not sideloaded APKs.
- **Migrations** `supabase/migrations/001…018`. Add the next number; never edit applied ones.

## Known gotchas
- **`tsc --noEmit` shows many errors that DON'T break the build:** `supabase/functions/**` (Deno globals + `https://` imports) are never bundled; custom-RPC calls need `(supabase.rpc as any)` casts. Metro/Babel strips types — there's no tsc gate in the build. Only act on errors in bundled app code.
- **JitPack flakiness:** EAS builds occasionally fail on `app.notifee:core` timing out from jitpack.io. Transient — just retry.
- **Metro ScrollView pitfall:** percentage heights collapse to 0 inside ScrollView; use `useWindowDimensions()` for absolute heights (see `components/ui/c/HeroBlock.tsx`).
- **Email clients strip `<style>` + CSS variables.** Emails must be inline-styled, table-based, literal colors (see `send-welcome-email` generateHTML). The hosted `docs/welcome-email.html` is the fancy "view in browser" version (browsers support CSS vars) — separate from the inbox email.
- **Windows:** CRLF warnings on commit are normal. Use the Bash tool's git from `/c/Dev/fitai-pro-app`.

## Reference docs (open the .html versions — Windows won't open .md)
`DEPLOY_CHECKLIST`, `LAUNCH_KIT`, `MARKETING`, `BRANCH_SETUP`, `HEALTH_SETUP` (each as `.html` at repo root).
