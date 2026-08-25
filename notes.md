# ESN Gent Events — build notes (updated 2026-08-07, v8)

Ticket shop + event calendar. Firebase project **esn-gent-9084b**. **Custom domain: https://events.esngent.org** (CNAME → esn-gent-9084b.web.app in sureserver DNS panel; wildcard *.esngent.org A record left untouched — explicit CNAME overrides it; app.esngent.org is TAKEN by Evorto/Azure). Auth authorized domain + OAuth JS origin added for events.esngent.org. User: Pieter-Jan Roggeman; superadmin esn.gent@gmail.com.

## Stack
Vanilla JS SPA (hash routing, no build) + Firebase v10 CDN (Auth Google, Firestore w/ persistentLocalCache for offline, Functions client) on Firebase Hosting. PWA (SW v6: same-origin network-first + CDN cache-first incl. gstatic/jsQR/qrcodejs/JsBarcode → app boots offline; offline tickets work). CDNs: qrcodejs, jsQR + jsbarcode@3 (jsdelivr), GIS (calendar OAuth), Lato. Cloud Functions 2nd gen ready, NOT deployed (Spark).

## Branding
Dragon logo (user-provided PNG): icon-192/512, logo.png, logo-white.png (chroma-keyed white-on-transparent for dark header/footer), favicon. Official ESN star (esn-star.png) on the ESNcard replica. star.svg deleted.

## Key screens
- #/account (avatar tap / Profile tab): ESNcard replica front & centre (credit-card layout, Google photo in photo box, profile-fed fields, real CODE128 barcode of esncardCode via JsBarcode) + link/buy card actions + menu (Edit profile / My tickets / Admin|Scan / Privacy / Sign out).
- #/profile: edit form + privacy/delete only. renderEsncard()/renderEsncardBarcode()/loadMyCardData() helpers.

## Feature set (cumulative)
Events/calendar/images/PWA/QR tickets/scanner/check-in/profiles/ESNcard (€15, priceEsn, esnOnly, esnLimit)/ticket types/rich text/Maps/waitlist/self-cancel 2h/search+filters/OG tags (now events.esngent.org URLs)/attendance stats/clean design/app-style mobile (slim title bar, no footer, This-week rail)/GDPR (#/privacy + deletion w/ anonymization + upcoming-tickets guard)/roles (superadmin|board|volunteer + Team tab)/ticket transfer (claim links, code proven via rules w/o read access)/offline tickets.

## Status / config
- Spark plan; TESTING rules block for free registrations (delete on Blaze). Stripe not connected.
- Calendar sync live (82cc663b...@group.calendar.google.com; OAuth client 79769544853-u6ihf...; External+testing; test user esn.gent@gmail.com).
- Functions ready: createCheckoutSession, registerFree, cancelRegistration, createEsncardCheckout, stripeWebhook.

## Rules summary
Role fns (hasStaffRole/isBoard/isSuper; missing role⇒superadmin). events(read published||board; write board) · registrations(read own||staff; TESTING free create; updates: staff checkedInAt, own anonymize, own transferCode arm/cancel, claim-with-code; delete board||own free>2h) · waitlist(own||board) · users(read own||board; self w/o esncardVerified; delete board||self) · esncardOrders(create self; update board; delete board||own) · adminNotes(board; delete self) · admins(read own||board; create/update isSuper+whitelist; delete isSuper&&!self).

## Next steps
- **Security rules audit** (recommended before launch; repeatedly offered)
- Board review privacy policy; verify Firestore region EU
- Blaze day: functions, Stripe (+Bancontact), delete TESTING block, email (Brevo?), refunds, waitlist auto-promotion, Wallet passes (Google free-ish / Apple $99/yr), Cloud Storage images, per-event OG previews
- Ideas: Telegram/Discord publish ping, Sheets export, ESNcard.eu API (availability unverified), Evorto migration → repoint app.esngent.org later