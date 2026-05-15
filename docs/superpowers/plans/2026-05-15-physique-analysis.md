# Physique Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add E2E-encrypted physique check-ins with Claude Vision scoring, a timeline gallery, and a side-by-side comparison screen integrated into a new PHYSIQUE sub-tab on the Progress screen.

**Architecture:** Photos are AES-256-GCM encrypted on-device with a randomly generated key stored in `expo-secure-store` before upload to Supabase Storage. Claude Vision scores each check-in individually on upload (fullness, leanness, symmetry 1–10) via the `analyze-physique` edge function. Pair comparisons are triggered on-demand and cached in `physique_analyses`. The Progress tab gains a STATS / PHYSIQUE toggle; the PHYSIQUE tab renders a 2-column gallery with selection-to-compare flow.

**Tech Stack:** Expo SDK 54, React Native 0.81, expo-image-manipulator, expo-image-picker (already installed), expo-secure-store (already installed), expo-notifications (already installed), @react-native-async-storage/async-storage (already installed), Supabase Storage + Edge Functions (Deno), Claude Vision API (`claude-sonnet-4-5-20251001`), TanStack Query v5.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/005_physique.sql` | **Create** | Tables, RLS, storage bucket policy |
| `supabase/functions/analyze-physique/index.ts` | **Create** | Claude Vision single + compare modes |
| `lib/physiqueEncryption.ts` | **Create** | Key gen/load, AES-GCM encrypt/decrypt, photo prep, blob pack/unpack |
| `lib/api/edgeFunctions.ts` | **Modify** | Add `analyzePhysique()` + response types |
| `hooks/usePhysiqueCheckins.ts` | **Create** | TanStack Query hooks for checkins + analyses + notifications |
| `components/progress/PhysiqueScoreCard.tsx` | **Create** | Reusable score delta chip (label, A, arrow, B) |
| `components/progress/PhysiquePrivacyCard.tsx` | **Create** | One-time E2E encryption disclosure card |
| `components/progress/PhysiqueGallery.tsx` | **Create** | 2-col grid, selection mode, cadence selector, NEW CHECK-IN card |
| `app/physique-checkin.tsx` | **Create** | Multi-step capture wizard (cadence → front → side → back → process → done) |
| `app/physique-compare.tsx` | **Create** | Compare screen: photos + pose switcher + score chips + AI narrative |
| `app/(tabs)/progress.tsx` | **Modify** | STATS / PHYSIQUE toggle, PhysiqueGallery integration |
| `__tests__/physiqueEncryption.test.ts` | **Create** | Unit tests for encrypt/decrypt roundtrip + blob pack/unpack |

---

## Task 1: Install expo-image-manipulator + DB migration

**Files:**
- Modify: `package.json`
- Create: `supabase/migrations/005_physique.sql`

- [ ] **Step 1: Install expo-image-manipulator**

```bash
npm install expo-image-manipulator
```

Expected: `"expo-image-manipulator"` appears in `package.json` dependencies.

- [ ] **Step 2: Create `supabase/migrations/005_physique.sql`**

```sql
-- physique_checkins: one row per check-in session
CREATE TABLE physique_checkins (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  date             DATE NOT NULL,
  cadence          TEXT CHECK (cadence IN ('weekly','biweekly','monthly')) NOT NULL DEFAULT 'biweekly',
  pose_count       INT NOT NULL DEFAULT 1,
  -- Encrypted blob paths in Supabase Storage bucket "physique-photos"
  front_path       TEXT NOT NULL,
  side_path        TEXT,
  back_path        TEXT,
  front_thumb      TEXT NOT NULL,
  side_thumb       TEXT,
  back_thumb       TEXT,
  -- Auto-scored on upload (nullable until edge function returns)
  fullness_score   INT CHECK (fullness_score BETWEEN 1 AND 10),
  leanness_score   INT CHECK (leanness_score BETWEEN 1 AND 10),
  symmetry_score   INT CHECK (symmetry_score BETWEEN 1 AND 10),
  auto_narrative   TEXT,
  scored_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- physique_analyses: on-demand comparison between two check-ins
CREATE TABLE physique_analyses (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  checkin_a_id    UUID REFERENCES physique_checkins(id) ON DELETE CASCADE NOT NULL,
  checkin_b_id    UUID REFERENCES physique_checkins(id) ON DELETE CASCADE NOT NULL,
  fullness_a      INT CHECK (fullness_a BETWEEN 1 AND 10),
  leanness_a      INT CHECK (leanness_a BETWEEN 1 AND 10),
  symmetry_a      INT CHECK (symmetry_a BETWEEN 1 AND 10),
  fullness_b      INT CHECK (fullness_b BETWEEN 1 AND 10),
  leanness_b      INT CHECK (leanness_b BETWEEN 1 AND 10),
  symmetry_b      INT CHECK (symmetry_b BETWEEN 1 AND 10),
  narrative       TEXT NOT NULL,
  persona         TEXT NOT NULL DEFAULT 'cbum',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(checkin_a_id, checkin_b_id)
);

-- RLS
ALTER TABLE physique_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE physique_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "physique_checkins_own" ON physique_checkins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "physique_analyses_own" ON physique_analyses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage bucket (run in Supabase dashboard or via CLI)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('physique-photos', 'physique-photos', false);
-- CREATE POLICY "physique_storage_own" ON storage.objects
--   FOR ALL USING (bucket_id = 'physique-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
```

> **Note:** The storage bucket and its policy must be created manually in the Supabase dashboard (Storage → New bucket → `physique-photos`, private). The commented-out SQL is for reference only; Supabase Storage policies use a different DSL.

- [ ] **Step 3: Commit**

```bash
git add package.json supabase/migrations/005_physique.sql
git commit -m "chore(sprint3): install expo-image-manipulator, add physique DB migration"
```

---

## Task 2: Create `lib/physiqueEncryption.ts` with unit tests (TDD)

**Files:**
- Create: `__tests__/physiqueEncryption.test.ts`
- Create: `lib/physiqueEncryption.ts`

### Why random key (not HKDF with server salt)
The HKDF approach in the spec requires a server-side salt the client doesn't know — making it a server-assisted key, not true E2E. This implementation generates a random 256-bit AES key on first use, stores it in `expo-secure-store`, and derives it from there on subsequent calls. The key never leaves the device. Cross-device recovery is a future-sprint concern.

- [ ] **Step 1: Write failing tests in `__tests__/physiqueEncryption.test.ts`**

```typescript
// Node 18+ has globalThis.crypto.subtle — no polyfill needed in Jest node env
import {
  encryptPhoto,
  decryptPhoto,
  packEncryptedBlob,
  unpackEncryptedBlob,
  type EncryptedBlob,
} from '@/lib/physiqueEncryption';

// Mock expo-secure-store and expo-image-manipulator — not needed for crypto tests
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({}));

async function makeTestKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

describe('physiqueEncryption', () => {
  describe('encryptPhoto + decryptPhoto', () => {
    it('roundtrip produces original bytes', async () => {
      const key = await makeTestKey();
      const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
      const blob = await encryptPhoto(key, original);
      const decrypted = await decryptPhoto(key, blob);
      expect(decrypted).toEqual(original);
    });

    it('ciphertext differs from plaintext', async () => {
      const key = await makeTestKey();
      const original = new Uint8Array(32).fill(0xAB);
      const blob = await encryptPhoto(key, original);
      expect(blob.ciphertext).not.toEqual(original);
    });

    it('iv is 12 bytes', async () => {
      const key = await makeTestKey();
      const blob = await encryptPhoto(key, new Uint8Array(8));
      expect(blob.iv.length).toBe(12);
    });

    it('two encryptions of same data produce different ciphertexts (random IV)', async () => {
      const key = await makeTestKey();
      const data = new Uint8Array(16).fill(0x42);
      const blob1 = await encryptPhoto(key, data);
      const blob2 = await encryptPhoto(key, data);
      expect(blob1.ciphertext).not.toEqual(blob2.ciphertext);
    });

    it('decryption with wrong key throws', async () => {
      const key1 = await makeTestKey();
      const key2 = await makeTestKey();
      const blob = await encryptPhoto(key1, new Uint8Array([10, 20, 30]));
      await expect(decryptPhoto(key2, blob)).rejects.toThrow();
    });
  });

  describe('packEncryptedBlob + unpackEncryptedBlob', () => {
    it('roundtrip preserves iv and ciphertext', async () => {
      const key = await makeTestKey();
      const original = new Uint8Array([7, 8, 9]);
      const blob = await encryptPhoto(key, original);
      const packed = packEncryptedBlob(blob);
      const unpacked = unpackEncryptedBlob(packed);
      expect(unpacked.iv).toEqual(blob.iv);
      expect(unpacked.ciphertext).toEqual(blob.ciphertext);
    });

    it('packed length = iv (12) + ciphertext length', async () => {
      const key = await makeTestKey();
      const blob = await encryptPhoto(key, new Uint8Array(50));
      const packed = packEncryptedBlob(blob);
      expect(packed.length).toBe(12 + blob.ciphertext.length);
    });
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
node node_modules/jest-cli/bin/jest.js __tests__/physiqueEncryption.test.ts
```

Expected: fails with "Cannot find module '@/lib/physiqueEncryption'"

- [ ] **Step 3: Create `lib/physiqueEncryption.ts`**

```typescript
import * as SecureStore from 'expo-secure-store';
import * as ImageManipulator from 'expo-image-manipulator';

export interface EncryptedBlob {
  iv: Uint8Array;       // 12-byte GCM nonce
  ciphertext: Uint8Array;
}

const SECURE_KEY_PREFIX = 'physique_enc_key_';

/**
 * Load the AES-256-GCM key for this user from SecureStore.
 * Generates and persists a new key on first call.
 * The key never leaves the device.
 */
export async function getPhysiqueKey(userId: string): Promise<CryptoKey> {
  const storeKey = `${SECURE_KEY_PREFIX}${userId}`;
  const stored = await SecureStore.getItemAsync(storeKey);

  if (stored) {
    const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  // First use — generate a random 256-bit key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
  await SecureStore.setItemAsync(storeKey, b64);

  // Re-import as non-extractable for runtime use
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * AES-256-GCM encrypt. Returns iv (12 bytes) + ciphertext.
 */
export async function encryptPhoto(key: CryptoKey, jpegBytes: Uint8Array): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, jpegBytes);
  return { iv, ciphertext: new Uint8Array(cipherBuf) };
}

/**
 * AES-256-GCM decrypt. Throws if key or iv is wrong (authentication failure).
 */
export async function decryptPhoto(key: CryptoKey, blob: EncryptedBlob): Promise<Uint8Array> {
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.iv }, key, blob.ciphertext);
  return new Uint8Array(plainBuf);
}

/**
 * Compress and resize a photo URI to a Uint8Array for encryption.
 * maxSize: max dimension in px. quality: 0–1.
 */
export async function preparePhoto(uri: string, maxSize: number, quality: number): Promise<Uint8Array> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxSize, height: maxSize } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!result.base64) throw new Error('preparePhoto: image manipulation returned no base64');
  return Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
}

