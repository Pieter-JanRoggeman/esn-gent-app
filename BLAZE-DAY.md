# 🔥 Blaze Day — exact order matters

Unzip this into your project folder first (it updates `functions/index.js`,
`public/app.js`, `public/sw.js` and adds `firestore.rules.blaze`).

> ⚠️ **Golden rule:** deploy the new **rules LAST**, only after you've seen a
> successful test registration go through the Cloud Functions. If you deploy
> `firestore.rules.blaze` before the functions work, free registration breaks
> (that caused the "internal" error once before).

## 1 · Upgrade the plan
Firebase console → project **esn-gent-9084b** → ⚙️ → *Usage and billing* →
**Modify plan** → Blaze. (Pay-per-use; at our scale expect ~€0–2/month.)

## 2 · Stripe secret key
Stripe dashboard → Developers → API keys → copy the **Secret key**
(starts `sk_live_…`; use `sk_test_…` first if you want a test run).

```bash
cd <project folder>
firebase functions:secrets:set STRIPE_SECRET_KEY
# paste the key when prompted
```

## 3 · First functions deploy
```bash
cd functions && npm install && cd ..
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
# ← paste a placeholder like "temp" for now, we get the real one in step 4
firebase deploy --only functions
```
Copy the printed URL of **stripeWebhook**
(`https://stripewebhook-…run.app` or `…cloudfunctions.net/stripeWebhook`).

## 4 · Stripe webhook
Stripe dashboard → Developers → Webhooks → **Add endpoint**:
- Endpoint URL: the stripeWebhook URL from step 3
- Events: `checkout.session.completed` **and** `checkout.session.expired`

Copy the endpoint's **Signing secret** (`whsec_…`), then:
```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET   # paste whsec_…
firebase deploy --only functions                        # redeploy with real secret
```

## 5 · Bancontact
Stripe dashboard → Settings → **Payment methods** → turn on **Bancontact**
(and Cards). Checkout picks them up automatically.

## 6 · Deploy the app
```bash
firebase deploy --only hosting
```

## 7 · TEST before switching the rules 🧪
With Stripe in **test mode** (test secret key + test webhook) or a real €-cheap event:
1. Free event → Register → must succeed (now via the function) and the
   sold-counter on the admin dashboard must go up.
2. Paid event → Buy → Stripe Checkout opens → card `4242 4242 4242 4242`,
   any future date/CVC → back on the site, ticket appears under Tickets,
   registration flips from *pending* to *paid* (webhook working!).
3. ESNcard: account → application in *applied* → **Pay online** → same flow →
   application flips to *paid* in Admin → Users & ESNcards.
4. Abandon a checkout → after ~1h the pending registration disappears.

## 8 · ONLY NOW: switch the rules
```bash
cp firestore.rules firestore.rules.spark-backup
cp firestore.rules.blaze firestore.rules
firebase deploy --only firestore
```
From this moment registrations are created exclusively by the functions:
real capacity enforcement, no duplicates, accurate sold-out labels.

## 9 · Aftercare
- If anything misbehaves: `cp firestore.rules.spark-backup firestore.rules
  && firebase deploy --only firestore` restores the old behaviour instantly.
- Test-mode Stripe? Repeat steps 2–4 once with the **live** key + a live
  webhook endpoint when you're ready for real money.
- Watch the first real payments in Stripe dashboard → Payments.

## What's newly live after today
Online tickets & merch (cards + Bancontact) · online ESNcard payment at the
statutory price (€15 / €7.50; team cards stay free & desk-only) ·
alumni pricing enforced server-side (incl. trips exception) · real capacity
enforcement + accurate sold-out for students · self-cleaning abandoned
checkouts.

## Still open for a next version (needs functions too)
Confirmation e-mails · refunds from the app · automatic waitlist promotion ·
card-expiry auto-enforcement · push notifications.
