# ESN Gent App

The event, ticketing & membership platform of **ESN Gent** — built for ~1,500 international students per year.

**Live:** https://app.esngent.org · Current version: **v1.0.0**

## What it does

**For students**
- Browse & book events, pay online (Stripe) or use member prices with a verified ESNcard
- QR tickets with live check-in status, ticket transfers, waitlists & refund requests
- ESNcard application, payment & digital card replica with barcode
- **ESN Passport**: stamps per attended event, visas per event category, levels & XP, badges (incl. secret ones), country league, shareable passport card
- Ghent guide & bucketlist, Cantus codex, ESNcard partner deals, push notifications, offline-capable PWA, personal calendar subscription

**For the board**
- Event management with venue presets, tag system (each tag linked to an ESN cause + DSA activity type), shiftlist templates, cash registers, per-event stats & feedback digests
- Automatic sync to **Google Calendar** and to the UGent activities site (**dsa.ugent.be**) — create/update/remove follows the event; board meetings & office hours included; room reservations shown on the board page
- ESNcard pipeline (apply → pay → verify → pickup), user management with audit history, partnership follow-up (statuses, contacts, contracts), reimbursements with finance approval, board meetings with minutes, to-dos, shiftlists, insights & analytics, friendship tree
- AI helper "Jacob" (Gemini) for event descriptions, feedback digests & meeting recaps

## Tech stack

- **Frontend:** vanilla JS single-page app (`public/app.js`) — no build step, Firebase v10 CDN modules, clean URLs, service-worker PWA
- **Backend:** Firebase — Hosting, Firestore, Cloud Functions (2nd gen, Node 22), Storage, Cloud Messaging, Auth (**Google sign-in only**)
- **Payments:** Stripe Checkout + webhooks (**LIVE** - cards + Bancontact; SEPA/bank-transfer stay off, the webhook treats checkout.session.completed as paid)
- **Integrations:** Google Calendar API, UGent DSA API, Gemini, SMTP mail

## Repository layout

```
public/                  the whole frontend
  index.html             app shell (og tags for events come from a function)
  app.js                 the entire SPA (~750 KB, deliberately one file)
  styles.css             all styling, light/dark aware
  sw.js                  service worker (bump CACHE on every release)
  config.js              Firebase web config (client-visible, not secret)
functions/
  index.js               all Cloud Functions (Stripe, mails, calendar & DSA sync,
                         push, nightly maintenance, callables)
firebase.json            hosting rewrites — ORDER MATTERS (/event/** before **)
firestore.rules          security rules (identical to firestore.rules.blaze)
firestore.indexes.json   composite indexes — the ROOT file is the only one deployed
storage.rules            Storage rules (images, proof PDFs)
```

## Running & deploying

Requirements: `firebase-tools` CLI, access to the Firebase project `esn-gent-9084b`.

```bash
firebase login
firebase use esn-gent-9084b

# frontend + functions
firebase deploy --only functions,hosting

# include rules / indexes only when they changed
firebase deploy --only functions,hosting,firestore,storage
```

Server secrets live in **Firebase Secret Manager**, never in this repo:

```
STRIPE_SECRET_KEY   STRIPE_WEBHOOK_SECRET   GEMINI_API_KEY   SMTP_PASSWORD   DSA_API_KEY   ESNCARD_BYPASS_KEY
```

Set one with `firebase functions:secrets:set NAME`, then redeploy functions.

## Conventions that must not break

- `firestore.rules` and `firestore.rules.blaze` are kept **identical** — edit one, copy to the other.
- `firestore.indexes.json` in the repo **root** is the deployed one; never keep a second copy under `functions/`.
- Bump `APP_VERSION` (app.js) **and** the `CACHE` name (sw.js) together on every release, and add a changelog entry.
- Native `alert/confirm/prompt` are forbidden — use `appAlert/appConfirm/appPrompt`.
- Ticket/counter fields on events & registrations (`ticketsSold`, `pendingHold*`, `stripeSession*`, `firstIn`, `lastIn`, `dsaActivityId`, …) are maintained by the functions — never edit them by hand.
- Users' IBANs are never stored on user docs; ESNcard codes & expiry are immutable for users.
- DSA sync: activities lock at their start time; the activity type comes from the event's tags; team events push as private "Vergadering"/non-public.

## Domains & services

| What | Where |
|---|---|
| App | https://app.esngent.org (events.esngent.org redirects) |
| University activities | https://dsa.ugent.be (association `esn`) |
| Forms | https://forms.esngent.org (Tally, separate) |
| Payments | Stripe dashboard |
| Backups | Firestore PITR + scheduled exports |

---

Maintained by the ESN Gent board · esn.gent@gmail.com