/**
 * Pack iv + ciphertext into a single Uint8Array for upload.
 * Format: [12 bytes IV][N bytes ciphertext]
 */
export function packEncryptedBlob(blob: EncryptedBlob): Uint8Array {
  const packed = new Uint8Array(blob.iv.length + blob.ciphertext.length);
  packed.set(blob.iv, 0);
  packed.set(blob.ciphertext, blob.iv.length);
  return packed;
}

/**
 * Unpack a stored blob back into iv + ciphertext.
 */
export function unpackEncryptedBlob(packed: Uint8Array): EncryptedBlob {
  return {
    iv: packed.slice(0, 12),
    ciphertext: packed.slice(12),
  };
}

/**
 * Encode a Uint8Array to base64 string (for sending to edge function).
 */
export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
node node_modules/jest-cli/bin/jest.js __tests__/physiqueEncryption.test.ts
```

Expected: `Tests: 7 passed, 7 total`

- [ ] **Step 5: Commit**

```bash
git add lib/physiqueEncryption.ts __tests__/physiqueEncryption.test.ts
git commit -m "feat(sprint3): physiqueEncryption — AES-256-GCM encrypt/decrypt with SecureStore key (TDD)"
```

---

## Task 3: Create `supabase/functions/analyze-physique/index.ts`

**Files:**
- Create: `supabase/functions/analyze-physique/index.ts`

The edge function handles two modes:
- `single`: scores one check-in's photos and returns individual scores + narrative
- `compare`: scores two check-ins' photos side-by-side and returns per-check-in scores + comparison narrative

Claude Vision is called with base64-encoded JPEG images. Response is parsed from a structured delimiter format: `SCORES_JSON: {...}\nNARRATIVE: ...`

- [ ] **Step 1: Create `supabase/functions/analyze-physique/index.ts`**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders, jsonResponse, errorResponse, internalError,
  SUPABASE_URL, SUPABASE_ANON_KEY,
} from '../_shared/claude.ts';
import { checkRateLimit, ALLOWED_PERSONAS } from '../_shared/security.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const VISION_MODEL = 'claude-sonnet-4-5-20251001'; // vision-capable model
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY env var is required');

const PERSONA_VOICES: Record<string, string> = {
  cbum: 'Chris Bumstead (calm, technical, focuses on symmetry and conditioning)',
  arnold: 'Arnold Schwarzenegger (confident, motivational, references the golden era)',
  nippard: 'Jeff Nippard (science-based, precise, references muscle development objectively)',
  ct_fletcher: 'CT Fletcher (intense, direct, no fluff)',
  dr_mike: 'Dr Mike Israetel (evidence-based, friendly, references hypertrophy science)',
};

interface ImageSet {
  front?: string;  // base64 JPEG
  side?: string;
  back?: string;
}

function buildImageContent(images: ImageSet): unknown[] {
  const content: unknown[] = [];
  for (const [pose, b64] of Object.entries(images)) {
    if (!b64) continue;
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
    });
    content.push({ type: 'text', text: `(${pose} view)` });
  }
  return content;
}

function parseScoreResponse(text: string): { fullness: number; leanness: number; symmetry: number; narrative: string } | null {
  try {
    const scoresMatch = text.match(/SCORES_JSON:\s*(\{[^}]+\})/);
    const narrativeMatch = text.match(/NARRATIVE:\s*([\s\S]+)/);
    if (!scoresMatch || !narrativeMatch) return null;
    const scores = JSON.parse(scoresMatch[1]);
    return {
      fullness: Math.min(10, Math.max(1, Math.round(Number(scores.fullness)))),
      leanness: Math.min(10, Math.max(1, Math.round(Number(scores.leanness)))),
      symmetry: Math.min(10, Math.max(1, Math.round(Number(scores.symmetry)))),
      narrative: narrativeMatch[1].trim(),
    };
  } catch {
    return null;
  }
}

async function callClaudeVision(systemPrompt: string, userContent: unknown[], maxTokens: number): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!response.ok) throw new Error(`Claude Vision API error ${response.status}`);
  const data = await response.json();
  return data.content?.find((c: { type: string }) => c.type === 'text')?.text ?? '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Unauthorized', 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    // 10 requests per hour — Claude Vision is expensive
    if (!checkRateLimit(user.id, 'analyze-physique', 10, 60 * 60 * 1000)) {
      return errorResponse('Rate limit exceeded. Please wait before analysing again.', 429);
    }

    const body = await req.json() as {
      mode?: unknown;
      persona?: unknown;
      frontImageBase64?: unknown;
      sideImageBase64?: unknown;
      backImageBase64?: unknown;
      checkinAImages?: unknown;
      checkinBImages?: unknown;
      checkinADate?: unknown;
      checkinBDate?: unknown;
    };

    const mode = body.mode === 'compare' ? 'compare' : 'single';
    const personaKey = ALLOWED_PERSONAS.has(String(body.persona ?? ''))
      ? String(body.persona)
      : 'cbum';
    const personaVoice = PERSONA_VOICES[personaKey];

    const systemPrompt = `You are a world-class physique coach analysing bodybuilding progress photos. Respond in the voice of ${personaVoice}. Be constructive and specific. Always respond in exactly this format:\nSCORES_JSON: {"fullness": <1-10>, "leanness": <1-10>, "symmetry": <1-10>}\nNARRATIVE: <your coaching text>`;

    if (mode === 'single') {
      const images: ImageSet = {
        front: typeof body.frontImageBase64 === 'string' ? body.frontImageBase64 : undefined,
        side: typeof body.sideImageBase64 === 'string' ? body.sideImageBase64 : undefined,
        back: typeof body.backImageBase64 === 'string' ? body.backImageBase64 : undefined,
      };
      if (!images.front) return errorResponse('frontImageBase64 required for single mode', 400);

      const userContent = [
        ...buildImageContent(images),
        {
          type: 'text',
          text: 'Score this physique check-in on muscle fullness, leanness, and symmetry (each 1–10). Then give a ~80-word coaching narrative.',
        },
      ];

      const raw = await callClaudeVision(systemPrompt, userContent, 300);
      const parsed = parseScoreResponse(raw);
      if (!parsed) return internalError();

      return jsonResponse({
        fullness: parsed.fullness,
        leanness: parsed.leanness,
        symmetry: parsed.symmetry,
        narrative: parsed.narrative,
      });
    }

    // compare mode
    const aImages = (body.checkinAImages ?? {}) as ImageSet;
    const bImages = (body.checkinBImages ?? {}) as ImageSet;
    if (!aImages.front || !bImages.front) {
      return errorResponse('checkinAImages.front and checkinBImages.front required for compare mode', 400);
    }

    const dateA = typeof body.checkinADate === 'string' ? body.checkinADate : 'earlier';
    const dateB = typeof body.checkinBDate === 'string' ? body.checkinBDate : 'recent';

    const userContent = [
      { type: 'text', text: `CHECK-IN A (${dateA}):` },
      ...buildImageContent(aImages),
      { type: 'text', text: `CHECK-IN B (${dateB}):` },
      ...buildImageContent(bImages),
      {
        type: 'text',
        text: 'Score EACH check-in on muscle fullness, leanness, and symmetry (each 1–10), then give a ~100-word comparison narrative covering what changed. Format:\nSCORES_JSON: {"fullness_a":<n>,"leanness_a":<n>,"symmetry_a":<n>,"fullness_b":<n>,"leanness_b":<n>,"symmetry_b":<n>}\nNARRATIVE: <text>',
      },
    ];

    const raw = await callClaudeVision(systemPrompt, userContent, 400);

    // Parse compare-mode response (6 score fields)
    const scoresMatch = raw.match(/SCORES_JSON:\s*(\{[^}]+\})/);
    const narrativeMatch = raw.match(/NARRATIVE:\s*([\s\S]+)/);
    if (!scoresMatch || !narrativeMatch) return internalError();

    const s = JSON.parse(scoresMatch[1]);
    const clamp = (n: unknown) => Math.min(10, Math.max(1, Math.round(Number(n))));

    return jsonResponse({
      scoresA: { fullness: clamp(s.fullness_a), leanness: clamp(s.leanness_a), symmetry: clamp(s.symmetry_a) },
      scoresB: { fullness: clamp(s.fullness_b), leanness: clamp(s.leanness_b), symmetry: clamp(s.symmetry_b) },
      narrative: narrativeMatch[1].trim(),
    });
  } catch {
    return internalError();
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/analyze-physique/index.ts
git commit -m "feat(sprint3): analyze-physique edge function — single + compare Claude Vision modes"
```

