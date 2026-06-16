# Google Play Subscription Product Setup

## Prerequisites
- Google Play Console account ($25 one-time fee)
- App listed in Google Play (can be in draft / closed testing)

## Register the 4 Subscription Products

Go to: https://play.google.com/console/u/0/developers/{your-dev-id}/app/{your-app-id}/subscriptions

### Product 1: PRO Monthly
- Product ID: `atleato_pro_monthly`
- Name: "Atleato PRO — Monthly"
- Description: "3 coaches, AI form correction, reward chests, physique photos, ringtone picker, unlimited streak freezes."
- Base plan: Auto-renewing, monthly billing period
- Price: $9.99 USD (other regions auto-converted)
- Free trial: Optional 7 days recommended
- Grace period: 3 days

### Product 2: PRO Yearly
- Product ID: `atleato_pro_yearly`
- Name: "Atleato PRO — Yearly (Save 15%)"
- Description: Same as monthly + "Save 15% with annual billing"
- Base plan: Auto-renewing, yearly
- Price: $101.90 USD (= $9.99 x 12 x 0.85)

### Product 3: LEGEND Monthly
- Product ID: `atleato_legend_monthly`
- Name: "Atleato LEGEND — Monthly"
- Description: "All 5 coaches, advanced form AI + video review, snooze re-calls, territory heatmap, voice customization."
- Base plan: Auto-renewing, monthly
- Price: $19.99 USD

### Product 4: LEGEND Yearly
- Product ID: `atleato_legend_yearly`
- Name: "Atleato LEGEND — Yearly (Save 20%)"
- Description: Same as monthly + "Save 20% with annual billing"
- Base plan: Auto-renewing, yearly
- Price: $191.90 USD (= $19.99 x 12 x 0.80)

## After Registration

1. Activate all 4 products
2. Set tax categories (digital service / subscription)
3. Upload icon for each (use assets/logo/logo-icon-512.png)
4. Submit app for internal testing review (optional but faster)
5. Run `npx expo prebuild --clean` so the native IAP module is included
6. Test purchases on a real device with a test Google account

## Test Account

Set up testing accounts:
- Play Console -> Settings -> License Testing -> Add tester emails
- These accounts can purchase without real payment

## When You're Done

The app code (lib/subscriptionManager.ts) already references these exact product IDs. As soon as they're active in Google Play Console, purchases work end-to-end.
