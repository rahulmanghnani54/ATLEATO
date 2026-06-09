# Lemon Squeezy → Supabase Webhook Setup

End-to-end automation for every Vanguard purchase:

```
Buyer pays on LS
    ↓ (LS POSTs webhook)
supabase/functions/lemonsqueezy-webhook
    ↓
1. Verify HMAC-SHA256 signature
2. Atomically assign pass # 1-500
3. Mark waitlist row is_vanguard = true
4. Insert vanguard_orders ledger row
5. Send "Pass #XXXX confirmed" email via Resend
```

---

## 1. Apply the migration

```bash
cd C:\Dev\fitai-pro-app
supabase db push
```

This creates `vanguard_orders` table, adds `is_vanguard` / `vanguard_pass_no` / `vanguard_at` columns to `waitlist`, and installs the atomic `assign_next_vanguard_pass_no()` RPC.

## 2. Deploy the edge function

```bash
supabase functions deploy lemonsqueezy-webhook --no-verify-jwt
```

The `--no-verify-jwt` is critical — Lemon Squeezy doesn't send Supabase JWTs. Our function does its own HMAC signature check instead.

You'll get a URL like:
```
https://kbldncrurztfwlqzajen.supabase.co/functions/v1/lemonsqueezy-webhook
```

## 3. Create the webhook in Lemon Squeezy

1. LS dashboard → **Settings** → **Webhooks** → **+ Create a webhook**
2. Fill in:
   ```
   Callback URL:    https://kbldncrurztfwlqzajen.supabase.co/functions/v1/lemonsqueezy-webhook
   Signing secret:  (click "Generate" — copy this for step 4)
   Events:          ☑ order_created
                    ☑ order_refunded
   ```
3. Click **Save**

## 4. Store the signing secret in Supabase

```bash
supabase secrets set LEMONSQUEEZY_WEBHOOK_SECRET=whsec_paste_the_secret_here
```

## 5. Verify Resend key is set (should already be)

```bash
supabase secrets list | grep -i resend
# Should show RESEND_API_KEY
```

If missing:
```bash
supabase secrets set RESEND_API_KEY=re_your_key_here
```

## 6. Test the loop

In LS, with the product still in **Test Mode**:

1. Open the LS test checkout
2. Pay with card `4242 4242 4242 4242`
3. Within 10 seconds, verify in Supabase SQL editor:
   ```sql
   SELECT id, ls_order_id, email, pass_no, status, test_mode, created_at
   FROM vanguard_orders
   ORDER BY created_at DESC
   LIMIT 5;
   ```
   You should see a `test_mode = true` row with `status = 'paid'` and a `pass_no` 1-500.
4. Check the waitlist row:
   ```sql
   SELECT email, is_vanguard, vanguard_pass_no, vanguard_at
   FROM waitlist
   WHERE email = 'your-test-email@example.com';
   ```
5. Inbox should have the "Pass #XXXX confirmed — welcome, Vanguard" email.

## 7. Switch to Live Mode

When ready:
1. Lemon Squeezy → top-right menu → **Switch to Live**
2. Click ⋯ on the product → **Copy to Live Mode**
3. Get the new live checkout URL → send to me → I swap it in `upsell.html`
4. Add a SECOND webhook in Live Mode (same URL, same events, **new signing secret**)
5. Update `LEMONSQUEEZY_WEBHOOK_SECRET` with the live secret (test and live are different)

Or use both secrets at once (advanced):
```typescript
// in index.ts, accept either signature
const ok = await verifySignature(rawBody, sig, LS_TEST_SECRET)
        || await verifySignature(rawBody, sig, LS_LIVE_SECRET);
```

---

## Debugging

**See live function logs:**
```bash
supabase functions logs lemonsqueezy-webhook --tail
```

**Check LS webhook delivery log:**
LS dashboard → Settings → Webhooks → click your endpoint → "Recent deliveries"

If LS shows "401 Unauthorized" you have the wrong signing secret. Re-copy from LS → update Supabase secret → redeploy.

If LS shows "200 OK" but no row in `vanguard_orders`, check function logs for the actual error.

---

## What gets sent to the buyer

| When | Email | Sender |
|---|---|---|
| Waitlist signup (free) | "you're in — pass reserved" | `hello@atleato.com` (Resend) |
| **Successful $1.99 payment** | **"Pass #XXXX confirmed — welcome, Vanguard"** | **`hello@atleato.com` (Resend, this webhook)** |
| Refund processed | None (LS sends its own refund receipt) | LS automation |
| Payment receipt | Auto-receipt with order details | Lemon Squeezy automation |

So a buyer receives **3 emails** total on purchase:
1. LS receipt (from `noreply@lemonsqueezy.com`)
2. LS thank-you/welcome (configured in product settings)
3. Your branded "Pass #XXXX confirmed" (from this webhook)
