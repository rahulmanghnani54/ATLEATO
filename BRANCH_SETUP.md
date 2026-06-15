# Branch Setup — Install-Referral Attribution

The referral reward now counts **real app installs** (10 → 1 month Pro free),
attributed via Branch deferred deep links. The code is built and fails safe
(no Branch key = feature dormant, app unaffected). To turn it on:

## 1. Create a Branch account
- Sign up at https://dashboard.branch.io (free tier covers up to 10k MAU).
- Create an app. Grab the **Branch Key** (`key_live_xxxxxxxx`).

## 2. Configure the Branch dashboard
- **Android:** add package name `com.madsales.atleato` + your SHA-256 cert
  fingerprint (from `eas credentials -p android` → preview/production profile).
- **iOS:** add bundle id `com.madsales.atleato` (when you ship iOS).
- **Link domain:** use the default `atleato.app.link` or set a custom domain.
- **Default link settings:** redirect to the Play Store listing (so taps that
  don't have the app installed go install it — that's the deferred deep link).

## 3. Set the key for builds
```cmd
cd C:\Dev\fitai-pro-app
eas env:create --environment preview --name EXPO_PUBLIC_BRANCH_KEY --value key_live_xxxxxxxx --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_BRANCH_KEY --value key_live_xxxxxxxx --visibility plaintext
```
`app.config.js` only adds the Branch native plugin when this key is present.

## 4. Apply the migration + rebuild
```cmd
supabase db push            # migration 018 (referred_by + install count + 10-threshold reward)
eas build -p android --profile preview
```
Branch is a native module → it only activates in a fresh build, not OTA.

## How it works once live
1. User taps **Share link** on the Referral screen → Branch link carrying their code.
2. Friend taps it → installs from Play Store → first open, Branch returns the
   code (deferred deep link) → `set_referrer(code)` stamps their profile.
3. `install_referral_count()` counts installs referred by each user.
4. At **10**, `claim_referral_reward()` grants 1 month Pro (server-side, once).

## Risks / notes
- **New Architecture:** this app runs RN New Arch (worklets/vision-camera need
  it). react-native-branch 6.10 supports New Arch, but verify the first dev
  build boots cleanly before relying on it. If it conflicts, the lazy-load
  catch keeps the app running — referrals just won't attribute until resolved.
- **Sideloaded APKs** (the preview builds you've been installing directly) do
  NOT get Play Store deferred deep links — install attribution works for
  **Play Store installs**. Test the full loop once the app is in Play
  closed-testing, not via sideload.
- **Fraud:** 10 installs is harder to fake than 3 waitlist emails, but a
  determined user could still self-install on emulators. Acceptable for launch;
  tighten (require referred users to complete onboarding / stay 7 days) if abused.
