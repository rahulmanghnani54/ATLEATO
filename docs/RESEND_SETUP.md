# Resend Email Automation Setup

Welcome emails for waitlist signups are sent automatically via Resend through a Supabase Edge Function (`supabase/functions/send-welcome-email`). This guide walks through one-time setup.

## Step 1 — Create a Resend account
Sign up at [resend.com](https://resend.com). The free tier covers 100 emails/day and 3,000/month — plenty for early launch traffic.

## Step 2 — Verify your sending domain
1. In Resend Dashboard → **Domains** → **Add Domain**, enter `atleato.com`.
2. Add the 4 DNS records (SPF, DKIM, DMARC, return-path) shown by Resend to your DNS provider.
3. Wait for verification (usually <10 minutes).

For initial testing, you can use Resend's shared `onboarding@resend.dev` address — just edit `FROM_EMAIL` in `supabase/functions/send-welcome-email/index.ts`.

## Step 3 — Generate an API key
Resend Dashboard → **API Keys** → **Create API Key** → name it `atleato-supabase`, scope `Sending access`. Copy the `re_...` value once — you won't see it again.

## Step 4 — Add the secret in Supabase
Supabase Dashboard → **Project Settings** → **Edge Functions** → **Secrets** → **Add new secret**:
- Name: `RESEND_API_KEY`
- Value: `re_xxxxxxxxxxxxx`

## Step 5 — Deploy the Edge Function
From the repo root:
```bash
supabase functions deploy send-welcome-email
```

## Step 6 — Wire up the Database Webhook
Supabase Dashboard → **Database** → **Webhooks** → **Create a new hook**:
- **Name:** `welcome-email`
- **Table:** `public.waitlist`
- **Events:** `Insert`
- **Type:** `HTTP Request`
- **Method:** `POST`
- **URL:** `https://kbldncrurztfwlqzajen.supabase.co/functions/v1/send-welcome-email`
- **HTTP Headers:**
  - `Authorization: Bearer <SERVICE_ROLE_KEY>`
  - `Content-Type: application/json`

(Find the service role key at Project Settings → API → `service_role` secret.)

## Step 7 — Test end-to-end
1. Submit the waitlist form on https://atleato.com using a real address.
2. Check that inbox within ~10 seconds for the Vanguard Badge welcome email.
3. If nothing arrives: Supabase Dashboard → **Edge Functions** → `send-welcome-email` → **Logs** will surface the error (most commonly `RESEND_API_KEY not configured` or a domain-not-verified message from Resend).

## Cost reference
- **Free tier:** 100 emails/day, 3,000/month, 1 verified domain.
- **Pro tier:** $20/month for 50,000 emails — only needed once you sustain ~1,500+ signups/day.
- **Domain verification:** free (just DNS records).

## What the email contains
- Personalized **Vanguard Badge** (e.g. "Obsidian Vanguard #042") generated deterministically from the user's email — same email always gets the same badge.
- Waitlist position (#2,400+id).
- VIP-remaining counter.
- Premium 3D-style HTML layout matching `docs/upsell.html`.
- Direct CTA to the $1.99 VIP upsell.
- Referral link for the "invite 3 friends → free" track.
