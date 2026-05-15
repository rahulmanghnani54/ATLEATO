# FitAI Pro — Deployment Runbook

## One-time setup (do this before first production build)

### 1. Supabase — Run Migrations

In your Supabase dashboard → SQL Editor, run each migration file in order:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_rls.sql
supabase/migrations/003_...
supabase/migrations/004_...
supabase/migrations/005_physique.sql
```

Or via CLI (if Supabase CLI is installed and linked):
```bash
supabase db push
```

### 2. Supabase — Create Storage Bucket (REQUIRED for Sprint 3)

This MUST be done manually — migrations cannot create storage buckets.

**Option A — Dashboard:**
1. Go to Supabase dashboard → Storage
2. Click "New bucket"
3. Name: `physique-photos`
4. Toggle: **Private** (not public)
5. Click "Create bucket"
6. Go to Storage → Policies → `physique-photos` bucket
7. Click "Add policy" → custom → paste:

```sql
CREATE POLICY "physique_storage_own" ON storage.objects
  FOR ALL
  USING (bucket_id = 'physique-photos' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'physique-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
```

**Option B — SQL Editor:**
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('physique-photos', 'physique-photos', false);

CREATE POLICY "physique_storage_own" ON storage.objects
  FOR ALL
  USING (bucket_id = 'physique-photos' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'physique-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
```

### 3. Supabase — Set Edge Function Secrets

In Supabase dashboard → Edge Functions → Manage secrets:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key from console.anthropic.com |

### 4. Supabase — Deploy Edge Functions

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Login
supabase login

# Link to your project (get project ref from dashboard URL)
supabase link --project-ref kbldncrurztfwlqzajen

# Deploy all edge functions
supabase functions deploy
```

Or deploy individually:
```bash
supabase functions deploy analyze-physique
supabase functions deploy ai-coach-chat
supabase functions deploy analyze-workout
supabase functions deploy form-feedback
supabase functions deploy generate-meal-plan
supabase functions deploy nutrition-advice
supabase functions deploy recovery-plan
supabase functions deploy weekly-summary
```

---

## Building for production

### Prerequisites

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to your Expo account
eas login
```

### iOS — First time only

```bash
# Set up Apple credentials (certificates + provisioning profiles)
# EAS will guide you through this interactively
eas credentials --platform ios
```

You need:
- An Apple Developer account ($99/year) at developer.apple.com
- App record created in App Store Connect (appstoreconnect.apple.com)
- Fill in `eas.json` submit section: `appleId`, `ascAppId`, `appleTeamId`

### Android — First time only

1. Create your app in Google Play Console (play.google.com/console)
2. Go to Setup → API access → Link to a Google Cloud project → Create service account
3. Download the JSON key → save as `google-play-service-account.json` in project root
4. **Never commit this file** — it's in `.gitignore`

### Build commands

```bash
# Production build (both platforms)
eas build --profile production --platform all

# iOS only
eas build --profile production --platform ios

# Android only
eas build --profile production --platform android

# Development build (for testing VisionCamera + encrypted photos on device)
eas build --profile development --platform all
```

### Submit to stores

```bash
# Submit the latest production build
eas submit --platform ios --latest
eas submit --platform android --latest
```

---

## App Store listing checklist

### Required assets
- [ ] App icon: 1024×1024px PNG (no transparency, no rounded corners — Apple adds them)
- [ ] Screenshots for each device size:
  - iPhone 6.7" (1290×2796px) — 3-5 screenshots
  - iPhone 6.1" (1179×2556px) — optional but recommended
  - iPad 12.9" — required if `supportsTablet: true`
- [ ] App preview video (optional but boosts conversion)

### Required metadata
- [ ] App name: `FitAI Pro`
- [ ] Subtitle (30 chars): e.g. `AI Fitness Coach & Tracker`
- [ ] Description (4000 chars max)
- [ ] Keywords (100 chars): `fitness,workout,AI coach,gym,physique,form analysis`
- [ ] Support URL (required)
- [ ] Privacy policy URL (required — see below)
- [ ] Category: Health & Fitness
- [ ] Age rating: 4+ (no objectionable content)

### Privacy labels (App Store Connect → App Privacy)
| Data type | Collected | Used for |
|-----------|-----------|----------|
| Photos | Yes | App functionality (encrypted before upload) |
| User content | Yes | App functionality |
| Identifiers (User ID) | Yes | Analytics, app functionality |
| Usage data | Yes | Analytics |

---

## Privacy policy

You MUST have a live privacy policy before submitting. Minimum required content:

```
FitAI Pro Privacy Policy

What we collect:
- Account email (via Supabase Auth)
- Workout logs and training data
- Physique photos: encrypted on your device using AES-256-GCM before upload.
  We cannot decrypt or view your photos. Only you hold the encryption key.
- AI coaching interactions (text only, not stored long-term)

What we don't collect:
- Unencrypted photos
- Location data
- Contacts

Data storage:
- Encrypted photos: Supabase Storage (EU/US region)
- Workout data: Supabase PostgreSQL with row-level security
- Encryption keys: stored only on your device (expo-secure-store)

Third-party services:
- Supabase (database + storage): supabase.com/privacy
- Anthropic Claude (AI analysis): anthropic.com/privacy

Contact: [your email]
```

Host this at a URL you control (e.g. `yourwebsite.com/privacy` or a public Notion page).

---

## Google Play listing checklist

### Required assets
- [ ] App icon: 512×512px PNG
- [ ] Feature graphic: 1024×500px JPG/PNG
- [ ] Screenshots: minimum 2, maximum 8 per device type
- [ ] Short description (80 chars)
- [ ] Full description (4000 chars)

### Data safety form
Under App content → Data safety:
- Photos: yes, encrypted, not shared with third parties
- App activity (workout logs): yes, required for app functionality
- Personal info (email): yes, account management

---

## Monitoring after launch

- **Supabase dashboard**: watch edge function invocation counts + errors
- **Expo dashboard** (expo.dev): crash reports via Expo's error reporting
- **App Store Connect / Play Console**: ratings, reviews, crash logs

### Rate limits to watch
- `analyze-physique` edge function: 10 calls/hour/user (Claude Vision is expensive)
- Other edge functions: configured in `_shared/security.ts`

---

## Quick command reference

```bash
# Run tests
node node_modules/jest-cli/bin/jest.js --passWithNoTests

# Dev build (VisionCamera needs native code)
eas build --profile development --platform android

# Production build
eas build --profile production --platform all

# Deploy edge functions
supabase functions deploy

# Submit to stores (after build completes)
eas submit --platform all --latest
```
