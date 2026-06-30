# Stripe Payment Link Setup

## Quick Setup (5 minutes)

1. Go to https://dashboard.stripe.com/payment-links
2. Click "+ New"
3. Product: "Evulto VIP Founder's Pass — $1.99 Deposit"
4. Price: $1.99 USD, one-time
5. Description: "Reserves your 90% off lifetime pricing + Founder badge. Remaining $18 charged at launch."
6. Click "Create link"
7. Copy the buy.stripe.com URL
8. Open `docs/upsell.html`
9. Find `REPLACE_WITH_YOUR_LINK` (2 places if there are CTAs)
10. Paste your Stripe URL
11. Commit + push

## Fees

- Stripe takes: 2.9% + $0.30 = ~$0.36 on $1.99
- You keep: ~$1.63 per signup
- For 1000 signups: ~$1,630 cash collected + 1000 leads validated

## Test mode

Use Stripe test mode first. Stripe test card: 4242 4242 4242 4242
