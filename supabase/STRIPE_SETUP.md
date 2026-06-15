# Stripe web payments — setup runbook

The code is already in the repo:
- `supabase/payments.sql` — the grant backbone (run in the SQL editor).
- `supabase/functions/create-checkout` — opens a Stripe Checkout session.
- `supabase/functions/stripe-webhook` — credits the account when a payment completes.
- Client buy buttons are wired to it.

Do these steps once in **test mode**, confirm a test purchase works, then repeat with live values.

Project ref: `derxaiqacejjzgdqlsdr`
Webhook URL: `https://derxaiqacejjzgdqlsdr.supabase.co/functions/v1/stripe-webhook`

---

## 1. Run the SQL
Supabase dashboard → SQL Editor → paste all of `supabase/payments.sql` → Run.

## 2. Get the 7 Stripe price ids (test mode)
Stripe → make sure Test mode is ON → Product catalog → open each product → copy the
id under Pricing that starts with `price_`. Match them to these keys:

| Product (price)        | key in the map |
|------------------------|----------------|
| 500 Medals ($1.99)     | pack_500       |
| 1,400 Medals ($4.99)   | pack_1400      |
| 3,200 Medals ($9.99)   | pack_3200      |
| 7,000 Medals ($19.99)  | pack_7000      |
| 16,000 Medals ($39.99) | pack_16000     |
| Membership ($15/mo)    | membership     |
| Remove Ads ($14.99)    | adfree         |

## 3. Get the test Secret key
Stripe → Developers → API keys → Secret key → Reveal → copy (`sk_test_...`).

## 4. Create the webhook + get its signing secret
Stripe → Developers → Webhooks → Add endpoint:
- Endpoint URL: `https://derxaiqacejjzgdqlsdr.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed` and `invoice.paid`
- Add endpoint, then on its page reveal the Signing secret and copy it (`whsec_...`).

## 5. Sign in to the Supabase CLI
From the project root (no global install needed):
```
npx supabase login
```
A browser opens; authorize, then return to the terminal.

## 6. Set the three secrets
Create a file `stripe-secrets.env` in the project root (it's gitignored) with your real
values on three lines:
```
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_MAP={"pack_500":"price_...","pack_1400":"price_...","pack_3200":"price_...","pack_7000":"price_...","pack_16000":"price_...","membership":"price_...","adfree":"price_..."}
```
Apply them, then delete the file:
```
npx supabase secrets set --env-file ./stripe-secrets.env --project-ref derxaiqacejjzgdqlsdr
del stripe-secrets.env
```

## 7. Deploy the two functions
```
npx supabase functions deploy create-checkout --project-ref derxaiqacejjzgdqlsdr
npx supabase functions deploy stripe-webhook --no-verify-jwt --project-ref derxaiqacejjzgdqlsdr
```
(If it asks for Docker, add `--use-api` to each command.)

## 8. Test the whole loop
- `npm run dev`, open `http://localhost:5173`, sign in.
- Shop → buy a medal pack → on the Stripe page use card `4242 4242 4242 4242`,
  any future expiry, any CVC, any zip.
- It returns to the game and your medal balance goes up within a few seconds.
- For Membership, the same card creates the subscription; your account flips to member
  and gets the monthly medals.

## Going live later
Switch Stripe to Live mode, recreate the 7 products (live has its own `price_` ids),
grab the live Secret key, create a live webhook to the same URL, then repeat steps 6–7
with the live values. (Live charges only work once the account finishes activation.)