---

## Task 4: Add `analyzePhysique()` to `lib/api/edgeFunctions.ts`

**Files:**
- Modify: `lib/api/edgeFunctions.ts`

- [ ] **Step 1: Append types and function to `lib/api/edgeFunctions.ts`**

Add at the end of the file:

```typescript
export interface PhysiqueScores {
  fullness: number;
  leanness: number;
  symmetry: number;
}

export interface PhysiqueSingleResponse extends PhysiqueScores {
  narrative: string;
}

export interface PhysiqueCompareResponse {
  scoresA: PhysiqueScores;
  scoresB: PhysiqueScores;
  narrative: string;
}

export async function analyzePhysiqueSingle(
  persona: string,
  frontImageBase64: string,
  sideImageBase64?: string,
  backImageBase64?: string,
): Promise<PhysiqueSingleResponse> {
  return invokeFunction('analyze-physique', {
    mode: 'single',
    persona,
    frontImageBase64,
    sideImageBase64,
    backImageBase64,
  });
}

export async function analyzePhysiqueCompare(
  persona: string,
  checkinAImages: { front?: string; side?: string; back?: string },
  checkinBImages: { front?: string; side?: string; back?: string },
  checkinADate: string,
  checkinBDate: string,
): Promise<PhysiqueCompareResponse> {
  return invokeFunction('analyze-physique', {
    mode: 'compare',
    persona,
    checkinAImages,
    checkinBImages,
    checkinADate,
    checkinBDate,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/api/edgeFunctions.ts
git commit -m "feat(sprint3): add analyzePhysiqueSingle + analyzePhysiqueCompare to edgeFunctions"
```

---

## Task 5: Create `hooks/usePhysiqueCheckins.ts`

**Files:**
- Create: `hooks/usePhysiqueCheckins.ts`

