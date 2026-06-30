# Deploy `send-drip-emails` (waitlist Day 2 / 5 / 9 nurture)

Sends the 3-step drip sequence to waitlist signups. Runs once a day; each
person gets each step exactly once (tracked by `drip_dayN_sent_at` columns,
migration 017).

## One-time setup

### 1. Apply migration 017
```cmd
cd C:\Dev\fitai-pro-app
supabase db push
```
(adds `drip_day2/5/9_sent_at` columns + due-scan indexes)

### 2. Set secrets
```cmd
supabase secrets set DRIP_CRON_SECRET=<random-hex>
# RESEND_API_KEY should already be set (used by send-welcome-email). If not:
supabase secrets set RESEND_API_KEY=<your-resend-key>
```
Generate a secret on Windows: `powershell -Command "[guid]::NewGuid().ToString('N')"`

### 3. Deploy
```cmd
supabase functions deploy send-drip-emails --no-verify-jwt
```
(`--no-verify-jwt` lets pg_cron call it; the function requires the
`x-cron-secret` header instead.)

### 4. Schedule it daily
Dashboard → Database → Cron Jobs → + Create a new cron job:

- **Name:** `send-drip-emails-daily`
- **Schedule:** `0 16 * * *`  (16:00 UTC — pick a good send hour for your audience)
- **Type:** SQL Snippet
- **SQL:**
  ```sql
  SELECT net.http_post(
    url := 'https://kbldncrurztfwlqzajen.functions.supabase.co/send-drip-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<your-DRIP_CRON_SECRET-value>'
    )
  );
  ```

## Test it
```cmd
curl -X POST https://kbldncrurztfwlqzajen.functions.supabase.co/send-drip-emails ^
  -H "x-cron-secret: <your-secret>"
```
Returns `{ ok:true, sent:{ day2:N, day5:N, day9:N }, claimed, left }`.

## How the timing works
- Each step targets rows whose age is in **[N, N+3) days** and that haven't
  received it yet. The 3-day window means the daily cron always catches a row
  (even if a run is missed), and the `_sent_at` stamp prevents repeats.
- Anyone who's already a Vanguard (`is_vanguard = true`) is skipped — no point
  selling to people who bought.
- `MAX_PER_STEP = 100` per run (Resend free-tier-safe). Raise in the function
  if your list outgrows it.

## Copy
Lives in the function (`STEPS` array). Mirrors MARKETING.md:
- **Day 2** — "what makes Evulto different" + showreel
- **Day 5** — live scarcity ("X of 500 claimed, Y left", pulled from
  `vanguard_claimed_count`)
- **Day 9** — last-call deadline

All CTAs carry `utm_source=email&utm_medium=drip&utm_campaign=dayN` so the
admin dashboard attributes conversions back to the drip.
