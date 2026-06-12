# Direction C — Per-Screen Migration Recipe

This document is the **pattern any future session follows** to migrate the
remaining ~40 screens to the Direction C (Nike/Telegram) aesthetic that
shipped on the Dashboard in commit XXXXXXX.

If you can follow this recipe, you can grind a screen in ~15-25 minutes
without any "what would look good here" guesswork. The visual decisions are
already made — your job is mechanical translation.

---

## What "Migrated" Means

A screen is migrated when:

1. **No `Fonts.legacyDisplay`** (Archivo Black) reference remains
2. **No `Fonts.legacyMono` / `Fonts.mono`** (JetBrains Mono) reference remains
3. **No `// uppercase mono kicker` text** anywhere
4. **No emoji used as a primary icon** (🔥, 💪, ⚡, 🏆, 📞, 🎙, 🍽 — banned)
5. **All icons come from `lucide-react-native`** (or are SVGs from the existing brand asset folder)
6. **Volt-green `Colors.systemAccent` only appears on toggles/switches/notification dots** — never as a content accent
7. **Persona accent (`persona.accent` via `personaFromProgramId`) is used as the primary content accent** in lieu of brand orange where the screen is persona-themed
8. **Uses Direction C primitives where they fit** — `HeroBlock`, `Stat`, `RowCard`, `AnchorCTA`

---

## The 6 Mechanical Substitutions

For each screen, run this checklist top-to-bottom. Each substitution is a
straight find/replace level of effort.

### 1. Font substitution

| Before | After |
|---|---|
| `Fonts.display` (= `ArchivoBlack_400Regular`) | `Fonts.display` (now `PlusJakartaSans_700Bold`) |
| `Fonts.mono` (= `JetBrainsMono_400Regular`) | **DELETE the element entirely** OR `Fonts.bodyMedium` if context demands |
| `Typography.h1` / `h2` | `Typography.heroName` (for hero) or `Typography.sectionTitle` (for sections) |
| `Typography.monoLabel` | **DELETE entirely** OR `Typography.statLabel` (Inter caps) if a label is still required |

The `Fonts.display` key is the same string so most screens automatically
swap to Plus Jakarta Sans without code changes. Anywhere using
`Fonts.legacyDisplay` should be removed.

### 2. Mono kicker removal

Search and destroy every `// SOMETHING` pattern:

```bash
grep -rn "// [A-Z]" app/ components/
```

Replace each with either:
- **Nothing** (often the kicker is redundant — the section title says it all)
- A `<Stat label="..." />` if the kicker was labeling a metric
- A subtle one-liner using `Typography.cardMeta`

### 3. Volt-green → persona accent OR remove

```bash
grep -rn "Colors.primary\|#dfff1f\|#c8ff3d" app/ components/ | grep -v "personaTheme\|systemAccent"
```

For each hit, decide:
- Is this a persona-themed screen? → `persona.accent`
- Is this a non-persona system action (toggle, switch)? → keep as `Colors.systemAccent`
- Is this just "the brand color" being overused? → `Colors.primary` (which is now orange, not lime)

### 4. Emoji icons → Lucide

Look for `<Text>` nodes containing emoji acting as an icon:

```bash
grep -rE "(🔥|💪|⚡|🏆|📞|🎙|🍽|🎯|🏋|⭐|🥇)" app/ components/
```