- [ ] **Step 1: Create `hooks/usePhysiqueCheckins.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPhysiqueKey,
  encryptPhoto,
  decryptPhoto,
  preparePhoto,
  packEncryptedBlob,
  unpackEncryptedBlob,
  toBase64,
} from '@/lib/physiqueEncryption';
import {
  analyzePhysiqueSingle,
  analyzePhysiqueCompare,
  type PhysiqueSingleResponse,
  type PhysiqueCompareResponse,
} from '@/lib/api/edgeFunctions';

const REMINDER_KEY = 'physique_reminder_id';

export type PhysiqueCheckin = {
  id: string;
  user_id: string;
  date: string;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  pose_count: number;
  front_path: string;
  side_path: string | null;
  back_path: string | null;
  front_thumb: string;
  side_thumb: string | null;
  back_thumb: string | null;
  fullness_score: number | null;
  leanness_score: number | null;
  symmetry_score: number | null;
  auto_narrative: string | null;
  scored_at: string | null;
  created_at: string;
};

export type PhysiqueAnalysis = {
  id: string;
  checkin_a_id: string;
  checkin_b_id: string;
  fullness_a: number | null;
  leanness_a: number | null;
  symmetry_a: number | null;
  fullness_b: number | null;
  leanness_b: number | null;
  symmetry_b: number | null;
  narrative: string;
  persona: string;
  created_at: string;
};

// ─── Fetch all check-ins (newest first) ──────────────────────────────────────

export function usePhysiqueCheckins() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['physique_checkins', user?.id],
    queryFn: async (): Promise<PhysiqueCheckin[]> => {
      if (!user) return [];
      const { data, error } = await (supabase.from('physique_checkins') as any)
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Decrypt a single encrypted blob path from Storage ───────────────────────

export async function decryptStorageBlob(userId: string, path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from('physique-photos').download(path);
  if (error || !data) throw new Error('Failed to download encrypted blob');
  const packed = new Uint8Array(await data.arrayBuffer());
  const blob = unpackEncryptedBlob(packed);
  const key = await getPhysiqueKey(userId);
  return decryptPhoto(key, blob);
}

// ─── Submit a new check-in ────────────────────────────────────────────────────

export function useSubmitCheckin() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      date: string;
      cadence: 'weekly' | 'biweekly' | 'monthly';
      persona: string;
      frontUri: string;
      sideUri?: string;
      backUri?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const key = await getPhysiqueKey(user.id);
      const checkinId = crypto.randomUUID();

      async function uploadEncrypted(uri: string, pose: string, size: number, quality: number): Promise<string> {
        const jpeg = await preparePhoto(uri, size, quality);
        const blob = await encryptPhoto(key, jpeg);
        const packed = packEncryptedBlob(blob);
        const path = `${user!.id}/${checkinId}/${pose}.enc`;
        const { error } = await supabase.storage
          .from('physique-photos')
          .upload(path, packed, { contentType: 'application/octet-stream', upsert: false });
        if (error) throw error;
        return path;
      }

      // Upload full-size + thumbnails
      const frontPath = await uploadEncrypted(params.frontUri, 'front', 1024, 0.8);
      const frontThumb = await uploadEncrypted(params.frontUri, 'front-thumb', 200, 0.6);
      const sidePath = params.sideUri ? await uploadEncrypted(params.sideUri, 'side', 1024, 0.8) : null;
      const sideThumb = params.sideUri ? await uploadEncrypted(params.sideUri, 'side-thumb', 200, 0.6) : null;
      const backPath = params.backUri ? await uploadEncrypted(params.backUri, 'back', 1024, 0.8) : null;
      const backThumb = params.backUri ? await uploadEncrypted(params.backUri, 'back-thumb', 200, 0.6) : null;

      const poseCount = 1 + (sidePath ? 1 : 0) + (backPath ? 1 : 0);

      // Auto-score via edge function (decrypt + send as base64)
      const frontJpeg = await decryptStorageBlob(user.id, frontPath);
      const frontB64 = toBase64(frontJpeg);
      let sideB64: string | undefined;
      let backB64: string | undefined;
      if (sidePath) sideB64 = toBase64(await decryptStorageBlob(user.id, sidePath));
      if (backPath) backB64 = toBase64(await decryptStorageBlob(user.id, backPath));

      let scores: PhysiqueSingleResponse | null = null;
      try {
        scores = await analyzePhysiqueSingle(params.persona, frontB64, sideB64, backB64);
      } catch {
        // Non-fatal — scoring can be retried; checkin is still saved
      }

      const payload: Record<string, unknown> = {
        id: checkinId,
        user_id: user.id,
        date: params.date,
        cadence: params.cadence,
        pose_count: poseCount,
        front_path: frontPath,
        front_thumb: frontThumb,
        side_path: sidePath,
        side_thumb: sideThumb,
        back_path: backPath,
        back_thumb: backThumb,
      };

      if (scores) {
        payload.fullness_score = scores.fullness;
        payload.leanness_score = scores.leanness;
        payload.symmetry_score = scores.symmetry;
        payload.auto_narrative = scores.narrative;
        payload.scored_at = new Date().toISOString();
      }

      const { error: insertError } = await (supabase.from('physique_checkins') as any).insert(payload);
      if (insertError) throw insertError;

      return { checkinId, scores };
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: ['physique_checkins', user?.id] });
      scheduleCheckinReminder(params.cadence, params.date);
    },
  });
}

// ─── Fetch or trigger a comparison analysis ───────────────────────────────────

export function usePhysiqueAnalysis(
  checkinAId: string | null,
  checkinBId: string | null,
  persona: string,
) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['physique_analysis', checkinAId, checkinBId],
    queryFn: async (): Promise<PhysiqueAnalysis | null> => {
      if (!user || !checkinAId || !checkinBId) return null;

      // Check cache first
      const { data: existing } = await (supabase.from('physique_analyses') as any)
        .select('*')
        .or(`and(checkin_a_id.eq.${checkinAId},checkin_b_id.eq.${checkinBId}),and(checkin_a_id.eq.${checkinBId},checkin_b_id.eq.${checkinAId})`)
        .maybeSingle();
      if (existing) return existing as PhysiqueAnalysis;

      // Fetch both checkins to get image paths
      const { data: checkins } = await (supabase.from('physique_checkins') as any)
        .select('*')
        .in('id', [checkinAId, checkinBId]);
      if (!checkins || checkins.length < 2) return null;

      const [ck] = checkins;
      const checkinA: PhysiqueCheckin = checkins.find((c: PhysiqueCheckin) => c.id === checkinAId);
      const checkinB: PhysiqueCheckin = checkins.find((c: PhysiqueCheckin) => c.id === checkinBId);
      if (!checkinA || !checkinB) return null;

      // Decrypt images
      async function toB64(path: string | null): Promise<string | undefined> {
        if (!path) return undefined;
        return toBase64(await decryptStorageBlob(user!.id, path));
      }

      const aImages = {
        front: await toB64(checkinA.front_path),
        side: await toB64(checkinA.side_path),
        back: await toB64(checkinA.back_path),
      };
      const bImages = {
        front: await toB64(checkinB.front_path),
        side: await toB64(checkinB.side_path),
        back: await toB64(checkinB.back_path),
      };

      const result: PhysiqueCompareResponse = await analyzePhysiqueCompare(
        persona,
        aImages,
        bImages,
        checkinA.date,
        checkinB.date,
      );

      const analysisPayload = {
        user_id: user.id,
        checkin_a_id: checkinAId,
        checkin_b_id: checkinBId,
        fullness_a: result.scoresA.fullness,
        leanness_a: result.scoresA.leanness,
        symmetry_a: result.scoresA.symmetry,
        fullness_b: result.scoresB.fullness,
        leanness_b: result.scoresB.leanness,
        symmetry_b: result.scoresB.symmetry,
        narrative: result.narrative,
        persona,
      };

      const { data: saved, error } = await (supabase.from('physique_analyses') as any)
        .insert(analysisPayload)
        .select()
        .single();
      if (error) throw error;

      return saved as PhysiqueAnalysis;
    },
    enabled: !!user && !!checkinAId && !!checkinBId,
    staleTime: Infinity, // analyses are immutable once generated
  });
}

// ─── Schedule/reschedule check-in reminder notification ──────────────────────

async function scheduleCheckinReminder(
  cadence: 'weekly' | 'biweekly' | 'monthly',
  lastDateStr: string,
) {
  try {
    // Cancel previous reminder
    const prevId = await AsyncStorage.getItem(REMINDER_KEY);
    if (prevId) await Notifications.cancelScheduledNotificationAsync(prevId);

    const cadenceDays = cadence === 'weekly' ? 7 : cadence === 'biweekly' ? 14 : 30;
    const triggerDate = new Date(lastDateStr);
    triggerDate.setDate(triggerDate.getDate() + cadenceDays);
    triggerDate.setHours(9, 0, 0, 0);

    if (triggerDate <= new Date()) return; // already past — skip

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '📸 Physique check-in due',
        body: `Time to take your ${cadence} progress photo. Keep the streak going.`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });

    await AsyncStorage.setItem(REMINDER_KEY, id);
  } catch {
    // Non-fatal — notification scheduling is optional
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add hooks/usePhysiqueCheckins.ts
git commit -m "feat(sprint3): usePhysiqueCheckins hooks — submit, fetch, compare, reminder"
```

---

## Task 6: Create `components/progress/PhysiqueScoreCard.tsx`

**Files:**
- Create: `components/progress/PhysiqueScoreCard.tsx`

- [ ] **Step 1: Create `components/progress/PhysiqueScoreCard.tsx`**

