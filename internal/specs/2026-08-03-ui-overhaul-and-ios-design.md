# Evulto — Full UI Overhaul (Dark + Light) & iOS Support

**Status:** Approved to proceed (2026-08-03)
**Goal:** Rebuild the app's entire visual layer around a two-theme token system, redesign every screen to modern reference patterns, and make the codebase iOS-buildable.

---

## 1. Why

Founder feedback: *"our app looks boring… it's slow, odd, buggy… I don't like the app."* Competing fitness apps feel fluid and premium; Evulto currently feels like a functional prototype. Inspiration set: Refero, SaaS Frame, Godly, UXArchive, Awwwards, Dribbble, Dark Mode Design.

Two outcomes define success:
1. A user opening Evulto for the first time believes it is a shipped commercial product.
2. The same codebase produces an iOS build.

---

## 2. Scope decisions (locked)

| Decision | Choice |
|---|---|
| Themes | **Dark + Light, user-switchable**, follows system by default |
| Default on first install | **Dark ("Midnight Slate")** |
| Redesign depth | **Full redesign of every screen** |
| Platforms | Android (existing) **+ iOS (new)** |

Non-negotiable constraints carried from prior work:
- Android package `com.madsales.atleato`, iOS bundle `com.madsales.atleato`, scheme `atleato`, social handles `@atleato*` — **never change**.
- Per-coach accent colors remain the identity system (Sculptor emerald `#12B981`, Monument gold, Analyst blue, Commander red, Architect deep emerald).
- Secrets stay server-side. `.env.local` stays gitignored.

---

## 3. Architecture — the theme system

Today colors are imported as constants (`Colors.primary`, `Colors.surface`) resolved at module load. That cannot support runtime theme switching. The redesign replaces this with a **three-layer token system**.

```
Layer 1  PRIMITIVES   raw values, never used directly in components
         slate900 #0B0F14 · slate800 #131A22 · emerald500 #12B981 · …

Layer 2  SEMANTIC     meaning, not appearance — components use ONLY these
         bg · bgElevated · surface · surfaceHover · border ·
         text · textSecondary · textTertiary · accent · accentInk ·
         success · warning · danger · overlay · scrim

Layer 3  COMPONENT    per-component overrides where needed
         card.bg · tabBar.bg · chip.border · …
```

Two palettes bind to Layer 2:
- **Midnight Slate (dark, default)** — deep desaturated slate grounds, single luminous accent, generous negative space. Elevation via lightness + subtle border, not heavy shadow (shadows read as mud on dark).
- **Instrument Light** — evolution of today's light theme; warmer neutrals, softer cards, restored contrast.

**Delivery mechanism:** a `ThemeProvider` at the root exposes tokens through `useTheme()`. Zustand holds the choice (`system | dark | light`), persisted to AsyncStorage, hydrated before first paint to prevent a flash of the wrong theme.

**Migration rule:** `StyleSheet.create` with static colors cannot react to theme changes. Components move to a `useThemedStyles(fn)` hook that memoizes per-theme. This is mechanical, and it is the single largest work item in the project.

### Accessibility floor
Every semantic pair must meet **WCAG AA (4.5:1)** for body text and **3:1** for large text and interactive borders, verified in both themes. Accent-on-background combinations are checked per coach persona — five accents × two themes.

---

## 4. Motion — "bold & punchy"

The approved motion primitives already exist (`components/ui/motion/`: `PressableScale`, `Skeleton`, `CountUp`, `AnimatedRing`). The overhaul makes them universal rather than opt-in.

| Rule | Spec |
|---|---|
| Every tap | spring scale to 0.94, haptic (heavy for primary/danger, light otherwise) |
| Every number | counts up on first appearance, never pops in |
| Every load | shimmer skeleton in the shape of the content — never a bare spinner |
| Screen transitions | shared-element where an object persists; slide + fade otherwise |
| List entry | staggered fade-slide, 30ms apart, capped at 8 items |
| Timing | 200ms standard, 320ms for entrances, spring (damping 18, stiffness 220) for interaction |

**Performance budget:** all animation runs on the UI thread via Reanimated worklets. Target 60fps on a mid-range Android. Any animation that cannot hold 60fps is cut, not shipped degraded.

---

## 5. Redesign waves

Each wave leaves the app **fully buildable and shippable**. No wave blocks a launch.

### Wave 0 — Foundation
Token system, `ThemeProvider`, `useThemedStyles`, both palettes, settings toggle, contrast audit. Visually near-identical to today when Light is selected — this wave is infrastructure. Motion primitives extended (page transitions, stagger helper).

### Wave 1 — Screens users live in
Full layout redesign: **Home, Workout list, Active workout session, Coach tab, Form Check, Eat, Progress.**
Patterns drawn from reference galleries: card-based information hierarchy, oversized numeric displays for key metrics, bottom-sheet detail rather than full-screen push, sticky contextual action bars.

### Wave 2 — Conversion and identity surfaces
Onboarding flow (UXArchive step patterns — progress dots, single-question screens, momentum), paywall/upsell, profile, settings, recovery check-in.