For each, choose the closest Lucide name from
[lucide.dev/icons](https://lucide.dev/icons) and import:

| Emoji | Lucide |
|---|---|
| 🔥 streak | `Flame` |
| 💪 strength | `Dumbbell` |
| ⚡ legend | `Zap` |
| 🏆 trophy / rank | `Trophy` |
| 📞 call | `Phone` |
| 🎙 voice | `Mic` |
| 🍽 nutrition | `UtensilsCrossed` |
| 🎯 goal | `Target` |
| 🏋 lift | `Dumbbell` |
| ⭐ star | `Star` |
| 🥇 first | `Award` |

Pattern:

```tsx
import { Flame } from 'lucide-react-native';
// ...
<Flame size={20} color={persona.accent} />
```

### 5. Replace ad-hoc cards/rows with `<RowCard>`

If the screen has a list of "icon + title + subtitle, tappable" rows
(streak card, workout card, settings row, etc.) — replace each with:

```tsx
import { Dumbbell } from 'lucide-react-native';
import { RowCard } from '@/components/ui/c';

<RowCard
  icon={<Dumbbell size={22} color={persona.accent} />}
  iconTintColor={persona.accent}
  title="Today's Workout"
  meta="Push · 55 min · 6 exercises"
  onPress={() => router.push('/workout-lobby')}
/>
```

Don't keep both the v0 card AND the new RowCard. Replace, don't supplement.

### 6. Anchor the primary action

If the screen has a primary CTA (a "START", "SAVE", "JOIN" button), move it
to an `<AnchorCTA>`:

```tsx
import { AnchorCTA } from '@/components/ui/c';

<AnchorCTA
  label="START PUSH DAY →"
  accent={persona.accent}
  accentInk={persona.ink}
  onPress={() => router.push('/workout-lobby')}
/>
```

Then add `paddingBottom: 110` to the scrolling content above so the last
row isn't covered by the button.

---

## Screen-by-Screen Priorities

Migrate in this order (each independently shippable):

### Phase 1 — Tab screens (5 files, highest visibility)

- ✅ `app/(tabs)/index.tsx` — Dashboard (already migrated, reference)
- [ ] `app/(tabs)/workouts.tsx` — HeroBlock + RowCard per program day
- [ ] `app/(tabs)/nutrition.tsx` — HeroBlock + Stat row for macros + RowCard for meal types
- [ ] `app/(tabs)/coach.tsx` — Chat UI keeps its bubbles, but header swaps to HeroBlock
- [ ] `app/(tabs)/territory.tsx` — Map stays, HUD chrome swaps to Stat tiles
- [ ] `app/(tabs)/progress.tsx` — Stat grid + RowCard per metric type

### Phase 2 — Workout flow (5 files)

- [ ] `app/workout-lobby.tsx`
- [ ] `app/workout-picker.tsx`
- [ ] `app/workout-session.tsx`
- [ ] `app/post-workout.tsx`
- [ ] `app/form-coach.tsx` (camera HUD)

### Phase 3 — Accountability + Calls (4 files)

- [ ] `app/social-stake.tsx`
- [ ] `app/charity-stake.tsx`
- [ ] `app/friend-scoreboard.tsx`
- [ ] `app/incoming-call.tsx`

### Phase 4 — Settings + Auxiliary (rest)

Everything else. Lower priority because users don't see them often.

---

## What NOT to Touch

- `lib/personaTheme.ts` — the persona accent system is correct as-is
- `constants/experts.ts` — workout content, not visual
- Anything in `supabase/` — backend
- `docs/` HTML pages — those have their own design language
- The login + sign-up screens — those use the legacy theme and that's fine
  (they're public, persona-less, brand-orange-by-default)

---

## Quality Gate Per Screen

Before marking a screen migrated, verify:

```bash
# 1. No legacy font references in the file
grep -E "legacyDisplay|legacyMono|Fonts\.mono\b" app/SCREEN.tsx
# (should output nothing)

# 2. No emoji in icons (manual scan, look for unicode in <Text> nodes)
grep -E "(🔥|💪|⚡|🏆|📞|🎙|🍽|🎯|🏋|⭐|🥇)" app/SCREEN.tsx
# (should output nothing)

# 3. No mono kickers
grep -E "// [A-Z]{3,}" app/SCREEN.tsx
# (should output nothing)

# 4. The screen still compiles
npx expo start --web --port 8081
# Navigate to the screen on web — no red error overlay
```

---

## When You Hit Friction

Common cases and how to resolve them:

### "This screen has a unique visual that doesn't fit the 4 primitives"

OK — build a 5th primitive in `components/ui/c/`. Keep it small, single-purpose,
named after what it represents (e.g., `MacroRing`, `RestTimer`).
Don't pad the primitive set with one-off custom components — those go in
`components/SCREEN/` next to the screen that owns them.

### "I need a chart"

Victory Native is already installed. Keep it. Set the `colors`
prop to `[persona.accent, persona.accentSoft, ...]` so charts match the
persona — don't use the default Victory palette which clashes hard with
both the dark theme and the persona accents.

### "The legacy v0 sub-component (e.g., StreakHero, ChainCalendarCard) had a lot of state"

You have two options:
- **Promote**: lift the state into the new screen, drop the v0 component.
  Higher effort, cleaner final result.
- **Wrap**: keep the v0 component but force its container to use the new
  spacing/radius. Low effort, leaves an aesthetic seam.

Pick "Promote" if the screen is in Phase 1 or 2. "Wrap" is acceptable for
Phase 4 if you're short on time.

---

## Smoke-Test Loop Per Screen

1. Migrate the screen per the 6 substitutions
2. Run `npx expo start --web --port 8081` if not already running
3. Navigate via the URL (`http://localhost:8081/SCREEN`) — no need to log in
   for most screens since the dev tooling lets you bypass auth on web
4. Eyeball it for the 6 AI tells — they should all be gone
5. Commit with `feat(ui-c): migrate SCREEN to Direction C` so each screen is a
   reviewable atomic commit
6. Update Phase 1/2/3/4 list above with `[x]` for the migrated screen
7. Repeat

---

## When the Migration Is Done

When all of Phase 1–4 are done, delete:

- `app/(tabs)/index-v0.tsx.bak` (the Dashboard backup)
- `Fonts.legacyDisplay` + `Fonts.legacyMono` (the Typography legacy presets too)
- `ArchivoBlack_400Regular` + `JetBrainsMono_*` from `app/_layout.tsx` `useFonts()`
- `@expo-google-fonts/archivo-black` + `@expo-google-fonts/jetbrains-mono` from `package.json`

That commit is the V1 theme cut-over — no v0 code remains and the bundle
ships ~600 KB lighter (two whole font families gone).