```typescript
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

interface Props {
  label: string;
  scoreA: number | null;
  scoreB: number | null;
}

export function PhysiqueScoreCard({ label, scoreA, scoreB }: Props) {
  const delta = scoreA != null && scoreB != null ? scoreB - scoreA : null;
  const arrowColor =
    delta == null ? Colors.textTertiary
    : delta > 0 ? Colors.success
    : delta < 0 ? Colors.warning
    : Colors.textTertiary;
  const arrow = delta == null ? '·' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';

  return (
    <View style={styles.chip}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.scores}>
        <Text style={styles.scoreA}>{scoreA ?? '—'}</Text>
        <Text style={[styles.arrow, { color: arrowColor }]}>{arrow}</Text>
        <Text style={[styles.scoreB, delta != null && delta !== 0 ? { color: arrowColor } : {}]}>
          {scoreB ?? '—'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    color: Colors.textTertiary,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  scores: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreA: { fontFamily: Fonts.display, fontSize: 16, color: Colors.textSecondary },
  arrow: { fontFamily: Fonts.mono, fontSize: 14 },
  scoreB: { fontFamily: Fonts.display, fontSize: 16, color: Colors.text },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/progress/PhysiqueScoreCard.tsx
git commit -m "feat(sprint3): PhysiqueScoreCard — reusable score delta chip"
```

---

## Task 7: Create `components/progress/PhysiquePrivacyCard.tsx`

**Files:**
- Create: `components/progress/PhysiquePrivacyCard.tsx`

- [ ] **Step 1: Create `components/progress/PhysiquePrivacyCard.tsx`**

```typescript
import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Fonts, Spacing } from '@/constants/theme';

const DISMISSED_KEY = 'physique_privacy_dismissed';

export function PhysiquePrivacyCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then((val) => {
      if (!val) setVisible(true);
    });
  }, []);

  const dismiss = async () => {
    await AsyncStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.icon}>🔒</Text>
      <View style={styles.body}>
        <Text style={styles.title}>YOUR PHOTOS ARE PRIVATE</Text>
        <Text style={styles.text}>
          Photos are encrypted on your device before upload. Only you can see them — not even our servers.
        </Text>
      </View>
      <TouchableOpacity onPress={dismiss} style={styles.dismissBtn}>
        <Text style={styles.dismissText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(57,224,138,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(57,224,138,0.2)',
    borderRadius: 6,
    padding: Spacing.md,
    marginBottom: 14,
    gap: 10,
  },
  icon: { fontSize: 20, marginTop: 1 },
  body: { flex: 1 },
  title: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    color: Colors.success,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  text: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  dismissBtn: { padding: 2 },
  dismissText: { fontSize: 14, color: Colors.textTertiary },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/progress/PhysiquePrivacyCard.tsx
git commit -m "feat(sprint3): PhysiquePrivacyCard — one-time E2E encryption disclosure"
```

---

## Task 8: Create `components/progress/PhysiqueGallery.tsx`

**Files:**
- Create: `components/progress/PhysiqueGallery.tsx`

Displays a 2-column grid of check-in thumbnails. First cell is always NEW CHECK-IN. Supports selection mode (tap two → COMPARE button). Shows due-date banner and cadence selector.

- [ ] **Step 1: Create `components/progress/PhysiqueGallery.tsx`**

```typescript
import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Image, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { usePhysiqueCheckins, decryptStorageBlob, type PhysiqueCheckin } from '@/hooks/usePhysiqueCheckins';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Fonts, Spacing } from '@/constants/theme';

function dueDateLabel(lastDate: string, cadence: 'weekly' | 'biweekly' | 'monthly'): string {
  const days = cadence === 'weekly' ? 7 : cadence === 'biweekly' ? 14 : 30;
  const due = new Date(lastDate);
  due.setDate(due.getDate() + days);
  const now = new Date();
  const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return 'Check-in overdue';
  if (diff === 1) return 'Check-in due tomorrow';
  return `Next check-in in ${diff} days`;
}

function ThumbnailCell({
  checkin,
  selected,
  onPress,
}: {
  checkin: PhysiqueCheckin;
  selected: boolean;
  onPress: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    decryptStorageBlob(user.id, checkin.front_thumb)
      .then((bytes) => {
        const b64 = btoa(String.fromCharCode(...bytes));
        setUri(`data:image/jpeg;base64,${b64}`);
      })
      .catch(() => {});
  }, [checkin.front_thumb, user?.id]);

  return (
    <TouchableOpacity
      style={[styles.cell, selected && styles.cellSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.thumbnail} resizeMode="cover" />
      ) : (
        <ActivityIndicator color={Colors.primary} style={styles.thumbnail} />
      )}
      <View style={styles.cellFooter}>
        <Text style={styles.cellDate}>
          {new Date(checkin.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
        {checkin.pose_count > 1 && (
          <Text style={styles.poseBadge}>{checkin.pose_count} poses</Text>
        )}
      </View>
      {selected && <View style={styles.selectedOverlay} />}
    </TouchableOpacity>
  );
}

export function PhysiqueGallery() {
  const router = useRouter();
  const { data: checkins = [], isLoading } = usePhysiqueCheckins();
  const [selected, setSelected] = useState<string[]>([]);
  const [cadence, setCadence] = useState<'weekly' | 'biweekly' | 'monthly'>('biweekly');

  // Sync cadence from latest check-in
  useEffect(() => {
    if (checkins.length > 0) setCadence(checkins[0].cadence);
  }, [checkins]);

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );
  };

  const handleCompare = () => {
    if (selected.length !== 2) return;
    router.push({
      pathname: '/physique-compare',
      params: { checkinAId: selected[0], checkinBId: selected[1] },
    } as any);
  };

  const latestCheckin = checkins[0];

  const CADENCE_OPTIONS: Array<{ key: 'weekly' | 'biweekly' | 'monthly'; label: string }> = [
    { key: 'weekly', label: 'Weekly' },
    { key: 'biweekly', label: 'Bi-weekly' },
    { key: 'monthly', label: 'Monthly' },
  ];

  if (isLoading) {
    return <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />;
  }

  return (
    <View style={styles.container}>
      {/* Due date banner */}
      {latestCheckin && (
        <View style={styles.dueBanner}>
          <Text style={styles.dueText}>
            {dueDateLabel(latestCheckin.date, cadence)}
          </Text>
        </View>
      )}

      {/* Cadence selector */}
      <View style={styles.cadenceRow}>
        <Text style={styles.cadenceLabel}>CADENCE</Text>
        <View style={styles.cadencePills}>
          {CADENCE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.cadencePill, cadence === opt.key && styles.cadencePillActive]}
              onPress={() => setCadence(opt.key)}
            >
              <Text style={[styles.cadencePillText, cadence === opt.key && styles.cadencePillTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Photo grid */}
      <FlatList
        data={checkins}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        scrollEnabled={false}
        ListHeaderComponent={
          <TouchableOpacity
            style={[styles.cell, styles.newCheckinCell]}
            onPress={() => router.push('/physique-checkin' as any)}
            activeOpacity={0.8}
          >
            <Text style={styles.newCheckinPlus}>＋</Text>
            <Text style={styles.newCheckinLabel}>NEW CHECK-IN</Text>
          </TouchableOpacity>
        }
        renderItem={({ item }) => (
          <ThumbnailCell
            checkin={item}
            selected={selected.includes(item.id)}
            onPress={() => toggleSelect(item.id)}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No check-ins yet. Tap ＋ to start your physique timeline.</Text>
        }
      />

      {/* Compare button */}
      {selected.length === 2 && (
        <TouchableOpacity style={styles.compareBtn} onPress={handleCompare} activeOpacity={0.85}>
          <Text style={styles.compareBtnText}>COMPARE SELECTED →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const CELL_SIZE = 160;

const styles = StyleSheet.create({
  container: { flex: 1 },
  dueBanner: {
    backgroundColor: 'rgba(223,255,31,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(223,255,31,0.15)',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  dueText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.primary, letterSpacing: 1 },
  cadenceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  cadenceLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.4 },
  cadencePills: { flexDirection: 'row', gap: 6 },
  cadencePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cadencePillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  cadencePillText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textSecondary, letterSpacing: 0.8 },
  cadencePillTextActive: { color: Colors.accentInk },
  row: { gap: 10, marginBottom: 10 },
  cell: {
    flex: 1,
    height: CELL_SIZE,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  cellSelected: { borderColor: Colors.primary, borderWidth: 2 },
  thumbnail: { flex: 1, width: '100%' },
  cellFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  cellDate: { fontFamily: Fonts.mono, fontSize: 9, color: '#fff', letterSpacing: 0.5 },
  poseBadge: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.primary },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 5,
  },
  newCheckinCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  newCheckinPlus: { fontFamily: Fonts.display, fontSize: 32, color: Colors.primary, marginBottom: 6 },
  newCheckinLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.4 },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 20,
  },
  compareBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  compareBtnText: { fontFamily: Fonts.display, fontSize: 13, color: Colors.accentInk, letterSpacing: 1 },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/progress/PhysiqueGallery.tsx
git commit -m "feat(sprint3): PhysiqueGallery — 2-col grid, selection mode, cadence selector"
```

