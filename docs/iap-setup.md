# In-App Purchases (iOS) — setup checklist

The IAP **code is already done** (RevenueCat plugin + `revenuecat-webhook` edge function). These are the
one-time dashboard steps to turn it on. Product ids must match EXACTLY — the code maps
`io.turfgame.app.<key>` to the medal/membership grant.

## 1. Paid Apps Agreement ✅ (done)
App Store Connect → Business → Agreements, Tax, and Banking. Paid Apps must be **Active**.
(Bank account "processing" is fine — only affects payouts, not product creation or sandbox testing.)

## 2. Create the 7 products
App Store Connect → Turfgame → **Monetization**.

**In-App Purchases** (one-time):

| Reference Name | Type | Product ID | Price |
|---|---|---|---|
| 500 Medals    | Consumable     | `io.turfgame.app.pack_500`   | $1.99 |
| 1,400 Medals  | Consumable     | `io.turfgame.app.pack_1400`  | $4.99 |
| 3,200 Medals  | Consumable     | `io.turfgame.app.pack_3200`  | $9.99 |
| 7,000 Medals  | Consumable     | `io.turfgame.app.pack_7000`  | $19.99 |
| 16,000 Medals | Consumable     | `io.turfgame.app.pack_16000` | $39.99 |
| Remove Ads    | Non-Consumable | `io.turfgame.app.adfree`     | $14.99 |

**Subscriptions**: group `Turfgame Membership` → subscription `io.turfgame.app.membership`, 1 month, $15/mo.

Each needs a price + one localization (display name + description). "Ready to Submit" / "Missing
Metadata" is fine for sandbox.

## 3. RevenueCat
- Create account → project "Turfgame".
- Add App: App Store, bundle `io.turfgame.app`; connect the App Store Connect API key + in-app
  purchase key / shared secret (RevenueCat walks you through it).
- Register the 7 products (same ids).
- Copy the **public SDK key** (Apple) → this becomes `VITE_REVENUECAT_IOS_KEY`.
- **Webhook** → URL `https://derxaiqacejjzgdqlsdr.supabase.co/functions/v1/revenuecat-webhook`,
  Authorization header = a secret you choose (call it the webhook secret).

## 4. Code/secrets (Claude does once you provide the keys)
- Put `VITE_REVENUECAT_IOS_KEY` in `client/.env.production` (public, committed).
- Set the webhook secret as a Supabase secret `REVENUECAT_WEBHOOK_AUTH`.
- Deploy: `supabase functions deploy revenuecat-webhook --use-api --no-verify-jwt --project-ref derxaiqacejjzgdqlsdr`
- Rebuild in Codemagic.

## 5. Sandbox test
- App Store Connect → Users and Access → Sandbox → create a sandbox tester.
- On the device, sign out of the App Store, then a purchase prompts for the sandbox account.
- Buy a medal pack → balance updates within seconds (via the webhook → grant_purchase).

How grants flow: purchase → RevenueCat → webhook → `grant_purchase(user, product, txn, 'ios')` — the
same idempotent grant the web/Stripe path uses (`supabase/payments.sql`).
