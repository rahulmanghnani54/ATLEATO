# Lemon Squeezy Setup (Alternative to Stripe)

## Why Lemon Squeezy?
- Acts as **Merchant of Record** — handles ALL global tax/VAT for you
- No need to register for tax in different countries
- Slightly higher fee (5% + $0.50) but zero tax headache

## Setup (5 minutes)
1. Sign up at https://www.lemonsqueezy.com/
2. Create a Store
3. New Product → **"Atleato VIP Vanguard Pass"**
4. Price: **$1.99 USD**, one-time payment (NOT subscription)
5. Description: paste the product description from chat
6. Publish → copy the checkout / buy link
7. Open `docs/upsell.html`, find `YOUR_PAYMENT_LINK`, replace with your link
8. Commit + push

## Stripe vs Lemon Squeezy

| | Stripe | Lemon Squeezy |
|---|---|---|
| Fee on $1.99 | ~$0.36 (2.9% + $0.30) | ~$0.60 (5% + $0.50) |
| Tax handling | You do it | They do it (Merchant of Record) |
| Setup time | 5 min | 5 min |
| Best for | US-focused | Global launch |

**Recommendation:** Lemon Squeezy if you're selling globally and don't want tax complexity. Stripe if you're mostly US/India and want lower fees.

## After setup
The `#pay-cta` button in `docs/upsell.html` currently points to `YOUR_PAYMENT_LINK`. Until you replace it, clicking shows a setup-instructions alert. Once replaced, it opens checkout directly.