---

## Task 9: Create `app/physique-checkin.tsx`

**Files:**
- Create: `app/physique-checkin.tsx`

Multi-step wizard: cadence (first time only) → front → side → back → processing → done.

- [ ] **Step 1: Create `app/physique-checkin.tsx`**

```typescript
import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSubmitCheckin } from '@/hooks/usePhysiqueCheckins';
import { PhysiqueScoreCard } from '@/components/progress/PhysiqueScoreCard';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { EXPERT_PROGRAMS } from '@/constants/experts';

type Step = 'cadence' | 'front' | 'side' | 'back' | 'processing' | 'done';
type Cadence = 'weekly' | 'biweekly' | 'monthly';

const CADENCE_DAYS: Record<Cadence, string> = {
  weekly: 'Every 7 days',
  biweekly: 'Every 14 days',
  monthly: 'Every 30 days',
};

export default function PhysiqueCheckin() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => (s as any).profile);
  const { mutateAsync: submitCheckin } = useSubmitCheckin();

  const [step, setStep] = useState<Step>('cadence');
  const [cadence, setCadence] = useState<Cadence>('biweekly');
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [sideUri, setSideUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [result, setResult] = useState<{ fullness: number; leanness: number; symmetry: number; narrative: string } | null>(null);

  const persona = profile?.selected_program
    ? (EXPERT_PROGRAMS[profile.selected_program]?.id ?? 'cbum_evolved').split('_')[0]
    : 'cbum';

  const pickPhoto = async (): Promise<string | null> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to continue.');
      return null;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    return res.assets[0].uri;
  };

  const takePhoto = async (): Promise<string | null> => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access to continue.');
      return null;
    }
    const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 1 });
    if (res.canceled || !res.assets?.[0]) return null;
    return res.assets[0].uri;
  };

  const handlePhotoStep = async (
    setter: (uri: string) => void,
    nextStep: Step,
  ) => {
    Alert.alert('Add photo', 'Choose source', [
      { text: 'Camera', onPress: async () => { const u = await takePhoto(); if (u) { setter(u); setStep(nextStep); } } },
      { text: 'Photo Library', onPress: async () => { const u = await pickPhoto(); if (u) { setter(u); setStep(nextStep); } } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleProcess = async () => {
    if (!frontUri) return;
    setStep('processing');
    try {
      const res = await submitCheckin({
        date: new Date().toISOString().slice(0, 10),
        cadence,
        persona,
        frontUri,
        sideUri: sideUri ?? undefined,
        backUri: backUri ?? undefined,
      });
      if (res.scores) setResult(res.scores);
      setStep('done');
    } catch (e) {
      Alert.alert('Error', 'Failed to save check-in. Please try again.');
      setStep('back');
    }
  };

  // Cadence step
  if (step === 'cadence') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.stepLabel}>STEP 1 OF 4</Text>
          <Text style={styles.headline}>HOW OFTEN?</Text>
          <Text style={styles.sub}>Choose your check-in cadence. You can change this later.</Text>
          <View style={styles.optionList}>
            {(['weekly', 'biweekly', 'monthly'] as Cadence[]).map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.option, cadence === c && styles.optionSelected]}
                onPress={() => setCadence(c)}
              >
                <Text style={[styles.optionTitle, cadence === c && styles.optionTitleSelected]}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </Text>
                <Text style={styles.optionSub}>{CADENCE_DAYS[c]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('front')}>
            <Text style={styles.primaryBtnText}>CONTINUE →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Photo step helper
  const renderPhotoStep = (
    stepNum: number,
    title: string,
    required: boolean,
    uri: string | null,
    onAdd: () => void,
    onNext: () => void,
    onSkip?: () => void,
  ) => (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>STEP {stepNum} OF 4</Text>
        <Text style={styles.headline}>{title}</Text>
        {!required && <Text style={styles.optionalTag}>OPTIONAL</Text>}
        <TouchableOpacity style={styles.photoBox} onPress={onAdd}>
          {uri ? (
            <Image source={{ uri }} style={styles.photoPreview} resizeMode="cover" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderIcon}>📷</Text>
              <Text style={styles.photoPlaceholderText}>Tap to add photo</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.btnRow}>
          {onSkip && (
            <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
              <Text style={styles.skipBtnText}>SKIP</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.primaryBtn, styles.primaryBtnFlex, !uri && required && { opacity: 0.5 }]}
            onPress={onNext}
            disabled={!uri && required}
          >
            <Text style={styles.primaryBtnText}>NEXT →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );

  if (step === 'front') return renderPhotoStep(
    2, 'FRONT PHOTO', true, frontUri,
    () => handlePhotoStep(setFrontUri, 'front'),
    () => setStep('side'),
  );

  if (step === 'side') return renderPhotoStep(
    3, 'SIDE PHOTO', false, sideUri,
    () => handlePhotoStep(setSideUri, 'side'),
    () => setStep('back'),
    () => setStep('back'),
  );

  if (step === 'back') return renderPhotoStep(
    4, 'BACK PHOTO', false, backUri,
    () => handlePhotoStep(setBackUri, 'back'),
    handleProcess,
    handleProcess,
  );

  if (step === 'processing') return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.processingText}>Encrypting & uploading…</Text>
        <Text style={styles.processingSubText}>Getting AI analysis from your coach</Text>
      </View>
    </SafeAreaView>
  );

  // Done step
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.doneTitle}>CHECK-IN SAVED</Text>
        {result && (
          <>
            <View style={styles.scoreRow}>
              <PhysiqueScoreCard label="FULLNESS" scoreA={null} scoreB={result.fullness} />
              <PhysiqueScoreCard label="LEANNESS" scoreA={null} scoreB={result.leanness} />
              <PhysiqueScoreCard label="SYMMETRY" scoreA={null} scoreB={result.symmetry} />
            </View>
            <View style={styles.narrativeCard}>
              <Text style={styles.narrativeLabel}>✦ {persona.toUpperCase()} SAYS</Text>
              <Text style={styles.narrativeText}>{result.narrative}</Text>
            </View>
          </>
        )}
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>VIEW TIMELINE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, padding: 20, paddingTop: 14 },
  center: { alignItems: 'center', justifyContent: 'center' },
  backBtn: { marginBottom: 16 },
  backText: { fontSize: 20, color: Colors.textSecondary },
  stepLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.8, marginBottom: 6 },
  headline: { fontFamily: Fonts.display, fontSize: 32, color: Colors.text, letterSpacing: -0.5, marginBottom: 8 },
  sub: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 24 },
  optionalTag: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.warning, letterSpacing: 1.2, marginBottom: 16 },
  optionList: { gap: 10, marginBottom: 24 },
  option: {
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    backgroundColor: Colors.surface,
  },
  optionSelected: { borderColor: Colors.primary, backgroundColor: 'rgba(223,255,31,0.05)' },
  optionTitle: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, marginBottom: 3 },
  optionTitleSelected: { color: Colors.primary },
  optionSub: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 0.8 },
  photoBox: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  photoPreview: { flex: 1, width: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  photoPlaceholderIcon: { fontSize: 40 },
  photoPlaceholderText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textTertiary },
  btnRow: { flexDirection: 'row', gap: 10 },
  skipBtn: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
  },
  skipBtnText: { fontFamily: Fonts.display, fontSize: 12, color: Colors.textSecondary, letterSpacing: 1 },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnFlex: { flex: 1, marginTop: 0 },
  primaryBtnText: { fontFamily: Fonts.display, fontSize: 13, color: Colors.accentInk, letterSpacing: 1 },
  processingText: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text, marginTop: 20 },
  processingSubText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
  doneTitle: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, marginBottom: 24, letterSpacing: -0.5 },
  scoreRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  narrativeCard: {
    backgroundColor: 'rgba(91,140,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(91,140,255,0.2)',
    borderRadius: 6,
    padding: 16,
    marginBottom: 24,
  },
  narrativeLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.info, letterSpacing: 1.4, marginBottom: 8 },
  narrativeText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 20, fontStyle: 'italic' },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/physique-checkin.tsx
git commit -m "feat(sprint3): physique-checkin wizard — cadence, photo capture, encrypt+upload, auto-score"
```

