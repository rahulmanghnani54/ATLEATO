# Physique Analysis — Sprint 3 Design Spec

**Date:** 2026-05-15
**Status:** Approved
**Scope:** Periodic encrypted physique check-ins, AI body composition scoring, timeline gallery, side-by-side comparison, progress tab physique sub-tab.

---

## 1. Overview

Users take periodic physique photos (front required, side and back optional) on a self-set cadence. Each photo is AES-256-GCM encrypted on-device before upload. Claude Vision scores each check-in individually (fullness, leanness, symmetry 1–10) and produces a persona-voiced narrative. Users can also select any two check-ins for a side-by-side comparison with score deltas.

---

## 2. Encryption Architecture

### Key derivation
- The encryption key is **32 bytes derived deterministically** using HKDF:
  - IKM: `user_id` (UUID, from Supabase auth)
  - Salt: server-side secret string stored as a Supabase edge function environment variable (`PHYSIQUE_KEY_SALT`)
  - Info: `"fitai-physique-v1"`
  - Hash: SHA-256
- This produces the same key on any device as long as the user is authenticated. No separate key backup needed.
- The derived key is stored in `expo-secure-store` under `physique_enc_key_{userId}` after first derivation to avoid re-deriving on every read.

### Encryption per photo
- Each photo is resized to max 1024px on its longest edge and compressed to JPEG at 80% quality before encryption.
- Encrypted using **AES-256-GCM**: 12-byte random IV prepended to ciphertext. Output stored as binary `.enc` file.
- Stored in Supabase Storage bucket `physique-photos` (private, RLS-gated) at path `{userId}/{checkinId}/{pose}.enc`.
- Supabase Storage never receives plaintext photo data.

### Thumbnail
- A low-resolution version (max 200px, JPEG 60%) is also encrypted and stored at `{userId}/{checkinId}/{pose}-thumb.enc`.
- Thumbnails are decrypted on-the-fly for gallery display, avoiding full-size decryption just to render a grid.

### Decryption for AI analysis
- Device decrypts the relevant photos in-memory.
- Decrypted JPEG bytes sent over HTTPS to the `analyze-physique` edge function.
- Edge function calls Claude Vision API. Decrypted images are **never persisted server-side** — they exist only in the edge function's memory for the duration of the request.
- Analysis results (scores + narrative text) are stored plaintext in `physique_analyses` — they are not sensitive.

---

## 3. Database Schema

### `physique_checkins`
```sql
CREATE TABLE physique_checkins (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  date         DATE NOT NULL,
  cadence      TEXT CHECK (cadence IN ('weekly','biweekly','monthly')) NOT NULL DEFAULT 'biweekly',
  pose_count   INT NOT NULL DEFAULT 1,
  front_path   TEXT NOT NULL,              -- encrypted blob path
  side_path    TEXT,                        -- null if not captured
  back_path    TEXT,                        -- null if not captured
  front_thumb  TEXT NOT NULL,              -- encrypted thumbnail path
  side_thumb   TEXT,
  back_thumb   TEXT,
  -- Auto-scored individually on upload (nullable until scoring completes)
  fullness_score   INT CHECK (fullness_score BETWEEN 1 AND 10),
  leanness_score   INT CHECK (leanness_score BETWEEN 1 AND 10),
  symmetry_score   INT CHECK (symmetry_score BETWEEN 1 AND 10),
  auto_narrative   TEXT,                   -- persona-voiced single-photo narrative
  scored_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
```

### `physique_analyses`
```sql
CREATE TABLE physique_analyses (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  checkin_a_id    UUID REFERENCES physique_checkins(id) ON DELETE CASCADE NOT NULL,
  checkin_b_id    UUID REFERENCES physique_checkins(id) ON DELETE CASCADE NOT NULL,
  -- Scores for each check-in in this comparison
  fullness_a      INT, leanness_a INT, symmetry_a INT,
  fullness_b      INT, leanness_b INT, symmetry_b INT,
  narrative       TEXT NOT NULL,           -- persona-voiced comparison narrative
  persona         TEXT NOT NULL DEFAULT 'cbum',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(checkin_a_id, checkin_b_id)
);
```