### Wave 3 — Long tail
Remaining ~20 screens: squads, leaderboard, reminders, avatar, physique check-ins, developer/API screens. Re-skinned to the system; redesigned where the cost is low.

---

## 6. iOS support

### 6.1 The hard constraint (must be understood before planning)

**iOS binaries cannot be compiled on Windows.** Apple's toolchain (Xcode) is macOS-only. This is a platform law, not a project limitation. Two viable paths:

| Path | Works from Windows | Cost | Notes |
|---|---|---|---|
| **EAS Build (cloud)** — recommended | ✅ Yes | Expo free tier available; paid tiers faster | `eas.json` already exists. Builds on Expo's macOS fleet. |
| Local Mac / Mac mini / cloud Mac | ❌ Needs a Mac | Hardware or rental | Only needed for deep native debugging |

**Apple Developer Program membership ($99/year) is required** to install on a physical device or ship to TestFlight/App Store. A simulator build can be produced without it, but cannot run on a real iPhone.

> **Action required from founder:** enroll in the Apple Developer Program. Nothing below can reach a real device until this exists.

### 6.2 Code-level iOS work (can be done now, no Mac needed)

**a) Generate the iOS project.** No `ios/` folder exists. `npx expo prebuild --platform ios` generates it. Because the project is prebuilt (checked-in native folders), this is a one-time generation that then gets committed.

**b) `eas.json` has no iOS section.** Add `ios` build profiles for `preview` (simulator + internal distribution) and `production` (App Store).

**c) Patch the iOS pose detector — CONFIRMED BUG.**
`node_modules/@scottjgilroy/…/ios/VisionCameraV3PoseDetection.m` line 40 constructs `MLKPoseDetector` **inside the per-frame callback**:

```objc
MLKPoseDetector *poseDetector = [MLKPoseDetector poseDetectorWithOptions:options];
```

This is the identical defect fixed on Android (patch `@scottjgilroy+…+1.2.2.patch`, Android-only). A fresh detector per frame destroys MLKit's `Stream` mode tracking — the source of the lag, jitter, and skeleton drift diagnosed in the 11-agent audit. **Form Check would ship broken on iOS without an equivalent iOS patch** hoisting the detector to an instance field.

**d) Android-only features need iOS equivalents or graceful absence:**

| Feature | Android mechanism | iOS plan |
|---|---|---|
| Per-coach app icon | `activity-alias` + `setComponentEnabledSetting` | `setAlternateIconName` — different API; icons must be pre-declared in `Info.plist`. Requires a new native module path. |
| Full-screen coach call | `withFullScreenCall` plugin, full-screen intent | CallKit — genuinely different model. Wake-up calls behave differently; may degrade to a notification. |
| Health data | `react-native-health-connect` (Android only) | `@kingstinct/react-native-healthkit` — **already a dependency**. Needs wiring + `NSHealthShareUsageDescription`. |
| Billing | Play Billing / RevenueCat | StoreKit via RevenueCat — same SDK, separate product setup in App Store Connect. |
| `withGradleMemory` plugin | Gradle memory tuning | No-op on iOS; harmless. |

**e) `Info.plist` permission strings.** iOS rejects builds lacking usage descriptions. Required: camera (`NSCameraUsageDescription`), microphone (`NSMicrophoneUsageDescription` — coach calls), photo library, HealthKit share/update, notifications. Each needs human-readable copy explaining *why*.

**f) Layout safety.** Dynamic Island / notch and the home indicator require `SafeAreaView` discipline. The redesign is authored iOS-aware from the start, which is cheaper than retrofitting.

### 6.3 iOS sequencing

iOS work is **interleaved, not appended**: every redesigned screen is authored against both platforms' safe areas and both themes as it is built. Native-module work (icon switching, CallKit, HealthKit) runs as its own track after Wave 1, once the Apple account exists.

---

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Theme migration touches every file | Large diff, regression risk | Wave 0 ships alone and is verified before any redesign |
| iOS pose detector patch untestable without a Mac/device | Form Check may still misbehave on iOS | Patch mirrors the proven Android fix; verify on TestFlight before App Store |
| No Apple Developer account | iOS cannot reach a device at all | Flagged as blocking; enroll early — approval can take days |
| Dark-mode contrast regressions | Unreadable text | Automated contrast check over the token matrix, both themes |
| Scope (every screen) vs. launch timing | Redesign delays release | Wave structure — app is shippable after every wave |
| R8/obfuscated release crashes | Ships broken | Existing rule holds: runtime smoke-test every release APK |

---

## 8. Verification

- **Contrast:** scripted AA check across the full semantic token matrix × 2 themes × 5 coach accents.
- **Both themes:** every redesigned screen reviewed in dark and light before its wave closes.
- **Performance:** no dropped frames on a mid-range Android during list scroll and screen transition.
- **Build integrity:** existing discipline continues — never trust an exit code; unzip the release APK and confirm new strings are in the Hermes bundle.
- **iOS:** simulator build green in EAS; device/TestFlight verification once the Apple account exists.

---

## 9. Out of scope

Backend/API changes · new features · pricing/packaging changes · the pending Supabase `ai-coach-chat` deploy (separate, already-fixed work) · web (`docs/`) marketing site restyle.