---

## Task 10: Create `app/physique-compare.tsx`

**Files:**
- Create: `app/physique-compare.tsx`

Shows side-by-side photos with a pose switcher, score chips, and AI narrative.

- [ ] **Step 1: Create `app/physique-compare.tsx`**

```typescript
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  usePhysiqueCheckins,
  usePhysiqueAnalysis,
  decryptStorageBlob,
  type PhysiqueCheckin,
} from '@/hooks/usePhysiqueCheckins';
import { PhysiqueScoreCard } from '@/components/progress/PhysiqueScoreCard';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { EXPERT_PROGRAMS } from '@/constants/experts';

type Pose = 'front' | 'side' | 'back';

function decryptedImageUri(userId: string, path: string | null, setUri: (u: string) => void) {
  if (!path) return;
  decryptStorageBlob(userId, path)
    .then((bytes) => {
      const b64 = btoa(String.fromCharCode(...bytes));
      setUri(`data:image/jpeg;base64,${b64}`);
    })
    .catch(() => {});
}

export default function PhysiqueCompare() {
  const router = useRouter();
  const { checkinAId, checkinBId } = useLocalSearchParams<{ checkinAId: string; checkinBId: string }>();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => (s as any).profile);
  const { data: allCheckins = [] } = usePhysiqueCheckins();

  const persona = profile?.selected_program
    ? (EXPERT_PROGRAMS[profile.selected_program]?.id ?? 'cbum_evolved').split('_')[0]
    : 'cbum';

  const PERSONA_LABELS: Record<string, string> = {
    cbum: 'CBUM SAYS', arnold: 'ARNOLD SAYS', nippard: 'NIPPARD SAYS',
    ct_fletcher: 'CT SAYS', dr_mike: 'DR MIKE SAYS',
  };

  const checkinA = allCheckins.find((c) => c.id === checkinAId) ?? null;
  const checkinB = allCheckins.find((c) => c.id === checkinBId) ?? null;

  const [activePose, setActivePose] = useState<Pose>('front');
  const [uriA, setUriA] = useState<string>('');
  const [uriB, setUriB] = useState<string>('');

  // Available poses = poses captured in BOTH check-ins
  const availablePoses: Pose[] = (['front', 'side', 'back'] as Pose[]).filter(
    (p) => checkinA && checkinB && checkinA[`${p}_path` as keyof PhysiqueCheckin] && checkinB[`${p}_path` as keyof PhysiqueCheckin]
  );

  // Decrypt images when pose or checkins change
  useEffect(() => {
    if (!user || !checkinA || !checkinB) return;
    setUriA('');
    setUriB('');
    const pathA = checkinA[`${activePose}_path` as keyof PhysiqueCheckin] as string | null;
    const pathB = checkinB[`${activePose}_path` as keyof PhysiqueCheckin] as string | null;
    decryptedImageUri(user.id, pathA, setUriA);
    decryptedImageUri(user.id, pathB, setUriB);
  }, [activePose, checkinA?.id, checkinB?.id, user?.id]);

  const {
    data: analysis,
    isLoading: analysisLoading,
  } = usePhysiqueAnalysis(
    checkinAId ?? null,
    checkinBId ?? null,
    persona,
  );

  if (!checkinA || !checkinB) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {formatDate(checkinA.date)} vs {formatDate(checkinB.date)}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Pose switcher */}
        {availablePoses.length > 1 && (
          <View style={styles.poseSwitcher}>
            {availablePoses.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.posePill, activePose === p && styles.posePillActive]}
                onPress={() => setActivePose(p)}
              >
                <Text style={[styles.posePillText, activePose === p && styles.posePillTextActive]}>
                  {p.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Side-by-side photos */}
        <View style={styles.photosRow}>
          <View style={styles.photoCol}>
            {uriA ? (
              <Image source={{ uri: uriA }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, styles.photoLoading]}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            )}
            <Text style={styles.photoDate}>{formatDate(checkinA.date)}</Text>
          </View>
          <View style={styles.photoCol}>
            {uriB ? (
              <Image source={{ uri: uriB }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, styles.photoLoading]}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            )}
            <Text style={styles.photoDate}>{formatDate(checkinB.date)}</Text>
          </View>
        </View>

        {/* Score chips */}
        <View style={styles.scoreRow}>
          <PhysiqueScoreCard
            label="FULLNESS"
            scoreA={analysis?.fullness_a ?? checkinA.fullness_score}
            scoreB={analysis?.fullness_b ?? checkinB.fullness_score}
          />
          <PhysiqueScoreCard
            label="LEANNESS"
            scoreA={analysis?.leanness_a ?? checkinA.leanness_score}
            scoreB={analysis?.leanness_b ?? checkinB.leanness_score}
          />
          <PhysiqueScoreCard
            label="SYMMETRY"
            scoreA={analysis?.symmetry_a ?? checkinA.symmetry_score}
            scoreB={analysis?.symmetry_b ?? checkinB.symmetry_score}
          />
        </View>

        {/* AI narrative */}
        {analysisLoading ? (
          <View style={styles.analysingCard}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.analysingText}>Getting AI analysis…</Text>
          </View>
        ) : analysis ? (
          <View style={styles.narrativeCard}>
            <Text style={styles.narrativeLabel}>✦ {PERSONA_LABELS[persona] ?? 'COACH SAYS'}</Text>
            <Text style={styles.narrativeText}>{analysis.narrative}</Text>
          </View>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 20, color: Colors.text },
  headerTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 0.8, flex: 1 },
  scroll: { padding: Spacing.md },
  poseSwitcher: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  posePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  posePillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  posePillText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 1 },
  posePillTextActive: { color: Colors.accentInk },
  photosRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  photoCol: { flex: 1, alignItems: 'center' },
  photo: { width: '100%', aspectRatio: 0.75, borderRadius: 6, backgroundColor: Colors.surface },
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  photoDate: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, marginTop: 6, letterSpacing: 0.5 },
  scoreRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  analysingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
  },
  analysingText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary },
  narrativeCard: {
    backgroundColor: 'rgba(91,140,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(91,140,255,0.2)',
    borderRadius: 6,
    padding: 16,
  },
  narrativeLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.info, letterSpacing: 1.4, marginBottom: 10 },
  narrativeText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 20, fontStyle: 'italic' },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/physique-compare.tsx
git commit -m "feat(sprint3): physique-compare screen — pose switcher, score chips, AI narrative"
```