### RLS
- All rows gated on `auth.uid() = user_id` for SELECT, INSERT, UPDATE, DELETE.
- Storage bucket `physique-photos` has a policy: authenticated users can read/write only within their own `{userId}/` prefix.

---

## 4. Edge Function: `analyze-physique`

**Endpoint:** `POST /functions/v1/analyze-physique`

**Auth:** Supabase JWT (same pattern as existing edge functions).

**Rate limit:** 10 requests per hour per user (photos are expensive to analyze).

**Request body:**
```typescript
{
  mode: 'single' | 'compare';
  persona: string;                        // e.g. 'cbum'
  // mode === 'single':
  frontImageBase64?: string;
  sideImageBase64?: string;
  backImageBase64?: string;
  // mode === 'compare':
  checkinAImages?: { front?: string; side?: string; back?: string };
  checkinBImages?: { front?: string; side?: string; back?: string };
  checkinADate?: string;
  checkinBDate?: string;
}
```

**Response (single mode):**
```typescript
{
  fullness: number;    // 1–10
  leanness: number;
  symmetry: number;
  narrative: string;   // persona-voiced, ~80 words
}
```

**Response (compare mode):**
```typescript
{
  scoresA: { fullness: number; leanness: number; symmetry: number };
  scoresB: { fullness: number; leanness: number; symmetry: number };
  narrative: string;   // persona-voiced comparison, ~100 words
}
```

**Claude prompt strategy:**
- System: "You are a world-class physique coach. Respond in the voice of {personaVoice}."
- User message includes the image(s) and structured instructions to return JSON scores followed by a narrative paragraph.
- Max tokens: 300 for single, 400 for compare.
- Response parsed as: JSON block first (scores), then narrative text after a delimiter.

---

## 5. Encryption Library: `lib/physiqueEncryption.ts`

Exports:
```typescript
// Derive or load key for the current user
getPhysiqueKey(userId: string): Promise<CryptoKey>

// Encrypt a JPEG Uint8Array → { iv: Uint8Array, ciphertext: Uint8Array }
encryptPhoto(key: CryptoKey, jpegBytes: Uint8Array): Promise<EncryptedBlob>

// Decrypt an encrypted blob → JPEG Uint8Array
decryptPhoto(key: CryptoKey, blob: EncryptedBlob): Promise<Uint8Array>

// Compress + resize a photo URI → Uint8Array (uses expo-image-manipulator)
preparePhoto(uri: string, maxSize: number, quality: number): Promise<Uint8Array>
```

Uses `expo-crypto` for `getRandomValues` (IV generation) and React Native's `crypto.subtle` (available via Hermes) for AES-GCM and HKDF operations. Falls back to `expo-crypto`'s `digestStringAsync` if `subtle` is unavailable.

**Required new dependency:** `expo-image-manipulator` (for resize/compress before encryption). Add to `package.json` dependencies.

---

## 6. UI Screens & Components

### `app/(tabs)/progress.tsx` — modifications
- Add a `STATS | PHYSIQUE` toggle at the top (pill-style, matching existing app aesthetic).
- `STATS` tab: existing content unchanged (volume chart, AI review, PRs, achievements).
- `PHYSIQUE` tab: renders `<PhysiqueGallery />`.
- First-time physique tab open: show `<PhysiquePrivacyCard />` once (persisted to AsyncStorage).

### `components/progress/PhysiquePrivacyCard.tsx`
- One-time card: "🔒 Your physique photos are encrypted on your device before upload. Only you can see them — not even our servers."
- Dismiss button. Stored dismissed state in AsyncStorage key `physique_privacy_dismissed`.

### `components/progress/PhysiqueGallery.tsx`
- 2-column photo grid, newest check-in first.
- Each cell: decrypted thumbnail + date label + pose count badge.
- First cell (top-left): always a "＋ NEW CHECK-IN" action card.
- Selection mode: tap one photo → highlighted border → tap another → "COMPARE" button appears at bottom.
- Shows "Next check-in due: {date}" banner based on last check-in date + cadence.
- Shows a cadence selector (Weekly / Bi-weekly / Monthly) in the gallery header so users can update their cadence at any time after the first check-in.

