# ESN Gent Events 🎉

A ticket shop + event calendar for ESN Gent, designed to live on a subdomain of
esngent.org (e.g. `events.esngent.org`). Styled with the official ESN colour
palette (cyan / magenta / green / orange / dark blue) and the Lato font, so it
matches the main site.

**What it does**

- Public event listing + month-view calendar (like esngent.org/calendar)
- Paid tickets via **Stripe Checkout** (secure, server-side) and free-event registration
- "Add to Google Calendar" + downloadable `.ics` file per event
- **User accounts** (Google sign-in) with a "My tickets" page listing all their transactions
- **Admin panel**: create/edit/publish events, set price & capacity, see all
  registrations per event with revenue stats, export CSV

**Stack**: Firebase Hosting (static site, no build step) + Firebase Auth +
Firestore + Cloud Functions (2nd gen) + Stripe. At student-org volume this runs
at effectively €0/month, but Cloud Functions require the **Blaze**
(pay-as-you-go) plan, which needs a card on file.

---

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com → **Add project** (e.g. `esngent-events`).
2. In **Build → Authentication → Sign-in method**, enable **Google**.
3. In **Build → Firestore Database**, click **Create database** → production mode → choose `europe-west1` (Belgium).
4. In **Project settings → General → Your apps**, add a **Web app** (`</>` icon). Copy the config object it shows you.
5. Upgrade the project to the **Blaze plan** (⚙️ next to "Spark plan" bottom-left, or Project settings → Usage and billing).

## 2. Configure this project

1. Open `.firebaserc` and replace `YOUR-FIREBASE-PROJECT-ID` with your project ID.
2. Open `public/config.js` and paste your web app config values (apiKey, authDomain, projectId, …).

## 3. Install the Firebase CLI and deploy Firestore + Hosting

```bash
npm install -g firebase-tools
firebase login
cd esn-events
firebase deploy --only firestore,hosting
```

Your site is now live at `https://YOUR-PROJECT-ID.web.app`. (Events won't load
payments yet — functions come next.)

## 4. Stripe setup

1. Create an account at https://stripe.com (choose Belgium, activate the account for live payments — test mode works immediately).
2. In the Stripe dashboard → **Developers → API keys**, copy the **Secret key** (`sk_test_...` for testing).
3. Set it as a secret and deploy the functions:

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
# paste the sk_... key when prompted
cd functions && npm install && cd ..
firebase deploy --only functions
```

4. The deploy output prints the URL of `stripeWebhook` (looks like
   `https://stripewebhook-xxxxx-uc.a.run.app` or
   `https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net/stripeWebhook`).
5. In Stripe → **Developers → Webhooks → Add endpoint**, paste that URL and
   subscribe to the events `checkout.session.completed` and
   `checkout.session.expired`.
6. Copy the webhook **Signing secret** (`whsec_...`) and set it, then redeploy:

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions
```

> Note: menu names in the Stripe dashboard change occasionally — if you don't
> find "Developers → Webhooks", search for "webhooks" in the dashboard search bar.

## 5. Make yourself admin

1. Sign in on your live site once with Google (so your account exists).
2. Firebase console → **Authentication → Users** → copy your **User UID**.
3. Firebase console → **Firestore Database** → **Start collection** →
   Collection ID: `admins` → Document ID: *paste your UID* → add a field
   `email` (string) with your email → Save.
4. Refresh the site — an **Admin** item appears in the menu.

Security rules only allow admin management from the console, so nobody can
make themselves admin through the site.

## 6. Create your first event

Admin → **+ New event**. Price `0` = free event (users register directly);
any other price uses Stripe Checkout. Tick **Published** to make it visible.

**Test a payment** with Stripe test mode using card number `4242 4242 4242 4242`,
any future expiry date and any CVC. When it works, swap the test keys for live
keys (repeat step 4 with `sk_live_...` and a live-mode webhook endpoint).

## 7. Connect the subdomain (events.esngent.org)

1. Firebase console → **Hosting → Add custom domain** → enter `events.esngent.org`.
2. Firebase shows you DNS records (usually A records, sometimes a TXT record for
   verification). Whoever manages DNS for `esngent.org` adds those records.
3. Wait for verification; Firebase provisions a free SSL certificate automatically.
4. **Important:** add the new domain in **Authentication → Settings →
   Authorized domains**, otherwise Google sign-in will be blocked on it.

---

## How payments stay secure

- The browser never touches your Stripe secret key. It calls the
  `createCheckoutSession` Cloud Function, which validates the event, price and
  capacity **server-side** and redirects the user to Stripe's hosted checkout.
- Payment confirmation comes **only** from Stripe's signed webhook — a user
  cannot mark their own ticket as paid. Firestore rules block all client writes
  to `registrations`.
- Abandoned checkouts expire after 30 minutes and their pending registrations
  are cleaned up automatically.

## Data model (Firestore)

| Collection | Doc contents |
|---|---|
| `events` | title, description, location, start/end (timestamp), price (cents), currency, capacity, ticketsSold, published, createdAt |
| `registrations` | eventId, eventTitle, uid, name, email, quantity, amountTotal (cents), currency, status (`pending`/`paid`/`free`), stripeSessionId, createdAt |
| `admins` | one doc per admin, doc ID = Firebase Auth UID |

## Costs (worth verifying against current pricing)

Firebase's free tier includes generous Hosting, Firestore and Functions quotas
that a student organisation is very unlikely to exceed; you'd typically pay €0.
Stripe charges a per-transaction fee (for European cards this has been around
1.5% + €0.25, but **check https://stripe.com/pricing for current rates**).
Consider building the Stripe fee into your ticket prices.

## Troubleshooting

- **"Could not load events"** → `public/config.js` still has placeholder values,
  or Firestore isn't created yet.
- **Query errors mentioning an index** → run `firebase deploy --only firestore`
  (deploys `firestore.indexes.json`) and wait a few minutes, or click the link
  in the browser-console error to auto-create the index.
- **Google sign-in popup fails on the custom domain** → add the domain to
  Authentication → Authorized domains (step 7.4).
- **Payments succeed but tickets stay "pending"** → the webhook isn't reaching
  the function: check the endpoint URL, that both events are subscribed, and
  that `STRIPE_WEBHOOK_SECRET` matches the endpoint's signing secret.
- **Functions deploy fails on the Spark plan** → the project must be on Blaze.

## File map

```
esn-events/
├── firebase.json            Hosting + Firestore + Functions config
├── .firebaserc              ← put your project ID here
├── firestore.rules          Security rules
├── firestore.indexes.json   Composite indexes for the queries the app uses
├── public/                  The website (no build step needed)
│   ├── index.html
│   ├── styles.css           ESN-branded styles
│   ├── app.js               All app logic (SPA with hash routing)
│   ├── config.js            ← paste your Firebase web config here
│   └── star.svg             Logo
└── functions/
    ├── index.js             Stripe checkout, webhook, free registration
    └── package.json
```