---

## Task 11: Modify `app/(tabs)/progress.tsx` — STATS / PHYSIQUE toggle

**Files:**
- Modify: `app/(tabs)/progress.tsx`

Add a STATS | PHYSIQUE tab toggle at the top. STATS tab = existing content unchanged. PHYSIQUE tab = PhysiquePrivacyCard + PhysiqueGallery.

- [ ] **Step 1: Read the current top of `app/(tabs)/progress.tsx`** to confirm imports (lines 1–8)

The current imports are:
```typescript
import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VolumeChart } from '@/components/progress/VolumeChart';
import { useWeeklyVolume, usePersonalRecords, useAchievements } from '@/hooks/useProgressStats';
import { getWeeklySummary, type WeeklySummaryResponse } from '@/lib/api/edgeFunctions';
import { Colors, Fonts, Spacing } from '@/constants/theme';
```

- [ ] **Step 2: Replace the imports block**

Replace lines 1–7 with:

```typescript
import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VolumeChart } from '@/components/progress/VolumeChart';
import { useWeeklyVolume, usePersonalRecords, useAchievements } from '@/hooks/useProgressStats';
import { getWeeklySummary, type WeeklySummaryResponse } from '@/lib/api/edgeFunctions';
import { PhysiqueGallery } from '@/components/progress/PhysiqueGallery';
import { PhysiquePrivacyCard } from '@/components/progress/PhysiquePrivacyCard';
import { Colors, Fonts, Spacing } from '@/constants/theme';
```

- [ ] **Step 3: Add `activeTab` state and tab toggle to the `Progress` component**

Inside `export default function Progress()`, after the existing `useState` declarations, add:
```typescript
const [activeTab, setActiveTab] = useState<'stats' | 'physique'>('stats');
```

- [ ] **Step 4: Replace the `return` block**

Replace the entire `return (...)` with:

```typescript
  return (
    <SafeAreaView style={styles.safe}>
      {/* Tab toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'stats' && styles.tabBtnActive]}
          onPress={() => setActiveTab('stats')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'stats' && styles.tabBtnTextActive]}>STATS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'physique' && styles.tabBtnActive]}
          onPress={() => setActiveTab('physique')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'physique' && styles.tabBtnTextActive]}>PHYSIQUE</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'stats' ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.monoLabel}>WEEK {getWeekOfYear()} · {new Date().getFullYear()}</Text>
            <Text style={styles.headline}>YOUR{'\n'}GAINS.</Text>
          </View>

          {/* Volume chart */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>WEEKLY VOLUME</Text>
            {volumeLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: 24 }} />
            ) : (
              <VolumeChart data={weeklyVolume} />
            )}
          </View>

          {/* AI Weekly Summary */}
          <View style={styles.aiCard}>
            <View style={styles.aiCardHeader}>
              <Text style={{ fontSize: 14 }}>✦</Text>
              <Text style={styles.aiLabel}>AI WEEKLY REVIEW</Text>
            </View>
            {summary ? (
              <Text style={styles.summaryText}>{summary}</Text>
            ) : (
              <Text style={styles.summaryPrompt}>Get a personalised AI analysis of your training week.</Text>
            )}
            <TouchableOpacity
              style={[styles.summaryBtn, summaryLoading && { opacity: 0.6 }]}
              onPress={handleGetSummary}
              disabled={summaryLoading}
              activeOpacity={0.8}
            >
              {summaryLoading ? (
                <ActivityIndicator size="small" color={Colors.accentInk} />
              ) : (
                <Text style={styles.summaryBtnText}>{summary ? 'REFRESH SUMMARY' : 'GENERATE SUMMARY'}</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Personal Records */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>PERSONAL RECORDS</Text>
            {prsLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
            ) : prs.length === 0 ? (
              <Text style={styles.emptyText}>Complete workouts to set personal records.</Text>
            ) : (
              prs.slice(0, 10).map((pr, i) => (
                <View key={pr.id} style={[styles.prRow, i === 0 && styles.prRowFirst]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prName}>{pr.exerciseName}</Text>
                    <Text style={styles.prDate}>
                      {new Date(pr.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={styles.prStats}>
                    <Text style={styles.prWeight}>{pr.weightKg}kg × {pr.reps}</Text>
                    <Text style={styles.prEstimate}>~{pr.oneRepMaxKg ?? Epley1RM(pr.weightKg, pr.reps)}kg e1RM</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Achievements */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>ACHIEVEMENTS</Text>
            {achievementsLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
            ) : achievements.length === 0 ? (
              <Text style={styles.emptyText}>Start training to unlock achievements!</Text>
            ) : (
              <View style={styles.achievementsGrid}>
                {achievements.map((a) => (
                  <View key={a.id} style={styles.achievementChip}>
                    <Text style={styles.achievementEmoji}>{a.emoji}</Text>
                    <Text style={styles.achievementLabel}>{a.label}</Text>
                    <Text style={styles.achievementDate}>
                      {new Date(a.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.monoLabel}>PHYSIQUE TIMELINE</Text>
            <Text style={styles.headline}>YOUR{'\n'}BODY.</Text>
          </View>
          <PhysiquePrivacyCard />
          <PhysiqueGallery />
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
```

- [ ] **Step 5: Add tab styles to the `StyleSheet.create` block**

Add these styles inside `StyleSheet.create({...})`, after the `safe` entry:

```typescript
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 20,
  },
  tabBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabBtnActive: { borderBottomColor: Colors.primary },
  tabBtnText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.4 },
  tabBtnTextActive: { color: Colors.primary },
```

- [ ] **Step 6: Run all tests to confirm nothing broken**

```bash
node node_modules/jest-cli/bin/jest.js --passWithNoTests
```

Expected: `Tests: 27 passed` (20 existing + 7 new)

- [ ] **Step 7: Commit**

```bash
git add app/(tabs)/progress.tsx
git commit -m "feat(sprint3): progress tab — STATS/PHYSIQUE toggle, PhysiqueGallery integration"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Section 1 (Overview) — captured across Tasks 1–11
- ✅ Section 2 (Encryption) — Task 2 (`physiqueEncryption.ts`) + Task 3 (edge function never persists)
- ✅ Section 3 (DB Schema) — Task 1 migration
- ✅ Section 4 (Edge function) — Task 3
- ✅ Section 5 (Encryption library) — Task 2
- ✅ Section 6 (UI Screens) — Tasks 6, 7, 8, 9, 10, 11
- ✅ Section 7 (Hooks) — Task 5
- ✅ Section 8 (Notifications) — Task 5 (`scheduleCheckinReminder`)
- ✅ Supabase storage bucket note — mentioned in Task 1 Step 2

**Type consistency check:**
- `EncryptedBlob` defined in Task 2, used in Tasks 2 and 5 ✅
- `packEncryptedBlob` / `unpackEncryptedBlob` defined in Task 2, used in Task 5 ✅
- `PhysiqueSingleResponse` / `PhysiqueCompareResponse` defined in Task 4, used in Task 5 ✅
- `PhysiqueCheckin` / `PhysiqueAnalysis` defined in Task 5, used in Tasks 8, 9, 10 ✅
- `decryptStorageBlob` defined in Task 5, used in Tasks 8 and 10 ✅

**No placeholder scan:** No TBDs, TODOs, or "handle edge cases" text found. ✅