### `app/physique-checkin.tsx` — multi-step capture wizard
Steps:
1. **Cadence selection** (first check-in only): Weekly / Bi-weekly / Monthly
2. **Front photo** (required): camera capture or pick from library via `expo-image-picker`
3. **Side photo** (optional): same, with SKIP button
4. **Back photo** (optional): same, with SKIP button
5. **Processing screen**: compress → encrypt → upload each photo → call `analyze-physique` (single mode) → save to DB
6. **Done screen**: shows auto-scored results + "View in timeline" button

### `app/physique-compare.tsx` — compare screen
Layout (top to bottom):
1. **Header**: back button + dates of both check-ins
2. **Pose switcher**: FRONT · SIDE · BACK pill toggle (only shows poses captured in both check-ins)
3. **Side-by-side photos**: two decrypted images at equal width, date labels below each
4. **Score chips**: three chips — Fullness, Leanness, Symmetry — each showing before/after values with a delta arrow (↑ green, ↓ amber, → grey)
5. **AI narrative card**: `✦ {PERSONA} SAYS` header + persona-voiced comparison text
6. If no analysis yet: single "ANALYSE" button → triggers edge function call → updates UI

### `components/progress/PhysiqueScoreCard.tsx`
- Reusable score chip: label, score A, arrow, score B, color-coded delta.
- Used in both compare screen and the processing/done screen.

---

## 7. Hooks: `hooks/usePhysiqueCheckins.ts`

```typescript
usePysiqueCheckins()        // fetch all checkins for user, ordered by date desc
usePhysiqueCheckin(id)      // fetch single checkin
useSubmitCheckin()          // mutation: encrypt + upload + score + save
usePhysiqueAnalysis(aId, bId) // fetch or trigger comparison analysis
useScheduleCheckinReminder(cadence, lastDate) // schedules expo-notification
```

---

## 8. Notifications

On check-in submission, `useScheduleCheckinReminder` cancels any existing physique reminder and schedules a new local push notification:
- **Title:** "📸 Physique check-in due"
- **Body:** "Time to take your {cadence} progress photo. Keep the streak going."
- **Trigger:** `lastDate + cadence days` at 9:00 AM local time
- Uses `expo-notifications` `scheduleNotificationAsync` with a `DateTriggerInput`.
- Notification identifier stored in AsyncStorage key `physique_reminder_id` so it can be cancelled/rescheduled.

---

## 9. New Files Summary

| File | Action |
|------|--------|
| `supabase/migrations/005_physique.sql` | Create tables + RLS |
| `supabase/functions/analyze-physique/index.ts` | Edge function |
| `lib/physiqueEncryption.ts` | Key derivation + AES-GCM encrypt/decrypt |
| `lib/api/edgeFunctions.ts` | Add `analyzePhysique()` |
| `hooks/usePhysiqueCheckins.ts` | TanStack Query hooks |
| `app/physique-checkin.tsx` | Multi-step capture wizard |
| `app/physique-compare.tsx` | Compare screen |
| `components/progress/PhysiqueGallery.tsx` | 2-col grid with selection |
| `components/progress/PhysiqueScoreCard.tsx` | Score delta chip |
| `components/progress/PhysiquePrivacyCard.tsx` | One-time privacy notice |

| File | Modification |
|------|-------------|
| `app/(tabs)/progress.tsx` | STATS/PHYSIQUE toggle, PhysiqueGallery integration |
| `lib/api/edgeFunctions.ts` | `analyzePhysique()` function |

---

## 10. Out of Scope (future sprints)

- Score-over-time line chart (foundation laid via `fullness_score`, `leanness_score`, `symmetry_score` columns on `physique_checkins`)
- Body measurement logging (waist, chest, arms)
- Photo sharing or export
- Side-by-side slider (drag to reveal before/after)
- AI meal/training recommendations based on physique trend
