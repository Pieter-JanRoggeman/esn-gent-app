// ============================================================
// ESN Gent App - single-page app
// Vanilla JS + Firebase v10 (CDN modules). No build step needed.
// ============================================================

import { firebaseConfig, functionsRegion } from "/config.js";
import { calendarSync } from "/calendar-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, Timestamp, serverTimestamp, deleteField, arrayUnion, increment,
  getCountFromServer, getAggregateFromServer, sum, limit, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getFunctions, httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  getMessaging, getToken as getPushToken, deleteToken as deletePushToken,
  onMessage, isSupported as pushApiSupported,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Persistent local cache: previously-loaded data (your tickets!) stays
// available when the device is offline. Falls back gracefully if the
// browser blocks storage (e.g. some private-browsing modes).
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache() });
} catch {
  db = getFirestore(app);
}
const functions = getFunctions(app, functionsRegion);
const storage = getStorage(app);

// Google Analytics (GA4, v0.100) - activates ONLY when a measurementId is
// present in config.js (enable Analytics in the Firebase console, copy the
// measurementId into firebaseConfig). Page views are logged per route.
let analytics = null;
try {
  if (firebaseConfig.measurementId) analytics = getAnalytics(app);
} catch { /* analytics stays off */ }

// ------------------------------------------------------------
// Version & changelog. Bump APP_VERSION and add an entry on every
// deploy - everyone sees the number, staff see the details.
// ------------------------------------------------------------
const APP_VERSION = "1.4.1";
const CHANGELOG = [
  {
    version: "1.4.1",
    date: "2026-09-05",
    notes: ["Fixes the 1.4.0 release, which didn't load at all (a broken line in the code - sorry). Everything below is what 1.4.0 brought."],
  },
  {
    version: "1.4.0",
    date: "2026-09-05",
    notes: [
      "Board: the ESNcard queue is built for speed. It opens on To assign (everyone who paid, oldest payment first), unpaid applications live under Office, Details under a name unfolds the submission instead of taking a row, Enter in the card field assigns and jumps to the next student, filters stay pinned while you scroll.",
      "Board: money first at the desk - an unpaid application shows a Paid? button; only after you confirm does the card-number field appear. Handing over the card is one green click.",
      "Colour language everywhere: green means yes, red means no - reject, remove, delete and cancel buttons are red, including in confirmation dialogs.",
      "Cash at the office is now a superadmin switch under Settings → ESNcard, OFF by default: students pay online right after submitting; the board can still register cash it did receive.",
      "Fixed: the user page crashed with 'subs is not defined' when opened from the queue.",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-09-05",
    notes: [
      "Board: the ESNcards tab is now Users, with two sub-tabs. ESNcard is the office-hours work queue - it opens on everything that still needs a hand (unpaid, to assign, to pick up), shows the time of each submission and filters by institution, nationality, type of stay, payment, proof and arrival month. Users lists every account with colour-coded institutions, team and alumni flags, and filters by institution, nationality and role.",
      "Board: numbers and the donut overview moved to Insights → Members & map. The 'card ready' e-mail text is edited under Settings → ESNcard (superadmin).",
      "Board: a user's page now shows their previous ESNcard submissions - every submit of the form is kept, so edits and renewals stay visible.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-09-05",
    notes: [
      "ESNcard form: tell us from which month to which month you're in Ghent (leave the end open if you don't know yet), pick your home country and city from a list, and whenever you choose 'Other' you can say what it is. The passport/ID number question is gone.",
      "Whatever your profile already knows is filled in for you, and what you add here is saved to your profile - no double typing.",
      "Proof of exchange: it says clearly which files work (JPG, PNG or PDF, max 5 MB).",
      "Board: an Overview with donut charts on the ESNcards tab - status, institutions, type of stay, nationalities, arrival and departure months, how people found ESN, home countries.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-09-05",
    notes: [
      "ESNcard application fixed: attaching a PDF as proof of exchange failed with a permissions error since day one - it works now (a rules fix went live first as 1.0.1). Sorry to everyone who hit it.",
      "The application form is shorter: three steps, the rarely-needed questions folded under 'Optional', and the proof is a real attachment (photo, screenshot or PDF up to 5 MB) with a clear file name and a Remove button.",
      "Errors now speak human: instead of 'Missing or insufficient permissions' or 'internal' you get what happened and what to do - and the board's error log keeps the technical text, the error code and who hit it.",
      "Board: the ESNcard review is down to two buttons - Assign card (checks the number on esncard.org, marks a cash application paid, links the card, mails the student) and Reject… (with a reason; online payments refund automatically). Every application now has a 'Full submission' view with all answers.",
      "Board: the error log gets a Download CSV button (all entries, opens in Excel/Sheets), shows who hit each error, and server-side failures are logged with their real cause.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-09-04",
    notes: [
      "Out of beta! 🎉 The app is live for real: payments run in Stripe live mode (cards + Bancontact), the beta chip and the built-in test-mode banner are gone, and the beta reset tool has been removed for good.",
      "Fresh start: all test data from the beta rounds was wiped before launch - everything you see from here on is real.",
      "Office details corrected everywhere: our office is the Home Canterbury common room, Stalhof 6, Ghent - hours as announced on the Office page.",
    ],
  },
  {
    version: "0.140-beta",
    date: "2026-09-03",
    notes: [
      "From your feedback: a Share button on every event page (native share sheet, or the link on your clipboard), and the 'Happening now' badge moved out of the tag row to the bottom of the card.",
      "Shop: 'Reserve - pay cash at pickup' is back as a real button next to Order - one open reservation per item, the order QR lands in My tickets, staff marks it paid at the office.",
      "Event form hardening: a double-tap can no longer create two events, invisible-character titles are stripped, creating an event in the past asks first, prices can't go negative, and a broken photo now says what's wrong instead of showing an exclamation mark.",
      "Assigning a volunteer to a BOARD shift slot now asks before doing it; abandoned checkouts release their held spots within 30 minutes instead of overnight.",
      "Guide links like ESNcard and Codex now render as real links, waterzooi appears once, and the FAQ answers whether you can sign in without Google (plus a note to watch WhatsApp for last-minute shifts).",
    ],
  },
  {
    version: "0.139-beta",
    date: "2026-09-03",
    notes: [
      "Pay buttons now show a spinner with what is happening ('Opening secure checkout…', 'Registering you…') the moment you tap - the few seconds before Stripe opens no longer feel frozen.",
      "The superadmin beta reset now covers everything added since it was written: contact messages (with replies), the creation log, cash counts, mail queue, error log, board notes and old card orders - plus event images in storage - and it clears card status, passport XP and levels on every profile. Accounts, roles, settings, tags, venues, partners, shop products, news and the codex stay.",
    ],
  },
  {
    version: "0.138.1-beta",
    date: "2026-09-03",
    notes: [
      "Deleted accounts no longer lock their ESNcard number forever: the kept issue-record stops blocking the one-card-one-person check, so someone who returns with a new login can relink their own card (esncard.org still confirms it). Two live accounts still can never share a number.",
      "Icons hotfix baked in: the app now declares the Material Symbols font itself instead of relying on Google's stylesheet to do it.",
    ],
  },
  {
    version: "0.138-beta",
    date: "2026-09-03",
    notes: [
      "Account deletion is now done in one server-side sweep: profile, notification tokens, waitlist entries, messages to the board, upcoming shift sign-ups, open reimbursements, proof photos and any team role are removed; past tickets, orders, ratings and past shifts stay as anonymous records; the login is deleted last. No more half-finished deletions or a second Google confirmation.",
      "The Ghent dragon now greets you while the app loads - a slow hover, a soft breath and a wisp of smoke - in light and dark, and still for anyone who prefers reduced motion.",
    ],
  },
  {
    version: "0.137-beta",
    date: "2026-09-02",
    notes: [
      "My tickets: every ticket is now a card with the EVENT date and a clear status (checked in with the time, valid, not scanned, payment not finished) plus an upcoming / checked-in tally on top. Tickets move to the archive the day after their event, when they can't be scanned any more.",
      "Ticket page: a big 'You're in' state once you're scanned, event date & place under the title, tidy facts (name, tickets, code, paid) and options that explain themselves - transfer, cancel or refund - with a Rate button after the event.",
      "Shop product page: big photo, size/option pills, a +/- quantity stepper, live total on the Order button, stock hints and a 3-step 'how pickup works'.",
      "Shiftlists on a phone: one card per shift with Board / Volunteers slots and a big 'join' pill - no more sideways scrolling.",
      "Board space: your own to-dos float to the top with a 'you' pill, Enter adds a to-do, and upcoming meetings show Today / Tomorrow / in N days.",
      "Admin dashboard: New event and Office hours are now big buttons at the very top, all-time totals moved out (they live under Insights), and a 'needs attention' row shows open card applications and student messages.",
      "Account page: one compact membership card instead of repeated ESNcard-discount text - an active card just says 'Active until …'; the menu shows which perks unlock with an active ESNcard.",
      "Office page: a hero with the next session (or 'Open now'), directions button, facts with icons and three tiles for what you can do there.",
      "Superadmin fallback: Settings → ESNcard → 'Also accept available cards as members'. Standard is active-only; switch it on when esncard.org registration or its API is down so linked cards still get member prices and perks - app and server alike.",
    ],
  },
  {
    version: "0.136-beta",
    date: "2026-08-31",
    notes: [
      "Smoother start-up: the splash screen is ESN blue in every theme, and returning users no longer see a Sign-in button flash while the app restores their session.",
      "The first tab is now simply Home, and the greeting tells you what's actually coming up this week instead of describing the app.",
      "Event cards: tap anywhere on the card to open the event, with material icons for date and location - and one clean level ring around your avatar instead of two.",
      "My tickets is split into Active & upcoming (soonest first) and a collapsed archive of past tickets, so the list stays short all semester.",
      "The digital ESNcard now shows the card's activation date (or validity) where the star and passport level used to be.",
      "The ESN Passport is a much shorter scroll: visas, badges, fun facts, the volunteer section and the country league fold into tappable sections with their counts on the outside.",
    ],
  },
  {
    version: "0.135-beta",
    date: "2026-08-31",
    notes: [
      "Creation log: who created, deleted or cancelled events, office hours, board meetings, news posts and merch is now recorded automatically and visible to the whole board on the admin dashboard (kept for a year, never editable).",
      "Birthday wishes: students with the app installed get a happy-birthday push from ESN Gent at 09:00 on their big day - once per year, with its own on/off switch under Notifications.",
      "Team birthdays on the board page: everyone with a team role plus the alumni network, sorted by who's next, with the age they turn - and a nudge listing who hasn't set a birthday yet.",
    ],
  },
  {
    version: "0.134-beta",
    date: "2026-08-31",
    notes: [
      "ESNcard verification is now fully system-driven - the board can no longer tick \"verified\" or type an expiry by hand anywhere. A card is only ever verified live against esncard.org, so a wrong number can't be saved. On a member's Details page, \"Verify & assign\" checks the number and links it in one step; wrong, blocked, expired or already-active cards are refused.",
      "The board only assigns available (blank, not-yet-registered) cards. A card that is already active on esncard.org belongs to the student - only they can link it, from their own account page.",
      "The Users list is now a read-only overview: every member shows a live ESNcard status badge (Active · Available · Expired · No card) and the filter chips count how many are in each status. Assigning or removing a card happens on the member's Details page.",
      "The 'card ready' e-mail no longer prints fixed office-hours times - it links to the always-current office page instead.",
    ],
  },
  {
    version: "0.133.1-beta",
    date: "2026-08-31",
    notes: [
      "The 'card ready' e-mail now leads with the card number and, for a not-yet-activated card, tells the student to register it on esncard.org right away - then pick up the physical card during office hours. Active cards keep the validity-date wording. New {activationNote} placeholder in the editable template.",
    ],
  },
  {
    version: "0.133-beta",
    date: "2026-08-31",
    notes: [
      "ESNcard verification is now automatic. Link a card on your account: if it's active on esncard.org, you're a verified member instantly - no board check, member prices apply right away (section, expiry and card number are read live).",
      "If your card isn't activated yet, it links as 'not activated' with a Refresh button - activate it on esncard.org and refresh to become a member.",
      "Board: assigning a card now verifies it live (refuses blocked, expired or unknown cards), links it, and sends the pickup e-mail - one card can never end up on two accounts, and expiry always comes from esncard.org.",
      "Every card link and assignment is saved to the person's card history, and expired cards just prompt for a fresh one.",
    ],
  },
  {
    version: "0.132-beta",
    date: "2026-08-31",
    notes: [
      "ESNcard verification is back: the board can check any card number against esncard.org straight from the app (Admin → ESNcards, and the Users list) - it shows the live status, section and expiry. ESN International gave us a server key for it, so verification works even though the site is behind Cloudflare now",
    ],
  },
  {
    version: "0.131-beta",
    date: "2026-08-30",
    notes: [
      "Site banner is now board-configurable (Settings → System → Site banner): any message, warning or info style, dismissible or not - a changed message reappears for everyone. Until you configure it, the built-in beta banner keeps showing",
      "Ticket transfers now go through the server, closing the loophole where a transfer could give one person two tickets for the same event",
      "Notification settings explain themselves on devices that can't receive push (iPhone browser → install guide) instead of offering choices that silently do nothing",
      "Scan page rebuilt: Scanner vs Kiosk mode cards with explainers, plus a live 'Scannable now' list showing checked-in / sold and a progress bar per event (board sees live door stats)",
      "Board space rebuilt: next meeting, open to-dos, room reservations and the inbox as tiles up top, meeting planning tucked into a collapsible card",
      "Admin dashboard: revenue & tickets THIS month with % vs the same point last month, a tickets-per-week chart for the last 8 weeks, and the all-time numbers in a calmer second row",
      "My tickets: cleaner layout with event icons, and the long 'pending' explainer moved into an (i) tooltip",
      "Account page decluttered: shift stats live on the ESN Passport now, and card-linking sits behind a small disclosure",
      "Calendar: dark mode chips are readable again (office-hours chips were invisible), and days are bucketed on Belgian time even if your phone is still on home time",
      "Plus: 'Free' filters count member prices for verified members, unread-message badge on the admin Inbox tab, one colour language for Save/Edit/destructive buttons, sub-headings restored on mobile, keyboard access for file uploads and the icon picker, and a skip-to-content link",
    ],
  },
  {
    version: "0.130-beta",
    date: "2026-08-30",
    notes: [
      "Full UX audit ahead of launch - the big ones: ticket holders no longer see 'Sold out - join the waitlist' on full events (your ticket shows first), the waitlist hold time shown now matches the real setting, and 'tickets left' counts checkouts in progress so the last spots don't fail silently during a rush",
      "When the last spot goes while you're buying, the page now refreshes to the real state (waitlist button included) instead of an endless retry",
      "Your waitlists are now listed under My tickets - see held spots, claim or leave them there",
      "After paying, the success page actually confirms the payment with Stripe before celebrating - no more scary 'pending + Cancel' moment in My tickets",
      "All times shown are Belgian time, whatever timezone your phone is still on",
      "'Get your ESNcard' buttons on the Passport/Guide/Codex pages and shop now actually open the application (they led to the home page)",
      "The shop shows sold-out items honestly (a failed payment is never silently turned into a 'reservation'), unfinished merch payments get a real Pay button, and linked-but-unverified ESNcards no longer see 'No card yet? Apply - €15'",
      "Finishing the ESNcard application now also completes your event profile, and your account page reminds you early if profile fields are missing",
      "Sign-in falls back to a full-page redirect when the popup is blocked (installed app, Instagram's browser)",
      "Faster, calmer start: theme applies before first paint (no more white flash in dark mode), and screen readers now hear labels and toasts instead of icon names",
      "Plus: searchable FAQ keeps custom + built-in answers, bigger touch targets, better contrast on FREE labels, cancelled events marked on the calendar, non-refundable policies open by default, and honest error pages with a way back",
    ],
  },
  {
    version: "0.129-beta",
    date: "2026-08-30",
    notes: [
      "Contact the board from inside the app (/contact, also in the account menu): pick a category, send your message, and replies arrive as a conversation - with a push notification and an e-mail when the board answers. Typing your question first shows matching FAQ answers live, so most questions are solved before they're sent",
      "Board side: new Inbox tab in Admin - open/answered/closed filters, category filter, reply threads (replying notifies the student automatically), close/reopen",
      "The FAQ is now searchable - one search bar filters every question live, and a 'Question not answered?' card links to the contact page",
    ],
  },
  {
    version: "0.128.1-beta",
    date: "2026-08-28",
    notes: [
      "Share card polish: the faded white dragon replaces the star in the background, Jacob left the card, one consistent typeface throughout (the canvas now waits for every font weight), a soft level-coloured glow behind the ring, a crisp edge around the photo, a 'Latest stamps' label, and cleaner icon tiles",
    ],
  },
  {
    version: "0.128-beta",
    date: "2026-08-28",
    notes: [
      "The shareable passport card got the same glow-up as the passport: your profile photo inside the XP ring, event icons on the stamps and the stat tiles, your favourite category with a medal, and a cleaner layout",
      "Server maintenance: Cloud Functions upgraded to Node 22 and the latest Firebase SDK (Google retires Node 20 on 30 October) - no visible changes",
      "Bug fixes: the 'closed the party' nightly job no longer fails (missing database index), the ticket page hides transfer/cancel options the moment you're scanned in (and explains why a transfer is refused), the partnerships Excel import skips bad rows instead of stopping, and form validation messages no longer land in the error log",
    ],
  },
  {
    version: "0.127-beta",
    date: "2026-08-28",
    notes: [
      "ESN Passport reworked as a top feature: your profile photo now sits in the level ring at the top, with an 'i' button that explains the whole passport",
      "Visas leveled up - each category now has a Bronze/Silver/Gold tier that climbs the more events you attend (Bronze at 1, Silver at 3, Gold at 6), shows your count and a progress bar, uses the category's icon, and your top three categories get a medal. Tap any visa to see exactly which events you joined in it",
      "XP system extended: reaching a visa tier is worth XP too (+8/+20/+40), and level thresholds were retuned so the climb to Erasmus Legend stays meaningful",
      "The team side is now one clean 'ESN Volunteer' block - your shift stats and service badges together instead of two separate sections",
    ],
  },
  {
    version: "0.126-beta",
    date: "2026-08-28",
    notes: [
      "Event icons grew up: a visual tap-to-pick grid with 60+ icons in the event form, and every tag can carry its standard icon (Settings, Event tags) - 'Auto' on an event now means 'use the first tag's icon'",
      "The calendar & DSA sync switches sit together under a clearer 'Sync switches' heading in the event form's Advanced section",
      "Home page: the news items got their own 'News' header, and when you open the app offline a strip at the top takes you straight to your saved tickets (My tickets also says clearly that offline QR codes still scan)",
      "Typography cleanup: long dashes replaced with plain ones across the whole app",
    ],
  },
  {
    version: "0.125-beta",
    date: "2026-08-28",
    notes: [
      "Events got icons: every event carries a material icon (auto-picked from its tag, changeable in the event form) - passport stamps now print that icon, so your stamp page looks like a real passport",
      "New /install page: step-by-step Android & iPhone install + notification setup per OS, linked from a dismissible banner on the home page when you're not using the installed app",
      "Alumni network page (/alumni) for the board & alumni coordinator: everyone flagged alumni with their board-function history, plus add/remove",
      "Check-in is now limited to the event day (+ the day after): wrong-day or too-late tickets show a clear warning, kiosk mode refuses them, and a board member can still override with a confirmation",
      "'Last spots!' ribbon on event cards when fewer than 10% of the spots are left",
      "Waitlist reply time is now a setting (Settings → Event defaults, default 12 h) instead of a fixed 24 h",
      "Per-event 'Sync to Google Calendar' switch under Advanced - just like the DSA switch",
      "Board meeting event report now covers everything since the previous meeting (not a fixed two weeks) and shows the students' ★ ratings - tap a rating for the written comments; both are included in the .md export",
      "FAQ: scanning & check-in questions grouped in their own section; the confusing merch-QR item removed",
    ],
  },
  {
    version: "0.124-beta",
    date: "2026-08-25",
    notes: [
      "Profile gamified: your ESN Passport level sits right on the card - the replica shows 'Level N - name' where the plastic card prints the photo disclaimer, the card glows in your level colour (stronger every level, Erasmus Legend pulses), and a level strip with your photo, ring & XP progress sits underneath - tap anything to open the passport",
    ],
  },
  {
    version: "0.123-beta",
    date: "2026-08-25",
    notes: [
      "Shiftlist TEMPLATES replace 'copy from another event': the board saves any event's shiftlist as a named template (Party, Therminal event, Cantus, …) and applies it on the shiftlist editor or straight in the event form - tasks, times, spots & notes, never the names",
      "Settings tab labels no longer show stray icon text",
    ],
  },
  {
    version: "0.122-beta",
    date: "2026-08-25",
    notes: [
      "Venues now carry their DSA location type (Settings → Event locations) - picking a saved venue in the event form also fills the 'Location type - for DSA' select (e.g. sports hall → UGent-domein)",
    ],
  },
  {
    version: "0.121-beta",
    date: "2026-08-25",
    notes: [
      "Deals page for the board: switch between card and LIST view, search across names/deals/contacts/notes, filter by status (with counts) and category, and group by status or category - going through the whole partner pipeline is finally quick; students keep the simple card grid",
    ],
  },
  {
    version: "0.120-beta",
    date: "2026-08-25",
    notes: [
      "Team organigram is now a real tree: Management (President · Vice-President · Treasurer) on top, the rest of the board below with volunteers under them - and the Advisory Board hangs off the side as an alumni extension (AB members are not board), with the alumni network (coordinator + previous board members) underneath",
      "Deals page: one-click 'Import from the partnerships Excel' button loads all 52 partners with status, category, dates, contact & stop reasons - existing names are skipped, and only ACTIVE ones ever show to students",
      "Admin → Settings split into tabs (Events / ESNcard / Organisation / System) - same cards, far less scrolling",
    ],
  },
  {
    version: "0.119-beta",
    date: "2026-08-25",
    notes: [
      "Partnership follow-up (like the board's Excel): every partner now has a status (Active / In progress / Contacted / Unknown / Stopped / Refused), category, signing & end dates, stop reason, contact person and board-only notes - students only ever see the ACTIVE ones, the board sees the whole pipeline on the deals page",
      "Passport demo mode (superadmin): a Demo button on the passport shows it fully unlocked with synthetic data for testing & screenshots - client-side only, nothing is saved",
    ],
  },
  {
    version: "0.118-beta",
    date: "2026-08-25",
    notes: [
      "ONE tag list: every tag now carries its ESN cause and DSA activity type as links (Settings → Event tags, with a one-click ESN Gent starter set of 13 tags) - events just pick tags, causes & DSA types follow automatically; the old separate cause tags are legacy (hidden from the form, still counted on old events)",
      "Passport visas are now the activity tags only, and Insights derives the per-cause statistics from the tag links",
      "Homepage decluttered: greeting instead of the big blue banner, then news → upcoming events → the next office-hours session → a rotating ESNcard partner deal; past events left the homepage",
    ],
  },
  {
    version: "0.117-beta",
    date: "2026-08-25",
    notes: [
      "Tickets-left fix: removing a registration now also lowers the sold counter the public event page uses (they could drift apart before) - and if an event's counter is already off, the admin page shows a warning with a one-click 'Fix counter' button",
      "Admins see an Edit event / Registrations / Shiftlist bar right on the event page - no more detour via the Admin tab",
    ],
  },
  {
    version: "0.116-beta",
    date: "2026-08-25",
    notes: [
      "ESN Passport streamlined: the four 'events attended' badges are now ONE tier badge with a progress bar showing exactly how many events to the next level (same for shift tiers on the team side)",
      "Live ticket fix: check-in now flips the ticket reliably even when the phone was locked at the door - the page re-checks the moment the screen wakes and polls as a fallback; the status badge flips to 'checked in ✓' and a big check covers the QR so the door team sees it instantly",
    ],
  },
  {
    version: "0.115-beta",
    date: "2026-08-25",
    notes: [
      "Venue profiles (Settings → Event locations): saved locations with address, a default picture (used when an event has none), default tags and per-venue statistics (events per month, tickets sold, upcoming) - the event form gets a 'saved venue' picker that fills everything in one go",
      "DSA fix: tag changes now re-push the event (tags decide the DSA activity type, but weren't part of the change detection - the reason an update didn't come through; PUT itself is fine, no PATCH needed)",
      "Duplicating an event no longer carries the original's DSA activity id (an edit on the copy would have overwritten the original on dsa.ugent.be)",
    ],
  },
  {
    version: "0.114.1-beta",
    date: "2026-08-25",
    notes: [
      "DSA: editing an event or meeting that has already started no longer errors - DSA locks activities at start time ('Too late'), so the sync now skips them and the DSA entry keeps its last pushed state",
    ],
  },
  {
    version: "0.114-beta",
    date: "2026-08-25",
    notes: [
      "DSA activity types linked to tags: in Settings → Event tags every tag can map to a DSA 'Type activiteit' (BBQ, Cantus, Feest, Sport, …) - the first mapped tag on an event decides what's pushed; office hours default to Permanentie, board meetings to Vergadering",
      "Frequent event locations: board-managed list in Settings → Org lists, shown as type-ahead suggestions in the event form and office-hours Location fields",
      "Admin event page & board meetings show an 'Open in DSA ↗' link once the activity is on dsa.ugent.be",
      "Profile home-city suggestions no longer show the same city twice in two spellings (Gent & Ghent → Ghent) - common endonyms are normalised to their English names",
    ],
  },
  {
    version: "0.113-beta",
    date: "2026-08-25",
    notes: [
      "Room reservations moved to their own board sub-page (/board/rooms) with a month-calendar view - /board loads instantly again; green/orange/magenta = approved/pending/denied",
      "Board meetings from the meeting planner now register on dsa.ugent.be automatically as a private 'Vergadering' (on by default, toggle when planning or via the DSA button on the meeting page)",
      "DSA fixes & polish: per-event location type (terrain) select under Advanced, 72-hour insurance warnings when creating anything closer than that, and the 'Push all upcoming events' button now shows the real per-event DSA error instead of a bare count",
    ],
  },
  {
    version: "0.112-beta",
    date: "2026-08-25",
    notes: [
      "UGent DSA: office hours and team events (board meetings, alumni & volunteer events) are now registered on dsa.ugent.be too - on by default, team events go up as non-public activities, and every event keeps its own off-switch under Advanced (office hours also directly in the quick-add form)",
    ],
  },
  {
    version: "0.111-beta",
    date: "2026-08-25",
    notes: [
      "Board page: live overview of ESN Gent's UGent room reservations (Therminal & co) straight from dsa.ugent.be - dates, times, locations and approved/pending status at a glance",
    ],
  },
  {
    version: "0.110-beta",
    date: "2026-08-25",
    notes: [
      "UGent DSA integration: published events are pushed to dsa.ugent.be automatically (no more manual entry) - edits update them, cancelling/unpublishing removes them",
      "Per-event switch under Advanced → 'Publish on the UGent activities site' (on by default; unticking removes an already-pushed activity). Team events and office hours are never pushed",
      "Admin → Settings: DSA card with on/off switch, association abbreviation and a 'Push all upcoming events' backfill button",
    ],
  },
  {
    version: "0.109.1-beta",
    date: "2026-08-25",
    notes: [
      "Design polish pass: fixed-width numerals on all statistics, tables and counters (numbers line up and stop jiggling), consistent stat-card sizing, calmer form interactions (hover hints, smooth focus), comfier settings rows on the profile page",
    ],
  },
  {
    version: "0.109-beta",
    date: "2026-08-24",
    notes: [
      "Four SECRET badges (shown as ??? until earned): first person scanned at an event, last one out (5+ attendees), fashionably late (90+ min), and checking in before the official start",
      "Passport 'Fun facts': your average arrival time (fashionably late or punctuality legend), favourite category and favourite night out - all from your own check-in data",
      "Country league now crowns the most punctual country (⏱️) and the most fashionably late one (🐢), computed from real door-scan times",
      "Share card cleaned up: flat colours, no neon glow",
    ],
  },
  {
    version: "0.108-beta",
    date: "2026-08-24",
    notes: [
      "ESN Passport redesigned: a proper passport cover (ESN blue, brand stripe, star watermark) with your level ring and headline numbers - and stamps now bundle per month so a busy semester stays scannable (latest month open, older months fold away)",
      "Share card reworked with a stronger ESN look: brand colour stripe, star watermark, and six stats (this year, visas, badges, XP, bucketlist %, country rank)",
      "Bucketlist split into themed sections: Cities to visit, Belgian beers to try, Food to try, Erasmus experiences (+ the existing survival list & Ghent bucketlist) - with per-section progress chips that jump to each section",
      "Ghent Explorer badge & the +25 XP bonus now reward completing any FULL section (finishing literally everything stays for the true legends)",
      "Board: 'Load the app's default list' button on the guide page to adopt the new sections in one click",
    ],
  },
  {
    version: "0.107-beta",
    date: "2026-08-24",
    notes: [
      "Ticket page updates LIVE at the door: the moment your QR is scanned, the open ticket flips to 'You're in - have fun!' by itself",
      "Push notification when you earn a passport stamp at check-in",
      "Admin dashboard reworked: attendance-rate, ESNcard-members and open-applications cards; on mobile the tabs are a compact grid instead of a scroll strip; events filterable by tag",
      "Calendar: filter the month by tag with one tap",
      "Every event now needs at least one category tag AND one ESN cause (Culture · Education & Youth · Environmental Sustainability · Health & Well-being · Skills & Employability · Social Inclusion) - the superadmin seeds all six causes with one click in Settings",
      "Insights: new per-tag & per-cause table (events, tickets, attendance, revenue) including which causes still lack an event this year",
    ],
  },
  {
    version: "0.106-beta",
    date: "2026-08-24",
    notes: [
      "Admin → Settings → Org lists now also covers the ESNcard form's study fields and higher-education institutions - edit them without touching code",
      "ESN Passport: new 'ESN service record' section for board, volunteers & alumni (role, shifts worked, office shifts, this-year count) with 6 service badges of its own",
      "5 new passport badges for everyone: Globetrotter (join a trip), Marathon (3 events in one week), Season pass (active in 3 months), Visa collector (3 visas), Feedback friend (rate 3 events)",
    ],
  },
  {
    version: "0.105-beta",
    date: "2026-08-24",
    notes: [
      "Proof of exchange now accepts PDFs too (max 5 MB - stored securely, board opens them with one tap); photos keep being compressed automatically",
      "Welcome-week switch: Admin → Settings → ESNcard can turn the proof requirement OFF - the upload disappears from the application form until it's switched back on",
      "Privacy: uploaded proofs are deleted automatically ~3 months after a card is activated, and always once the academic year is over (the application record itself stays)",
    ],
  },
  {
    version: "0.104-beta",
    date: "2026-08-24",
    notes: [
      "Friendship tree (board & alumni only): a draggable web of who's friends with whom - dotted line = good friends, solid = best friends. Anyone in the circle can add, retype or remove friendships; everyone else can't even see the page (enforced by security rules, not just hidden)",
    ],
  },
  {
    version: "0.103-beta",
    date: "2026-08-24",
    notes: [
      "Event form: create the shiftlist right in the event form (new section 3 - task, time, board & volunteer spots per shift)",
      "Team events: under Advanced → 'Who can join?' tick board / volunteers / alumni / advisory - the event stays invisible to regular students, never syncs to the public Google Calendar, sends no push, and registration is enforced server-side",
      "Events can now carry multiple tags - every tag counts as a passport visa for attendees (the first tag keeps giving the event its colour)",
      "ESN Passport, Cantus codex and bucketlist/survival guide are now member perks: unlocked by an active ESNcard, alumni status or a team role",
    ],
  },
  {
    version: "0.102-beta",
    date: "2026-08-24",
    notes: [
      "Fixed: after the board removed someone's card, they were locked out of re-applying ('already being processed') - a card-less account can now always apply again",
      "Admin user page: new card history (every assign / link / replace / removal, recorded from now on) and a Board & team section with current role and role history",
      "ESNcard office flow: after 'Assign & activate' the row stays in view so 'picked up' can be ticked immediately - no more switching filters",
      "Shop: the ESNcard appears as the first item for anyone without a card - status-aware (apply / finish payment / being prepared / ready for pickup / renew)",
    ],
  },
  {
    version: "0.101.3-beta",
    date: "2026-08-24",
    notes: [
      "Calendar page: the Apple/Outlook button now actually SUBSCRIBES (webcal link - auto-updating) instead of downloading a frozen .ics snapshot, plus a 'Copy calendar address' button for Outlook & other apps",
      "Event page: 'Download .ics' renamed to 'Add to Apple/Outlook (.ics)'; FAQ now explains subscribe (auto-updates) vs downloaded file (one-time snapshot)",
    ],
  },
  {
    version: "0.101.2-beta",
    date: "2026-08-24",
    notes: [
      "Backed out of a Stripe checkout? The event page now shows a 'Payment in progress' card with Resume payment and Cancel checkout & free my spot - no more waiting an hour for the held spot to release itself",
      "My tickets: pending payments get Pay and Cancel buttons too",
      "Unfinished checkouts now expire after ~30 minutes instead of 1 hour (cancelling releases the spot instantly and kills the Stripe payment page, so it can't be paid afterwards)",
    ],
  },
  {
    version: "0.101.1-beta",
    date: "2026-08-24",
    notes: [
      "Fixed registrations failing with INTERNAL on events with a capacity: a deploy had deleted the waitlist database index the capacity check depends on - the index is restored (and now tracked in the project), the check survives a missing index gracefully, and server errors report what went wrong instead of 'INTERNAL'",
    ],
  },
  {
    version: "0.101-beta",
    date: "2026-08-24",
    notes: [
      "The ESN Passport levelled up: XP & levels (Fresh Arrival → Erasmus Legend) with a coloured ring around your avatar, visas to collect per event category, and the Country League 🌍 - check-ins per nationality, updated daily",
      "Share your passport: a designed story-format card (level ring, stamps, badges, your flag) straight to Instagram or downloads",
      "Registration fixes: the confusing 'permission-denied' message is gone - errors now say what's actually wrong - and the ticket-policy checkbox is replaced by a simple 'by registering you agree' note",
    ],
  },
  {
    version: "0.100.1-beta",
    date: "2026-08-23",
    notes: [
      "Privacy policy refreshed for launch: it now covers the service e-mails, Google Analytics, the AI board tools (student data never goes to the AI), push tokens and passport/bucketlist data",
    ],
  },
  {
    version: "0.100-beta",
    date: "2026-08-23",
    notes: [
      "News: the board publishes updates (text, link, image) right on the new News page - every post sends a push notification, and fresh news shows on the homepage",
      "ESN Passport 🛂 - a stamp for every event you're checked in at, plus badges to earn (find it under Profile → Extras)",
      "Ghent guide & bucketlist: arrival checklist + things to do before you leave, tickable with your own progress - board edits it on the page",
      "ESNcard deals: the partner discounts in Ghent, with logos, locations and links - board manages the cards on the page",
      "Events can now carry a photo-album link (shown on the event page once added), and the app supports Google Analytics when enabled in the Firebase console",
    ],
  },
  {
    version: "0.99.12-beta",
    date: "2026-08-23",
    notes: [
      "E-mails now cover the whole ticket lifecycle: event cancellations (with the board's message and automatic-refund info, sent in safe batches), waitlist offers (your 24h hold, also by mail), refund decisions (approved with the amount, or declined with the treasurer's note) and transferred tickets (the new owner gets their ticket by mail)",
    ],
  },
  {
    version: "0.99.11-beta",
    date: "2026-08-23",
    notes: [
      "Launch hardening: paid checkouts now hold their tickets the moment checkout starts, so a rush on a popular event can never oversell - holds free up automatically when a payment completes, expires or is abandoned",
      "Sharing an event link now shows the event's own image, title, date and place in WhatsApp/Instagram/Telegram previews",
      "Security tightening before launch: IBANs no longer touch the profile record (finance-only, as promised), ticket scanning can only ever set a real check-in time, and a legacy collection was closed for writes",
    ],
  },
  {
    version: "0.99.10-beta",
    date: "2026-08-23",
    notes: [
      "Clean URLs: pages now live at app.esngent.org/event/…, /calendar, /links and so on - no more # in the address bar, and the back/forward buttons work as before",
      "Every old #/-style link (e-mails, calendar entries, bookmarks, QR screenshots) silently redirects to its clean equivalent, so nothing out there breaks",
    ],
  },
  {
    version: "0.99.9-beta",
    date: "2026-08-23",
    notes: [
      "Multi-day events (trips, festivals) now show on every day they span in the calendar - later days marked as '↳ continues' - and the event page shows the end date when it's a different day",
      "Overnight events are treated sensibly: a party from 23:00 till 05:00 stays on its start day only (anything ending before 08:00 counts as the night before)",
    ],
  },
  {
    version: "0.99.8-beta",
    date: "2026-08-23",
    notes: [
      "ESNcard pickup e-mails: the moment a card number is assigned & activated, the student automatically gets a branded mail with their card number, validity and the office hours - so they know the card is ready for pickup",
      "The text is a board-editable template (Admin → Users & ESNcards → 'Card ready' e-mail): placeholders like {firstName}, {cardNumber}, {activationNote} (register-on-esncard.org note) and {officeHours} fill in per student, with a 'Send me a preview' button to check it",
    ],
  },
  {
    version: "0.99.7-beta",
    date: "2026-08-23",
    notes: [
      "Homepage fix: an event that already started no longer poses as upcoming - it shows a pulsing 'Happening now' badge while it runs, drops to Recent past when it ends, and a mistyped end date can't keep it on top for more than 14 days",
      "Ticket transfers now close the moment the event starts (they already closed on scan) - the FAQ says so too",
    ],
  },
  {
    version: "0.99.6-beta",
    date: "2026-08-23",
    notes: [
      "The app moved to its new home: app.esngent.org (taken over from the retired Evorto platform) is now the main address - events.esngent.org keeps working and forwards there, so nothing breaks",
      "Board heads-up: if you had the app installed or notifications enabled, re-install / re-enable them once on the new address - installs and push are tied to the domain",
    ],
  },
  {
    version: "0.99.4-beta",
    date: "2026-08-23",
    notes: [
      "Confirmation e-mails: every paid or free registration now also gets a branded ticket e-mail, sent from the section's own esngent.org mailbox - configure it under Admin → Settings → System (with a 'Send me a test' button), password stored once as the SMTP_PASSWORD secret",
      "Mails are queued and retried automatically every 15 minutes, so a big on-sale burst or a mail-server hiccup never loses a confirmation - and the whole thing has an on/off switch like the AI",
    ],
  },
  {
    version: "0.99.3-beta",
    date: "2026-08-22",
    notes: [
      "Fixed Jacob's 404: Google retired gemini-2.5-flash for new API users - the default model is now gemini-3.6-flash, and a saved old model name is remapped automatically on the server",
      "When Google rejects an AI request, the error now quotes Google's own explanation, so a future model change tells you exactly what to put in Settings",
    ],
  },
  {
    version: "0.99.2-beta",
    date: "2026-08-22",
    notes: [
      "Meet Jacob - the AI helpers are now fronted by our mascot: Jacob drafts event descriptions, digests event feedback, and (new) writes a recap of board-meeting minutes with decisions, action points and per-function highlights, straight on the meeting page",
      "The recap uses only what's written in the meeting notes (it saves your unsaved edits first) - same rules as before: board-only, off by default, master switch in Admin → Settings",
    ],
  },
  {
    version: "0.99.1-beta",
    date: "2026-08-22",
    notes: [
      "AI helpers for the board (off by default, master switch in Admin → Settings → System): 'Draft with AI' writes an event description from the facts already in the form, and event pages can summarize student feedback into three lines for the board meeting",
      "Everything runs on the existing Google billing, only board members can use it, student data never enters prompts - and flipping the switch off removes it everywhere instantly",
    ],
  },
  {
    version: "0.99-beta",
    date: "2026-08-22",
    notes: [
      "Cash registers went digital: every event's admin page (office hours included) has a Cash registers card - any board member counts a register before and after by tapping in the number of each note and coin, totals calculate live, and the difference shows what the register earned",
      "Finance gets the cross-event overview (Admin → Finance → Cash registers): all registers per event, most recent first, with who counted and any remarks - replacing the register spreadsheet",
    ],
  },
  {
    version: "0.98-beta",
    date: "2026-08-22",
    notes: [
      "New under Profile → Extras: the Cantus Codex 🎶 - all 82 songs, searchable by title or any line of text, lyrics one tap away",
      "The board can edit songs, add new ones or reorder them right on the page; everyone else reads along (also handy mid-cantus)",
    ],
  },
  {
    version: "0.97-beta",
    date: "2026-08-22",
    notes: [
      "The app has its own link-in-bio page for the Instagram bio: events.esngent.org/links - the next 3 events always on top (updates itself), then the ESN Gent links (Telegram, guides, well-being resources per institution)",
      "Board members edit the links right on the page (pencil button) or in Admin → Settings - goodbye Linktree",
    ],
  },
  {
    version: "0.96-beta",
    date: "2026-08-22",
    notes: [
      "Profiles grew up: first and last name (prefilled from your Google account), clear required fields (*) - home university, Instagram and LinkedIn stay optional",
      "Registering for an event now asks you to complete your profile first - fill in the missing bits once and you land straight back on the event",
      "Fixed a crash on the admin Team tab",
    ],
  },
  {
    version: "0.95-beta",
    date: "2026-08-22",
    notes: [
      "Events without tickets: when creating an event, choose how students join - in-app tickets (as before), 'just show up' (no registration; the event page shows the door prices, e.g. €5 at the door · free with ESNcard), or an external partner sign-up link",
      "Walk-in and external events skip all the ticket machinery - no policy checkbox, no waitlist, no capacity - and their cards say so at a glance",
    ],
  },
  {
    version: "0.94-beta",
    date: "2026-08-22",
    notes: [
      "Built for the long run: the app now works in academic years (July–June). Every admin list - events, ESNcards, orders, finance, insights - loads the current year by default, with a year picker to browse any past year as an archive. Nothing is deleted; old years just stay out of the way",
      "Faster admin screens: the Users tab loads only accounts active this year (full list on demand), adding team members uses a live search instead of a giant dropdown, and the shift leaderboard runs per academic year",
      "More things the next boards can change without a developer: board functions, shift task names, the 'how did you find us' options and the ESNcard validity period all moved to Admin → Settings",
      "Nightly housekeeping now cleans up old error logs, stale waitlist entries and ancient finished to-dos automatically",
    ],
  },
  {
    version: "0.93-beta",
    date: "2026-08-22",
    notes: [
      "Big polish pass: every confirmation and input popup is now a proper in-app dialog - a smooth bottom sheet on your phone, a centred card on desktop - instead of the browser's grey boxes",
      "Sleek motion everywhere: pages glide in, event cards lift (and their photos zoom subtly) on hover, toasts spring up with an icon, and everything respects your system's reduced-motion setting",
      "The little (i) info icons now open a neat popover bubble where you tap, My tickets became searchable, long past-meeting lists collapse, and inputs glow softly when focused",
    ],
  },
  {
    version: "0.92-beta",
    date: "2026-08-21",
    notes: [
      "One card, one account: linking an ESNcard now checks the whole system - the same number can never end up on two accounts (the board's assign & verify screens double-check against the database too)",
      "ESNcards now properly expire: once the date passes, member prices stop automatically, your profile shows a clear 'card expired' notice, and - if you're still an international student in Ghent - a Renew button starts a fresh application",
      "The board can set or correct a card's expiry date on each member's detail page (verifying a linked card fills in 12 months automatically)",
    ],
  },
  {
    version: "0.91-beta",
    date: "2026-08-21",
    notes: [
      "Waitlist got fair: when a spot frees up, the FIRST person in line gets a notification and a personal 24-hour hold - nobody can snatch it in the meantime, and unused holds pass to the next person automatically",
      "Fixed: 'free with ESNcard' events now show the green Register button for verified members instead of a broken Stripe checkout",
      "Refunds: the treasurer can refund a custom (partial) amount, the standard fee (€1) and standard cancellation deadline are now editable under Admin → Settings, and the Settings page is grouped into Events / ESNcard / Organisation / System",
      "ESN tasks show when they were added and completed, and old finished tasks move into a collapsed archive",
      "The board can edit the student FAQ in Settings; long team dropdowns got a type-to-filter box; a gentle warning appears before registering if you no-showed 2+ events",
      "Calendar page: subscribe once to the ESN Gent calendar (Google or Apple/Outlook) and every event lands in your own agenda automatically",
    ],
  },
  {
    version: "0.90-beta",
    date: "2026-08-21",
    notes: [
      "Android push notifications now show the ESN dragon in the status bar instead of a white square",
      "Home city on your profile suggests real cities (OpenStreetMap) while you type - picking one also fills your home country",
      "The board can set ESN's socials (website, Instagram, Facebook, TikTok, YouTube, Discord, WhatsApp) in Admin → Settings; only filled-in ones appear at the bottom of the page and on the Office page",
      "Cancelling and refunds moved into a tucked-away 'Ticket options' section on the ticket itself - and they correctly disappear once the event's cancellation deadline has passed",
      "Fixed a crash when leaving the Scan page while the camera was starting, and cleaned obvious noise out of the error log",
    ],
  },
  {
    version: "0.89-beta",
    date: "2026-08-19",
    notes: [
      "Homepage no longer shows the same event twice: the separate 'This week' strip is gone - the upcoming list itself is now grouped into 'This week' and 'Later', each event appearing exactly once",
      "Profile shortcuts got smarter: the tiles only show destinations that are NOT already in your bottom bar, so nothing appears twice (students see no tiles at all - their bar has everything); the ESN office found a permanent home in the menu",
      "Signing in is clearer everywhere: every locked page now shows one white 'Continue with Google' button with the Google logo and explains that the same tap creates your account if you're new",
    ],
  },
  {
    version: "0.88-beta",
    date: "2026-08-19",
    notes: [
      "Profile page, app-style: a compact grid of shortcut tiles (Tickets, Calendar, Shop, Office - plus Shifts, Scan, Board and Admin for the team) sits right under your ESNcard, so on mobile every part of the app is one tap away again",
      "Menu rows now read like a native app: icon and label left-aligned, chevron right, and the theme shows its current value on the row",
      "Removed leftover grey footnotes about the statutes - where the context matters it now lives behind a small (i) icon instead",
    ],
  },
  {
    version: "0.87-beta",
    date: "2026-08-19",
    notes: [
      "Account page decluttered for real: everything that already lives in the top navigation (tickets, shop, shifts, scan, board, admin) left the menu - it now only holds profile, notifications, appearance, tasks, reimbursements, help and sign out",
      "The loose status lines (role, verified, shift counts) merged into one tidy card under the ESNcard - no more floating text with big gaps on desktop",
    ],
  },
  {
    version: "0.86-beta",
    date: "2026-08-19",
    notes: [
      "Account page redesigned: grouped menu with icons (My account / ESN team / More), less clutter - and the ESNcard now tilts in 3D with a glossy sheen when you move your cursor over it",
      "Dark-mode fixes: the card replica keeps its readable dark text (it's a light physical card), and calendar day numbers & headers got proper contrast",
      "Office address, office hours and contact e-mail are no longer hard-coded: the board edits them in Admin → Settings → Organisation info, and the footer, Office page and FAQ update everywhere instantly (footer's double office link fixed too)",
    ],
  },
  {
    version: "0.85-beta",
    date: "2026-08-19",
    notes: [
      "New error log under Admin → Settings (treasurer/president & superadmin): every error a user sees, every crash and every server-side hiccup (payments, calendar, push) - with timestamp, place and app version",
      "The Sync calendar button moved from the Events tab to Settings - sync is fully automatic anyway; the button is only for forcing a re-sync",
    ],
  },
  {
    version: "0.84-beta",
    date: "2026-08-19",
    notes: [
      "Event form polish: 'Free for ESNcard members' is now one checkbox in the essentials, defaults changed (cancellation 24h, refund fee €0.50), Draft/Published became a clear status field, and verbose help text turned into little info icons (hover or tap them)",
      "Office-hours sessions are created only via '+ Office hours' - the checkbox left the event form",
      "New Admin → Settings tab: ESNcard prices (treasurer/president), event tags (superadmin only now), push setup and the beta reset all live there - the day-to-day tabs stay clean",
      "ESNcards tab is now the office work queue: lands on 'To assign' when paid applications are waiting (highlighted green), and loads only this academic year by default (all years one click away)",
    ],
  },
  {
    version: "0.83-beta",
    date: "2026-08-19",
    notes: [
      "Creating an event is now much lighter: just the essentials (title, when, where, price, photo, description) - ticket types, member pricing, refunds and other extras moved into a collapsed 'Advanced settings' panel that opens automatically when an event uses them",
      "Location picker fixed & smarter: no more duplicate results, short readable names, results biased to the Ghent area, Enter searches, and a single clear match pins itself immediately with a map preview",
      "Publish moved next to the Create button, and the form got icons throughout",
    ],
  },
  {
    version: "0.82-beta",
    date: "2026-08-18",
    notes: [
      "Tidier admin: 5 grouped sections with icons instead of 7 flat tabs - Events, ESNcards, Insights (analytics + member map together), Finance, Shop, Team",
      "The Events tab now only shows event actions (new event, office hours, calendar sync) - Scan, Shifts and Meetings live in the main menu where they always were",
      "Subtle divider in the top menu between the student pages and the team pages",
    ],
  },
  {
    version: "0.81-beta",
    date: "2026-08-18",
    notes: [
      "Push notifications 🔔 - turn them on under Account → Notifications and choose exactly what you want: ticket & refund updates, a reminder 3 hours before your events, new events, waitlist spots, ESNcard updates, and shift reminders for the team",
      "You'll be offered notifications at smart moments (after buying a ticket, on your tickets page, on the shifts page) - never forced",
      "iPhone note: install the app first (Share → Add to Home Screen), then enable notifications from inside the app",
    ],
  },
  {
    version: "0.8-beta",
    date: "2026-08-18",
    notes: [
      "BETA TEST WEEK - everything below is live for testing. Payments run in Stripe TEST mode: no real money moves; pay with test card 4242 4242 4242 4242 (any future date, any CVC).",
      "Events & tickets: browse, calendar, free registration and paid tickets via Stripe (cards + Bancontact), one ticket per person, ticket policy per event, QR tickets that work offline, ticket transfer, waitlist, ratings",
      "Refunds & cancellations: per-event cancellation deadline and optional refund fee, students request refunds from My tickets, treasurer approves (automatic Stripe refund, spot released), whole-event cancel refunds everyone in full",
      "ESNcard fully digital: apply → pay online (default) or cash during office hours → board assigns & verifies the card number (typo/duplicate checks) → pick up at the office; decline auto-refunds; prices editable by treasurer/president",
      "Office hours: own page with map & upcoming sessions, quick weekly-series creation, automatic 2-board-member shiftlist, separate office-shift count per person",
      "Team tools: shiftlists (grid like the old spreadsheet), board meetings with minutes & approval flow, to-dos, reimbursements with IBAN-safe finance approval, roles & organigram, event tags & colours, member stats with world map",
      "Shop: merch with variants, online payment or reserve & pay at pickup, order QR codes - pickup only during office hours",
      "Under the hood: images in Cloud Storage (auto-cropped 16:9), Google Calendar syncs server-side without sign-in popups, map-pinned locations with per-location statistics, installable app (PWA) with offline tickets",
    ],
  },
];

// ------------------------------------------------------------
// Theme (light / dark / follow device)
// ------------------------------------------------------------
function themePref() { // 'light' | 'dark' | null = follow device
  try { return localStorage.getItem("theme"); } catch { return null; }
}
function setThemePref(v) {
  try { v ? localStorage.setItem("theme", v) : localStorage.removeItem("theme"); } catch { /* storage blocked */ }
}
function applyTheme() {
  const pref = themePref();
  const dark = pref ? pref === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#12132a" : "#2E3192");
}
applyTheme();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  if (!themePref()) applyTheme();
});

const ACCENTS = ["#00AEEF", "#EC008C", "#7AC143", "#F47B20"];

const NATIONALITIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia",
  "Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium",
  "Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei",
  "Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Cape Verde",
  "Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo (DRC)",
  "Congo (Republic)","Costa Rica","Croatia","Cuba","Cyprus","Czechia","Denmark","Djibouti",
  "Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea",
  "Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia",
  "Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau",
  "Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq",
  "Ireland","Israel","Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya",
  "Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia",
  "Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia",
  "Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico",
  "Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar",
  "Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria",
  "North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama",
  "Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania",
  "Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines",
  "Samoa","San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia",
  "Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia",
  "South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname",
  "Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste",
  "Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda",
  "Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan",
  "Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe","Other",
];

function mapsSearchUrl(location) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

// ------------------------------------------------------------
// Locations with coordinates (v1.22). Admin forms can pin the
// exact spot via free OpenStreetMap geocoding (no API key);
// events then carry {lat, lng} next to the location text, which
// powers precise maps and the per-location statistics.
// ------------------------------------------------------------
async function geocodeSearch(q) {
  // Bias towards the Ghent area (viewbox, not bounded - trips abroad still work),
  // then de-duplicate: OSM often returns the same place several times
  // (building + amenity + address node within metres of each other).
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=10&accept-language=en&viewbox=3.55,51.15,3.85,50.95&q=${encodeURIComponent(q)}`,
    { headers: { "Accept-Language": "en" } }
  );
  if (!res.ok) throw new Error("Location search is unavailable right now - the text location still works.");
  const raw = await res.json(); // [{ display_name, lat, lon }]
  const seen = new Set();
  const out = [];
  for (const h of raw) {
    const parts = String(h.display_name || "").split(",").map((s) => s.trim());
    // Short, readable label: name + street-ish part + city
    h.shortName = parts.slice(0, 2).join(", ") + (parts.length > 4 ? `, ${parts[parts.length - 5] || parts[2]}` : "");
    // Duplicate if same rounded spot (~100 m) or same short label
    const key = `${(+h.lat).toFixed(3)},${(+h.lon).toFixed(3)}`;
    const nameKey = h.shortName.toLowerCase();
    if (seen.has(key) || seen.has(nameKey)) continue;
    seen.add(key); seen.add(nameKey);
    out.push(h);
    if (out.length >= 4) break;
  }
  return out;
}
const mapsUrlFor = (ev) => (ev.lat != null && ev.lng != null)
  ? `https://www.google.com/maps/search/?api=1&query=${ev.lat},${ev.lng}`
  : mapsSearchUrl(ev.location || "");
const mapEmbedSrc = (ev) => (ev.lat != null && ev.lng != null)
  ? `https://maps.google.com/maps?q=${ev.lat},${ev.lng}&z=16&output=embed`
  : `https://maps.google.com/maps?q=${encodeURIComponent(ev.location || "")}&z=15&output=embed`;

function locationPickerHtml(prefix, lat, lng) {
  const pinned = lat != null && lng != null;
  return `
    <div class="form-actions" style="margin:6px 0 0;align-items:center">
      <button type="button" class="btn btn-sm btn-ghost btn-ink" id="${prefix}-geo">${mi("location_on", "sm")} Pin on map</button>
      <span class="form-hint" id="${prefix}-geo-status">${pinned ? `Pinned ✓` : "Optional - type the place, hit Enter or this button, pick the match."}</span>
      <button type="button" class="btn btn-sm btn-ghost btn-danger ${pinned ? "" : "hidden"}" id="${prefix}-geo-clear">✕ remove pin</button>
    </div>
    <div id="${prefix}-geo-results"></div>`;
}
// Wires the picker; returns a state object whose .lat/.lng to save.
function wireLocationPicker(prefix, inputId, initial) {
  const state = { lat: initial?.lat ?? null, lng: initial?.lng ?? null };
  const statusEl = document.getElementById(`${prefix}-geo-status`);
  const resultsEl = document.getElementById(`${prefix}-geo-results`);
  const clearBtn = document.getElementById(`${prefix}-geo-clear`);
  const input = document.getElementById(inputId);

  const showPin = (name) => {
    resultsEl.innerHTML = `<iframe class="map-embed" style="height:190px;margin-top:8px;width:100%;border:1px solid var(--border);border-radius:10px" loading="lazy" src="https://maps.google.com/maps?q=${state.lat},${state.lng}&z=16&output=embed" title="Location preview"></iframe>`;
    statusEl.innerHTML = `Pinned ✓${name ? ` <span class="form-hint">${esc(name)}</span>` : ""}`;
    clearBtn.classList.remove("hidden");
  };
  const pick = (h) => {
    state.lat = parseFloat(h.lat);
    state.lng = parseFloat(h.lon);
    // If the field was vague, adopt the found name so text & pin agree.
    if (input.value.trim().length < 8) input.value = h.shortName || input.value;
    showPin(h.shortName);
  };

  const search = async () => {
    const q = input.value.trim();
    if (!q) { toast("Type a location first, then pin it.", "error"); return; }
    statusEl.textContent = "Searching…";
    resultsEl.innerHTML = "";
    try {
      const hits = await geocodeSearch(q);
      if (!hits.length) { statusEl.textContent = "No match - try “name, street number, city”."; return; }
      if (hits.length === 1) { pick(hits[0]); return; } // one clear match → just pin it
      statusEl.textContent = "Pick the right one:";
      resultsEl.innerHTML = `<div class="geo-results">${hits.map((h, i) => `
        <button type="button" class="geo-hit" data-i="${i}" title="${esc(h.display_name)}">
          ${mi("location_on", "sm")}<span><strong>${esc(h.shortName)}</strong><br><small>${esc(String(h.display_name).split(",").slice(-3).join(",").trim())}</small></span>
        </button>`).join("")}</div>`;
      resultsEl.querySelectorAll(".geo-hit").forEach((b) => {
        b.onclick = () => pick(hits[+b.dataset.i]);
      });
    } catch (err) { statusEl.textContent = err.message; }
  };

  document.getElementById(`${prefix}-geo`).onclick = search;
  // Enter in the location field searches instead of submitting the form.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); search(); }
  });
  clearBtn.onclick = () => {
    state.lat = null; state.lng = null;
    resultsEl.innerHTML = "";
    statusEl.textContent = "Pin removed - the text location is used as-is.";
    clearBtn.classList.add("hidden");
  };
  // Editing an already-pinned event: show the pin right away.
  if (state.lat != null && state.lng != null) showPin();
  return state;
}

// Home-city autocomplete (OpenStreetMap/Nominatim): suggests real cities
// while typing; picking one also fills the home-country select if empty.
function wireCityPicker(inputId, countryId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const box = document.createElement("div");
  box.className = "city-suggest";
  input.insertAdjacentElement("afterend", box);
  let timer = null, seq = 0;
  const close = () => { box.innerHTML = ""; };
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { close(); return; }
    timer = setTimeout(async () => {
      const mySeq = ++seq;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=en&featuretype=settlement&q=${encodeURIComponent(q)}`,
          { headers: { "Accept-Language": "en" } }
        );
        if (!res.ok) return;
        const hits = await res.json();
        if (mySeq !== seq || document.activeElement !== input) return;
        const seen = new Set();
        const rows = [];
        // Endonym → English exonym: Nominatim sometimes returns both spellings
        // (Gent AND Ghent) as separate hits - normalise so they merge and the
        // stored value is the English name.
        const CITY_EN = {
          "gent": "Ghent", "brussel": "Brussels", "bruxelles": "Brussels", "antwerpen": "Antwerp",
          "brugge": "Bruges", "leuven": "Leuven", "luik": "Liège", "den haag": "The Hague",
          "köln": "Cologne", "münchen": "Munich", "wien": "Vienna", "praha": "Prague",
          "warszawa": "Warsaw", "kraków": "Krakow", "lisboa": "Lisbon", "sevilla": "Seville",
          "roma": "Rome", "milano": "Milan", "torino": "Turin", "napoli": "Naples",
          "firenze": "Florence", "venezia": "Venice", "genève": "Geneva", "zürich": "Zurich",
          "københavn": "Copenhagen", "göteborg": "Gothenburg", "athina": "Athens", "bucurești": "Bucharest",
        };
        for (const h of hits) {
          const parts = String(h.display_name || "").split(",").map((s) => s.trim());
          let city = parts[0];
          const country = parts[parts.length - 1];
          city = CITY_EN[city.toLowerCase()] || city;
          const key = `${city}|${country}`.toLowerCase();
          if (!city || seen.has(key)) continue;
          seen.add(key);
          rows.push({ city, country });
          if (rows.length >= 5) break;
        }
        if (!rows.length) { close(); return; }
        box.innerHTML = `<div class="geo-results">${rows.map((r, i) => `
          <button type="button" class="geo-hit" data-i="${i}">${mi("location_city", "sm")}<span><strong>${esc(r.city)}</strong><br><small>${esc(r.country)}</small></span></button>`).join("")}</div>`;
        box.querySelectorAll(".geo-hit").forEach((b) => {
          b.onclick = () => {
            const r = rows[+b.dataset.i];
            input.value = r.city;
            const sel = countryId ? document.getElementById(countryId) : null;
            if (sel && !sel.value) {
              const opt = [...sel.options].find((o) => o.value.toLowerCase() === r.country.toLowerCase());
              if (opt) sel.value = opt.value;
            }
            close();
          };
        });
      } catch { /* suggestions are best-effort; typing plain text always works */ }
    }, 400);
  });
  input.addEventListener("blur", () => setTimeout(close, 250)); // let a click land first
}

// Long people-dropdowns get a type-to-filter box (the team grows every year).
function wireSelectFilter(sel, placeholder = "Type a name to filter…") {
  if (!sel || sel.options.length < 8 || sel.dataset.filterWired) return;
  sel.dataset.filterWired = "1";
  const inp = document.createElement("input");
  inp.className = "inline-input select-filter";
  inp.placeholder = placeholder;
  inp.setAttribute("aria-label", "Filter the list below");
  sel.insertAdjacentElement("beforebegin", inp);
  const all = [...sel.options].map((o) => ({ value: o.value, text: o.textContent, sel: o.selected }));
  inp.addEventListener("input", () => {
    const q = inp.value.trim().toLowerCase();
    const cur = sel.value;
    const keep = all.filter((o, i) => i === 0 || !q || o.text.toLowerCase().includes(q));
    sel.innerHTML = keep.map((o) => `<option value="${esc(o.value)}">${esc(o.text)}</option>`).join("");
    // keep the current pick when it survives the filter; else auto-pick a
    // single match so filter+click flows fast
    if (keep.some((o) => o.value === cur)) sel.value = cur;
    else if (q && keep.length === 2) sel.value = keep[1].value;
    sel.dispatchEvent(new Event("change"));
  });
}

function randomCode(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

// Lightweight, safe rich text: **bold**, *italic*, [text](https://url),
// "- " bullets, "## " subheadings. Input is HTML-escaped first, so no
// raw HTML can ever be injected.
function renderRich(text) {
  const inline = (s) => s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\[([^\]]+)\]\((#\/[^)\s]*)\)/g, '<a href="$2">$1</a>')
    .replace(/\[([^\]]+)\]\((\/[a-z0-9\-/]*)\)/g, '<a href="$2">$1</a>');
  const lines = esc(text || "").split("\n");
  let html = "", inList = false, para = [];
  const flushPara = () => { if (para.length) { html += `<p>${para.join("<br>")}</p>`; para = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      flushPara();
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(line.slice(2))}</li>`;
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      if (line.startsWith("## ")) { flushPara(); html += `<h3>${inline(line.slice(3))}</h3>`; }
      else if (line === "") flushPara();
      else para.push(inline(line));
    }
  }
  if (inList) html += "</ul>";
  flushPara();
  return html;
}

// Same text with the formatting markers removed (for cards, calendar, .ics)
function plainText(text) {
  return String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/^## /gm, "")
    .replace(/^- /gm, "• ");
}
const $app = document.getElementById("app");

let currentUser = null;
let myRole = null;         // null | volunteer | board | superadmin | advisory | alumnicoord
let myBoardFunction = "";  // e.g. 'President' (from the admins doc)
let isAdmin = false;       // true for board + superadmin
let myProfile = null;      // users/{uid} doc of the signed-in user
let calCursor = new Date(); // month shown on the calendar page

// Working staff (can scan tickets): superadmin, board, volunteer.
// Advisory board & the alumni coordinator are NOT scanning staff.
function isStaff() { return !!myRole && !["advisory", "alumnicoord"].includes(myRole); }
// Access to the board-meetings space (AB + alumni coordinator attend the AV).
function canMeetings() { return ["superadmin", "board", "finance", "advisory", "alumnicoord"].includes(myRole); }
// Finance safeguard: ONLY this role (and the superadmin) can read IBANs
// and manage reimbursements - enforced in the security rules too.
function isFinance() { return ["superadmin", "finance"].includes(myRole); }
// Human label for the signed-in person's place in the organisation.
function roleLabel() {
  if (myRole === "superadmin") return "Admin (superadmin)";
  if (myRole === "finance") return myBoardFunction ? `Board (finance) - ${myBoardFunction}` : "Board - finance";
  if (myRole === "board") return myBoardFunction ? `Board - ${myBoardFunction}` : "Board member";
  if (myRole === "advisory") return myBoardFunction ? `Advisory Board - ${myBoardFunction}` : "Advisory Board";
  if (myRole === "alumnicoord") return "Alumni coordinator";
  if (myRole === "volunteer") return "Volunteer";
  if (isAlumni()) return "Alumni";
  return "Student";
}

// Required profile fields - students complete these before registering for
// events (home university, Instagram and LinkedIn stay optional).
function profileMissing(p = myProfile || {}) {
  const hasName = (p.firstName && p.lastName) || p.displayName; // legacy accounts
  const req = [
    [hasName, "name"],
    [p.birthday, "birthday"],
    [p.phone, "phone"],
    [p.nationality, "nationality"],
    [p.homeCountry, "home country"],
    [p.homeCity, "home city"],
  ];
  return req.filter(([v]) => !v).map(([, label]) => label);
}

// An expired card is no card - member prices stop the day it runs out.
function cardExpiredFor(p) {
  return p?.esncardVerified === true && p.esncardExpiresAt && toDate(p.esncardExpiresAt) < new Date();
}
// Does this profile count as an ESNcard member? Normally only a card that
// is ACTIVE on esncard.org (verified + not expired). Superadmin fallback
// (v0.137, settings/esncard.acceptAvailable): a linked card that is still
// "available" (bought, not yet registered) counts too - for when students
// can't register on esncard.org or the API is down. The Cloud Functions
// apply the same rule (profileHasCard there), so prices always match.
function profileHasCard(p) {
  if (!p) return false;
  if (p.esncardVerified === true) return !cardExpiredFor(p);
  return cardPricing.acceptAvailable === true && !!p.esncardCode && p.esncardStatus === "available";
}
function hasVerifiedCard() {
  return profileHasCard(myProfile);
}
// Alumni (former board, Art. 7 §3 of the statutes) get member prices for
// life - except on trips marked "no alumni discount". Membership eligibility
// for a specific event therefore depends on the event.
function isAlumni() {
  return myProfile?.alumni === true;
}
// ---- Team-audience events (v0.103) ----
// events.audience = subset of ["board","volunteer","alumni","advisory"]
// (absent/empty = everyone). Such events are hidden from outsiders, never
// sync to Google Calendar and never trigger the new-event push. The
// checkboxes are ALSO enforced server-side in registerFree/checkout.
const AUDIENCE_OPTIONS = [
  ["board", "Board", "incl. finance & superadmin"],
  ["volunteer", "Volunteers", ""],
  ["alumni", "Alumni", "incl. alumni coordinator"],
  ["advisory", "Advisory board", ""],
];
function audienceLabel(aud) {
  const names = { board: "board", volunteer: "volunteers", alumni: "alumni", advisory: "advisory board" };
  return (aud || []).map((a) => names[a]).filter(Boolean).join(" · ");
}
// ---- Member perks (v0.103) ----
// The ESN Passport, Cantus codex and bucketlist/survival guide are member
// perks: an active (verified, unexpired) ESNcard unlocks them - as does
// lifetime alumni membership or any team role (staff manage the content).
function memberPerkGate(icon, what) {
  if (hasVerifiedCard() || isAlumni() || myRole) return false;
  $app.innerHTML = `<div class="empty-state"><div class="big">${mi(icon)}</div>
    <p><strong>${what}</strong> is an ESNcard member perk.</p>
    <p class="form-hint" style="max-width:440px;margin:6px auto 16px">${currentUser ? "" : "Sign in and "}get your ESNcard to unlock it - plus member prices on our events and thousands of student discounts across Europe.</p>
    <a class="btn btn-magenta" href="/esncard">Get your ESNcard</a></div>`;
  return true;
}

function audienceEligible(ev) {
  const aud = Array.isArray(ev?.audience) && ev.audience.length ? ev.audience : null;
  if (!aud) return true;
  if (!currentUser) return false;
  if (aud.includes("board") && ["board", "finance", "superadmin"].includes(myRole)) return true;
  if (aud.includes("volunteer") && myRole === "volunteer") return true;
  if (aud.includes("advisory") && myRole === "advisory") return true;
  if (aud.includes("alumni") && (myProfile?.alumni === true || myRole === "alumnicoord")) return true;
  return false;
}

// Board-side audit trail (userHistory/{uid} - board-only, see rules):
// every ESNcard link/unlink/replace and every board-role change is
// appended here, so the admin user page can always answer "which cards
// did this person have?" and "what did they do in the board?".
async function logUserHistory(uid, kind, entry) {
  try {
    await setDoc(doc(db, "userHistory", uid), {
      [kind]: arrayUnion({ ...entry, at: Timestamp.now(), by: currentUser?.uid || null }),
    }, { merge: true });
  } catch { /* the audit trail must never block the action itself */ }
}

// Creation log (v0.135, auditLog collection - board-readable, see rules):
// who created / deleted / cancelled events, board meetings, news and merch.
// Fire-and-forget: logging must never block or break the action itself.
function logAudit(action, kind, title, refId = "") {
  try {
    addDoc(collection(db, "auditLog"), {
      at: serverTimestamp(),
      uid: currentUser?.uid || "",
      name: myProfile?.displayName || currentUser?.displayName || "",
      action, // created | deleted | cancelled
      kind,   // event | office hours | board meeting | news post | merch item
      title: String(title || "").slice(0, 200),
      refId: String(refId || ""),
    }).catch(() => {});
  } catch { /* never block the action */ }
}
function memberEligible(ev = null) {
  if (hasVerifiedCard()) return true;
  if (isAlumni()) return !ev || ev.noAlumniDiscount !== true;
  return false;
}
// ESNcard price by statute: free for board/AB (Art. 5 §5, 9 §5),
// €7.50 for werkgroepleden/volunteers (Art. 6 §5) and alumni (Art. 7 §6),
// €15 for students (Art. 8).
// ESNcard pricing - statutory defaults, overridable by the finance role
// (president/treasurer) or superadmin via settings/esncard. Loaded once
// at boot; the Cloud Function reads the same doc, so client and server
// always quote the same price. Board/AB/team cards stay free (statutes).
// proofRequired: welcome-week switch (v0.105) - when false, the apply form
// hides the proof-of-exchange upload entirely and applications go through
// without one. Toggled in Admin → Settings → ESNcard.
let cardPricing = { student: 1500, volunteer: 750, validityMonths: 12, proofRequired: true, acceptAvailable: false, cashEnabled: false };
// Cash at the office is OFF by default since v1.4.0 - students pay online;
// the superadmin can switch it on under Settings → ESNcard (busy weeks, card
// terminal down, …). The board can always register cash it did receive.
function cashAllowed() { return cardPricing.cashEnabled === true; }
// Org-wide event defaults (settings/events) - standard cancellation deadline
// & refund fee. Per-event values always win; these fill the gaps.
let eventDefaults = { defaultCancelHours: 24, defaultRefundFee: 100, waitlistHours: 12 };
// DSA "Type activiteit" dropdown values (dsa.ugent.be panel, confirmed 25/08).
// Tags can be LINKED to one of these in Settings → Event tags; the first tag
// on an event with a link decides the type pushed to DSA.
const DSA_TYPES = ["BBQ", "Horeca", "Cantus", "Doop", "Vergadering", "Lezing", "Cultuur", "Sport", "Feest", "Onderwijs", "Permanentie", "Andere"];
// The 6 official ESN causes (blog.erasmusgeneration.org/causes-esn). Since
// v0.118 they are LINKED per tag (eventTags.esnCause), no longer tags
// themselves - old cause TAGS (cause:true) are legacy, hidden from pickers.
const ESN_CAUSES = ["Culture", "Education & Youth", "Environmental Sustainability", "Health & Well-being", "Skills & Employability", "Social Inclusion"];
// DSA terrain tokens + display labels - shared by the event form and the
// venue profiles (v0.122: venues carry a terrain so picking one fills it).
// Event icons (v0.125): every event gets a Material icon - auto-picked
// from its first tag, overridable per event in the form. Used on the
// passport stamps (and anywhere an event needs a pictogram).
const TAG_ICON_DEFAULTS = [
  [/party|feest|night/i, "celebration"], [/sport/i, "sports_soccer"],
  [/food|drink|dinner|resto|bbq/i, "restaurant"], [/culture|sightsee|museum/i, "museum"],
  [/trip|travel/i, "travel_explore"], [/cantus|music|karaoke/i, "music_note"],
  [/workshop|lecture|skill/i, "school"], [/social|games|inclusion/i, "diversity_3"],
  [/sustain|environment/i, "recycling"], [/wellbeing|well-being|health/i, "self_improvement"],
  [/charity|volunteer/i, "volunteer_activism"], [/info|education|youth/i, "campaign"],
  [/partner/i, "handshake"], [/office/i, "meeting_room"],
];
// Icon picker choices (v0.126) - grouped for the visual grid. All names
// are Material Symbols ligatures (same font the whole app uses).
const EVENT_ICON_CHOICES = [
  // party & nightlife
  "celebration", "nightlife", "local_bar", "wine_bar", "sports_bar", "liquor", "music_note", "headphones", "mic",
  // food & drinks
  "restaurant", "outdoor_grill", "local_pizza", "bakery_dining", "ramen_dining", "local_cafe", "icecream", "cake",
  // sports & outdoor
  "sports_soccer", "sports_basketball", "sports_volleyball", "sports_tennis", "fitness_center", "pool", "directions_bike", "directions_run", "hiking", "kayaking", "surfing", "downhill_skiing", "ice_skating",
  // culture
  "museum", "theater_comedy", "palette", "photo_camera", "menu_book", "castle",
  // trips & travel
  "travel_explore", "flight", "train", "directions_boat", "sailing", "luggage", "map", "forest", "cottage", "beach_access",
  // social & games
  "diversity_3", "groups", "handshake", "favorite", "forum", "quiz", "casino", "sports_esports", "extension",
  // learning & causes
  "school", "science", "campaign", "lightbulb", "self_improvement", "spa", "eco", "recycling", "volunteer_activism",
  // other
  "meeting_room", "star", "public", "event",
];
const iconForName = (n) => (TAG_ICON_DEFAULTS.find(([re]) => re.test(n || "")) || [null, "event"])[1];
const eventIcon = (ev) => {
  if (ev.icon) return ev.icon;
  // A tag's own icon wins (set per tag in Admin -> Settings -> Event tags,
  // v0.126) - FIRST tag with one decides, like the colour.
  if (Array.isArray(ev.tags)) {
    const t = ev.tags.find((x) => x && x.icon);
    if (t) return t.icon;
  }
  // Then name heuristics: first tag name, legacy tag field, title.
  const names = [...(eventTagNames(ev) || []), ev.tagName, ev.title].filter(Boolean);
  for (const n of names) {
    const hit = TAG_ICON_DEFAULTS.find(([re]) => re.test(n));
    if (hit) return hit[1];
  }
  return "event";
};
// Shared visual icon grid (event form inline + tag-manager dialog).
const iconGridHtml = (current, cls = "icon-opt") =>
  EVENT_ICON_CHOICES.map((ic) => `<button type="button" class="${cls} ${current === ic ? "sel" : ""}" data-ic="${ic}" title="${ic.replace(/_/g, " ")}">${mi(ic)}</button>`).join("");
// Small overlay dialog with the icon grid - resolves to the picked icon
// name, "" for "Auto", or undefined when dismissed.
function pickIconDialog(current) {
  return new Promise((resolve) => {
    document.getElementById("icon-dlg")?.remove();
    const ov = document.createElement("div");
    ov.id = "icon-dlg";
    ov.className = "dialog-overlay";
    ov.innerHTML = `
      <div class="dialog-card" role="dialog" aria-modal="true" style="max-width:420px">
        <div class="dialog-msg" style="margin-bottom:10px"><strong>Pick an icon</strong></div>
        <div class="icon-pick">
          <button type="button" class="icon-opt icon-auto ${!current ? "sel" : ""}" data-ic="">Auto</button>
          ${iconGridHtml(current)}
        </div>
        <div class="dialog-actions"><button class="btn btn-ghost btn-danger" id="icon-dlg-cancel">Cancel</button></div>
      </div>`;
    document.body.appendChild(ov);
    document.body.classList.add("dialog-open");
    const opener = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); done(undefined); } };
    document.addEventListener("keydown", onKey, true);
    const done = (val) => {
      document.removeEventListener("keydown", onKey, true);
      document.body.classList.remove("dialog-open");
      ov.remove();
      opener?.focus?.();
      resolve(val);
    };
    ov.addEventListener("click", (e) => { if (e.target === ov) done(undefined); });
    ov.querySelector("#icon-dlg-cancel").onclick = () => done(undefined);
    ov.querySelectorAll(".icon-opt").forEach((b) => { b.onclick = () => done(b.dataset.ic); });
    ov.querySelector(".icon-opt")?.focus();
  });
}
const DSA_TERRAINS_UI = [
  ["other", "Andere - private venues (bars, clubs, …)"],
  ["public", "Openbaar domein - streets, parks, squares (Stad Gent)"],
  ["ugent", "UGent-domein - UGent buildings (Therminal, TimeEdit rooms)"],
  ["augent", "AUGent-domein - AUGent buildings outside UGent"],
  ["home", "Home-domein - in a student Home"],
  ["abroad", "Buitenland - trip abroad (UGent insurance!)"],
  ["online", "Online - no physical location"],
];
// One-click starter set: [name, colour, DSA type, ESN cause].
const STARTER_TAGS = [
  ["Party", "#EC008C", "Feest", "Social Inclusion"],
  ["Culture & Sightseeing", "#2E3192", "Cultuur", "Culture"],
  ["Trip", "#9B59B6", "Andere", "Culture"],
  ["Sports", "#E74C3C", "Sport", "Health & Well-being"],
  ["Food & Drinks", "#F47B20", "Horeca", "Culture"],
  ["Cantus", "#A0522D", "Cantus", "Culture"],
  ["Workshop & Lecture", "#00AEEF", "Lezing", "Skills & Employability"],
  ["Social & Games", "#16A085", "Andere", "Social Inclusion"],
  ["Sustainability", "#7AC143", "Andere", "Environmental Sustainability"],
  ["Wellbeing", "#0097A7", "Andere", "Health & Well-being"],
  ["Charity & Volunteering", "#607D8B", "Andere", "Social Inclusion"],
  ["Info session", "#3F51B5", "Onderwijs", "Education & Youth"],
  ["Partner Event", "#DAA520", "Andere", "Social Inclusion"],
];
let EVENT_LOCATIONS = []; // board-managed frequent event locations (settings/lists)
// Org lists that change over the years (settings/lists) - board functions,
// shift task names, "how did you find us" options. Editable in Settings;
// the hardcoded lists above stay as fallbacks.
(async () => {
  try {
    const s = await getDoc(doc(db, "settings", "lists"));
    if (s.exists()) {
      const d = s.data();
      const ok = (v) => Array.isArray(v) && v.length && v.every((x) => typeof x === "string");
      if (ok(d.boardFunctions)) BOARD_FUNCTIONS = d.boardFunctions;
      if (ok(d.shiftTasks)) SHIFT_TASKS = d.shiftTasks;
      if (ok(d.discoveryOptions)) DISCOVERY_OPTIONS = d.discoveryOptions;
      if (ok(d.hostInstitutions)) HOST_INSTITUTIONS = d.hostInstitutions;
      if (ok(d.studyFields)) STUDY_FIELDS = d.studyFields;
      if (ok(d.locations)) EVENT_LOCATIONS = d.locations;
    }
  } catch { /* fallbacks stand */ }
})();

// Where to send the user back to after completing their profile (set by
// the event-page registration gate).
let profileReturnTo = null;
// Live-ticket snapshot listener (v0.107) - route() unsubscribes it.
let ticketUnsub = null;
// Home-page partner rotation (v0.118) - cached for the session.
let homePartners = null;
// Passport demo mode (v0.119) - superadmin preview flag, session-only.
let passportDemo = false;
// Admin → Settings: which settings section is open (v0.120), session-only.
let settingsGroupTab = 0;
// Deals page board prefs (v0.121): view/search/filter/group, session-only.
let dealsPrefs = { view: "cards", q: "", status: "all", type: "all", group: "status" };
// Calendar tag filter (v0.107) - survives month navigation.
let calTagFilter = null;

// ------------------------------------------------------------
// #/links - the app's own link-in-bio page (replaces Linktree).
// Top: the next 3 events, always current. Below: board-editable links
// (settings/linktree). Format: '## Section' headers + 'Label | URL' lines.
// Seeded with the links from linktr.ee/esngent (Aug 2026).
// ------------------------------------------------------------
const DEFAULT_LINKTREE = `## ESN Gent
ESN Gent website 💻 | https://www.esngent.org/
Where is our office? 💼 | https://www.instagram.com/reel/DOsho-hiBud/
Ghent - Erasmus Destination of the Year | https://m.youtube.com/watch?v=Ff3YF7xC8FQ

## Stay in the loop
ESN Gent announcements (Telegram) | https://t.me/esngentupdates
Telegram group 2026–2027 | https://t.me/+lTbwzO60mKoyY2Jk
Accommodation chat | https://t.me/+_18nRsYsb8dmNGY0
Facebook group | https://www.facebook.com/groups/814938039938928

## Useful
Buy your ESNcard | https://esngent.org/esncard
Register your ESNcard | https://esncard.org
Accommodation guide 🏠 | https://www.esngent.org/guides/accommodation-guide
Buddy System | https://buddysystem.eu/en/

## Well-being
Study locations (City of Ghent) | https://stad.gent/en/international-students/studying/study-locations
Health insurance - all students | https://stad.gent/en/international-students/living/health-insurance
UGent - Feel Good | https://www.ugent.be/student/en/study-support/feelinggood
HOGENT - guidance & well-being | https://www.hogent.be/en/student/guidance-and-well-being/
Artevelde - student support | https://www.artevelde-uas.be/contact/office-student-support
LUCA - psychological assistance | https://www.luca-arts.be/en/psychological-assistance
Odisee/KU Leuven - counselling | https://www.odisee.be/en/psychological-counseling`;

// ------------------------------------------------------------
// Cash registers - digital version of the treasury's register sheets.
// Every register is counted BEFORE and AFTER an event (office hours too);
// any board member counts, finance gets the cross-event overview.
// ------------------------------------------------------------
const CASH_DENOMS = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]; // cents: €0.05 → €100
const cashCountId = (eventId, register, phase) =>
  `${eventId}_${register.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}_${phase}`;

// Renders + wires the "Cash registers" card into `box` for one event.
async function renderCashCard(box, ev) {
  let counts;
  try {
    counts = await getDocs(query(collection(db, "cashCounts"), where("eventId", "==", ev.id)))
      .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch { box.innerHTML = ""; return; }

  const registers = [...new Set(counts.map((c) => c.register))];
  let editing = null; // { register, phase }

  const draw = () => {
    const get = (r, ph) => counts.find((c) => c.register === r && c.phase === ph);

    if (editing) {
      const existing = get(editing.register, editing.phase);
      const vals = existing?.counts || {};
      box.innerHTML = `
        <div class="form-card" style="margin-bottom:20px">
          <strong>${mi("point_of_sale", "sm")} ${esc(editing.register)} - count ${editing.phase} ${hintIcon("Type how many of each note/coin is in the register - the totals calculate themselves. Saving overwrites this register's previous " + editing.phase + " count.")}</strong>
          <div class="cash-grid" style="margin-top:12px">
            ${CASH_DENOMS.map((d) => `
              <label class="cash-row">
                <span class="cash-val">${fmtMoney(d)}</span>
                <input type="number" min="0" step="1" inputmode="numeric" class="cash-n" data-d="${d}" value="${vals[d] || ""}" placeholder="0" />
                <span class="cash-line" data-line="${d}">${vals[d] ? fmtMoney(d * vals[d]) : "-"}</span>
              </label>`).join("")}
          </div>
          <p class="cash-total">Total: <strong id="cash-total">€0.00</strong></p>
          <div class="form-field" style="margin-top:8px">
            <input id="cash-note" maxlength="200" placeholder="Remark (optional - e.g. €50 removed for change)" value="${esc(existing?.note || "")}" />
          </div>
          <div class="form-actions">
            <button class="btn btn-green btn-sm" id="cash-save">Save ${editing.phase} count</button>
            <button class="btn btn-ghost btn-sm btn-danger" id="cash-cancel">Cancel</button>
          </div>
        </div>`;

      const recalc = () => {
        let total = 0;
        box.querySelectorAll(".cash-n").forEach((inp) => {
          const d = +inp.dataset.d;
          const n = parseInt(inp.value, 10) || 0;
          total += d * n;
          box.querySelector(`[data-line="${d}"]`).textContent = n ? fmtMoney(d * n) : "-";
        });
        document.getElementById("cash-total").textContent = fmtMoney(total);
        return total;
      };
      recalc();
      box.querySelectorAll(".cash-n").forEach((inp) => inp.addEventListener("input", recalc));
      document.getElementById("cash-cancel").onclick = () => { editing = null; draw(); };
      document.getElementById("cash-save").onclick = async (e) => {
        const total = recalc();
        const c = {};
        box.querySelectorAll(".cash-n").forEach((inp) => {
          const n = parseInt(inp.value, 10) || 0;
          if (n > 0) c[inp.dataset.d] = n;
        });
        e.target.disabled = true;
        try {
          const id = cashCountId(ev.id, editing.register, editing.phase);
          const data = {
            eventId: ev.id, eventTitle: ev.title || "", eventStart: ev.start || null,
            register: editing.register, phase: editing.phase,
            counts: c, total,
            note: document.getElementById("cash-note").value.trim(),
            countedBy: currentUser.uid, countedByName: currentUser.displayName || "",
            updatedAt: serverTimestamp(),
          };
          await setDoc(doc(db, "cashCounts", id), { ...data, createdAt: serverTimestamp() }, { merge: true });
          const i = counts.findIndex((x) => x.register === editing.register && x.phase === editing.phase);
          if (i >= 0) counts[i] = { id, ...data }; else counts.push({ id, ...data });
          toast(`${editing.register}: ${editing.phase} count saved - ${fmtMoney(total)}.`, "success");
          editing = null;
          draw();
        } catch (err) { toast("Save failed: " + err.message, "error"); e.target.disabled = false; }
      };
      return;
    }

    box.innerHTML = `
      <div class="form-card" style="margin-bottom:20px">
        <strong>${mi("point_of_sale", "sm")} Cash registers</strong> ${hintIcon("Count every register before AND after the event - any board member can. The difference is what the register earned. Finance sees the overview of all events under Admin → Finance.")}
        ${registers.length ? `
        <div class="table-wrap" style="margin-top:10px"><table>
          <thead><tr><th>Register</th><th>Before</th><th>After</th><th>Difference</th><th></th></tr></thead>
          <tbody>
            ${registers.map((r) => {
              const b = get(r, "before"), a = get(r, "after");
              const diff = b && a ? a.total - b.total : null;
              return `<tr>
                <td class="card-main"><strong>${esc(r)}</strong>${(b?.note || a?.note) ? `<br><small class="form-hint">${esc(b?.note || "")}${b?.note && a?.note ? " · " : ""}${esc(a?.note || "")}</small>` : ""}</td>
                <td data-l="Before">${b ? `<strong>${fmtMoney(b.total)}</strong><br><small class="form-hint">${esc((b.countedByName || "").split(" ")[0])}</small>` : "-"}</td>
                <td data-l="After">${a ? `<strong>${fmtMoney(a.total)}</strong><br><small class="form-hint">${esc((a.countedByName || "").split(" ")[0])}</small>` : "-"}</td>
                <td data-l="Difference">${diff === null ? "-" : `<strong style="color:${diff >= 0 ? "var(--esn-green)" : "var(--esn-magenta)"}">${diff >= 0 ? "+" : "−"}${fmtMoney(Math.abs(diff))}</strong>`}</td>
                <td class="card-actions" style="white-space:nowrap">
                  <button class="btn btn-sm ${b ? "btn-ghost btn-ink" : "btn-cyan"} cash-count" data-r="${esc(r)}" data-p="before">${b ? "Recount" : "Count"} before</button>
                  <button class="btn btn-sm ${a ? "btn-ghost btn-ink" : "btn-green"} cash-count" data-r="${esc(r)}" data-p="after">${a ? "Recount" : "Count"} after</button>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table></div>` : `<p class="form-hint" style="margin-top:8px">No registers counted yet for this event.</p>`}
        <div class="form-actions" style="margin-top:10px">
          <button class="btn btn-sm btn-dark" id="cash-add">${mi("add", "sm")} ${registers.length ? "Add another register" : "Count a register"}</button>
        </div>
      </div>`;

    box.querySelectorAll(".cash-count").forEach((btn) => {
      btn.onclick = () => { editing = { register: btn.dataset.r, phase: btn.dataset.p }; draw(); };
    });
    document.getElementById("cash-add").onclick = async () => {
      const name = await appPrompt("Name of the register - the same names you write on the physical boxes.", {
        value: registers.length ? "" : "Register 1", placeholder: "e.g. Small blue register", maxlength: 40, okLabel: "Start counting",
      });
      if (name === null || !name.trim()) return;
      editing = { register: name.trim(), phase: "before" };
      draw();
    };
  };
  draw();
}

// ------------------------------------------------------------
// #/codex - the Cantus Codex: every song, searchable by everyone,
// editable by the board. Seeded once from /codex-seed.json (superadmin).
// ------------------------------------------------------------
let codexCache = null;
async function viewCodex() {
  if (memberPerkGate("music_note", "The Cantus codex")) return;
  setLoading();
  if (!codexCache) {
    try {
      codexCache = await getDocs(collection(db, "codexSongs"))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { $app.innerHTML = errorState(e.message); return; }
  }
  const songs = codexCache;
  songs.sort((a, b) => (a.order || 999) - (b.order || 999) || (a.title || "").localeCompare(b.title || ""));

  let cq = "";
  let editingId = null; // song id being edited, "new" for a fresh one

  const render = () => {
    const q = cq.toLowerCase();
    const hits = q
      ? songs.filter((s) => (s.title || "").toLowerCase().includes(q) || (s.lyrics || "").toLowerCase().includes(q))
      : songs;

    const editForm = (s) => `
      <div class="form-card codex-edit" data-id="${s.id || "new"}" style="margin:8px 0 14px">
        <div class="form-grid">
          <div class="form-field full"><label>Title *</label><input class="cx-title" maxlength="120" value="${esc(s.title || "")}" /></div>
          <div class="form-field"><label>Melody / note <span class="form-hint">(optional)</span></label><input class="cx-melody" maxlength="120" placeholder="e.g. melody of Clementine" value="${esc(s.melody || "")}" /></div>
          <div class="form-field"><label>Position ${hintIcon("Order in the codex - songs are shown lowest first. Leave as is to keep the current spot.")}</label><input class="cx-order" type="number" min="1" step="1" value="${s.order || songs.length + 1}" /></div>
          <div class="form-field full"><label>Lyrics *</label><textarea class="cx-lyrics" rows="12" maxlength="8000">${esc(s.lyrics || "")}</textarea></div>
        </div>
        <div class="form-actions">
          <button class="btn btn-green btn-sm cx-save">Save song</button>
          <button class="btn btn-ghost btn-sm cx-cancel btn-danger">Cancel</button>
          ${s.id ? `<button class="btn btn-ghost btn-sm cx-delete btn-danger" style="color:var(--esn-magenta);margin-left:auto">Delete song</button>` : ""}
        </div>
      </div>`;

    $app.innerHTML = `
      <div class="codex-page">
        <h2 class="section-title">${mi("music_note", "sm")} Cantus Codex</h2>
        <p class="form-hint" style="margin:-6px 0 14px">${songs.length} songs - tap one to open the lyrics.${isAdmin ? " Board: use ✎ to edit, or add a new song below." : ""}</p>
        <div class="filter-bar" style="margin-bottom:14px">
          <input id="codex-q" type="search" placeholder="Search a song or a line of text…" value="${esc(cq)}" />
        </div>
        ${isAdmin && editingId === "new" ? editForm({}) : ""}
        ${hits.length ? hits.map((s) => editingId === s.id ? editForm(s) : `
          <details class="codex-song" ${q ? "open" : ""}>
            <summary><span class="codex-num">${s.order || "·"}</span><span class="codex-title">${esc(s.title)}</span>
              ${isAdmin ? `<button type="button" class="codex-editbtn" data-id="${s.id}" title="Edit song" aria-label="Edit song">${mi("edit", "sm")}</button>` : ""}
            </summary>
            ${s.melody ? `<p class="form-hint" style="margin:6px 0 0">♪ ${esc(s.melody)}</p>` : ""}
            <pre class="codex-lyrics">${esc(s.lyrics)}</pre>
          </details>`).join("")
        : songs.length ? `<div class="empty-state"><div class="big">${mi("search_off")}</div><p>No song matches "${esc(cq)}".</p></div>`
        : `<div class="empty-state"><div class="big">${mi("music_note")}</div><p>The codex is empty${isAdmin ? " - add the first song below" : " - the board is working on it"}.</p></div>`}
        ${isAdmin && editingId !== "new" ? `
          <div class="form-actions" style="justify-content:center;margin-top:14px">
            <button class="btn btn-cyan btn-sm" id="codex-add">${mi("add", "sm")} Add a song</button>
            ${myRole === "superadmin" && !songs.length ? `<button class="btn btn-dark btn-sm" id="codex-import">${mi("upload", "sm")} Import the ESN Codex (82 songs)</button>` : ""}
          </div>` : ""}
      </div>
    `;

    const qEl = document.getElementById("codex-q");
    qEl.addEventListener("input", () => {
      cq = qEl.value.trim();
      render();
      const el = document.getElementById("codex-q");
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });

    $app.querySelectorAll(".codex-editbtn").forEach((b) => {
      b.onclick = (e2) => { e2.preventDefault(); e2.stopPropagation(); editingId = b.dataset.id; render(); };
    });
    document.getElementById("codex-add")?.addEventListener("click", () => { editingId = "new"; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });

    const form = $app.querySelector(".codex-edit");
    if (form) {
      form.querySelector(".cx-cancel").onclick = () => { editingId = null; render(); };
      form.querySelector(".cx-save").onclick = async (e2) => {
        const title = form.querySelector(".cx-title").value.trim();
        const lyrics = form.querySelector(".cx-lyrics").value.trim();
        const melody = form.querySelector(".cx-melody").value.trim();
        const order = parseInt(form.querySelector(".cx-order").value, 10);
        if (!title || !lyrics) { toast("A song needs a title and lyrics.", "warn"); return; }
        e2.target.disabled = true;
        try {
          const data = { title, lyrics, melody: melody || null, order: Number.isFinite(order) && order > 0 ? order : songs.length + 1, updatedBy: currentUser.uid, updatedAt: serverTimestamp() };
          if (form.dataset.id === "new") {
            const ref = await addDoc(collection(db, "codexSongs"), { ...data, createdAt: serverTimestamp() });
            songs.push({ id: ref.id, ...data });
            toast(`"${title}" added to the codex.`, "success");
          } else {
            await updateDoc(doc(db, "codexSongs", form.dataset.id), data);
            Object.assign(songs.find((x) => x.id === form.dataset.id), data);
            toast("Song saved.", "success");
          }
          editingId = null;
          songs.sort((a, b) => (a.order || 999) - (b.order || 999) || (a.title || "").localeCompare(b.title || ""));
          render();
        } catch (err) { toast("Save failed: " + err.message, "error"); e2.target.disabled = false; }
      };
      form.querySelector(".cx-delete")?.addEventListener("click", async () => {
        const s = songs.find((x) => x.id === form.dataset.id);
        if (!await appConfirm(`Delete "${s?.title || "this song"}" from the codex? This cannot be undone.`)) return;
        try {
          await deleteDoc(doc(db, "codexSongs", form.dataset.id));
          songs.splice(songs.findIndex((x) => x.id === form.dataset.id), 1);
          editingId = null;
          toast("Song removed.", "success");
          render();
        } catch (err) { toast("Delete failed: " + err.message, "error"); }
      });
    }

    // One-time seed: fetches the parsed ESN Codex (hosted next to the app)
    document.getElementById("codex-import")?.addEventListener("click", async (e2) => {
      if (!await appConfirm("Import the full ESN Codex (82 songs) into the app? You can edit or remove any song afterwards.", { okLabel: "Import 82 songs", danger: false })) return;
      e2.target.disabled = true;
      e2.target.textContent = "Importing…";
      try {
        const seed = await fetch("/codex-seed.json").then((r) => r.json());
        for (const s of seed) {
          const ref = await addDoc(collection(db, "codexSongs"), {
            title: s.title, lyrics: s.lyrics, melody: null, order: s.order,
            createdAt: serverTimestamp(), updatedBy: currentUser.uid, updatedAt: serverTimestamp(),
          });
          songs.push({ id: ref.id, title: s.title, lyrics: s.lyrics, melody: null, order: s.order });
        }
        toast(`${seed.length} songs imported - the codex is live.`, "success");
        render();
      } catch (err) {
        toast("Import failed: " + err.message, "error");
        e2.target.disabled = false;
        e2.target.textContent = "Import the ESN Codex (82 songs)";
      }
    });
  };
  render();
}

async function viewLinks() {
  setLoading();
  let content = DEFAULT_LINKTREE;
  let upcoming = [];
  try {
    const [snap, evs] = await Promise.all([
      getDoc(doc(db, "settings", "linktree")).catch(() => null),
      fetchPublishedEvents(new Date()).catch(() => []),
    ]);
    if (snap?.exists() && typeof snap.data().content === "string" && snap.data().content.trim()) {
      content = snap.data().content;
    }
    upcoming = evs.filter((ev) => !ev.cancelled).slice(0, 3);
  } catch { /* defaults render */ }

  const linkRows = content.split("\n").map((line) => {
    const l = line.trim();
    if (!l) return "";
    if (l.startsWith("## ")) return `<h3 class="links-sect">${esc(l.slice(3))}</h3>`;
    const [label, url] = l.split("|").map((s) => s.trim());
    if (!label || !url || !/^https?:\/\//i.test(url)) return "";
    return `<a class="link-btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}<span class="material-symbols-rounded mi-sm">arrow_outward</span></a>`;
  }).join("");

  $app.innerHTML = `
    <div class="links-page">
      <div class="links-hero">
        <img src="/logo.png" alt="ESN Gent" />
        <h1>ESN Gent</h1>
        <p>Events, trips &amp; friends for international students in Ghent</p>
        ${socialIconsHtml()}
      </div>

      ${upcoming.length ? `
      <h3 class="links-sect">Coming up</h3>
      ${upcoming.map((ev) => {
        const d = toDate(ev.start);
        return `
        <a class="link-btn link-event" href="/event/${ev.id}" style="--accent:${eventAccent(ev)}">
          <span class="link-date"><span class="d">${d.getDate()}</span><span class="m">${d.toLocaleDateString("en-GB", { month: "short" })}</span></span>
          <span class="link-ev-main"><strong>${esc(ev.title)}</strong><small>${fmtTime(ev.start)}${ev.location ? ` · ${esc(ev.location)}` : ""}</small></span>
          <span class="link-ev-price">${ev.officeHours ? "drop in" : ev.regMode === "none" ? (ev.price ? fmtMoney(ev.price, ev.currency) + " at the door" : "free entry") : ev.regMode === "external" ? "sign-up ↗" : (Array.isArray(ev.options) && ev.options.length ? "from " + fmtMoney(Math.min(...ev.options.map((o) => o.price)), ev.currency) : ev.price ? fmtMoney(ev.price, ev.currency) : "FREE")}</span>
        </a>`;
      }).join("")}
      <a class="btn btn-cyan btn-block" href="/" style="margin:4px 0 10px">All events &amp; tickets →</a>` : `
      <a class="btn btn-cyan btn-block" href="/" style="margin:4px 0 10px">Events &amp; tickets →</a>`}

      ${linkRows}

      ${isAdmin ? `
      <div class="form-actions" style="justify-content:center;margin-top:18px">
        <button class="btn btn-ghost btn-sm btn-ink" id="links-edit">${mi("edit", "sm")} Edit these links (board)</button>
      </div>` : ""}
    </div>
  `;

  document.getElementById("links-edit")?.addEventListener("click", async () => {
    const next = await appPrompt("Edit the link page. One link per line as:\nLabel | https://url\nSection titles start with '## '. The 3 upcoming events above stay automatic.", {
      multiline: true, rows: 14, maxlength: 8000, value: content, okLabel: "Save links",
    });
    if (next === null) return;
    try {
      await setDoc(doc(db, "settings", "linktree"), {
        content: next.trim(),
        updatedBy: currentUser.uid, updatedAt: serverTimestamp(),
      });
      toast("Link page saved - live immediately.", "success");
      viewLinks();
    } catch (err) { toast("Save failed: " + err.message, "error"); }
  });
}

// ------------------------------------------------------------
// News (v0.100) - board publishes updates (title, text, optional link &
// image); creating a post broadcast-pushes to everyone who opted in.
// Board manages posts right on the page, no separate admin screen.
// ------------------------------------------------------------
async function viewNews() {
  setLoading();
  let posts = [];
  try {
    posts = (await getDocs(query(collection(db, "news"), orderBy("createdAt", "desc"), limit(30))))
      .docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { $app.innerHTML = errorState(e.message); return; }

  const render = () => {
    $app.innerHTML = `
      <h2 class="section-title">${mi("campaign")} News</h2>
      ${isAdmin ? `
      <div class="form-actions" style="margin:0 0 14px">
        <button class="btn btn-cyan btn-sm" id="news-new">${mi("add", "sm")} New post</button>
        <span class="form-hint">Publishing sends a push notification to everyone who opted in - editing later doesn't.</span>
      </div>
      <div id="news-form-box"></div>` : ""}
      ${posts.length ? posts.map((n) => `
      <article class="form-card news-card" style="margin-bottom:16px">
        ${n.image ? `<img class="news-img" src="${esc(n.image)}" alt="" loading="lazy" />` : ""}
        <p class="form-hint" style="margin:0 0 4px">${fmtDate(n.createdAt)}${n.authorName ? ` · ${esc(n.authorName.split(" ")[0])}` : ""}</p>
        <h3 style="margin:0 0 8px">${esc(n.title || "")}</h3>
        <div class="rich">${renderRich(n.body || "")}</div>
        <div class="form-actions" style="margin-top:10px">
          ${n.url ? `<a class="btn btn-sm btn-cyan" href="${esc(n.url)}" target="_blank" rel="noopener">Read more ${mi("arrow_outward", "sm")}</a>` : ""}
          ${isAdmin ? `
          <button class="btn btn-sm btn-ghost btn-ink news-edit" data-id="${n.id}">${mi("edit", "sm")} Edit</button>
          <button class="btn btn-sm btn-ghost news-del btn-danger" data-id="${n.id}">Delete</button>` : ""}
        </div>
      </article>`).join("") : `<div class="empty-state"><div class="big">${mi("campaign")}</div><p>No news yet - announcements from the board will appear here.</p></div>`}
    `;

    const showForm = (existing) => {
      const box = document.getElementById("news-form-box");
      box.innerHTML = `
        <div class="form-card" style="margin-bottom:18px">
          <div class="form-field"><label for="nw-title">Title *</label>
            <input id="nw-title" maxlength="140" value="${esc(existing?.title || "")}" /></div>
          <div class="form-field"><label for="nw-body">Text ${hintIcon("Formatting: **bold**, *italic*, [link](https://…), '- ' bullets.")}</label>
            <textarea id="nw-body" rows="6" maxlength="4000">${esc(existing?.body || "")}</textarea></div>
          <div class="form-grid">
            <div class="form-field"><label for="nw-url">Link (optional)</label>
              <input id="nw-url" type="url" maxlength="300" placeholder="https://…" value="${esc(existing?.url || "")}" /></div>
            <div class="form-field"><label for="nw-image">Image (optional)</label>
              <input id="nw-image" type="file" accept="image/*" />
              ${existing?.image ? `<label class="checkbox-row" style="margin-top:6px"><input type="checkbox" id="nw-image-remove" /> Remove current image</label>` : ""}</div>
          </div>
          <div class="form-actions">
            <button class="btn btn-green btn-sm" id="nw-save">${existing ? "Save changes" : `${mi("campaign", "sm")} Publish (sends push)`}</button>
            <button class="btn btn-ghost btn-sm btn-danger" id="nw-cancel">Cancel</button>
          </div>
        </div>`;
      document.getElementById("nw-cancel").onclick = () => { box.innerHTML = ""; };
      document.getElementById("nw-save").onclick = async (e) => {
        const title = document.getElementById("nw-title").value.trim();
        if (!title) { toast("Give the post a title.", "warn"); return; }
        e.target.disabled = true;
        try {
          let image = existing?.image || null;
          const file = document.getElementById("nw-image").files[0];
          if (file) image = await storeImage(await compressImage(file), "news");
          if (document.getElementById("nw-image-remove")?.checked) image = null;
          const data = {
            title,
            body: document.getElementById("nw-body").value.trim(),
            url: document.getElementById("nw-url").value.trim() || null,
            image,
            authorName: currentUser.displayName || "",
            updatedAt: serverTimestamp(),
          };
          if (existing) {
            await updateDoc(doc(db, "news", existing.id), data);
            Object.assign(posts.find((p) => p.id === existing.id), data, { updatedAt: Timestamp.now() });
            toast("Post updated.", "success");
          } else {
            const ref = await addDoc(collection(db, "news"), { ...data, createdAt: serverTimestamp(), createdBy: currentUser.uid });
            posts.unshift({ id: ref.id, ...data, createdAt: Timestamp.now() });
            logAudit("created", "news post", data.title, ref.id);
            toast("Published - push notification on its way.", "success");
          }
          render();
        } catch (err) { toast("Save failed: " + err.message, "error"); e.target.disabled = false; }
      };
    };

    document.getElementById("news-new")?.addEventListener("click", () => showForm(null));
    $app.querySelectorAll(".news-edit").forEach((b) => { b.onclick = () => { showForm(posts.find((p) => p.id === b.dataset.id)); window.scrollTo(0, 0); }; });
    $app.querySelectorAll(".news-del").forEach((b) => {
      b.onclick = async () => {
        if (!await appConfirm("Delete this news post? This cannot be undone.")) return;
        try {
          const gone = posts.find((p) => p.id === b.dataset.id);
          await deleteDoc(doc(db, "news", b.dataset.id));
          logAudit("deleted", "news post", gone?.title || "", b.dataset.id);
          posts = posts.filter((p) => p.id !== b.dataset.id);
          toast("Post deleted.", "success");
          render();
        } catch (err) { toast("Delete failed: " + err.message, "error"); }
      };
    });
  };
  render();
}

// ------------------------------------------------------------
// ESN Passport (v0.100, gamified v0.101) - stamps for every event you
// were CHECKED IN at, XP & levels, visas per event category, the country
// league and a shareable passport card. Fills itself from door scans.
// ------------------------------------------------------------
const PASSPORT_LEVELS = [
  { xp: 0, name: "Fresh Arrival", color: "#9a9cb5" },
  { xp: 40, name: "Explorer", color: "#00AEEF" },
  { xp: 100, name: "Regular", color: "#7AC143" },
  { xp: 200, name: "Local Hero", color: "#F47B20" },
  { xp: 380, name: "Erasmus Legend", color: "#EC008C" },
];
// Visa tiers (v0.127): a visa is one per event category, and it LEVELS UP
// the more events you attend in that category. Each category awards its
// tier's cumulative XP once reached (Bronze 8 -> Silver 20 -> Gold 40).
const VISA_TIERS = [
  { min: 1, name: "Bronze", color: "#C6893F", xp: 8 },
  { min: 3, name: "Silver", color: "#9AA7B6", xp: 20 },
  { min: 6, name: "Gold", color: "#EAB308", xp: 40 },
];
function visaTierFor(count) {
  let tier = null, idx = -1;
  VISA_TIERS.forEach((t, i) => { if (count >= t.min) { tier = t; idx = i; } });
  const next = VISA_TIERS[idx + 1] || null;
  const prevMin = tier ? tier.min : 0;
  const frac = next ? Math.max(0, Math.min(1, (count - prevMin) / (next.min - prevMin))) : (tier ? 1 : 0);
  return { tier, idx, next, frac };
}
const NAT_ISO = { Afghanistan: "AF", Albania: "AL", Algeria: "DZ", Andorra: "AD", Angola: "AO", Argentina: "AR", Armenia: "AM", Australia: "AU", Austria: "AT", Azerbaijan: "AZ", Bahamas: "BS", Bahrain: "BH", Bangladesh: "BD", Barbados: "BB", Belarus: "BY", Belgium: "BE", Belize: "BZ", Benin: "BJ", Bhutan: "BT", Bolivia: "BO", "Bosnia and Herzegovina": "BA", Botswana: "BW", Brazil: "BR", Brunei: "BN", Bulgaria: "BG", "Burkina Faso": "BF", Burundi: "BI", Cambodia: "KH", Cameroon: "CM", Canada: "CA", "Cape Verde": "CV", "Central African Republic": "CF", Chad: "TD", Chile: "CL", China: "CN", Colombia: "CO", Comoros: "KM", "Congo (DRC)": "CD", "Congo (Republic)": "CG", "Costa Rica": "CR", Croatia: "HR", Cuba: "CU", Cyprus: "CY", Czechia: "CZ", Denmark: "DK", Djibouti: "DJ", Dominica: "DM", "Dominican Republic": "DO", Ecuador: "EC", Egypt: "EG", "El Salvador": "SV", "Equatorial Guinea": "GQ", Eritrea: "ER", Estonia: "EE", Eswatini: "SZ", Ethiopia: "ET", Fiji: "FJ", Finland: "FI", France: "FR", Gabon: "GA", Gambia: "GM", Georgia: "GE", Germany: "DE", Ghana: "GH", Greece: "GR", Grenada: "GD", Guatemala: "GT", Guinea: "GN", "Guinea-Bissau": "GW", Guyana: "GY", Haiti: "HT", Honduras: "HN", Hungary: "HU", Iceland: "IS", India: "IN", Indonesia: "ID", Iran: "IR", Iraq: "IQ", Ireland: "IE", Israel: "IL", Italy: "IT", "Ivory Coast": "CI", Jamaica: "JM", Japan: "JP", Jordan: "JO", Kazakhstan: "KZ", Kenya: "KE", Kiribati: "KI", Kosovo: "XK", Kuwait: "KW", Kyrgyzstan: "KG", Laos: "LA", Latvia: "LV", Lebanon: "LB", Lesotho: "LS", Liberia: "LR", Libya: "LY", Liechtenstein: "LI", Lithuania: "LT", Luxembourg: "LU", Madagascar: "MG", Malawi: "MW", Malaysia: "MY", Maldives: "MV", Mali: "ML", Malta: "MT", "Marshall Islands": "MH", Mauritania: "MR", Mauritius: "MU", Mexico: "MX", Micronesia: "FM", Moldova: "MD", Monaco: "MC", Mongolia: "MN", Montenegro: "ME", Morocco: "MA", Mozambique: "MZ", Myanmar: "MM", Namibia: "NA", Nauru: "NR", Nepal: "NP", Netherlands: "NL", "New Zealand": "NZ", Nicaragua: "NI", Niger: "NE", Nigeria: "NG", "North Korea": "KP", "North Macedonia": "MK", Norway: "NO", Oman: "OM", Pakistan: "PK", Palau: "PW", Palestine: "PS", Panama: "PA", "Papua New Guinea": "PG", Paraguay: "PY", Peru: "PE", Philippines: "PH", Poland: "PL", Portugal: "PT", Qatar: "QA", Romania: "RO", Russia: "RU", Rwanda: "RW", "Saint Kitts and Nevis": "KN", "Saint Lucia": "LC", "Saint Vincent and the Grenadines": "VC", Samoa: "WS", "San Marino": "SM", "Sao Tome and Principe": "ST", "Saudi Arabia": "SA", Senegal: "SN", Serbia: "RS", Seychelles: "SC", "Sierra Leone": "SL", Singapore: "SG", Slovakia: "SK", Slovenia: "SI", "Solomon Islands": "SB", Somalia: "SO", "South Africa": "ZA", "South Korea": "KR", "South Sudan": "SS", Spain: "ES", "Sri Lanka": "LK", Sudan: "SD", Suriname: "SR", Sweden: "SE", Switzerland: "CH", Syria: "SY", Taiwan: "TW", Tajikistan: "TJ", Tanzania: "TZ", Thailand: "TH", "Timor-Leste": "TL", Togo: "TG", Tonga: "TO", "Trinidad and Tobago": "TT", Tunisia: "TN", Turkey: "TR", Turkmenistan: "TM", Tuvalu: "TV", Uganda: "UG", Ukraine: "UA", "United Arab Emirates": "AE", "United Kingdom": "GB", "United States": "US", Uruguay: "UY", Uzbekistan: "UZ", Vanuatu: "VU", "Vatican City": "VA", Venezuela: "VE", Vietnam: "VN", Yemen: "YE", Zambia: "ZM", Zimbabwe: "ZW" };
const flagOf = (name) => {
  const c = NAT_ISO[name];
  return c ? String.fromCodePoint(...[...c].map((ch) => 0x1F1A5 + ch.charCodeAt(0))) : "🌍";
};
function passportLevelFor(xp) {
  let idx = 0;
  PASSPORT_LEVELS.forEach((l, i) => { if (xp >= l.xp) idx = i; });
  return idx; // 0-based
}
function applyAvatarRing() {
  const img = document.getElementById("user-avatar");
  if (!img) return;
  const lvl = (myProfile && myProfile.passportLevel) || 0;
  img.className = "user-avatar" + (lvl ? ` pp-ring pp-ring-${lvl}` : "");
  img.title = lvl ? `ESN Passport · Level ${lvl} - ${PASSPORT_LEVELS[lvl - 1].name}` : "";
}

// ---- the shareable passport card (1080×1920 canvas) ----
function ppRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawPassportCard(ctx, d, imgs) {
  // Typography: Lato is loaded in 400 / 700 / 900 ONLY - never ask the
  // canvas for other weights (the fallback ruins the consistent look).
  const W = 1080, H = 1920;
  const PALETTE = ["#2E3192", "#00AEEF", "#EC008C", "#7AC143", "#F47B20"];
  const F = (weight, size) => `${weight} ${size}px Lato, Arial, sans-serif`;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#232668"); g.addColorStop(0.55, "#2E3192"); g.addColorStop(1, "#171a4a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // Soft glow behind the ring for depth (level-coloured, very faint)
  const glow = ctx.createRadialGradient(W / 2, 742, 60, W / 2, 742, 520);
  glow.addColorStop(0, d.levelColor + "2e");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 260, W, 1000);
  // Watermark: the white dragon, big and faded, behind everything
  if (imgs.logo) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    const wm = 760, wmh = wm * (imgs.logo.height / imgs.logo.width);
    ctx.translate(W / 2 + 210, 1500);
    ctx.rotate(-0.16);
    ctx.drawImage(imgs.logo, -wm / 2, -wmh / 2, wm, wmh);
    ctx.restore();
  }
  // Brand stripe: the five ESN colours across the top edge
  const stripeW = W / PALETTE.length;
  PALETTE.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * stripeW, 0, stripeW + 1, 26); });

  // Material icons on canvas: ligature text in the icon font. Guard: if
  // ligatures are not applied the word's width is huge - skip cleanly.
  const ico = (name, size, x, y, color) => {
    ctx.save();
    ctx.font = `${size}px "Material Symbols Rounded"`;
    if (ctx.measureText(name).width <= size * 1.35) {
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText(name, x, y);
    }
    ctx.restore();
  };

  if (imgs.logo) {
    const lw = 104, lh = 104 * (imgs.logo.height / imgs.logo.width);
    ctx.drawImage(imgs.logo, W / 2 - lw / 2, 84, lw, lh);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = F(900, 76);
  ctx.fillText("ESN PASSPORT", W / 2, 300);
  ctx.font = F(400, 38);
  ctx.fillStyle = "#aeb4e8";
  ctx.fillText("ESN Gent · " + d.season, W / 2, 356);

  // Name pill
  ctx.font = F(900, 48);
  const nameW = Math.min(W - 120, ctx.measureText(d.name).width + (d.flag ? 150 : 90));
  ppRoundRect(ctx, W / 2 - nameW / 2, 402, nameW, 88, 44);
  ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillText((d.flag ? d.flag + "  " : "") + d.name, W / 2, 461);

  // XP ring - profile photo inside when we have one, big number otherwise
  const cx = W / 2, cy = 742, R = 178;
  ctx.lineWidth = 24; ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  const frac = Math.max(0.04, Math.min(1, d.levelFrac));
  ctx.strokeStyle = d.levelColor;
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
  if (imgs.photo) {
    const pr = R - 26;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, pr, 0, 7); ctx.clip();
    const s = Math.min(imgs.photo.width, imgs.photo.height);
    ctx.drawImage(imgs.photo, (imgs.photo.width - s) / 2, (imgs.photo.height - s) / 2, s, s,
      cx - pr, cy - pr, pr * 2, pr * 2);
    ctx.restore();
    // crisp hairline between photo and ring
    ctx.beginPath(); ctx.arc(cx, cy, pr, 0, 7);
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 4; ctx.stroke();
  } else {
    ctx.fillStyle = "#fff";
    ctx.font = F(900, 140);
    ctx.fillText(String(d.stampCount), cx, cy + 16);
    ctx.font = F(700, 36); ctx.fillStyle = "#aeb4e8";
    ctx.fillText(d.stampCount === 1 ? "EVENT STAMPED" : "EVENTS STAMPED", cx, cy + 74);
  }

  // Under the ring: stamp count (when the photo took its place) + level pill
  let yy = cy + R + 66;
  if (imgs.photo) {
    ctx.fillStyle = "#fff";
    ctx.font = F(900, 46);
    ctx.fillText(`${d.stampCount} ${d.stampCount === 1 ? "EVENT" : "EVENTS"} STAMPED`, cx, yy);
    yy += 64;
  }
  ctx.font = F(900, 42);
  const lvlTxt = "LV " + d.levelIdx + " · " + d.levelName.toUpperCase();
  const lw2 = ctx.measureText(lvlTxt).width + 84;
  ppRoundRect(ctx, cx - lw2 / 2, yy - 8, lw2, 80, 40);
  ctx.fillStyle = d.levelColor; ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = F(900, 42);
  ctx.fillText(lvlTxt, cx, yy + 46);
  yy += 122;

  // Favourite category - one centred group: [icon] 🥇 Party · N×
  if (d.topCat) {
    ctx.font = F(700, 36);
    const txt = `🥇 Favourite: ${d.topCat.name} · ${d.topCat.count}×`;
    const textW = ctx.measureText(txt).width;
    const iconW = d.topCat.icon ? 56 : 0;
    const startX = cx - (textW + iconW) / 2;
    if (d.topCat.icon) ico(d.topCat.icon, 42, startX + 21, yy + 2, "#dfe3ff");
    ctx.textAlign = "left";
    ctx.fillStyle = "#dfe3ff";
    ctx.font = F(700, 36);
    ctx.fillText(txt, startX + iconW, yy);
    ctx.textAlign = "center";
  }

  // Six stat tiles, each with its material icon in a tinted square
  const tiles = [
    [String(d.thisAY), "THIS YEAR", PALETTE[1], "event"],
    [String(d.visas) + "/" + d.visasTotal, "VISAS", PALETTE[2], "approval"],
    [String(d.badges) + "/" + d.badgesTotal, "BADGES", PALETTE[3], "military_tech"],
    [String(d.xp ?? "-"), "XP", PALETTE[4], "bolt"],
    [d.bucketPct != null ? d.bucketPct + "%" : "-", "BUCKETLIST", PALETTE[1], "checklist"],
    [d.leagueRank ? "#" + d.leagueRank : "-", "COUNTRY RANK", PALETTE[2], "public"],
  ];
  const tw = 300, th = 150, gap = 30, x0 = (W - 3 * tw - 2 * gap) / 2, ty0 = 1206;
  tiles.forEach(([num, lab, ac, icn], i) => {
    const x = x0 + (i % 3) * (tw + gap), y = ty0 + Math.floor(i / 3) * (th + 26);
    ppRoundRect(ctx, x, y, tw, th, 28);
    ctx.fillStyle = "rgba(255,255,255,.09)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 2; ctx.stroke();
    ppRoundRect(ctx, x + 20, y + 22, 54, 54, 15);
    ctx.fillStyle = ac + "3d"; ctx.fill();
    ico(icn, 38, x + 47, y + 62, "#ffffff");
    ctx.fillStyle = "#fff"; ctx.font = F(900, 56);
    ctx.textAlign = "left";
    ctx.fillText(num, x + 92, y + 66);
    ctx.fillStyle = "#aeb4e8"; ctx.font = F(700, 24);
    ctx.fillText(lab, x + 22, y + th - 24);
    ctx.textAlign = "center";
  });

  // Latest stamps - dashed passport circles with the event's icon
  const st = d.stamps.slice(-3);
  if (st.length) {
    ctx.fillStyle = "rgba(255,255,255,.45)";
    ctx.font = F(700, 26);
    ctx.fillText("LATEST STAMPS", W / 2, 1600);
  }
  const sr = 92, sy = 1712;
  const sx0 = (W - st.length * (sr * 2 + 40) + 40) / 2 + sr;
  st.forEach((s, i) => {
    const x = sx0 + i * (sr * 2 + 40), tilt = ((i % 3) - 1) * 0.1;
    ctx.save(); ctx.translate(x, sy); ctx.rotate(tilt);
    ctx.setLineDash([14, 10]); ctx.lineWidth = 6;
    const c = PALETTE[(i + 1) % PALETTE.length];
    ctx.strokeStyle = c;
    ctx.beginPath(); ctx.arc(0, 0, sr, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    if (s.icon) ico(s.icon, 46, 0, -30, c);
    ctx.fillStyle = c;
    ctx.font = F(900, 28);
    ctx.fillText(s.date.toUpperCase(), 0, 14);
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = F(700, 23);
    const t1 = s.title.length > 14 ? s.title.slice(0, 13) + "…" : s.title;
    ctx.fillText(t1, 0, 48);
    ctx.restore();
  });

  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = F(900, 40);
  ctx.fillText("app.esngent.org", W / 2, 1846);
  ctx.font = F(400, 30); ctx.fillStyle = "#aeb4e8";
  ctx.fillText("Get your own passport in the ESN Gent app", W / 2, 1894);
}
const ppLoadImg = (src) => new Promise((res) => {
  if (!src) { res(null); return; }
  const i = new Image();
  // CORS mode so cross-origin images (the Google profile photo) don't
  // taint the canvas - if the host refuses, we just draw without it.
  i.crossOrigin = "anonymous";
  i.onload = () => res(i);
  i.onerror = () => res(null);
  i.src = src;
});

// ------------------------------------------------------------
// Friendship tree (v0.104) - the social web of board & alumni.
// Dotted line = good friends, solid = best friends. Only the circle
// (board roles, alumni coordinator, alumni) sees or edits it - rules-
// enforced, not just hidden. One doc per pair: friendships/{uidA_uidB}
// (sorted), {a, b, aName, bName, type, createdBy(Name), createdAt}.
// ------------------------------------------------------------
function friendshipEligible() {
  return myProfile?.alumni === true || ["board", "finance", "superadmin", "alumnicoord"].includes(myRole);
}

function drawFriendGraph(canvas, friendships, people) {
  const ids = [...new Set(friendships.flatMap((f) => [f.a, f.b]))];
  const pById = Object.fromEntries(people.map((p) => [p.uid, p]));
  const nameFor = (id) => pById[id]?.name
    || friendships.find((f) => f.a === id && f.aName)?.aName
    || friendships.find((f) => f.b === id && f.bName)?.bName || "-";
  const deg = {};
  friendships.forEach((f) => { deg[f.a] = (deg[f.a] || 0) + 1; deg[f.b] = (deg[f.b] || 0) + 1; });

  const W = canvas.parentElement.clientWidth - 16 || 600;
  const H = Math.max(380, Math.min(640, 240 + ids.length * 26));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const inkColor = getComputedStyle(document.body).color || "#26264f";

  // Start on a circle (deterministic), then let the physics settle.
  const nodes = ids.map((id, i) => {
    const ang = (i / ids.length) * Math.PI * 2;
    const p = pById[id];
    return {
      id, name: nameFor(id),
      color: p ? (p.board && p.alumni ? "#7AC143" : p.board ? "#00AEEF" : "#F47B20") : "#9a9cb5",
      r: 14 + Math.min(10, (deg[id] || 1) * 2),
      x: W / 2 + Math.cos(ang) * Math.min(W, H) * 0.32,
      y: H / 2 + Math.sin(ang) * Math.min(W, H) * 0.32,
      vx: 0, vy: 0,
    };
  });
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges = friendships
    .map((f) => ({ a: byId[f.a], b: byId[f.b], type: f.type }))
    .filter((e) => e.a && e.b);

  let frames = 0;
  let dragging = null;
  const PAD = 34;

  const step = () => {
    // pairwise repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i], n2 = nodes[j];
        let dx = n2.x - n1.x, dy = n2.y - n1.y;
        const d2 = Math.max(120, dx * dx + dy * dy);
        const force = 5200 / d2;
        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        n1.vx -= dx * force; n1.vy -= dy * force;
        n2.vx += dx * force; n2.vy += dy * force;
      }
    }
    // springs along friendships (best friends sit closer)
    for (const e of edges) {
      const rest = e.type === "best" ? 95 : 150;
      let dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const force = (d - rest) * 0.02;
      dx /= d; dy /= d;
      e.a.vx += dx * force; e.a.vy += dy * force;
      e.b.vx -= dx * force; e.b.vy -= dy * force;
    }
    // soft gravity to the middle + integrate
    let moved = 0;
    for (const n of nodes) {
      if (n === dragging) { n.vx = 0; n.vy = 0; continue; }
      n.vx += (W / 2 - n.x) * 0.004;
      n.vy += (H / 2 - n.y) * 0.004;
      n.vx *= 0.82; n.vy *= 0.82;
      n.x = Math.max(PAD, Math.min(W - PAD, n.x + n.vx));
      n.y = Math.max(PAD, Math.min(H - PAD, n.y + n.vy));
      moved += Math.abs(n.vx) + Math.abs(n.vy);
    }
    return moved;
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    for (const e of edges) {
      ctx.beginPath();
      ctx.setLineDash(e.type === "best" ? [] : [5, 6]);
      ctx.lineWidth = e.type === "best" ? 3 : 2;
      ctx.strokeStyle = e.type === "best" ? "#EC008C" : "#8b8fb8";
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.textAlign = "center";
    for (const n of nodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, 7);
      ctx.fillStyle = n.color;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `800 ${Math.round(n.r * 0.72)}px Lato, Arial`;
      const parts = n.name.split(" ").filter(Boolean);
      ctx.fillText(((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase(), n.x, n.y + n.r * 0.26);
      ctx.fillStyle = inkColor;
      ctx.font = "700 11px Lato, Arial";
      ctx.fillText(parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : (parts[0] || "-"), n.x, n.y + n.r + 14);
    }
  };

  const loop = () => {
    if (!canvas.isConnected) return; // view navigated away
    const moved = step();
    draw();
    frames++;
    if (frames < 700 && (moved > 0.25 || dragging)) requestAnimationFrame(loop);
    else draw();
  };
  requestAnimationFrame(loop);

  // Drag people around (pointer events cover mouse + touch)
  const pos = (evt) => {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  };
  canvas.addEventListener("pointerdown", (evt) => {
    const { x, y } = pos(evt);
    dragging = nodes.find((n) => (n.x - x) ** 2 + (n.y - y) ** 2 < (n.r + 8) ** 2) || null;
    if (dragging) {
      canvas.setPointerCapture(evt.pointerId);
      frames = 0;
      requestAnimationFrame(loop);
    }
  });
  canvas.addEventListener("pointermove", (evt) => {
    if (!dragging) return;
    const { x, y } = pos(evt);
    dragging.x = Math.max(PAD, Math.min(W - PAD, x));
    dragging.y = Math.max(PAD, Math.min(H - PAD, y));
  });
  const release = () => { dragging = null; frames = 0; };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
}

async function viewFriends() {
  if (!currentUser) {
    $app.innerHTML = signInState("diversity_3", "The friendship tree is a board & alumni corner of the app - sign in to check if that's you.");
    document.getElementById("es-login")?.addEventListener("click", signIn);
    return;
  }
  if (!friendshipEligible()) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("diversity_3")}</div>
      <p>The friendship tree is a <strong>board &amp; alumni</strong> corner of the app.</p>
      <p class="form-hint">Stick around ESN Gent long enough and you might end up in it.</p></div>`;
    return;
  }
  setLoading();
  let friendships = [];
  try {
    const fs = await getDocs(collection(db, "friendships"));
    friendships = fs.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { $app.innerHTML = errorState(e.message); return; }
  // People picker: current board team + everyone flagged alumni. If either
  // list can't load, the tree itself still renders from the stored names.
  let people = [];
  try {
    const [adminsSnap, alumniSnap] = await Promise.all([
      getDocs(collection(db, "admins")),
      getDocs(query(collection(db, "users"), where("alumni", "==", true))),
    ]);
    const map = new Map();
    adminsSnap.docs.forEach((d) => {
      const a = d.data();
      if (["board", "finance", "superadmin"].includes(a.role || "superadmin")) {
        map.set(d.id, { uid: d.id, name: a.name || a.email || "-", board: true, alumni: false });
      }
    });
    alumniSnap.docs.forEach((d) => {
      const u = d.data();
      const hit = map.get(d.id);
      if (hit) hit.alumni = true;
      else map.set(d.id, { uid: d.id, name: u.displayName || u.email || "-", board: false, alumni: true });
    });
    people = [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
  } catch { people = []; }
  const nameOf = (uid, fallback) => people.find((p) => p.uid === uid)?.name || fallback || "-";
  const personOption = (p) => `<option value="${esc(p.uid)}">${esc(p.name)}${p.board && p.alumni ? " (board · alumni)" : p.board ? " (board)" : " (alumni)"}</option>`;

  $app.innerHTML = `
    <h2 class="section-title">${mi("diversity_3")} Friendship tree</h2>
    <p class="form-hint" style="margin:-6px 0 14px">The board &amp; alumni web of ESN Gent - only this circle can see it.
      <strong style="color:var(--esn-magenta)">- solid = best friends</strong> · <strong>··· dotted = good friends</strong>. Drag people around.
      <span style="white-space:nowrap">${mi("circle", "sm")} <span style="color:#00AEEF">board</span> · <span style="color:#F47B20">alumni</span> · <span style="color:#7AC143">both</span></span></p>
    ${friendships.length ? `
    <div class="form-card" style="padding:8px;margin-bottom:16px">
      <canvas id="fr-canvas" style="width:100%;display:block;touch-action:none;cursor:grab"></canvas>
    </div>` : `
    <div class="empty-state" style="margin-bottom:16px"><div class="big">${mi("diversity_3")}</div>
      <p>No friendships in the tree yet - add the very first one below.</p></div>`}

    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("group_add", "sm")} Add a friendship</strong>
      ${people.length >= 2 ? `
      <div class="form-actions" style="margin-top:10px;align-items:center;flex-wrap:wrap">
        <select id="fr-a"><option value="">- who -</option>${people.map(personOption).join("")}</select>
        <span style="font-weight:800">+</span>
        <select id="fr-b"><option value="">- and who -</option>${people.map(personOption).join("")}</select>
        <select id="fr-type">
          <option value="good">Good friends (dotted)</option>
          <option value="best">Best friends (solid)</option>
        </select>
        <button class="btn btn-sm btn-green" id="fr-add">Add</button>
      </div>
      <p class="form-hint" style="margin-top:8px">The list holds the current board team plus everyone flagged as alumni. Adding an existing pair again just updates the kind of friendship.</p>`
      : `<p class="form-hint" style="margin-top:8px">The people list couldn't load - the tree above still works.</p>`}
    </div>

    ${friendships.length ? `
    <div class="table-wrap cards"><table>
      <thead><tr><th>Friends</th><th>Kind</th><th>Added by</th><th></th></tr></thead>
      <tbody>
        ${friendships.map((f) => `
        <tr>
          <td class="card-main"><strong>${esc(nameOf(f.a, f.aName))}</strong> ↔ <strong>${esc(nameOf(f.b, f.bName))}</strong></td>
          <td data-l="Kind"><button class="btn btn-sm btn-ghost btn-ink fr-toggle" data-fid="${esc(f.id)}" title="Click to switch between good and best">${f.type === "best" ? "Best friends --" : "Good friends ···"}</button></td>
          <td data-l="Added by">${esc(f.createdByName || "-")}</td>
          <td class="card-actions"><button class="btn btn-sm btn-ghost fr-del btn-danger" data-fid="${esc(f.id)}" title="Remove friendship">✕</button></td>
        </tr>`).join("")}
      </tbody>
    </table></div>` : ""}
  `;

  document.getElementById("fr-add")?.addEventListener("click", async (e) => {
    const a = document.getElementById("fr-a").value;
    const b = document.getElementById("fr-b").value;
    const type = document.getElementById("fr-type").value;
    if (!a || !b) { toast("Pick two people first.", "warn"); return; }
    if (a === b) { toast("Pick two different people - self-friendship is implied.", "warn"); return; }
    const [x, y] = [a, b].sort();
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await setDoc(doc(db, "friendships", `${x}_${y}`), {
        a: x, b: y,
        aName: nameOf(x), bName: nameOf(y),
        type,
        createdBy: currentUser.uid,
        createdByName: myProfile?.displayName || currentUser.displayName || "",
        createdAt: serverTimestamp(),
      });
      toast("Friendship saved", "success");
      viewFriends();
    } catch (err) { toast("Failed: " + err.message, "error"); btn.disabled = false; }
  });
  $app.querySelectorAll(".fr-toggle").forEach((btn) => {
    btn.onclick = async () => {
      const f = friendships.find((x) => x.id === btn.dataset.fid);
      if (!f) return;
      btn.disabled = true;
      try {
        await updateDoc(doc(db, "friendships", f.id), { type: f.type === "best" ? "good" : "best" });
        viewFriends();
      } catch (err) { toast("Failed: " + err.message, "error"); btn.disabled = false; }
    };
  });
  $app.querySelectorAll(".fr-del").forEach((btn) => {
    btn.onclick = async () => {
      const f = friendships.find((x) => x.id === btn.dataset.fid);
      if (!await appConfirm(`Remove the friendship between ${nameOf(f?.a, f?.aName)} and ${nameOf(f?.b, f?.bName)}? (Only in the app, hopefully.)`)) return;
      try {
        await deleteDoc(doc(db, "friendships", btn.dataset.fid));
        toast("Friendship removed", "success");
        viewFriends();
      } catch (err) { toast("Failed: " + err.message, "error"); }
    };
  });
  const cv = document.getElementById("fr-canvas");
  if (cv) drawFriendGraph(cv, friendships, people);
}

const passportEventCache = {}; // eventId → event data (visas need tags)

async function viewPassport() {
  if (!currentUser) {
    $app.innerHTML = signInState("workspace_premium", "Your ESN Passport collects a stamp for every event you attend - sign in to see it.");
    document.getElementById("es-login")?.addEventListener("click", signIn);
    return;
  }
  if (memberPerkGate("workspace_premium", "The ESN Passport")) return;
  setLoading();
  let regs = [], allTags = [], league = null, guideContent = DEFAULT_GUIDE, myRatings = 0, myShifts = [];
  try {
    [regs, allTags, league, guideContent, myRatings, myShifts] = await Promise.all([
      fetchMyRegistrations(),
      fetchEventTags().catch(() => []),
      getDoc(doc(db, "stats", "countryLeague")).then((s) => (s.exists() ? s.data() : null)).catch(() => null),
      getDoc(doc(db, "settings", "guide")).then((s) => (s.exists() && s.data().content ? s.data().content : DEFAULT_GUIDE)).catch(() => DEFAULT_GUIDE),
      getDocs(query(collection(db, "feedback"), where("uid", "==", currentUser.uid))).then((s) => s.size).catch(() => 0),
      // team side of the passport - shifts only exist for team members
      (myRole || isAlumni())
        ? getDocs(query(collection(db, "shiftSignups"), where("uid", "==", currentUser.uid)))
          .then((s) => s.docs.map((d) => d.data())).catch(() => [])
        : Promise.resolve([]),
    ]);
  } catch (e) { $app.innerHTML = errorState(e.message); return; }

  // ---- DEMO MODE (v0.119, superadmin only): a fully unlocked passport
  // with synthetic data, for testing & screenshots. Client-side only -
  // NOTHING is written anywhere (the level persist below is skipped too).
  const demoOn = passportDemo && myRole === "superadmin";
  if (demoOn) {
    const now2 = new Date();
    const tagList = allTags.filter((t) => t.name && t.cause !== true);
    const nTags = Math.max(1, tagList.length);
    const mk = (i, opts = {}) => {
      const d = new Date(now2);
      d.setDate(d.getDate() - (opts.daysAgo ?? i * 11 + 12));
      d.setHours(opts.hour ?? 20, 0, 0, 0);
      const id = `demo-${i}`;
      const t = tagList[i % nTags] || { name: "Party", color: "#EC008C" };
      passportEventCache[id] = {
        title: opts.title || `Demo: ${t.name} night`,
        tags: [{ id: t.id || "d", name: t.name, color: t.color || null }],
        tagName: t.name, tagColor: t.color || "#EC008C",
      };
      const start = Timestamp.fromDate(d);
      const ci = new Date(d);
      ci.setMinutes(ci.getMinutes() + (opts.delayMin ?? 10));
      return { eventId: id, eventTitle: passportEventCache[id].title, eventStart: start, createdAt: start, checkedInAt: Timestamp.fromDate(ci), status: "free", quantity: 1, ...(opts.extra || {}) };
    };
    regs = [
      ...Array.from({ length: Math.max(nTags, 21) }, (_, i) => mk(i)), // every visa + Legend tier + months
      mk(90, { daysAgo: 3, hour: 23, title: "Demo: night out" }),      // night owl
      mk(91, { daysAgo: 4, hour: 9, title: "Demo: sunrise hike" }),    // early bird
      mk(92, { daysAgo: 5, extra: { firstIn: true } }),                // secret: first through the door
      mk(93, { daysAgo: 6, extra: { lastIn: true } }),                 // secret: closed the party
      mk(94, { daysAgo: 8, delayMin: 120 }),                           // secret: fashionably late
      mk(95, { daysAgo: 9, delayMin: -15 }),                           // secret: keen bean
    ];
    myRatings = Math.max(myRatings, 5);
    myShifts = Array.from({ length: 16 }, (_, i) => {
      const d = new Date(now2);
      d.setDate(d.getDate() - i * 9 - 1);
      return { eventStart: Timestamp.fromDate(d), officeHours: i % 3 === 0 };
    });
  }

  const stamps = regs
    .filter((r) => r.checkedInAt)
    .sort((a, b) => (toDate(a.eventStart || a.createdAt)?.getTime() || 0) - (toDate(b.eventStart || b.createdAt)?.getTime() || 0));
  // The stamps' event docs carry the tag (visas) - fetched once, cached.
  const evIds = [...new Set(stamps.map((r) => r.eventId).filter(Boolean))].slice(0, 80);
  await Promise.all(evIds.filter((id) => !passportEventCache[id]).map(async (id) => {
    try {
      const s = await getDoc(doc(db, "events", id));
      passportEventCache[id] = s.exists() ? s.data() : {};
    } catch { passportEventCache[id] = {}; }
  }));
  const stampEv = (r) => passportEventCache[r.eventId] || {};

  const PALETTE = ["#2E3192", "#00AEEF", "#EC008C", "#7AC143", "#F47B20"];
  const ayFrom = new Date(academicYearStart());
  const thisAY = stamps.filter((r) => toDate(r.eventStart || r.createdAt) >= ayFrom).length;
  const hour = (r) => toDate(r.eventStart)?.getHours?.() ?? 12;

  // ---- visas: one per event category (tag) you attended ----
  // Multi-tag aware (v0.103): every tag on a checked-in event counts.
  const attendedTags = new Set(stamps.flatMap((r) => eventTagNames(stampEv(r))));
  // v0.118: visas = the ACTIVITY tags only - legacy cause tags are out.
  const visaTags = allTags.filter((t) => t.name && t.cause !== true);
  const visasEarned = visaTags.filter((t) => attendedTags.has(t.name));
  // Per-category attendance count + the events behind it (tier + popup list).
  const visaData = visaTags.map((t) => {
    const evs = stamps
      .filter((r) => eventTagNames(stampEv(r)).includes(t.name))
      .sort((a, b) => (toDate(b.eventStart || b.createdAt)?.getTime() || 0) - (toDate(a.eventStart || a.createdAt)?.getTime() || 0));
    return { tag: t, count: evs.length, events: evs, ...visaTierFor(evs.length) };
  }).sort((a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name));
  // Your strongest three categories get a podium medal on the passport.
  const visaRank = new Map();
  visaData.filter((v) => v.count > 0).slice(0, 3).forEach((v, i) => visaRank.set(v.tag.name, i + 1));
  const visaXp = visaData.reduce((s, v) => s + (v.tier ? v.tier.xp : 0), 0);

  // ---- bucketlist progress (per SECTION since v0.108 - the list grew
  // to cities/beers/food/experiences, so "finish everything" is no longer
  // the goal: completing any one full section is the achievement) ----
  const djb2 = (t) => { let h = 5381; for (const c of t) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h.toString(36); };
  const doneMap = (myProfile && myProfile.bucketDone) || {};
  const bucketSections = [];
  {
    let cur = null;
    for (const line of guideContent.split("\n")) {
      const l = line.trim();
      if (l.startsWith("## ")) { cur = { name: l.slice(3), total: 0, done: 0 }; bucketSections.push(cur); }
      else if ((l.startsWith("- [ ] ") || l.startsWith("- [x] ")) && cur) {
        cur.total++;
        if (doneMap[djb2(l.slice(6).trim())]) cur.done++;
      }
    }
  }
  if (demoOn) bucketSections.forEach((s) => { s.done = s.total; });
  const realSections = bucketSections.filter((s) => s.total > 0);
  const bucketItems = realSections.reduce((s, x) => s + x.total, 0);
  const bucketDone = demoOn ? bucketItems : Object.values(doneMap).filter(Boolean).length;
  const sectionComplete = realSections.some((s) => s.total >= 3 && s.done >= s.total);

  // ---- XP & level ----
  const isTrip = (r) => eventTagNames(stampEv(r)).some((n) => /trip/i.test(n));
  const attendanceXp = stamps.reduce((s, r) => s + (isTrip(r) ? 25 : 10), 0);
  const xp = attendanceXp
    + visaXp                                                   // visa tiers (v0.127)
    + myRatings * 3
    + Math.min(bucketDone, bucketItems || bucketDone) * 2
    + (sectionComplete ? 25 : 0);
  const lvlIdx = passportLevelFor(xp);            // 0-based
  const lvl = PASSPORT_LEVELS[lvlIdx];
  const next = PASSPORT_LEVELS[lvlIdx + 1] || null;
  const levelFrac = next ? (xp - lvl.xp) / (next.xp - lvl.xp) : 1;
  // Persist for the avatar ring (cosmetic, self-written; NEVER in demo mode).
  if (!demoOn && myProfile && (myProfile.passportLevel !== lvlIdx + 1 || myProfile.passportXp !== xp)) {
    setDoc(doc(db, "users", currentUser.uid), { passportLevel: lvlIdx + 1, passportXp: xp }, { merge: true }).catch(() => {});
    myProfile.passportLevel = lvlIdx + 1;
    myProfile.passportXp = xp;
    applyAvatarRing();
  }

  // "3 events within any 7 days" - stamps are sorted by date already.
  const stampTimes = stamps.map((r) => toDate(r.eventStart || r.createdAt)?.getTime() || 0).filter(Boolean);
  const marathon = stampTimes.some((t, i) => stampTimes[i + 2] && stampTimes[i + 2] - t <= 7 * 24 * 3600e3);
  const monthsActive = new Set(stamps.map((r) => {
    const d = toDate(r.eventStart || r.createdAt);
    return d ? `${d.getFullYear()}-${d.getMonth()}` : null;
  }).filter(Boolean)).size;

  const BADGES = [
    ["🎉", "First stamp", "Attend your first event", stamps.length >= 1],
    // Attendance TIERS as ONE badge (v0.116): shows the tier you're on and
    // how many events to the next one - replaced 4 separate cards.
    // Tuple index 5 = progress fraction → renders a mini progress bar.
    ...(() => {
      const TIERS = [[3, "🔥", "Warming up"], [5, "⭐", "Regular"], [10, "💜", "Die-hard ESNer"], [20, "🏆", "Legend"]];
      const n = stamps.length;
      const cur = [...TIERS].reverse().find(([k]) => n >= k) || null;
      const nxt = TIERS.find(([k]) => n < k) || null;
      const how = nxt
        ? `${n}/${nxt[0]} events - ${nxt[0] - n} more to ${nxt[2]}`
        : `${n} events - every tier unlocked`;
      return [[cur ? cur[1] : "🔥", cur ? cur[2] : "Warming up", how, !!cur, false, nxt ? Math.min(1, n / nxt[0]) : 1]];
    })(),
    ["🦉", "Night owl", "Attend an event starting after 22:00", stamps.some((r) => hour(r) >= 22)],
    ["🌅", "Early bird", "Attend an event starting before 10:00", stamps.some((r) => hour(r) < 10)],
    ["✈️", "Globetrotter", "Join a trip", stamps.some(isTrip)],
    ["🏃", "Marathon", "3 events within one week", marathon],
    ["📅", "Season pass", "Active in 3 different months", monthsActive >= 3],
    ["🎫", "Visa collector", "Collect 3 visas", visasEarned.length >= 3],
    ["💬", "Feedback friend", "Rate 3 events afterwards", myRatings >= 3],
    ["🗺️", "Ghent Explorer", "Complete a whole bucketlist section", sectionComplete],
    // ---- secret badges (v0.109) - shown as ??? until earned ----
    // firstIn / lastIn are written server-side (check-in trigger + nightly).
    ...(() => {
      const delayMin = (r) => {
        const a = toDate(r.checkedInAt), b = toDate(r.eventStart);
        return a && b ? (a.getTime() - b.getTime()) / 60000 : null;
      };
      return [
        ["🥇", "First through the door", "Be the very first person scanned at an event", stamps.some((r) => r.firstIn === true), true],
        ["🌙", "Closed the party", "Be the last person scanned at an event (5+ attendees)", stamps.some((r) => r.lastIn === true), true],
        ["🐢", "Fashionably late", "Check in more than 90 minutes after an event started", stamps.some((r) => { const d2 = delayMin(r); return d2 != null && d2 >= 90 && d2 <= 300; }), true],
        ["⚡", "Keen bean", "Check in before an event even officially started", stamps.some((r) => { const d2 = delayMin(r); return d2 != null && d2 < 0 && d2 >= -120; }), true],
      ];
    })(),
  ];
  const earned = BADGES.filter((b) => b[3]).length;

  // ---- team side (board / volunteers / alumni) ----
  const teamSide = !!(myRole || isAlumni());
  const shiftsDone = myShifts.filter((s) => toDate(s.eventStart) < new Date());
  const officeDone = shiftsDone.filter((s) => s.officeHours === true);
  const shiftsThisAY = shiftsDone.filter((s) => toDate(s.eventStart) >= ayFrom);
  const TEAM_BADGES = teamSide ? [
    ["🤝", "First shift", "Work your first shift", shiftsDone.length >= 1],
    // Shift TIERS as one badge (v0.116) - same pattern as attendance.
    ...(() => {
      const TIERS = [[5, "💪", "Reliable hands"], [15, "🦸", "Backbone of ESN"]];
      const n = shiftsDone.length;
      const cur = [...TIERS].reverse().find(([k]) => n >= k) || null;
      const nxt = TIERS.find(([k]) => n < k) || null;
      const how = nxt ? `${n}/${nxt[0]} shifts - ${nxt[0] - n} more to ${nxt[2]}` : `${n} shifts - every tier unlocked`;
      return [[cur ? cur[1] : "💪", cur ? cur[2] : "Reliable hands", how, !!cur, false, nxt ? Math.min(1, n / nxt[0]) : 1]];
    })(),
    ["🗝️", "Office hero", "5 office shifts", officeDone.length >= 5, false, Math.min(1, officeDone.length / 5)],
    ["🧭", "On the team", "Hold a role in ESN Gent", !!myRole],
    ["🎓", "Once ESN, always ESN", "Alumni of ESN Gent", isAlumni()],
  ] : [];
  const teamEarned = TEAM_BADGES.filter((b) => b[3]).length;
  const myCountry = (myProfile && myProfile.nationality) || "";

  $app.innerHTML = `
    <div class="passport">
      <div class="pp-cover">
        <div class="pp-cover-head">
          <img src="/logo-white.png" alt="" class="pp-cover-logo" />
          <div style="min-width:0;flex:1">
            <span class="pp-cover-kicker">ESN GENT</span>
            <h2>ESN Passport</h2>
          </div>
          <button class="btn btn-ghost btn-sm pp-icon-btn" id="pp-info" title="What is the ESN Passport?" aria-label="About the ESN Passport" style="color:#fff;border-color:rgba(255,255,255,.35)">${mi("info", "sm")}</button>
          ${myRole === "superadmin" ? `<button class="btn btn-ghost btn-sm" id="pp-demo" title="Superadmin only: preview the passport fully unlocked with synthetic data - nothing is saved." style="color:#fff;border-color:rgba(255,255,255,.35)">${demoOn ? "Demo ✓" : "Demo"}</button>` : ""}
          ${stamps.length ? `<button class="btn btn-magenta btn-sm" id="pp-share">${mi("ios_share", "sm")} Share</button>` : ""}
        </div>
        <div class="pp-cover-id">
          <div class="pp-idring" style="background:conic-gradient(${lvl.color} ${Math.round(levelFrac * 360)}deg, rgba(255,255,255,.18) 0deg)">
            <div class="pp-idring-inner">
              ${currentUser.photoURL
                ? `<img src="${esc(currentUser.photoURL)}" alt="" referrerpolicy="no-referrer" />`
                : `<span class="pp-idring-mono">${esc((currentUser.displayName || "?").trim()[0] || "?").toUpperCase()}</span>`}
            </div>
            <span class="pp-idring-lvl" style="background:${lvl.color}">${lvlIdx + 1}</span>
          </div>
          <div style="min-width:0">
            <strong class="pp-cover-name">${myCountry ? `${flagOf(myCountry)} ` : ""}${esc((currentUser.displayName || "Traveller").split(" ")[0])}</strong>
            <span class="pp-cover-level" style="color:${lvl.color}">Level ${lvlIdx + 1} - ${lvl.name}</span>
            <span class="pp-cover-xp">${xp} XP${next ? ` · ${next.xp - xp} XP to ${next.name}` : " · max level, you absolute legend"}</span>
          </div>
        </div>
        <div class="pp-cover-stats">
          <div><b>${stamps.length}</b><span>stamps</span></div>
          <div><b>${thisAY}</b><span>this year</span></div>
          <div><b>${visasEarned.length}/${visaTags.length || 0}</b><span>visas</span></div>
          <div><b>${earned}/${BADGES.length}</b><span>badges</span></div>
          <div><b>${bucketItems ? `${Math.round((Math.min(bucketDone, bucketItems) / bucketItems) * 100)}%` : "-"}</b><span>bucketlist</span></div>
        </div>
        <p class="pp-cover-hint">${demoOn ? `${mi("science", "sm")} DEMO VIEW - synthetic data, nothing is saved. Click Demo again to go back. · ` : ""}Earn XP: event +10 · trip +25 · visa tier +8/+20/+40 · rate an event +3 · bucketlist tick +2 · full section +25</p>
      </div>

      ${stamps.length ? (() => {
        const stampHtml = (r, i) => {
          const d = toDate(r.eventStart || r.createdAt);
          const c = stampEv(r).tagColor || PALETTE[i % PALETTE.length];
          return `
          <a class="stamp" href="/event/${r.eventId}" style="--stamp:${esc(c)};--tilt:${(i % 5) - 2}deg">
            <span class="stamp-ico">${mi(eventIcon({ ...stampEv(r), title: r.eventTitle }))}</span>
            <span class="stamp-date">${d ? d.getDate() : ""} ${d ? d.toLocaleDateString("en-GB", { month: "short" }) : ""}</span>
            <span class="stamp-title">${esc((r.eventTitle || "Event").slice(0, 36))}</span>
          </a>`;
        };
        // ≤10 stamps: one grid. More: bundled per month (newest open) so a
        // busy semester doesn't become an endless wall of circles.
        if (stamps.length <= 10) return `<div class="stamp-grid">${stamps.map(stampHtml).join("")}</div>`;
        const groups = {};
        stamps.forEach((r, i) => {
          const d = toDate(r.eventStart || r.createdAt);
          const k = d ? `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}` : "0000-00";
          (groups[k] ??= []).push([r, i]);
        });
        return Object.keys(groups).sort().reverse().map((k, gi) => {
          const [yy, mm] = k.split("-").map(Number);
          const label = k === "0000-00" ? "Earlier" : new Date(yy, mm, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
          return `
          <details class="pp-month" ${gi === 0 ? "open" : ""}>
            <summary><strong>${label}</strong><span class="form-hint">${groups[k].length} stamp${groups[k].length === 1 ? "" : "s"} ›</span></summary>
            <div class="stamp-grid" style="margin-bottom:4px">${groups[k].map(([r, i]) => stampHtml(r, i)).join("")}</div>
          </details>`;
        }).join("");
      })() : `
      <div class="empty-state"><div class="big">${mi("approval")}</div>
        <p>No stamps yet - your passport fills itself when you're checked in at the door of an event.</p>
        <p><a class="btn btn-cyan btn-sm" href="/">Find your first event</a></p>
      </div>`}

      ${visaTags.length ? `
      <details class="pp-section">
        <summary>${mi("approval", "sm")} Visas · ${visasEarned.length}/${visaTags.length} <span class="form-hint">one per category, levels up the more you go</span></summary>
        <div class="pp-section-body">
      <div class="visa-grid2">
        ${visaData.map((v) => {
          const icon = v.tag.icon || iconForName(v.tag.name);
          const rank = visaRank.get(v.tag.name);
          const medal = rank ? ["🥇", "🥈", "🥉"][rank - 1] : "";
          const cat = v.tag.color || "#2E3192";
          const tierColor = v.tier ? v.tier.color : "rgba(128,128,160,.35)";
          const nextTxt = v.next
            ? `${v.next.min - v.count} more for ${v.next.name}`
            : v.tier ? "Gold - maxed! ★" : `Attend a ${v.tag.name} event`;
          const tierTxt = v.tier ? `${v.tier.name} visa` : "Not collected yet";
          return `<button class="visa-card ${v.tier ? "got" : ""} ${rank ? "top" : ""}" data-visa="${esc(v.tag.name)}" style="--visa:${esc(cat)};--tier:${tierColor}" title="${v.count ? `Tap to see your ${esc(v.tag.name)} events` : `Attend a ${esc(v.tag.name)} event to start this visa`}">
            ${medal ? `<span class="visa-rank" title="Top ${rank} category">${medal}</span>` : ""}
            <span class="visa-ic">${mi(icon)}${v.count ? `<span class="visa-count">${v.count}</span>` : ""}</span>
            <strong class="visa-name">${esc(v.tag.name)}</strong>
            <span class="visa-tier">${tierTxt}</span>
            <span class="visa-bar"><i style="width:${Math.round(v.frac * 100)}%"></i></span>
            <span class="visa-next">${nextTxt}</span>
          </button>`;
        }).join("")}
      </div>
      <p class="form-hint" style="margin:8px 0 4px">${mi("info", "sm")} Bronze at 1 event · Silver at 3 · Gold at 6. Tap a visa to see which events you joined.</p>
        </div>
      </details>` : ""}

      <details class="pp-section">
        <summary>${mi("military_tech", "sm")} Badges · ${earned}/${BADGES.length} <span class="form-hint">little challenges, some secret</span></summary>
        <div class="pp-section-body">
      <div class="badge-grid">
        ${BADGES.map(([icon, name, how, got, secret, prog]) => (secret && !got ? `
        <div class="pp-badge" title="Secret badge - earn it to find out">
          <span class="pp-badge-icon">❓</span>
          <strong>???</strong>
          <small>Secret badge - earn it to find out</small>
        </div>` : `
        <div class="pp-badge ${got ? "earned" : ""}" title="${esc(how)}">
          <span class="pp-badge-icon">${got ? icon : "🔒"}</span>
          <strong>${esc(name)}</strong>
          <small>${esc(how)}</small>
          ${prog != null ? `<span class="pp-badge-bar"><i style="width:${Math.round(prog * 100)}%"></i></span>` : ""}
        </div>`)).join("")}
      </div>
        </div>
      </details>

      ${stamps.length >= 3 ? (() => {
        const delayMin = (r) => {
          const a = toDate(r.checkedInAt), b = toDate(r.eventStart);
          return a && b ? (a.getTime() - b.getTime()) / 60000 : null;
        };
        const delays = stamps.map(delayMin).filter((d2) => d2 != null && d2 >= -120 && d2 <= 300);
        const avgDelay = delays.length >= 3 ? Math.round(delays.reduce((a, b2) => a + b2, 0) / delays.length) : null;
        const tagCount = {};
        stamps.forEach((r) => eventTagNames(stampEv(r)).forEach((n) => { tagCount[n] = (tagCount[n] || 0) + 1; }));
        const favTag = Object.entries(tagCount).sort((x, y) => y[1] - x[1])[0];
        const dowCount = {};
        stamps.forEach((r) => { const d2 = toDate(r.eventStart || r.createdAt); if (d2) dowCount[d2.getDay()] = (dowCount[d2.getDay()] || 0) + 1; });
        const favDowE = Object.entries(dowCount).sort((x, y) => y[1] - x[1])[0];
        const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const lines = [];
        if (avgDelay != null) {
          lines.push(avgDelay >= 10 ? `${mi("schedule", "sm")} You arrive on average <strong>${avgDelay} min after</strong> the start - fashionably late.`
            : avgDelay <= -5 ? `${mi("schedule", "sm")} You arrive on average <strong>${-avgDelay} min early</strong> - punctuality legend.`
            : `${mi("schedule", "sm")} You arrive basically <strong>on time</strong> - rare around here.`);
        }
        if (favTag) lines.push(`${mi("label", "sm")} Favourite category: <strong>${esc(favTag[0])}</strong> (${favTag[1]}×).`);
        if (favDowE) lines.push(`${mi("event", "sm")} Your night out is <strong>${DOW[+favDowE[0]]}</strong> (${favDowE[1]} events).`);
        return lines.length ? `
      <details class="pp-section">
        <summary>${mi("auto_awesome", "sm")} Fun facts</summary>
        <div class="pp-section-body form-card">
        ${lines.map((l) => `<p style="margin:4px 0;font-size:.9rem">${l}</p>`).join("")}
        </div>
      </details>` : "";
      })() : ""}

      ${teamSide ? `
      <details class="pp-section">
        <summary>${mi("volunteer_activism", "sm")} ESN Volunteer · ${teamEarned}/${TEAM_BADGES.length} <span class="form-hint">the team side of your passport</span></summary>
        <div class="pp-section-body">
      <div class="pp-vol">
        <div class="pp-vol-head">
          <span class="pp-vol-role">${esc(roleLabel())}${myRole && isAlumni() ? ` · alumni` : ""}</span>
          <span class="pp-vol-count">${teamEarned}/${TEAM_BADGES.length} service badges</span>
        </div>
        <div class="stat-row" style="margin:0 0 14px">
          <div class="stat-card" style="--accent:#00AEEF"><div class="num">${shiftsDone.length}</div><div class="lbl">Shifts worked</div></div>
          <div class="stat-card" style="--accent:#7AC143"><div class="num">${officeDone.length}</div><div class="lbl">Office shifts</div></div>
          <div class="stat-card" style="--accent:#EC008C"><div class="num">${shiftsThisAY.length}</div><div class="lbl">This academic year</div></div>
        </div>
        <div class="badge-grid">
          ${TEAM_BADGES.map(([icon, name, how, got, , prog]) => `
          <div class="pp-badge ${got ? "earned" : ""}" title="${esc(how)}">
            <span class="pp-badge-icon">${got ? icon : "🔒"}</span>
            <strong>${esc(name)}</strong>
            <small>${esc(how)}</small>
            ${prog != null ? `<span class="pp-badge-bar"><i style="width:${Math.round(prog * 100)}%"></i></span>` : ""}
          </div>`).join("")}
        </div>
        ${myRole ? `<p class="form-hint" style="margin:12px 0 0">Sign up for shifts on the <a href="/shifts">Shiftlists page</a> - worked shifts land here automatically.</p>` : ""}
      </div>
        </div>
      </details>` : ""}

      ${league && Array.isArray(league.rows) && league.rows.length ? (() => {
        // Punctuality medals (v0.109): the most punctual and the most
        // fashionably-late country among the top rows (needs lateMin data).
        const timed = league.rows.filter((r2) => typeof r2.lateMin === "number");
        const punctual = timed.length >= 2 ? timed.reduce((a, b2) => (a.lateMin <= b2.lateMin ? a : b2)).country : null;
        const latest = timed.length >= 2 ? timed.reduce((a, b2) => (a.lateMin >= b2.lateMin ? a : b2)).country : null;
        return `
      <details class="pp-section">
        <summary>🌍 Country league <span class="form-hint">check-ins per country, this academic year</span></summary>
        <div class="pp-section-body">
      <div class="form-card">
        ${league.rows.slice(0, 10).map((row, i) => `
        <div class="league-row ${row.country === myCountry ? "mine" : ""}">
          <span class="league-pos">${i + 1}</span>
          <span class="league-flag">${flagOf(row.country)}</span>
          <span class="league-name">${esc(row.country)}${row.country === punctual ? ` <span title="Most punctual country - avg ${row.lateMin} min after start">⏱️</span>` : ""}${row.country === latest ? ` <span title="Most fashionably late - avg ${row.lateMin} min after start">🐢</span>` : ""}</span>
          <span class="league-bar"><i style="width:${Math.max(4, Math.round((row.checkins / league.rows[0].checkins) * 100))}%"></i></span>
          <span class="league-count">${row.checkins}</span>
        </div>`).join("")}
        <p class="form-hint" style="margin:8px 0 0">Updated daily. Represent your country - every scanned ticket counts! 🏁${punctual ? ` · ⏱️ most punctual: ${esc(punctual)}` : ""}${latest ? ` · 🐢 fashionably late: ${esc(latest)}` : ""}</p>
      </div>
        </div>
      </details>`;
      })() : ""}

      <p class="form-hint" style="margin-top:14px">Stamps come from door check-ins - make sure your ticket gets scanned when you arrive.</p>
    </div>`;

  // Demo toggle (superadmin) - re-renders the whole passport either way.
  document.getElementById("pp-demo")?.addEventListener("click", () => {
    passportDemo = !passportDemo;
    viewPassport();
  });

  // "What is the passport?" explainer (plain-text appAlert).
  document.getElementById("pp-info")?.addEventListener("click", () => {
    appAlert(
      "Your ESN Passport\n\n" +
      "It fills itself: every time your ticket is scanned at the door of an event, you collect a stamp - no manual logging.\n\n" +
      "VISAS - one per event category (Party, Sports, Culture...). Each visa levels up the more of that category you attend: Bronze at 1 event, Silver at 3, Gold at 6. Your top three categories get a medal. Tap any visa to see the events behind it.\n\n" +
      "XP & LEVELS - you earn XP for going to events (+10, trips +25), for each visa tier you reach (+8/+20/+40), for rating events (+3), and for ticking off the Ghent bucketlist (+2 each, +25 for a full section). Enough XP moves you from Fresh Arrival up to Erasmus Legend.\n\n" +
      "BADGES - little challenges, some of them secret until you unlock them.\n\n" +
      "COUNTRY LEAGUE - every scanned ticket also scores a point for your country. Represent!\n\n" +
      "Share your passport any time with the Share button - it makes a clean card for your stories.");
  });

  // Tap a visa -> the events behind it (plain-text appAlert).
  $app.querySelector(".visa-grid2")?.addEventListener("click", (e) => {
    const card = e.target.closest(".visa-card");
    if (!card) return;
    const v = visaData.find((x) => x.tag.name === card.dataset.visa);
    if (!v) return;
    if (!v.count) {
      appAlert(`${v.tag.name} visa\n\nYou haven't been to a ${v.tag.name} event yet. Go to one and get your ticket scanned at the door to start this visa!`);
      return;
    }
    const list = v.events.map((r) => {
      const d = toDate(r.eventStart || r.createdAt);
      return `• ${d ? `${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : ""} - ${r.eventTitle || "Event"}`;
    }).join("\n");
    const tierLine = v.tier
      ? `${v.tier.name} visa${v.next ? ` · ${v.next.min - v.count} more for ${v.next.name}` : " · maxed out ★"}`
      : "Not collected yet";
    appAlert(`${v.tag.name} visa - ${v.count} event${v.count === 1 ? "" : "s"}\n${tierLine}\n\n${list}`);
  });

  // ---- share card ----
  document.getElementById("pp-share")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const old = btn.innerHTML;
    btn.innerHTML = `${mi("hourglass_top", "sm")} Making it pretty…`;
    try {
      const [logo, photo] = await Promise.all([
        ppLoadImg("/logo-white.png"),
        ppLoadImg(currentUser.photoURL || null),
      ]);
      // Make sure every font/weight the card uses is really loaded before
      // drawing - otherwise the canvas silently falls back and the type
      // looks mixed (Lato ships 400/700/900 only).
      try {
        await Promise.all([
          document.fonts.load('40px "Material Symbols Rounded"'),
          document.fonts.load('400 30px Lato'),
          document.fonts.load('700 30px Lato'),
          document.fonts.load('900 30px Lato'),
        ]);
      } catch { /* fallback fonts still draw */ }
      const canvas = document.createElement("canvas");
      canvas.width = 1080; canvas.height = 1920;
      const m = new Date().getMonth();
      const topV = visaData.find((v) => v.count > 0) || null;
      drawPassportCard(canvas.getContext("2d"), {
        name: (currentUser.displayName || "ESNer").split(" ")[0],
        flag: myCountry ? flagOf(myCountry) : "",
        season: `${m >= 8 || m === 0 ? "Autumn" : m >= 1 && m <= 5 ? "Spring" : "Summer"} ${new Date().getFullYear()}`,
        stampCount: stamps.length, thisAY,
        levelIdx: lvlIdx + 1, levelName: lvl.name, levelColor: lvl.color, levelFrac,
        badges: earned, badgesTotal: BADGES.length,
        visas: visasEarned.length, visasTotal: visaTags.length || 1,
        xp,
        topCat: topV ? { name: topV.tag.name, count: topV.count, icon: topV.tag.icon || iconForName(topV.tag.name) } : null,
        bucketPct: bucketItems ? Math.round((Math.min(bucketDone, bucketItems) / bucketItems) * 100) : null,
        leagueRank: (() => {
          const i = (league?.rows || []).findIndex((r2) => r2.country === myCountry);
          return i >= 0 ? i + 1 : null;
        })(),
        stamps: stamps.slice(-3).map((r) => {
          const d = toDate(r.eventStart || r.createdAt);
          return {
            date: d ? `${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}` : "",
            title: r.eventTitle || "Event",
            icon: eventIcon({ ...stampEv(r), title: r.eventTitle }),
          };
        }),
      }, { logo, photo });
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      const file = new File([blob], "esn-passport.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "My ESN Passport" });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "esn-passport.png";
        a.click();
        URL.revokeObjectURL(a.href);
        toast("Passport card downloaded - share it wherever you like!", "success");
      }
    } catch (err) {
      if (err?.name !== "AbortError") toast("Could not create the card: " + err.message, "error");
    }
    btn.disabled = false;
    btn.innerHTML = old;
  });
}

// ------------------------------------------------------------
// Ghent guide & bucketlist (v0.100) - board-editable sections; lines
// written as "- [ ] item" become a personal checklist (progress saved
// on your profile). Edited on the page itself, like the links page.
// ------------------------------------------------------------
const DEFAULT_GUIDE = `## Surviving your first week
Welcome to Ghent! The basics, in order:
- [ ] Register with the city (appointment at Gent city hall - bring your passport & proof of enrolment)
- [ ] Get a Belgian SIM or eSIM
- [ ] Open a bank account (several banks have free student accounts)
- [ ] Get a bike - Ghent runs on bikes (try second-hand or student rentals)
- [ ] Buy your [ESNcard](/account) and join your first [event](/)

## Ghent bucketlist
- [ ] Climb the Belfry for the view
- [ ] Gravensteen castle (yes, it has a moat)
- [ ] Graffiti street (Werregarenstraat)
- [ ] Eat cuberdons ("neuzekes") from a market stall
- [ ] Watch the sunset from St Michael's Bridge
- [ ] Swim at Blaarmeersen in summer
- [ ] Survive a night in the Overpoort
- [ ] Attend a cantus (learn the songs in the [Codex](/codex))
- [ ] Day-trip to Bruges, Antwerp & Brussels

## Cities to visit
- [ ] Bruges - the postcard one
- [ ] Antwerp - fashion, the harbour & the station
- [ ] Brussels - Grand Place, Atomium & EU bubble
- [ ] Leuven - the other student city
- [ ] Ostend or De Haan - the Belgian seaside
- [ ] Dinant & the citadel (Wallonia!)
- [ ] Lille or Amsterdam - cross a border by train

## Belgian beers to try
- [ ] A Trappist (Westmalle, Chimay, Orval or - if you find it - Westvleteren)
- [ ] Duvel - the devil in a glass
- [ ] Tripel Karmeliet
- [ ] A kriek or fruit lambic (cherries in your beer, yes)
- [ ] A geuze - the sour one, be brave
- [ ] Gruut - brewed right here in Ghent
- [ ] A "spéciale" in a brown café older than your country

## Food to try
- [ ] Fries from a real frituur - with stoofvlees sauce
- [ ] A Liège waffle AND a Brussels waffle (they're different, pick a side)
- [ ] Cuberdons ("neuzekes") from a market stall
- [ ] Waterzooi - Ghent's own dish
- [ ] Moules-frites (mussels & fries)
- [ ] Belgian chocolate from an actual chocolatier
- [ ] Speculoos spread on anything
- [ ] Tierenteyn mustard - sharper than you expect

## Erasmus experiences
- [ ] Cook a dish from your country for your housemates
- [ ] Learn 10 words of Dutch (and use "goeiedag" in a shop)
- [ ] Make a friend from a country you'd never met anyone from
- [ ] Join a [trip](/) with people you didn't know the week before
- [ ] Watch the sunrise after a night out
- [ ] Visit a friend's home country after the exchange
- [ ] Teach someone a song in your language
- [ ] Say "yes" to a plan you'd normally skip

## Good to know
Emergency number: 112 · Non-urgent police: 101
Supermarkets close early on Sundays - plan ahead.
Student restaurants ("resto") are the cheapest warm meal in town.`;

async function viewGuide() {
  if (memberPerkGate("checklist", "The bucketlist & survival guide")) return;
  setLoading();
  let content = DEFAULT_GUIDE;
  try {
    const s = await getDoc(doc(db, "settings", "guide"));
    if (s.exists() && typeof s.data().content === "string" && s.data().content.trim()) content = s.data().content;
  } catch { /* default shown */ }
  const hashOf = (t) => { let h = 5381; for (const c of t) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h.toString(36); };
  const done = { ...((myProfile && myProfile.bucketDone) || {}) };
  const items = [];

  const renderBody = () => content.split("\n").map((line) => {
    const l = line.trim();
    if (!l) return "";
    if (l.startsWith("## ")) return `<h3 class="guide-sect" id="gs-${hashOf(l.slice(3))}">${esc(l.slice(3))}</h3>`;
    if (l.startsWith("- [ ] ") || l.startsWith("- [x] ")) {
      const text = l.slice(6).trim();
      const h = hashOf(text);
      if (!items.includes(h)) items.push(h);
      return `<label class="guide-item ${done[h] ? "done" : ""}"><input type="checkbox" data-h="${h}" ${done[h] ? "checked" : ""} ${currentUser ? "" : "disabled"} /><span>${renderRich(text)}</span></label>`;
    }
    if (l.startsWith("- ")) return `<p class="guide-line">•&nbsp; ${renderRich(l.slice(2))}</p>`;
    return `<p class="guide-line">${renderRich(l)}</p>`;
  }).join("");

  // Per-section progress (v0.108) - "Cities to visit 2/7" etc.
  const sectionStats = () => {
    const out = [];
    let cur = null;
    for (const line of content.split("\n")) {
      const l = line.trim();
      if (l.startsWith("## ")) { cur = { name: l.slice(3), total: 0, done: 0 }; out.push(cur); }
      else if ((l.startsWith("- [ ] ") || l.startsWith("- [x] ")) && cur) {
        cur.total++;
        if (done[hashOf(l.slice(6).trim())]) cur.done++;
      }
    }
    return out.filter((s) => s.total > 0);
  };

  const render = () => {
    items.length = 0;
    const bodyHtml = renderBody();
    const doneCount = items.filter((h) => done[h]).length;
    const sects = sectionStats();
    $app.innerHTML = `
      <h2 class="section-title">${mi("explore")} Ghent guide &amp; bucketlist</h2>
      ${items.length && currentUser ? `
      <div class="guide-progress">
        <div class="guide-bar"><div style="width:${items.length ? Math.round((doneCount / items.length) * 100) : 0}%"></div></div>
        <span class="form-hint">${doneCount}/${items.length} ticked off${doneCount === items.length && items.length ? " - you've done it ALL, legend 🏆" : ""}</span>
      </div>` : currentUser ? "" : `<p class="form-hint" style="margin:-6px 0 12px">Sign in to tick things off and keep your progress.</p>`}
      ${sects.length > 1 ? `
      <div class="filter-chips" style="margin:0 0 14px">
        ${sects.map((s) => `<button class="chip ${s.done >= s.total ? "active" : ""}" data-goto="gs-${hashOf(s.name)}" title="Jump to ${esc(s.name)}">${esc(s.name)} ${s.done}/${s.total}${s.done >= s.total ? " ✓" : ""}</button>`).join("")}
      </div>` : ""}
      <div class="form-card guide-card">${bodyHtml}</div>
      ${isAdmin ? `
      <div class="form-actions" style="justify-content:center;margin-top:16px">
        <button class="btn btn-ghost btn-sm btn-ink" id="guide-edit">${mi("edit", "sm")} Edit the guide (board)</button>
        <button class="btn btn-ghost btn-sm btn-ink" id="guide-reset">${mi("restart_alt", "sm")} Load the app's default list</button>
      </div>` : ""}
    `;
    $app.querySelectorAll("[data-goto]").forEach((b) => {
      b.addEventListener("click", () => document.getElementById(b.dataset.goto)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
    document.getElementById("guide-reset")?.addEventListener("click", async () => {
      if (!await appConfirm("Replace the current guide with the app's built-in list (survival, Ghent bucketlist, cities, beers, food, Erasmus experiences)? Items with the same text keep everyone's ticks.")) return;
      try {
        await setDoc(doc(db, "settings", "guide"), { content: DEFAULT_GUIDE, updatedBy: currentUser.uid, updatedAt: serverTimestamp() });
        content = DEFAULT_GUIDE;
        toast("Default guide loaded - tweak it further with Edit.", "success");
        render();
      } catch (err) { toast("Failed: " + err.message, "error"); }
    });
    $app.querySelectorAll(".guide-item input").forEach((cb) => {
      cb.onchange = async () => {
        const h = cb.dataset.h;
        done[h] = cb.checked;
        cb.closest(".guide-item").classList.toggle("done", cb.checked);
        try {
          await setDoc(doc(db, "users", currentUser.uid),
            { bucketDone: { [h]: cb.checked ? true : deleteField() } }, { merge: true });
          if (myProfile) myProfile.bucketDone = { ...(myProfile.bucketDone || {}), [h]: cb.checked };
          render();
        } catch (err) { toast("Could not save: " + err.message, "error"); }
      };
    });
    document.getElementById("guide-edit")?.addEventListener("click", async () => {
      const next = await appPrompt("Edit the guide. '## ' starts a section, '- [ ] item' is a checkable bucketlist item, '- item' a plain bullet. Links: [label](https://…) or [Codex](/codex).", {
        multiline: true, rows: 16, maxlength: 18000, value: content, okLabel: "Save guide",
      });
      if (next === null) return;
      try {
        await setDoc(doc(db, "settings", "guide"), { content: next.trim(), updatedBy: currentUser.uid, updatedAt: serverTimestamp() });
        content = next.trim();
        toast("Guide saved - live immediately.", "success");
        render();
      } catch (err) { toast("Save failed: " + err.message, "error"); }
    });
  };
  render();
}

// ------------------------------------------------------------
// ESNcard deals (v0.100) - partner discounts in Ghent. Board manages the
// cards on the page (logo, deal, location, website/Instagram, promoted).
// ------------------------------------------------------------
// Partnership follow-up fields (v0.119, mirrors the board's Excel):
// status, category, signing/end dates, stop reason, contact, notes.
const PARTNER_STATUSES = [
  ["active", "🟢 Active"], ["in-progress", "🔵 In progress"], ["contacted", "✉️ Contacted"],
  ["unknown", "🟠 Unknown"], ["stopped", "🔴 Stopped"], ["refused", "⚫ Refused"],
];
const PARTNER_TYPES = ["Bar / Resto", "Drinks / Food", "Transport", "Sport", "Healthcare / Beauty", "App", "Shop", "Hostel / Travel", "Other"];
const partnerStatus = (p) => p.status || "active"; // pre-v0.119 docs = active
const partnerStatusLabel = (p) => (PARTNER_STATUSES.find(([k]) => k === partnerStatus(p)) || PARTNER_STATUSES[0])[1];

// One-time import of the board's "Partnerships MAIN.xlsx" (26-27 sheet
// + the stopped/refused archive), curated 25/08/2026 - used by the
// Import button on /deals. Names already in Firestore are skipped.
const PARTNER_IMPORT = [{"name":"Donkey Republic","status":"in-progress","type":"Transport","shortInfo":"Biking rental, subscribtions...","location":"Gent & other european cities","deal":"Daily Rider (€8.5/ month, which includes 2 hours per day)","promo":"Need a bike? Check out Donkey Repiblic's ESN offers! 🚲 Rent a bike for 2h/day for only €8.5/month.","contactName":"Ivana Gracova (mogelijks niet meer up to date)","contactInfo":"ivana@donkeyrepublic.com","esncardUrl":"https://esncard.org/donkey-republic","website":"https://www.donkey.bike/cities/bike-rental-ghent"},{"name":"Kapsalon Ali","status":"unknown","type":"Healthcare / Beauty","shortInfo":"Hairdresser","location":"Wondelgemstraat 19, 9000 Gent","deal":"When showing a valid ESNcard, you'll get the following prices:\nMale: Haircut: €13, Shave: €7, Haircut + shave: €20","promo":"Need a haircut? Look no further, Kapsalon Ali is the place to be! 💇 Upon showing your ESNcard you can benefit from our discounts. How much will you pay (add overview). IMPORTANT: the hairdresser is on","contactName":"Ali Dogan","contactInfo":"+32487715333","esncardUrl":"https://esncard.org/discount/kapsalon-ali","website":"https://calendly.com/barber-ali/women?month=2023-04"},{"name":"Jims","status":"contacted","type":"Sport","shortInfo":"Fitness in Gent","location":"Overpoortstraat 49, 9000 Gent","deal":"Free trial pass for 1 day of free access to the fitness facilities\n \ntime           fitness    group   All-in\n12 weken  120         150      180\n16 weken  150         180      220 \n24 weken   220     ","promo":"What's it they say about a healthy mind and body? Thanks to our partnership with Jims Overpoort, you get a discount upon subscribing (overview).","contactInfo":"gent.overpoort@jimsfitness.com","esncardUrl":"https://esncard.org/discount/jims","website":"https://www.jimsfitness.be/","signed":"2022-01-01"},{"name":"Mayana","status":"contacted","type":"Bar / Resto","shortInfo":"Chocolate bar","location":"Sint-Pietersnieuwstraat 208, 9000 Gent","deal":"Brownies for on international dinner and discounts for students \nChocoholic actie: Bij elke warme chocolademelk krijg je twee slices brownie + topping + chocolade gratis. \nChocolate Junkie actie: Bij ","promo":"The best chocolatebased food and drinks in town.","contactName":"Lana","contactInfo":"Lana@mayana.be","website":"https://mayana.be/"},{"name":"Flixbus","status":"unknown","type":"Transport","shortInfo":"Green and smart mobility to experience the world.","location":"Kasteellaan 433a, 9000 Gent","deal":"With an ESNcard, you can claim up to 12 vouchers that give a 10% discount.","promo":"You don't always need to travel by plane! Flixbus takes you to some beautiful destinations. Even better: with your ESNcard you can claim up to 12 vouchers each worth a 10% discount","website":"https://global.flixbus.com/"},{"name":"Flibco","status":"unknown","type":"Transport","shortInfo":"20% + shuttle service","deal":"-0.2","promo":"Looking for an easy way to travel between Gent and the airport (Brussels-Zaventem and Charleroi)? Check out Flibco.com, claim your voucher and benefit from a 20% discount on your fare! You can use you","website":"https://www.flibco.com/en"},{"name":"Delirium","status":"unknown","type":"Drinks / Food","deal":"Buy a crat and get  a crat of beer for free. Only valid at the fabric itself.","promo":"this is mainly important for us board as the students dont really buy \"bakken\" to take home"},{"name":"Meat District","status":"unknown","type":"Drinks / Food","shortInfo":"burger place","location":"Ottergemsesteenweg 1, 9000 Gent","deal":"10% korting + 1 free menu of board","contactName":"Adrian","contactInfo":"+32485664460 (whatsapp)"},{"name":"Frituur Benji's","status":"unknown","type":"Drinks / Food","shortInfo":"Frituur","location":"Sint-Kwintensberg 56, 9000 Gent","deal":"10% korting","contactName":"Benji","contactInfo":"+32476603117\n info@frituur-benjis.be"},{"name":"Daskalidès","status":"unknown","type":"Drinks / Food","shortInfo":"Chocolatier","location":"HENEGOUWENSTRAAT 1,9000 GENTBELGIUM","deal":"0.1","contactName":"Donatienne Vancauwenberghe, Vestigingsverantwoordelijke","contactInfo":"HouseofDaskalides@daskalides.be"},{"name":"DeliLunch","status":"unknown","type":"Bar / Resto","deal":"0.1"},{"name":"Rock circus","status":"unknown","type":"Drinks / Food","shortInfo":"Bar","location":"Overpoortstraat 22, 9000 Gent","deal":"1 euro discount on housebeer"},{"name":"OnCampus Abroad","status":"contacted","type":"Other","shortInfo":"Insurance company","location":"Spain","deal":"Goodies for goodiebag and 10% discount with welcome10 code","contactName":"Marta Silvia","contactInfo":"marta.silva@oncampusabroad.com"},{"name":"Albert Heijn","status":"contacted","type":"Drinks / Food","shortInfo":"Supermarket","location":"Gent","deal":"Goodies for goodiebag","contactName":"Milano (alumnia) of Max (manager van AH Korenmarkt)","contactInfo":"max.lacante@ah.nl"},{"name":"Crazy Tiger","status":"contacted","type":"Drinks / Food","shortInfo":"Energy drink","location":"Da Vincilaan 9, 1930 Zaventem","deal":"1512 free energy drinks for in our goodiebags + 60 times 1l bottles for party","promo":"Find a crazy tiger energy drink in each goodiebag! There are 2 flavours available: regular and cherry","contactName":"Marie Vandendriessche","contactInfo":"CrazyTigerBeLux@royalunibrew.com (contact 2026) Marie.Vandendriessche@solerabeverages.be (contact 2025)"},{"name":"Scoutmymove","status":"in-progress","type":"Other","shortInfo":"Website where you can request someone to check out a possible dorm","location":"Based in Luxembourgh","deal":"20% of the first visit for ESNcard holders + chances for volunteers to earn €20 or more/ visit","promo":"The deposit is paid. The flat does not exist.\n\nIt happens to Erasmus students every year. A verified local Scout confirms the flat is real before you send a cent.","contactName":"Elyot","contactInfo":"contact@scoutmymove.com","website":"https://www.scoutmymove.com/","signed":"2026-09-01"},{"name":"Knaek","status":"contacted","type":"App","shortInfo":"App with student discounts","location":"Belgium & Netherlands","deal":"Coupons to use app for free","promo":"Student life can be expensive from time to time right? We know 🥹\nBut don't worry, we've got your back!\nESN Gent partnered up with Knaek, THE student discount app. 🤩\nKnaek gives you the highest and mos","contactName":"Sofie| Knaek Gent","contactInfo":"info@knaek.be / sofie@knaek.be\ngent@knaekapp.be (niet meer in gebruik)","esncardUrl":"https://esncard.org/discount/knaek-studentapp","website":"https://www.knaek.com/"},{"name":"De Geus van Gent","status":"in-progress","type":"Bar / Resto","shortInfo":"Bar","location":"Kantienberg 9, 9000 Gent","contactName":"David Vandenbossche","contactInfo":"geusvangent@gmail.com","website":"Geuzenhuis | Home - Geuzenhuis"},{"name":"Porter House","status":"in-progress","type":"Bar / Resto","shortInfo":"Bar","location":"Stalhof 1, 9000 Gent","contactName":"Arno, Mathias","contactInfo":"Groepschat WhatsApp","website":"Porterhouse – Danscafé in irish pub stijl"},{"name":"Schaakclub de Mercatel","status":"active","type":"Sport","shortInfo":"Chess initiations","location":"Halvemaanstraat 92, 9040 Gent","deal":"Free chess initiations for students with presentation","contactName":"Guy Burssens","contactInfo":"guy.burssens@gmail.com","website":"https://www.demercatel.be/"},{"name":"Decathlon Gent","status":"contacted","type":"Sport","shortInfo":"Sports shop","location":"Vliegtuiglaan 8, 9000 Gent","website":"Sportwinkel in Gent | Decathlon"},{"name":"Brouwerij Van Steenberge","status":"contacted","type":"Bar / Resto","shortInfo":"Brewery","location":"Lindenlaan 25, 9940 Evergem","deal":"One free brewery visit / each year. Discount?","website":"https://www.vansteenberge.com/"},{"name":"Bar coda","status":"stopped","type":"Bar / Resto","deal":"Gave us discount coupons for coffee ONLY during afternoon","endReason":"Only wanted to give a discount if we did byweekly events + promoted 1 event a week. Otherwise only a discount during the events organised there. Called ESN difficult to work with and upset multiple bo"},{"name":"De Vrolijke Viking","status":"stopped","type":"Bar / Resto","shortInfo":"De Vrolijke Viking, or the happy viking is a Norse themed bar that specialises in mead, boardgames and awesomeness. Located on crawling dist","location":"Voskenslaan 67, 9000 Gent","deal":"Reduction is -€0,50 on jupiler, pepsi, pepsi max, mirinda & 7Up","promo":"Do you like to play boardgames with your friends? De Vrolijke Viking, a Norse-themed bar is the ideal spot to go! Enjoy the ESN discounts upon showing your valid ESNcard. Get a discount of €0,50 of be","contactName":"Nils","contactInfo":"info@devrolijkeviking.be","esncardUrl":"https://esncard.org/discount/de-vrolijke-viking","ended":"2025-09-01","endReason":"Do not want to do any fixed discounts anymore for student organisations. Are still open to a discount when we organise an event there"},{"name":"Bier Central","status":"stopped","type":"Bar / Resto","shortInfo":"Bar in the city center","location":"Botermarkt 11, 9000 Gent","deal":"When showing a valid ESNcard, you'll get the following prices:\n\nValid on Sunday-, Monday- and Tuesday evening : \n\nCristal 25cl = €2,50\nCristal 50cl = €5\nSpecial beers (33 choices) 50cl = €6,50\nValid a","esncardUrl":"https://esncard.org/discount/bier-central","endReason":"Stopped 2022-2023. Didn't act on their promises, 'forgot'' to give discounts"},{"name":"Bocca","status":"refused","type":"Drinks / Food","shortInfo":"Pasta","location":"Gent","contactName":"Merlijn Mestdagh","contactInfo":"merlijn@bocca.be","endReason":"Stopped 2023-2024. No Sponsorbudget in 2023-2024 due to new store"},{"name":"Uppelink","status":"stopped","type":"Hostel / Travel","shortInfo":"Hostel & kayak","deal":"-10% on Kayak and Hostel","endReason":"Stopped 2023-2024. No longer Int partners"},{"name":"De Lijn","status":"refused","type":"Transport","endReason":"Stopped 2023-2024. "},{"name":"Twitch","status":"stopped","type":"Bar / Resto","shortInfo":"Club at overpoort.","location":"Overpoortstraat 9, 9000 Gent","deal":"Free entrance to our parties and a happy hour on everything from 00:00 till 01:00 (everything you order gets doubled during this period) when you show your ESNcard.","promo":"Like to party? Twitch is the place to be! Especially when ESN is organizing the party! 😎 Bring your valid ESNcard and enjoy special promotions. Enter our parties for free and get discounts at our ESN ","contactName":"Randy Deschryver","endReason":"Stopped 2023-2024. Closed"},{"name":"Patrick Foley's","status":"stopped","type":"Bar / Resto","shortInfo":"Irish Pub & food","location":"Recollettenlei 10, 9000 Gent","deal":"If you show a valid ESNcard, you'll get: The classic burgers (Cheese and Bacon, Chicken Piri Piri, Old Goat, Vegan Delight) at a discounted price of €12.    Discounted price of €3,50 for a standard Ju","promo":"The best Irish pub in town. Show your valid ESNcard and get a delicious classic burger for €12, and pay only €3,50 for a large beer (Jupiler, 50cl)","contactName":"Alex","contactInfo":"info@foleys.be","esncardUrl":"https://esncard.org/discount/patrick-foleys","endReason":"Stopped 2023-2024. didn't want to offer discounts - 'forgot' to give them anyways"},{"name":"La Cikketteria","status":"stopped","type":"Bar / Resto","shortInfo":"Bar at overpoort (also serves food)\nPre drinks","location":"Overpoortstraat 8, 9000 Gent","deal":"Lunch: €10 luch (soup + toast/ quiche + 25xl stella/soft) or €12 Lasagne/pasta\nEvening: €5 for 3 beers, 1 beer + 1 toast for €3,5","promo":"Located in the heart of the student area you can find La Cikketteria. With your valid ESNcard you can get 3 beers for €5 or a beer and toast for €3,5, the ideal spot for predrinks ;). During lunchtime","contactName":"Sonia Tullo","contactInfo":"soniatullo42@gmail.com","endReason":"Stopped 2022-2023. Closed"},{"name":"Hawaian Poke Bowl","status":"refused","type":"Bar / Resto","shortInfo":"Poke Bowls","location":"Vlaanderenstraat 116\n\nKalandestraat 1","contactInfo":"https://hawaiianpokebowl.be/"},{"name":"Babu","status":"unknown","type":"Drinks / Food"},{"name":"Amadeus","status":"unknown","type":"Bar / Resto"},{"name":"Quicksolutions","status":"unknown","type":"Other"},{"name":"Orange","status":"unknown","type":"Other"},{"name":"BOOOT","status":"unknown","type":"Transport"},{"name":"SPHINX cinema","status":"unknown","type":"Other"},{"name":"Hopduvel Gent","status":"unknown","type":"Drinks / Food"},{"name":"Basic Italian","status":"unknown","type":"Bar / Resto"},{"name":"Holy Guacamoly","status":"unknown","type":"Bar / Resto"},{"name":"Izy Coffee","status":"unknown","type":"Bar / Resto"},{"name":"Have a roll","status":"unknown","type":"Bar / Resto"},{"name":"Guido Gids","status":"refused","type":"Other","endReason":"The offer is not interesting -> if they'll contact us again: still no"},{"name":"Swapfiets","status":"stopped"},{"name":"T Hamburgertje Bij Ertan","status":"stopped","type":"Bar / Resto","location":"Overpoortstraat 9, 9000 Gent","deal":"-€0.50 on everything","promo":"In need of a burger during a night out? Ertan is the place to be! Show your ESNcard and get a discount of €0,50 on everything!","endReason":"unclear - fewer students due to move to Kofschip?","shortInfo":"Hamburger place in Overpoort"},{"name":"Bar Jan Cremer","status":"unknown","type":"Bar / Resto"}];

async function viewDeals() {
  setLoading();
  let partners = [];
  try {
    partners = (await getDocs(collection(db, "partners"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { $app.innerHTML = errorState(e.message); return; }
  const statusRank = (p) => PARTNER_STATUSES.findIndex(([k]) => k === partnerStatus(p));
  partners.sort((a, b) => (b.promoted === true) - (a.promoted === true) || statusRank(a) - statusRank(b) || (a.name || "").localeCompare(b.name || ""));

  const render = () => {
    $app.innerHTML = `
      <h2 class="section-title">${mi("sell")} ESNcard deals</h2>
      <p class="form-hint" style="margin:-6px 0 14px">Show your ESNcard (in the <a href="/account">app</a>) to claim these - and check <a href="https://esncard.org/discounts" target="_blank" rel="noopener">esncard.org</a> for international deals.</p>
      ${isAdmin ? `
      <div class="form-actions" style="margin:0 0 12px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-cyan btn-sm" id="pt-new">${mi("add", "sm")} Add partner</button>
        ${PARTNER_IMPORT.some((ip) => !partners.some((p) => (p.name || "").toLowerCase() === ip.name.toLowerCase())) ? `<button class="btn btn-ghost btn-sm btn-ink" id="pt-import">${mi("upload_file", "sm")} Import from the partnerships Excel</button>` : ""}
        <button class="btn btn-sm btn-ghost btn-ink" id="pt-view">${dealsPrefs.view === "cards" ? `${mi("view_list", "sm")} List view` : `${mi("grid_view", "sm")} Card view`}</button>
        <span class="form-hint">${partners.filter((p) => partnerStatus(p) === "active").length} active (shown to students) · ${partners.filter((p) => partnerStatus(p) !== "active").length} in follow-up (board only)</span>
      </div>
      <div class="filter-bar" style="margin:0 0 10px">
        <input id="pt-q" type="search" placeholder="Search partners, deals, contacts, notes…" value="${esc(dealsPrefs.q)}" />
        <div class="filter-chips" id="pt-status-chips">
          <button class="chip ${dealsPrefs.status === "all" ? "active" : ""}" data-st="all">All (${partners.length})</button>
          ${PARTNER_STATUSES.map(([k, l]) => {
            const n = partners.filter((p) => partnerStatus(p) === k).length;
            return n ? `<button class="chip ${dealsPrefs.status === k ? "active" : ""}" data-st="${k}">${l} (${n})</button>` : "";
          }).join("")}
        </div>
      </div>
      <div class="form-actions" style="margin:0 0 14px;align-items:center;flex-wrap:wrap">
        <select id="pt-type-f" class="inline-input">
          <option value="all">All categories</option>
          ${PARTNER_TYPES.map((t) => `<option value="${t}" ${dealsPrefs.type === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <select id="pt-group" class="inline-input">
          <option value="status" ${dealsPrefs.group === "status" ? "selected" : ""}>Group by status</option>
          <option value="type" ${dealsPrefs.group === "type" ? "selected" : ""}>Group by category</option>
          <option value="none" ${dealsPrefs.group === "none" ? "selected" : ""}>No grouping</option>
        </select>
      </div>
      <div id="pt-form-box"></div>` : ""}
      <div id="pt-list"></div>
    `;

    // Card & row builders share the same .pt-edit/.pt-del hooks.
    const card = (p) => `
      <div class="deal-card ${p.promoted ? "promoted" : ""}" ${isAdmin && partnerStatus(p) !== "active" ? `style="opacity:.75"` : ""}>
        ${p.promoted ? `<span class="deal-flag">${mi("star", "sm")} Deal of the moment</span>` : ""}
        <div class="deal-head">
          ${p.logo ? `<img class="deal-logo" src="${esc(p.logo)}" alt="" loading="lazy" />` : `<span class="deal-logo deal-logo-ph">${esc((p.name || "?")[0].toUpperCase())}</span>`}
          <strong>${esc(p.name || "")}</strong>
        </div>
        <p class="deal-text">${esc(p.deal || "")}</p>
        ${p.location ? `<p class="form-hint">${mi("location_on", "sm")} <a href="${mapsSearchUrl(p.location)}" target="_blank" rel="noopener">${esc(p.location)}</a></p>` : ""}
        ${isAdmin ? `
        <div class="form-hint" style="border-top:1px dashed var(--border);margin-top:8px;padding-top:8px">
          <strong>${partnerStatusLabel(p)}</strong>${p.type ? ` · ${esc(p.type)}` : ""}${p.signedAt ? ` · signed ${fmtDate(p.signedAt)}` : ""}${p.endedAt ? ` · ended ${fmtDate(p.endedAt)}` : ""}
          ${p.contactName || p.contactInfo ? `<br>${mi("person", "sm")} ${esc([p.contactName, p.contactInfo].filter(Boolean).join(" · "))}` : ""}
          ${p.endReason ? `<br>${mi("info", "sm")} ${esc(p.endReason)}` : ""}
          ${p.notes ? `<br>${mi("edit_note", "sm")} ${esc(p.notes)}` : ""}
        </div>` : ""}
        <div class="form-actions" style="margin-top:auto">
          ${p.website ? `<a class="btn btn-sm btn-ghost btn-ink" href="${esc(p.website)}" target="_blank" rel="noopener">${mi("language", "sm")} Website</a>` : ""}
          ${p.instagram ? `<a class="btn btn-sm btn-ghost btn-ink" href="${esc(p.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ""}
          ${p.esncardUrl && isAdmin ? `<a class="btn btn-sm btn-ghost btn-ink" href="${esc(p.esncardUrl)}" target="_blank" rel="noopener">esncard.org ↗</a>` : ""}
          ${isAdmin ? `
          <button class="btn btn-sm btn-ghost btn-ink pt-edit" data-id="${p.id}">${mi("edit", "sm")}</button>
          <button class="btn btn-sm btn-ghost pt-del" data-id="${p.id}" style="color:var(--esn-magenta)">${mi("delete", "sm")}</button>` : ""}
        </div>
      </div>`;
    const tableHtml = (items) => `
      <div class="table-wrap cards"><table>
        <thead><tr><th>Partner</th><th>Status</th><th>Deal</th><th>Contact</th><th>Dates</th><th></th></tr></thead>
        <tbody>${items.map((p) => `
          <tr ${p.notes ? `title="${esc(p.notes)}"` : ""} ${partnerStatus(p) !== "active" ? `style="opacity:.85"` : ""}>
            <td class="card-main"><strong>${esc(p.name || "")}</strong>${p.promoted ? " ⭐" : ""}<br><small class="form-hint">${esc(p.type || "")}${p.location ? ` · ${esc(p.location)}` : ""}</small></td>
            <td data-l="Status" style="white-space:nowrap">${partnerStatusLabel(p)}</td>
            <td data-l="Deal"><small>${esc((p.deal || "").slice(0, 90))}${(p.deal || "").length > 90 ? "…" : ""}</small></td>
            <td data-l="Contact"><small>${esc(p.contactName || "")}${p.contactName && p.contactInfo ? "<br>" : ""}${esc(p.contactInfo || "")}</small></td>
            <td data-l="Dates"><small>${p.signedAt ? `signed ${fmtDate(p.signedAt)}` : ""}${p.signedAt && (p.endedAt || p.endReason) ? "<br>" : ""}${p.endedAt ? `ended ${fmtDate(p.endedAt)} ` : ""}${p.endReason ? esc(p.endReason.slice(0, 60)) : ""}</small></td>
            <td class="card-actions" style="white-space:nowrap">
              ${p.website ? `<a class="btn btn-sm btn-ghost btn-ink" href="${esc(p.website)}" target="_blank" rel="noopener" title="Website">${mi("language", "sm")}</a>` : ""}
              ${p.esncardUrl ? `<a class="btn btn-sm btn-ghost btn-ink" href="${esc(p.esncardUrl)}" target="_blank" rel="noopener" title="esncard.org">${mi("badge", "sm")}</a>` : ""}
              <button class="btn btn-sm btn-ghost btn-ink pt-edit" data-id="${p.id}">${mi("edit", "sm")}</button>
              <button class="btn btn-sm btn-ghost pt-del" data-id="${p.id}" style="color:var(--esn-magenta)">${mi("delete", "sm")}</button>
            </td>
          </tr>`).join("")}</tbody>
      </table></div>`;

    // Search / filter / group / view (v0.121, board): students always get
    // the simple card grid of ACTIVE partners.
    const renderList = () => {
      const box = document.getElementById("pt-list");
      let shown = isAdmin ? [...partners] : partners.filter((p) => partnerStatus(p) === "active");
      if (isAdmin) {
        const q = dealsPrefs.q.trim().toLowerCase();
        if (q) shown = shown.filter((p) => `${p.name || ""} ${p.deal || ""} ${p.contactName || ""} ${p.contactInfo || ""} ${p.notes || ""} ${p.type || ""} ${p.location || ""} ${p.endReason || ""}`.toLowerCase().includes(q));
        if (dealsPrefs.status !== "all") shown = shown.filter((p) => partnerStatus(p) === dealsPrefs.status);
        if (dealsPrefs.type !== "all") shown = shown.filter((p) => (p.type || "Other") === dealsPrefs.type);
      }
      if (!shown.length) {
        box.innerHTML = `<div class="empty-state"><div class="big">${mi("sell")}</div><p>${partners.length ? "No partners match your search or filters." : "No deals listed yet - the board is out negotiating. 😉"}</p></div>`;
        return;
      }
      let groups;
      if (!isAdmin || dealsPrefs.group === "none") {
        groups = [{ label: null, items: shown }];
      } else if (dealsPrefs.group === "type") {
        const m = {};
        shown.forEach((p) => { (m[p.type || "Other"] ??= []).push(p); });
        groups = Object.keys(m).sort().map((k) => ({ label: k, items: m[k] }));
      } else {
        groups = PARTNER_STATUSES.map(([k, l]) => ({ label: l, items: shown.filter((p) => partnerStatus(p) === k) })).filter((g) => g.items.length);
      }
      box.innerHTML = groups.map((g) => `
        ${g.label ? `<h3 class="group-title">${g.label} · ${g.items.length}</h3>` : ""}
        ${isAdmin && dealsPrefs.view === "list" ? tableHtml(g.items) : `<div class="deals-grid">${g.items.map(card).join("")}</div>`}`).join("");
      box.querySelectorAll(".pt-edit").forEach((b) => { b.onclick = () => { showForm(partners.find((x) => x.id === b.dataset.id)); window.scrollTo(0, 0); }; });
      box.querySelectorAll(".pt-del").forEach((b) => {
        b.onclick = async () => {
          if (!await appConfirm("Remove this partner from the deals page?")) return;
          try {
            await deleteDoc(doc(db, "partners", b.dataset.id));
            partners = partners.filter((x) => x.id !== b.dataset.id);
            toast("Removed.", "success");
            render();
          } catch (err) { toast("Delete failed: " + err.message, "error"); }
        };
      });
    };
    renderList();

    // Toolbar wiring (board): search re-renders only the list → focus stays.
    document.getElementById("pt-q")?.addEventListener("input", (e) => { dealsPrefs.q = e.target.value; renderList(); });
    document.querySelectorAll("#pt-status-chips .chip").forEach((c) => {
      c.onclick = () => {
        dealsPrefs.status = c.dataset.st;
        document.querySelectorAll("#pt-status-chips .chip").forEach((b) => b.classList.toggle("active", b === c));
        renderList();
      };
    });
    document.getElementById("pt-type-f")?.addEventListener("change", (e) => { dealsPrefs.type = e.target.value; renderList(); });
    document.getElementById("pt-group")?.addEventListener("change", (e) => { dealsPrefs.group = e.target.value; renderList(); });
    document.getElementById("pt-view")?.addEventListener("click", () => { dealsPrefs.view = dealsPrefs.view === "cards" ? "list" : "cards"; render(); });

    const showForm = (existing) => {
      const box = document.getElementById("pt-form-box");
      box.innerHTML = `
        <div class="form-card" style="margin-bottom:18px">
          <div class="form-grid">
            <div class="form-field"><label for="pt-name">Partner name *</label>
              <input id="pt-name" maxlength="90" value="${esc(existing?.name || "")}" /></div>
            <div class="form-field"><label for="pt-location">Location</label>
              <input id="pt-location" maxlength="140" placeholder="Overpoortstraat 1, Gent" value="${esc(existing?.location || "")}" /></div>
            <div class="form-field full"><label for="pt-deal">The deal *</label>
              <input id="pt-deal" maxlength="200" placeholder="e.g. 20% off all pizzas with your ESNcard" value="${esc(existing?.deal || "")}" /></div>
            <div class="form-field"><label for="pt-website">Website</label>
              <input id="pt-website" type="url" maxlength="200" placeholder="https://…" value="${esc(existing?.website || "")}" /></div>
            <div class="form-field"><label for="pt-instagram">Instagram</label>
              <input id="pt-instagram" type="url" maxlength="200" placeholder="https://instagram.com/…" value="${esc(existing?.instagram || "")}" /></div>
            <div class="form-field"><label for="pt-logo">Logo (square works best)</label>
              <input id="pt-logo" type="file" accept="image/*" /></div>
            <div class="form-field"><label class="checkbox-row" style="margin-top:22px"><input type="checkbox" id="pt-promoted" ${existing?.promoted ? "checked" : ""} /> Promote (pinned on top with a star)</label></div>
            <div class="form-field"><label for="pt-status">Status ${hintIcon("Only ACTIVE partnerships appear to students on this page and on the homepage - everything else is the board's follow-up pipeline, visible here only.")}</label>
              <select id="pt-status">${PARTNER_STATUSES.map(([k, l]) => `<option value="${k}" ${(existing ? partnerStatus(existing) : "active") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
            <div class="form-field"><label for="pt-type">Category</label>
              <select id="pt-type"><option value="">-</option>${PARTNER_TYPES.map((t) => `<option value="${t}" ${existing?.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
            <div class="form-field"><label for="pt-signed">Signing date</label>
              <input id="pt-signed" type="date" value="${existing?.signedAt ? toDate(existing.signedAt).toISOString().slice(0, 10) : ""}" /></div>
            <div class="form-field"><label for="pt-ended">End date ${hintIcon("Only for stopped/refused partnerships - when it ended.")}</label>
              <input id="pt-ended" type="date" value="${existing?.endedAt ? toDate(existing.endedAt).toISOString().slice(0, 10) : ""}" /></div>
            <div class="form-field"><label for="pt-contact">Contact person</label>
              <input id="pt-contact" maxlength="90" placeholder="e.g. Ali Dogan" value="${esc(existing?.contactName || "")}" /></div>
            <div class="form-field"><label for="pt-contactinfo">Contact e-mail / phone</label>
              <input id="pt-contactinfo" maxlength="140" placeholder="name@partner.be / +32…" value="${esc(existing?.contactInfo || "")}" /></div>
            <div class="form-field"><label for="pt-esncard">esncard.org link</label>
              <input id="pt-esncard" type="url" maxlength="200" placeholder="https://esncard.org/…" value="${esc(existing?.esncardUrl || "")}" /></div>
            <div class="form-field"><label for="pt-endreason">Stop / refusal reason</label>
              <input id="pt-endreason" maxlength="200" placeholder="e.g. no sponsor budget this year" value="${esc(existing?.endReason || "")}" /></div>
            <div class="form-field full"><label for="pt-notes">Follow-up notes (board only)</label>
              <textarea id="pt-notes" rows="2" maxlength="500" placeholder="To do, renewal date, who follows up…">${esc(existing?.notes || "")}</textarea></div>
          </div>
          <div class="form-actions">
            <button class="btn btn-green btn-sm" id="pt-save">${existing ? "Save changes" : "Add partner"}</button>
            <button class="btn btn-ghost btn-sm btn-danger" id="pt-cancel">Cancel</button>
          </div>
        </div>`;
      document.getElementById("pt-cancel").onclick = () => { box.innerHTML = ""; };
      document.getElementById("pt-save").onclick = async (e) => {
        const name = document.getElementById("pt-name").value.trim();
        const deal = document.getElementById("pt-deal").value.trim();
        if (!name || !deal) { toast("Name and deal are required.", "warn"); return; }
        e.target.disabled = true;
        try {
          let logo = existing?.logo || null;
          const file = document.getElementById("pt-logo").files[0];
          if (file) logo = await storeImage(await compressImage(file), "partners");
          const data = {
            name, deal,
            location: document.getElementById("pt-location").value.trim() || null,
            website: document.getElementById("pt-website").value.trim() || null,
            instagram: document.getElementById("pt-instagram").value.trim() || null,
            logo,
            promoted: document.getElementById("pt-promoted").checked,
            // Follow-up details (v0.119, mirrors the partnerships Excel)
            status: document.getElementById("pt-status").value || "active",
            type: document.getElementById("pt-type").value || null,
            signedAt: (() => { const v = document.getElementById("pt-signed").value; return v ? Timestamp.fromDate(new Date(`${v}T12:00`)) : null; })(),
            endedAt: (() => { const v = document.getElementById("pt-ended").value; return v ? Timestamp.fromDate(new Date(`${v}T12:00`)) : null; })(),
            endReason: document.getElementById("pt-endreason").value.trim() || null,
            contactName: document.getElementById("pt-contact").value.trim() || null,
            contactInfo: document.getElementById("pt-contactinfo").value.trim() || null,
            esncardUrl: document.getElementById("pt-esncard").value.trim() || null,
            notes: document.getElementById("pt-notes").value.trim() || null,
            updatedAt: serverTimestamp(),
          };
          if (existing) {
            await updateDoc(doc(db, "partners", existing.id), data);
            Object.assign(partners.find((x) => x.id === existing.id), data);
          } else {
            const ref = await addDoc(collection(db, "partners"), { ...data, createdAt: serverTimestamp() });
            partners.push({ id: ref.id, ...data });
          }
          partners.sort((a, b) => (b.promoted === true) - (a.promoted === true) || statusRank(a) - statusRank(b) || (a.name || "").localeCompare(b.name || ""));
          toast("Saved.", "success");
          render();
        } catch (err) { toast("Save failed: " + err.message, "error"); e.target.disabled = false; }
      };
    };

    // One-time Excel import (v0.120): adds every partner from the sheet that
    // doesn't exist yet (matched by name) with status/type/dates/contact -
    // students still only see the ACTIVE ones, so importing is safe.
    document.getElementById("pt-import")?.addEventListener("click", async (e) => {
      const missing = PARTNER_IMPORT.filter((ip) => !partners.some((p) => (p.name || "").toLowerCase() === ip.name.toLowerCase()));
      if (!missing.length) { toast("Everything from the Excel is already in.", "success"); return; }
      if (!await appConfirm(`Import ${missing.length} partner${missing.length === 1 ? "" : "s"} from the partnerships Excel? Existing names are skipped, and only ACTIVE ones ever show to students - review statuses afterwards.`)) return;
      const btn = e.currentTarget || document.getElementById("pt-import");
      if (btn) btn.disabled = true;
      let added = 0;
      const failed = [];
      try {
        for (const ip of missing) {
          const docData = {
            name: (ip.name || "").slice(0, 99),
            deal: ip.deal || ip.promo || ip.shortInfo || "-",
            location: ip.location || null,
            website: ip.website || null,
            instagram: null, logo: null, promoted: false,
            status: ip.status || "unknown",
            type: ip.type || null,
            signedAt: ip.signed ? Timestamp.fromDate(new Date(`${ip.signed}T12:00`)) : null,
            endedAt: ip.ended ? Timestamp.fromDate(new Date(`${ip.ended}T12:00`)) : null,
            endReason: ip.endReason || null,
            contactName: ip.contactName || null,
            contactInfo: ip.contactInfo || null,
            esncardUrl: ip.esncardUrl || null,
            notes: [ip.shortInfo, ip.promo && ip.deal ? `Promo: ${ip.promo}` : null].filter(Boolean).join(" · ").slice(0, 500) || null,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          };
          // One bad row must not stop the rest (v0.128) - collect and report.
          try {
            const ref = await addDoc(collection(db, "partners"), docData);
            partners.push({ id: ref.id, ...docData });
            added++;
          } catch { failed.push(ip.name); }
        }
        partners.sort((a, b) => (b.promoted === true) - (a.promoted === true) || statusRank(a) - statusRank(b) || (a.name || "").localeCompare(b.name || ""));
        toast(`${added} partner${added === 1 ? "" : "s"} imported${failed.length ? ` - ${failed.length} skipped (${failed.slice(0, 3).join(", ")}${failed.length > 3 ? ", …" : ""})` : ""} - review the statuses (only ACTIVE ones show to students).`, failed.length ? "warn" : "success");
        render();
      } catch (err) {
        toast(`Import stopped after ${added}: ${err.message} - click again to continue with the rest.`, "error");
        if (btn) btn.disabled = false;
        render();
      }
    });
    document.getElementById("pt-new")?.addEventListener("click", () => showForm(null));
  };
  render();
}

// AI features (settings/ai) - master switch + model, board-only tools.
// The assistant is called Jacob, after the ESN Gent mascot (the purple
// dragon) - all AI UI wears his face so it's obvious what's machine-made.
const aiConfig = { enabled: false, model: "gemini-3.6-flash" };
const jacobImg = (cls = "jacob-sm") => `<img src="/jacob.png" alt="" class="${cls}" aria-hidden="true" />`;
const jacobCard = (html, hint) => `
  <div class="jacob-card">${jacobImg("jacob-lg")}<div class="rich" style="min-width:0">${html}</div></div>
  ${hint ? `<p class="form-hint" style="margin:4px 0 0">${hint}</p>` : ""}`;
(async () => {
  try {
    const s = await getDoc(doc(db, "settings", "ai"));
    if (s.exists()) {
      aiConfig.enabled = s.data().enabled === true;
      if (typeof s.data().model === "string" && s.data().model.trim()) aiConfig.model = s.data().model.trim();
    }
  } catch { /* stays off */ }
})();

// Custom student FAQ (settings/faq) - empty = the built-in FAQ is used.
let faqCustom = null;
(async () => {
  try {
    const s = await getDoc(doc(db, "settings", "faq"));
    if (s.exists() && Array.isArray(s.data().items) && s.data().items.length) faqCustom = s.data().items;
  } catch { /* built-in FAQ stands */ }
})();
(async () => {
  try {
    const s = await getDoc(doc(db, "settings", "events"));
    if (s.exists()) {
      const d = s.data();
      if (typeof d.defaultCancelHours === "number" && d.defaultCancelHours >= 0) eventDefaults.defaultCancelHours = d.defaultCancelHours;
      if (typeof d.defaultRefundFee === "number" && d.defaultRefundFee >= 0) eventDefaults.defaultRefundFee = d.defaultRefundFee;
      if (typeof d.waitlistHours === "number" && d.waitlistHours >= 1 && d.waitlistHours <= 168) eventDefaults.waitlistHours = d.waitlistHours;
    }
  } catch { /* defaults stand */ }
})();
(async () => {
  try {
    const snap = await getDoc(doc(db, "settings", "esncard"));
    if (snap.exists()) {
      const d = snap.data();
      if (Number.isFinite(d.priceStudent) && d.priceStudent >= 0) cardPricing.student = d.priceStudent;
      if (Number.isFinite(d.priceVolunteer) && d.priceVolunteer >= 0) cardPricing.volunteer = d.priceVolunteer;
      if (Number.isFinite(d.validityMonths) && d.validityMonths >= 1) cardPricing.validityMonths = d.validityMonths;
      if (typeof d.proofRequired === "boolean") cardPricing.proofRequired = d.proofRequired;
      if (typeof d.acceptAvailable === "boolean") cardPricing.acceptAvailable = d.acceptAvailable;
      if (typeof d.cashEnabled === "boolean") cardPricing.cashEnabled = d.cashEnabled;
    }
  } catch { /* defaults are fine */ }
})();

function myCardPrice() {
  if (["superadmin", "board", "finance", "advisory", "alumnicoord"].includes(myRole)) return 0;
  if (myRole === "volunteer" || isAlumni()) return cardPricing.volunteer;
  return cardPricing.student;
}

// ------------------------------------------------------------
// Push notifications (v0.81) - FCM web push.
// The VAPID public key is pasted once by the superadmin (Team tab)
// and stored in settings/push; without it, all push UI stays hidden.
// Preferences live on the user profile (notifyPrefs - a category is
// ON unless explicitly false); tokens in pushTokens/{token}.
// ------------------------------------------------------------
const PUSH_CATEGORIES = [
  ["tickets", "My tickets & orders", "Ticket confirmed, refund decided, order paid, event cancelled"],
  ["reminders", "Event reminders", "A push 3 hours before an event you're attending starts"],
  ["newEvents", "New events", "When ESN Gent publishes a new event"],
  ["news", "News & announcements", "When the board publishes a news update"],
  ["waitlist", "Waitlist", "When a spot opens up on an event you're waitlisted for"],
  ["esncard", "ESNcard", "Payment received, card ready for pickup, application decisions"],
  ["shifts", "Shift reminders (team)", "A push the day before an event you have a shift at"],
  ["contact", "Contact messages", "When the board replies to a message you sent them"],
  ["birthday", "Birthday wishes", "A happy birthday from ESN Gent on your big day"],
];
// Organisation info (v0.86) - office address, hours and contact e-mail are
// Official brand glyphs (simple-icons, 24x24) for the footer social row.
const BRAND_PATHS = {
  instagram: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
  facebook: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  tiktok: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  youtube: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  discord: "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z",
  whatsapp: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
};
function brandIcon(name) {
  return BRAND_PATHS[name]
    ? `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${BRAND_PATHS[name]}"/></svg>`
    : mi("language");
}

// DATA, not code: editable in Admin → Settings (settings/org), because they
// change over semesters/boards. These are only the fallback defaults.
const orgInfo = {
  officeAddress: "Home Canterbury common room, Stalhof 6, Ghent",
  officeHoursText: "announced on the Office page",
  contactEmail: "esn.gent@gmail.com",

  socialWebsite: "https://www.esngent.org",
  socialInstagram: "",
  socialFacebook: "",
  socialTiktok: "",
  socialYoutube: "",
  socialDiscord: "",
  socialWhatsapp: "",
};

// Footer social row: only links the board actually filled in are shown.
const SOCIAL_DEFS = [
  ["socialWebsite", "Website", "website"],
  ["socialInstagram", "Instagram", "instagram"],
  ["socialFacebook", "Facebook", "facebook"],
  ["socialTiktok", "TikTok", "tiktok"],
  ["socialYoutube", "YouTube", "youtube"],
  ["socialDiscord", "Discord", "discord"],
  ["socialWhatsapp", "WhatsApp", "whatsapp"],
];
function socialIconsHtml(cls) {
  const links = SOCIAL_DEFS.filter(([k]) => (orgInfo[k] || "").trim())
    .map(([k, label, icon]) => `<a href="${esc(orgInfo[k])}" target="_blank" rel="noopener" title="${label}" aria-label="${label}">${icon === "website" ? mi("language") : brandIcon(icon)}</a>`);
  return links.length ? `<div class="${cls || "socials-row"}">${links.join("")}</div>` : "";
}
function applyOrgInfo() {
  const em = document.getElementById("footer-email");
  if (em) { em.textContent = orgInfo.contactEmail; em.href = `mailto:${orgInfo.contactEmail}`; }
  const of = document.getElementById("footer-office");
  if (of) of.textContent = `Office: ${orgInfo.officeAddress} · ${orgInfo.officeHoursText}`;
  const soc = document.getElementById("footer-socials");
  if (soc) {
    const html = socialIconsHtml("");
    soc.innerHTML = html;
    soc.classList.toggle("hidden", !html);
  }
}
(async () => {
  try {
    const s = await getDoc(doc(db, "settings", "org"));
    if (s.exists()) {
      const d = s.data();
      for (const k of ["officeAddress", "officeHoursText", "contactEmail"]) {
        if (typeof d[k] === "string" && d[k].trim()) orgInfo[k] = d[k].trim();
      }
      for (const [k] of SOCIAL_DEFS) {
        if (typeof d[k] === "string") orgInfo[k] = d[k].trim();
      }
    }
  } catch { /* fallbacks are fine */ }
  applyOrgInfo();
})();

const pushConfig = { vapidKey: null };
(async () => {
  try {
    const snap = await getDoc(doc(db, "settings", "push"));
    if (snap.exists()) pushConfig.vapidKey = snap.data().vapidKey || null;
  } catch { /* push simply stays off */ }
})();

let messagingInst = null;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

async function pushSupported() {
  if (!pushConfig.vapidKey) return false;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  return await pushApiSupported().catch(() => false);
}

// Foreground: show pushes as in-app toasts (browser won't display them
// while the app is open). Wired at boot if permission is already granted.
function wireForegroundPush() {
  try {
    messagingInst = messagingInst || getMessaging(app);
    onMessage(messagingInst, (p) => {
      const d = p.data || {};
      if (d.title) toast(`${d.title}${d.body ? " - " + d.body : ""}`, "success");
    });
  } catch { /* non-fatal */ }
}

async function enablePush() {
  if (!currentUser) { toast("Sign in first to enable notifications.", "error"); return false; }
  if (!(await pushSupported())) {
    toast(isIOS() && !isStandalone()
      ? "On iPhone, first install the app (30-second guide on the /install page) - then enable notifications from inside the app."
      : "Notifications aren't available in this browser.", "error");
    return false;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      toast("Notifications stay off - you can change your mind anytime under Account → Notifications.", "warn");
      return false;
    }
    messagingInst = messagingInst || getMessaging(app);
    const reg = await navigator.serviceWorker.ready;
    const token = await getPushToken(messagingInst, {
      vapidKey: pushConfig.vapidKey,
      serviceWorkerRegistration: reg,
    });
    if (!token) throw new Error("no token received");
    await setDoc(doc(db, "pushTokens", token), {
      uid: currentUser.uid,
      platform: navigator.userAgent.slice(0, 140),
      createdAt: serverTimestamp(),
    });
    try { localStorage.setItem("push-token", token); } catch { /* ok */ }
    wireForegroundPush();
    toast("Notifications are ON for this device.", "success");
    return true;
  } catch (err) {
    toast("Could not enable notifications: " + (err.message || ""), "error");
    return false;
  }
}

async function disablePushHere() {
  try {
    let token = null;
    try { token = localStorage.getItem("push-token"); } catch { /* ok */ }
    if (token) {
      await deleteDoc(doc(db, "pushTokens", token)).catch(() => {});
      try { localStorage.removeItem("push-token"); } catch { /* ok */ }
    }
    if (messagingInst) await deletePushToken(messagingInst).catch(() => {});
    toast("Notifications are off for this device.", "success");
  } catch (err) { toast(err.message || "Failed", "error"); }
}

function pushEnabledHere() {
  try {
    return Notification?.permission === "granted" && !!localStorage.getItem("push-token");
  } catch { return false; }
}

// Smart-moment nudge: shown right after a ticket/shift/application action.
function pushOfferHtml(text) {
  let dismissed = false;
  try { dismissed = localStorage.getItem("push-offer-dismissed") === "1"; } catch { /* ok */ }
  if (dismissed || !pushConfig.vapidKey || !currentUser) return "";
  if (!("Notification" in window) || Notification.permission !== "default") return "";
  return `
    <div class="form-card push-offer" style="margin:0 0 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-size:.9rem">${mi("notifications", "sm")} ${text}</span>
      <span style="display:flex;gap:8px;margin-left:auto">
        <button class="btn btn-cyan btn-sm" id="push-offer-yes">Turn on</button>
        <button class="btn btn-ghost btn-sm btn-ink" id="push-offer-no">Not now</button>
      </span>
    </div>`;
}
function wirePushOffer(rerender) {
  document.getElementById("push-offer-yes")?.addEventListener("click", async () => {
    if (await enablePush()) document.querySelector(".push-offer")?.remove();
  });
  document.getElementById("push-offer-no")?.addEventListener("click", () => {
    try { localStorage.setItem("push-offer-dismissed", "1"); } catch { /* ok */ }
    document.querySelector(".push-offer")?.remove();
    void rerender;
  });
}

// ------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------
// Material Symbols (Google Fonts) - professional icons instead of emojis.
// Busy state for buttons that talk to the server before something visible
// happens (Stripe checkout takes a few seconds - cold starts included).
// Spinner + label inside the button; btnIdle restores the original content.
function btnBusy(btn, label) {
  if (!btn || btn.dataset.busyHtml) return;
  btn.dataset.busyHtml = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add("is-busy");
  btn.innerHTML = `<span class="btn-spin" aria-hidden="true"></span> ${label}`;
}
function btnIdle(btn) {
  if (!btn || btn.dataset.busyHtml == null) return;
  btn.innerHTML = btn.dataset.busyHtml;
  delete btn.dataset.busyHtml;
  btn.disabled = false;
  btn.classList.remove("is-busy");
}

function mi(name, size = "") {
  // aria-hidden: the ligature text ("celebration", "qr_code_scanner") is
  // meaningless to screen readers - the adjacent label carries the meaning.
  return `<span class="material-symbols-rounded${size ? ` mi-${size}` : ""}" aria-hidden="true">${name}</span>`;
}

// Official Google "G" mark - used on every sign-in button (brand guideline:
// the G always sits on a white button).
function googleG() {
  return `<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
}
function googleBtn(label = "Continue with Google", id = "es-login") {
  return `<button class="btn btn-google" id="${id}">${googleG()}<span>${label}</span></button>`;
}
// Standard "you need an account here" screen: clear message, one obvious
// Google button, and a line that makes clear signing in IS registering.
function signInState(icon, title) {
  return `<div class="empty-state signin-state">
    <div class="big">${mi(icon)}</div>
    <p><strong>${title}</strong></p>
    <p class="form-hint">Use your Google account - one tap, no separate password or registration. New here? The same button creates your account.</p>
    ${googleBtn()}
  </div>`;
}

// Small (i) icon that explains a field on hover or tap - keeps forms clean.
function hintIcon(text) {
  return `<button type="button" class="hint-i" title="${esc(text)}" data-hint="${esc(text)}" aria-label="More info">${mi("info", "sm")}</button>`;
}
// Tapping any (i) opens a little anchored popover (mobile has no hover).
document.addEventListener("click", (e) => {
  const existing = document.getElementById("hint-pop");
  const b = e.target.closest?.(".hint-i");
  existing?.remove();
  if (!b?.dataset.hint || existing?.dataset.for === b.dataset.hint) return;
  const pop = document.createElement("div");
  pop.id = "hint-pop";
  pop.className = "hint-pop";
  pop.dataset.for = b.dataset.hint;
  pop.textContent = b.dataset.hint;
  document.body.appendChild(pop);
  const r = b.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 24);
  pop.style.width = w + "px";
  pop.style.left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12) + "px";
  const below = r.bottom + 8;
  pop.style.top = (below + pop.offsetHeight > window.innerHeight - 12 ? Math.max(12, r.top - pop.offsetHeight - 8) : below) + "px";
});
window.addEventListener("scroll", () => document.getElementById("hint-pop")?.remove(), { passive: true });

// ------------------------------------------------------------
// In-app dialogs - replace the browser's native confirm()/prompt() with
// popups that look and feel like the app. Same contract:
//   await appConfirm("…") → true/false
//   await appPrompt("…", { value, placeholder, multiline, type }) → string|null
// ------------------------------------------------------------
function appDialog({ message = "", input = null, okLabel = "OK", cancelLabel = "Cancel", danger = false }) {
  // Colour language (v1.4.0): green = yes, red = no/destructive.
  return new Promise((resolve) => {
    document.getElementById("app-dialog")?.remove();
    const ov = document.createElement("div");
    ov.id = "app-dialog";
    ov.className = "dialog-overlay";
    ov.innerHTML = `
      <div class="dialog-card" role="${input ? "dialog" : "alertdialog"}" aria-modal="true">
        <div class="dialog-msg">${esc(message).replace(/\n/g, "<br>")}</div>
        ${input ? `
          <div class="form-field" style="margin:14px 0 0">
            ${input.multiline
              ? `<textarea id="dlg-input" rows="${input.rows || 3}" maxlength="${input.maxlength || 300}" placeholder="${esc(input.placeholder || "")}">${esc(input.value || "")}</textarea>`
              : `<input id="dlg-input" type="${input.type || "text"}" ${input.type === "number" ? `min="0" step="0.01"` : ""} maxlength="${input.maxlength || 200}" placeholder="${esc(input.placeholder || "")}" value="${esc(input.value || "")}" />`}
          </div>` : ""}
        <div class="dialog-actions">
          ${cancelLabel === null ? "" : `<button class="btn btn-ghost ${danger ? "btn-ink" : "btn-danger"}" id="dlg-cancel">${esc(cancelLabel)}</button>`}
          <button class="btn ${danger ? "btn-danger-solid" : "btn-green"}" id="dlg-ok">${esc(okLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    document.body.classList.add("dialog-open");
    const inputEl = document.getElementById("dlg-input");
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey, true);
      document.body.classList.remove("dialog-open");
      ov.classList.add("closing");
      setTimeout(() => ov.remove(), 170);
      resolve(val);
    };
    const ok = () => done(input ? (inputEl?.value ?? "") : true);
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); done(input ? null : false); }
      else if (e.key === "Enter" && !input?.multiline) { e.preventDefault(); ok(); }
    };
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("click", (e) => { if (e.target === ov) done(input ? null : false); });
    const cancelBtn = ov.querySelector("#dlg-cancel");
    if (cancelBtn) cancelBtn.onclick = () => done(input ? null : false);
    ov.querySelector("#dlg-ok").onclick = ok;
    setTimeout(() => (inputEl || ov.querySelector("#dlg-ok")).focus(), 80);
  });
}
function appAlert(message, okLabel = "Got it") {
  return appDialog({ message, okLabel, cancelLabel: null });
}
function appConfirm(message, opts = {}) {
  // Danger heuristic: destructive wording gets the magenta button by default
  const danger = opts.danger ?? /delete|remove|wipe|cannot be undone|unusable|refunded immediately/i.test(message);
  return appDialog({
    message,
    danger,
    okLabel: opts.okLabel ?? (danger ? "Yes, do it" : "Yes"),
    cancelLabel: opts.cancelLabel ?? "Never mind",
  });
}
function appPrompt(message, opts = {}) {
  return appDialog({
    message,
    input: { multiline: !!opts.multiline, type: opts.type, value: opts.value, placeholder: opts.placeholder, maxlength: opts.maxlength, rows: opts.rows },
    okLabel: opts.okLabel ?? "Save",
    cancelLabel: opts.cancelLabel ?? "Cancel",
    danger: opts.danger === true,
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function accentFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}
// Events: the admin-managed tag colour wins; otherwise a stable hash colour.
function eventAccent(ev) {
  return ev.tagColor && /^#[0-9a-fA-F]{6}$/.test(ev.tagColor) ? ev.tagColor : accentFor(ev.id);
}
function tagBadge(ev) {
  // Multi-tag (v0.103): ev.tags = [{id,name,color},…]; legacy single-tag
  // events keep working through tagName/tagColor.
  const tags = Array.isArray(ev.tags) && ev.tags.length
    ? ev.tags
    : ev.tagName ? [{ name: ev.tagName, color: ev.tagColor }] : [];
  return tags.map((t) =>
    `<span class="badge" style="background:${t.color && /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : eventAccent(ev)}">${esc(t.name)}</span>`
  ).join(" ");
}
// All tag names on an event (multi-tag aware) - passport visas etc.
function eventTagNames(ev) {
  if (Array.isArray(ev?.tags) && ev.tags.length) return ev.tags.map((t) => t.name).filter(Boolean);
  return ev?.tagName ? [ev.tagName] : [];
}
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  return new Date(v);
}
// All dates/times display in BELGIAN time (v0.130): the audience arrives
// from every timezone with phones still on home time - a 23:00 party must
// never read as 16:00. Events physically happen in Ghent.
const TZ_BE = "Europe/Brussels";
function fmtDate(d) {
  return toDate(d)?.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ_BE,
  }) ?? "";
}
function fmtTime(d) {
  return toDate(d)?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ_BE }) ?? "";
}
function fmtMoney(cents, currency = "eur") {
  return new Intl.NumberFormat("en-BE", {
    style: "currency", currency: currency.toUpperCase(),
  }).format((cents || 0) / 100);
}
// Readable errors (v1.1.0). Firebase's own wording ("Missing or insufficient
// permissions.", "internal", "client is offline") means nothing to a
// student. Every error toast passes through here: the raw fragment is
// swapped for plain advice, while the LOG keeps the raw text + a code so
// the board still sees exactly what happened.
const ERROR_HINTS = [
  [/Missing or insufficient permissions\.?/i, "permission-denied",
    "the app wasn't allowed to save this. Sign out and back in, then try again - if it keeps happening, message the board (it's logged on our side)."],
  [/Failed to get document because the client is offline\.?|\bclient is offline\b|Failed to fetch|NetworkError|network-request-failed/i, "offline",
    "no connection - check your internet and try again."],
  [/storage\/unauthorized/i, "storage-unauthorized", "that file couldn't be uploaded - only images and PDFs up to 5 MB are allowed."],
  [/storage\/(canceled|retry-limit-exceeded|unknown)/i, "storage-failed", "the upload didn't finish - check your connection and try again."],
  [/auth\/popup-blocked/i, "popup-blocked", "your browser blocked the sign-in window - allow pop-ups for app.esngent.org, or try again."],
  [/auth\/(popup-closed-by-user|cancelled-popup-request)/i, "signin-cancelled", "sign-in was cancelled."],
  [/auth\/(user-token-expired|invalid-user-token|requires-recent-login)/i, "session-expired", "your session expired - please sign in again and retry."],
];
// Bare callable codes: Firebase uses the code itself as the message when a
// function fails without one ("internal", "unavailable", …). Only matched
// when the code IS the message (or sits alone at the end in brackets).
const CODE_HINTS = {
  "internal": "something went wrong on our side - it's been logged, please try again in a minute.",
  "unavailable": "the server didn't respond - check your connection and try again in a moment.",
  "deadline-exceeded": "that took too long and was cancelled - please try again.",
  "unauthenticated": "your session expired - please sign in again and retry.",
  "resource-exhausted": "the app is very busy right now - please try again in a minute.",
  "permission-denied": "you don't have permission for this. Sign out and back in, then try again.",
};
const CODE_RE = new RegExp(`(^|\\(|: )(${Object.keys(CODE_HINTS).join("|")})\\)?\\.?$`, "i");
function humanizeError(msg) {
  const raw = String(msg || "");
  const finish = (text, code) => {
    const t = text.replace(/\s+/g, " ").trim();
    return { text: t.charAt(0).toUpperCase() + t.slice(1), code, raw };
  };
  for (const [re, code, text] of ERROR_HINTS) {
    if (re.test(raw)) return finish(raw.replace(re, text), code); // keeps the caller's context ("Could not submit: …")
  }
  const m = raw.match(CODE_RE);
  if (m) {
    const code = m[2].toLowerCase();
    const closing = m[0].includes(")") ? ")" : "";
    return finish(raw.replace(CODE_RE, (m[1] || "") + CODE_HINTS[code] + closing), code);
  }
  return { text: raw, code: "", raw };
}
// Validation nudges ("Please fill in…") are not errors - keep them out of the log.
const VALIDATION_RE = /^(please |fill in |enter |choose |select |pick |write |type |add |that doesn't look|not confirmed|nothing to|already |you can't|you cannot)/i;
function toast(msg, type = "") {
  const t = document.getElementById("toast");
  const icon = type === "error" ? "error" : type === "warn" ? "warning" : type === "success" ? "check_circle" : "info";
  let shown = msg;
  let h = null;
  if (type === "error") { h = humanizeError(msg); shown = h.text; }
  t.innerHTML = `${mi(icon, "sm")}<span>${esc(shown)}</span>`;
  t.className = `toast ${type}`;
  // restart the entrance animation even when a toast is already showing
  void t.offsetWidth;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), h && h.code ? 7000 : 4500);
  // Every REAL error a user sees also lands in the error log (v0.85) - with
  // the raw Firebase text and a code, never the friendly rewrite.
  if (type === "error" && !VALIDATION_RE.test(String(msg))) logError("app", h.raw, { code: h.code });
}
function errorState(msg) {
  logError("page", msg);
  return `<div class="empty-state"><div class="big">${mi("error")}</div>
    <p>Something went wrong loading this page.</p>
    <p class="form-hint">${esc(msg || "")}</p>
    <button class="btn btn-cyan" onclick="location.reload()">Try again</button></div>`;
}

// ------------------------------------------------------------
// Error log (v0.85) - every shown error, crash and unhandled
// promise rejection is written to errorLog/ with a timestamp and
// where it happened. Superadmin & finance read it under Settings.
// Throttled and de-duplicated so a crash loop can't spam the DB.
// ------------------------------------------------------------
const _errSeen = new Set();
let _errBudget = 15; // max writes per session
function logError(where, message, extra = {}) {
  try {
    const msg = String(message || "").slice(0, 500);
    if (!msg || _errBudget <= 0) return;
    // Known-benign browser noise - never worth a log entry.
    if (msg.includes("ResizeObserver loop")) return;
    const key = `${where}|${msg}`;
    if (_errSeen.has(key)) return;
    _errSeen.add(key);
    _errBudget--;
    if (!currentUser) return; // rules require sign-in; anonymous errors stay local
    const entry = {
      ts: serverTimestamp(),
      where,
      message: msg,
      hash: (location.pathname + location.hash).slice(0, 100),
      uid: currentUser.uid,
      ua: navigator.userAgent.slice(0, 120),
      version: APP_VERSION,
    };
    // v1.1.0: who + what kind, so the board can follow up with the person.
    if (currentUser.email) entry.email = String(currentUser.email).slice(0, 120);
    if (extra.code) entry.code = String(extra.code).slice(0, 60);
    if (extra.detail) entry.detail = String(extra.detail).slice(0, 600);
    addDoc(collection(db, "errorLog"), entry).catch(() => {}); // logging must never cause errors itself
  } catch { /* never throw from the logger */ }
}
window.addEventListener("error", (e) => {
  logError("crash", `${e.message || "script error"} @ ${(e.filename || "").split("/").pop()}:${e.lineno || "?"}`,
    { detail: e.error?.stack ? String(e.error.stack).split("\n").slice(0, 4).join(" | ") : "" });
});
window.addEventListener("unhandledrejection", (e) => {
  logError("promise", e.reason?.message || String(e.reason || "unhandled rejection"),
    { code: e.reason?.code || "", detail: e.reason?.stack ? String(e.reason.stack).split("\n").slice(0, 4).join(" | ") : "" });
});

// Smooth navigation: instead of instantly wiping the page (which feels
// like a full reload), keep the current content dimmed and only show the
// spinner if loading takes noticeably long. Any view that sets
// $app.innerHTML clears the pending spinner automatically (observer below).
let loadingTimer = null;
// The Ghent dragon (v0.138) - the idle animation from index.html's boot
// loader is captured once and reused for every in-app loading state, so the
// SVG lives in exactly one place. Falls back to the plain spinner.
const DRAGON_SVG = document.getElementById("dragon-boot")?.innerHTML || "";
function dragonHtml(cls = "") {
  return DRAGON_SVG ? `<div class="dragon-wrap ${cls}">${DRAGON_SVG}</div>` : `<div class="spinner"></div>`;
}
function setLoading() {
  clearTimeout(loadingTimer);
  $app.classList.add("is-loading");
  loadingTimer = setTimeout(() => {
    $app.innerHTML = `<div class="loading">${dragonHtml()}<p>Loading…</p></div>`;
  }, 350);
}
new MutationObserver(() => {
  $app.classList.remove("is-loading");
  if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
}).observe($app, { childList: true });
function ticketsLeft(ev) {
  if (!ev.capacity) return Infinity;
  // pendingHold = spots reserved by checkouts in progress (v0.130) - the
  // server refuses them anyway, so showing them as free just causes
  // failed purchases during an on-sale rush.
  return Math.max(0, ev.capacity - (ev.ticketsSold || 0) - (ev.pendingHold || 0));
}

// Compress an image file to a data URL small enough for a Firestore doc
// (works on the free plan - no Cloud Storage needed).
async function compressImage(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("That image file cannot be read - it may be damaged or an unsupported format. Try a different photo (JPG or PNG).")); img.src = url; });
  } finally {
    URL.revokeObjectURL(url);
  }
  const attempts = [
    { maxW: 1000, q: 0.8 }, { maxW: 900, q: 0.65 },
    { maxW: 700, q: 0.55 }, { maxW: 550, q: 0.45 },
  ];
  for (const { maxW, q } of attempts) {
    const scale = Math.min(1, maxW / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", q);
    if (dataUrl.length < 400_000) return dataUrl; // ~400 KB, well under the 1 MB doc limit
  }
  throw new Error("Image is too complex to compress - try a smaller or simpler image.");
}

// ------------------------------------------------------------
// Card images (events & merch) - v1.19: real files in Cloud Storage.
// compressCardImage(): centre-crops to 16:9 and resizes to max
// 1600×900, WebP where the browser can encode it (JPEG otherwise),
// so every upload is minimal and uniform. The data URL is used for
// the local preview; storeImage() turns it into a Storage file at
// save time and returns the https URL that goes into Firestore.
// Old base64 images keep rendering and migrate automatically the
// next time an admin re-saves the event/product with them.
// ------------------------------------------------------------
async function compressCardImage(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("That image file cannot be read - it may be damaged or an unsupported format. Try a different photo (JPG or PNG).")); img.src = url; });
  } finally {
    URL.revokeObjectURL(url);
  }
  const RATIO = 16 / 9;
  let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if (sw / sh > RATIO) { const w = sh * RATIO; sx = (sw - w) / 2; sw = w; }
  else { const h = sw / RATIO; sy = (sh - h) / 2; sh = h; }
  const outW = Math.min(1600, Math.max(1, Math.round(sw)));
  const outH = Math.max(1, Math.round(outW / RATIO));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  // WebP is ~30% smaller; Safari <17 can't encode it and silently
  // returns PNG - detect that and fall back to JPEG.
  let dataUrl = canvas.toDataURL("image/webp", 0.78);
  if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/jpeg", 0.78);
  return dataUrl;
}

const isStorageUrl = (v) => typeof v === "string" && v.includes("firebasestorage");

// data URL → uploaded Storage file → https URL. Falls back to keeping
// the base64 inline (pre-1.19 behaviour) if Storage isn't set up yet.
async function storeImage(dataUrl, folder) {
  if (!dataUrl) return null;
  if (!dataUrl.startsWith("data:")) return dataUrl; // already a URL - keep
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
    const path = `images/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const r = storageRef(storage, path);
    // Unique filename per upload → safe to cache forever.
    await uploadBytes(r, blob, { contentType: blob.type, cacheControl: "public,max-age=31536000,immutable" });
    return await getDownloadURL(r);
  } catch (err) {
    console.warn("Storage upload failed, keeping the image inline:", err.message);
    if (dataUrl.length < 900_000) {
      toast("Heads-up: Cloud Storage isn't reachable - the image was stored inline instead (works, but slower). Check Storage setup.", "error");
      return dataUrl;
    }
    throw new Error("Image upload failed and it's too large to store inline: " + err.message);
  }
}

// Best-effort cleanup of a replaced/removed Storage image.
function deleteStoredImage(url) {
  if (!isStorageUrl(url)) return;
  try { deleteObject(storageRef(storage, url)).catch(() => {}); } catch { /* best-effort */ }
}

// Google Calendar link + .ics download
function gcalUrl(ev) {
  const fmt = (d) => toDate(d).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${fmt(ev.start)}/${fmt(ev.end || ev.start)}`,
    details: ev.description || "",
    location: ev.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
function downloadIcs(ev) {
  const fmt = (d) => toDate(d).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const escIcs = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ESN Gent App//EN",
    "BEGIN:VEVENT",
    `UID:${ev.id}@esngent-events`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(ev.start)}`,
    `DTEND:${fmt(ev.end || ev.start)}`,
    `SUMMARY:${escIcs(ev.title)}`,
    `DESCRIPTION:${escIcs(plainText(ev.description))}`,
    `LOCATION:${escIcs(ev.location)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${ev.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ------------------------------------------------------------
// Google Calendar sync (one-way: app → public ESN calendar)
// Runs in the admin's browser using an OAuth token - no server needed.
// ------------------------------------------------------------
let calToken = null;

function calendarConfigured() {
  return !!(calendarSync?.clientId && !calendarSync.clientId.startsWith("PASTE") && calendarSync.calendarId);
}

function getCalToken() {
  return new Promise((resolve, reject) => {
    if (calToken) return resolve(calToken);
    if (!window.google?.accounts?.oauth2) {
      return reject(new Error("Google auth library didn't load - refresh and try again."));
    }
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: calendarSync.clientId,
      scope: "https://www.googleapis.com/auth/calendar.events",
      callback: (resp) => {
        if (resp && resp.access_token) {
          calToken = resp.access_token;
          setTimeout(() => { calToken = null; }, 50 * 60 * 1000); // tokens last ~1h
          resolve(calToken);
        } else {
          reject(new Error((resp && resp.error) || "Calendar authorization was cancelled."));
        }
      },
      error_callback: (err) => reject(new Error(err?.message || "Calendar authorization failed.")),
    });
    tc.requestAccessToken();
  });
}

async function calRequest(method, path, body, calId = calendarSync.calendarId) {
  const token = await getCalToken();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}${path}`,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  if (res.status === 401 || res.status === 403) {
    calToken = null;
    throw new Error("Calendar access was denied or expired - try again and allow access.");
  }
  if (res.status === 404 || res.status === 410) return null; // event gone (e.g. deleted by hand)
  if (!res.ok) throw new Error(`Calendar API error (${res.status})`);
  return res.status === 204 ? {} : res.json();
}

function calEventBody(ev) {
  const soldOut = !!(ev.capacity && (ev.ticketsSold || 0) >= ev.capacity);
  const link = `${location.origin}/event/${ev.id}`;
  const startD = toDate(ev.start);
  const endD = ev.end ? toDate(ev.end) : new Date(startD.getTime() + 2 * 60 * 60 * 1000);
  return {
    summary: (soldOut ? "[SOLD OUT] " : "") + ev.title,
    location: ev.location || "",
    description:
      (soldOut ? "⚠️ This event is SOLD OUT.\n\n" : "") +
      (ev.description ? plainText(ev.description) + "\n\n" : "") +
      `🎟️ Info & registration: ${link}`,
    start: { dateTime: startD.toISOString(), timeZone: calendarSync.timeZone || "Europe/Brussels" },
    end: { dateTime: endD.toISOString(), timeZone: calendarSync.timeZone || "Europe/Brussels" },
  };
}

// Upserts a published event, removes an unpublished one.
// Returns the Google event id (or null). Never touches other calendar items.
async function syncEventToCalendar(ev) {
  if (!calendarConfigured()) return ev.googleEventId || null;
  if (ev.published) {
    if (ev.googleEventId) {
      const patched = await calRequest("PATCH", `/events/${ev.googleEventId}`, calEventBody(ev));
      if (patched) return ev.googleEventId;
      // fell through: it was deleted from the calendar by hand - recreate it
    }
    const created = await calRequest("POST", "/events", calEventBody(ev));
    return created?.id || null;
  }
  if (ev.googleEventId) {
    await calRequest("DELETE", `/events/${ev.googleEventId}`);
  }
  return null;
}

// Board meetings sync to the separate internal board calendar.
async function syncMeetingToCalendar(m) {
  if (!calendarConfigured() || !calendarSync.boardCalendarId) return m.googleEventId || null;
  const startD = toDate(m.start);
  const endD = m.end ? toDate(m.end) : new Date(startD.getTime() + 2 * 60 * 60 * 1000);
  const body = {
    summary: m.title || "Board meeting",
    location: m.location || "",
    description: `Board meeting - agenda & minutes: ${location.origin}/board/meeting-${m.id}`,
    start: { dateTime: startD.toISOString(), timeZone: calendarSync.timeZone || "Europe/Brussels" },
    end: { dateTime: endD.toISOString(), timeZone: calendarSync.timeZone || "Europe/Brussels" },
  };
  if (m.googleEventId) {
    const patched = await calRequest("PATCH", `/events/${m.googleEventId}`, body, calendarSync.boardCalendarId);
    if (patched) return m.googleEventId;
    // deleted by hand on the calendar - recreate below
  }
  const created = await calRequest("POST", "/events", body, calendarSync.boardCalendarId);
  return created?.id || null;
}

// ------------------------------------------------------------
// Data access
// ------------------------------------------------------------
// from/to (Date, optional) bound the query server-side so we never
// download years of past events (docs can carry a big image each).
async function fetchPublishedEvents(from = null, to = null) {
  const parts = [where("published", "==", true)];
  if (from) parts.push(where("start", ">=", from));
  if (to) parts.push(where("start", "<", to));
  const q = query(collection(db, "events"), ...parts, orderBy("start", "asc"));
  const snap = await getDocs(q);
  // Team-audience events only appear for people who can actually join them.
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(audienceEligible);
}
async function fetchEventTags() {
  const snap = await getDocs(collection(db, "eventTags"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}
async function fetchAllEvents() {
  const snap = await getDocs(query(collection(db, "events"), orderBy("start", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function fetchEvent(id) {
  const snap = await getDoc(doc(db, "events", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
async function fetchMyRegistrations() {
  const q = query(
    collection(db, "registrations"),
    where("uid", "==", currentUser.uid),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function fetchRegistrationsForEvent(eventId) {
  const q = query(
    collection(db, "registrations"),
    where("eventId", "==", eventId),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ------------------------------------------------------------
// Auth
// ------------------------------------------------------------
async function signIn() {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    // Popups are blocked in installed PWAs (iOS especially) and in-app
    // browsers (Instagram/WhatsApp) - exactly where event links get
    // opened. Fall back to the full-page redirect flow (v0.130).
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/internal-error"].includes(e.code)) {
      try { await signInWithRedirect(auth, new GoogleAuthProvider()); return; } catch { /* fall through */ }
    }
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      toast("Sign-in failed: " + e.message, "error");
    }
  }
}
// Complete a redirect-based sign-in when the page comes back (no-op otherwise).
getRedirectResult(auth).catch(() => { /* not a redirect return */ });

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  isAdmin = false;
  myRole = null;
  myBoardFunction = "";
  myProfile = null;
  if (user) {
    try {
      const adminDoc = await getDoc(doc(db, "admins", user.uid));
      if (adminDoc.exists()) {
        // Entries created before roles existed count as superadmin
        myRole = adminDoc.data().role || "superadmin";
        myBoardFunction = adminDoc.data().boardFunction || "";
      }
      isAdmin = ["board", "superadmin", "finance"].includes(myRole);
    } catch { isAdmin = false; myRole = null; }
    try {
      // Keep a profile doc for every signed-in user (admin overview needs it)
      await setDoc(doc(db, "users", user.uid), {
        displayName: user.displayName || "",
        email: user.email || "",
        lastLogin: serverTimestamp(),
      }, { merge: true });
      const profSnap = await getDoc(doc(db, "users", user.uid));
      myProfile = profSnap.exists() ? profSnap.data() : {};
    } catch { myProfile = {}; }
  }
  document.getElementById("btn-signin").classList.toggle("hidden", !!user);
  document.getElementById("user-chip").classList.toggle("hidden", !user);
  // Remember the auth state for the NEXT cold start: the inline script in
  // index.html reads this flag before first paint, so returning users never
  // see the Sign-in button flash while Firebase restores their session.
  try { localStorage.setItem("esn-signed-in", user ? "1" : "0"); } catch { /* private mode */ }
  document.documentElement.dataset.auth = user ? "1" : "0";
  if (user) {
    document.getElementById("user-name").textContent = user.displayName || user.email;
    document.getElementById("user-avatar").src = user.photoURL ||
      "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><circle cx="15" cy="15" r="15" fill="#00AEEF"/></svg>');
    applyAvatarRing(); // passport level ring around the avatar
  }
  document.querySelectorAll(".auth-only").forEach((el) => el.classList.toggle("hidden", !user));
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !isAdmin));
  document.querySelectorAll(".staff-only").forEach((el) => el.classList.toggle("hidden", !isStaff()));
  document.querySelectorAll(".board-only").forEach((el) => el.classList.toggle("hidden", !canMeetings()));
  // Advisory members get a Board tab in the bottom bar (staff reach it via Admin)
  document.querySelectorAll(".advisory-only").forEach((el) => el.classList.toggle("hidden", !["advisory", "alumnicoord"].includes(myRole)));
  // Volunteers get a Shifts tab in the bottom bar (board reaches shifts via Admin)
  document.querySelectorAll(".vol-only").forEach((el) => el.classList.toggle("hidden", !(isStaff() && !isAdmin)));
  // Staff trade Calendar+Shop tabs for Scan/Admin in the bottom bar (max 5 tabs)
  document.querySelectorAll(".bottom-nav .m-student").forEach((el) => el.classList.toggle("hidden", isStaff()));
  // Advisory: hide Shop in the bottom bar so Board fits (max 5 tabs)
  document.querySelector('.bottom-nav [data-nav="shop"]')?.classList.toggle("hidden", isStaff() || ["advisory", "alumnicoord"].includes(myRole));
  route(); // re-render current view with the right permissions
});

// ------------------------------------------------------------
// Views
// ------------------------------------------------------------
let homeFilter = { q: "", chip: "all" };

async function viewHome() {
  setLoading();
  let events;
  let latestNews = [];
  try {
    // last 30 days (for the "recent past" section) + everything upcoming
    const lookback = new Date();
    lookback.setDate(lookback.getDate() - 30);
    [events, latestNews] = await Promise.all([
      fetchPublishedEvents(lookback),
      getDocs(query(collection(db, "news"), orderBy("createdAt", "desc"), limit(2)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
        .catch(() => []),
    ]);
  } catch (e) {
    $app.innerHTML = errorState(e.message);
    return;
  }
  // The news strip shows only while a post is fresh (14 days).
  const freshNews = latestNews.filter((n) => {
    const d = toDate(n.createdAt);
    return d && Date.now() - d.getTime() < 14 * 86400e3;
  }).slice(0, 1);
  const now = new Date();
  // "Upcoming" = hasn't started yet. A started event only stays in the list
  // while it is genuinely ongoing (start ≤ now ≤ end), and never longer than
  // 14 days after its start - so a mistyped end date can't pin a finished
  // event to the top of the homepage. Everything else is a past event.
  const isOngoing = (ev) => {
    const s = toDate(ev.start);
    return s <= now && toDate(ev.end || ev.start) >= now && now - s < 14 * 86400e3;
  };
  // v0.118 home order: news → upcoming events → next office hours → a
  // rotating ESNcard partner. Office hours get their own strip (not cards);
  // past events left the homepage (they live in each one's page/calendar).
  const upcomingAll = events.filter((ev) => toDate(ev.start) >= now || isOngoing(ev));
  const upcoming = upcomingAll.filter((ev) => ev.officeHours !== true);
  const nextOffice = upcomingAll.find((ev) => ev.officeHours === true) || null;

  const CHIPS = [
    { k: "all", label: "All" },
    { k: "free", label: "Free" },
    { k: "paid", label: "Paid" },
    { k: "esn", label: "ESNcard only" },
    { k: "month", label: "Next 30 days" },
  ];

  const applyFilter = () => {
    const q = homeFilter.q.trim().toLowerCase();
    return upcoming.filter((ev) => {
      if (q && !`${ev.title} ${ev.location || ""} ${plainText(ev.description)}`.toLowerCase().includes(q)) return false;
      // Member-aware (v0.131): for a verified member, "Free" means free
      // FOR THEM - an event that's €5 / free-with-ESNcard files under Free.
      const eff = (base, esnPrice) => (memberEligible(ev) && esnPrice != null ? esnPrice : base || 0);
      const prices = ev.options?.length ? ev.options.map((o) => eff(o.price, o.priceEsn)) : [eff(ev.price, ev.priceEsn)];
      switch (homeFilter.chip) {
        case "free": return prices.some((p) => p === 0);
        case "paid": return prices.some((p) => p > 0);
        case "esn": return !!ev.esnOnly;
        case "month": { const lim = new Date(now); lim.setMonth(lim.getMonth() + 1); return toDate(ev.start) <= lim; }
        default: return true;
      }
    });
  };

  const thisWeek = upcoming.filter((ev) => {
    const lim = new Date(now);
    lim.setDate(lim.getDate() + 7);
    return toDate(ev.start) <= lim;
  });
  const firstName = (currentUser?.displayName || "").split(" ")[0];
  // Greeting line that actually says something (v0.136): what's coming up,
  // instead of a static description of the app.
  const wd = (ev) => toDate(ev.start).toLocaleDateString("en-GB", { weekday: "long", timeZone: TZ_BE });
  const greetSub = thisWeek.length
    ? `${thisWeek.length === 1 ? "1 event" : `${thisWeek.length} events`} this week - first up: ${esc(thisWeek[0].title)} on ${wd(thisWeek[0])}`
    : upcoming.length
      ? `Next up: ${esc(upcoming[0].title)} · ${fmtDate(upcoming[0].start)}`
      : "No events planned right now - new ones land here first, check back soon!";

  $app.innerHTML = `
    <div class="m-greet">
      <h1>${currentUser ? `Hi ${esc(firstName || "there")}` : "Welcome"}</h1>
      <p>${greetSub}</p>
    </div>
    ${(() => {
      // Install nudge (v0.125): shown to visitors who aren't signed in or
      // haven't installed the app yet - dismissible, links to /install.
      try { if (localStorage.getItem("esnInstallDismissed") === "1") return ""; } catch { /* show it */ }
      if (currentUser && isInstalledApp()) return "";
      return `
    <a class="news-strip" href="/install" id="install-strip">
      <span class="news-strip-icon">${mi("install_mobile")}</span>
      <span class="news-strip-main">
        <small>30 seconds - no app store needed</small>
        <strong>Install the ESN Gent App on your phone: offline tickets, notifications &amp; your ESN Passport</strong>
      </span>
      <button type="button" id="install-dismiss" title="Don't show this again" style="background:none;border:0;color:var(--muted);font-size:1.05rem;cursor:pointer;padding:6px">✕</button>
    </a>`;
    })()}
    ${currentUser && !navigator.onLine ? `
    <a class="news-strip" href="/my-tickets" style="border-left:4px solid var(--esn-orange)">
      <span class="news-strip-icon">${mi("qr_code_2")}</span>
      <span class="news-strip-main">
        <small>You're offline</small>
        <strong>Your saved tickets still work: open them here</strong>
      </span>
      <span class="chev">›</span>
    </a>` : ""}
    ${freshNews.length ? `<h2 class="section-title">News</h2>` : ""}
    ${freshNews.map((n) => `
    <a class="news-strip" href="/news">
      ${n.image ? `<img class="news-strip-img" src="${esc(n.image)}" alt="" loading="lazy" />` : `<span class="news-strip-icon">${mi("campaign")}</span>`}
      <span class="news-strip-main">
        <small>${mi("campaign", "sm")} News · ${fmtDate(n.createdAt)}</small>
        <strong>${esc(n.title || "")}</strong>
      </span>
      <span class="chev">›</span>
    </a>`).join("")}
    <h2 class="section-title">Upcoming events</h2>
    <div class="filter-bar">
      <input id="filter-q" type="search" placeholder="Search events, places…" value="${esc(homeFilter.q)}" />
      <div class="filter-chips">
        ${CHIPS.map((c) => `<button class="chip ${homeFilter.chip === c.k ? "active" : ""}" data-chip="${c.k}">${c.label}</button>`).join("")}
      </div>
    </div>
    <div id="home-events"></div>
    ${nextOffice ? `
    <h2 class="section-title">Office hours</h2>
    <a class="news-strip" href="/office">
      <span class="news-strip-icon">${mi("meeting_room")}</span>
      <span class="news-strip-main">
        <small>Next session · ${fmtDate(nextOffice.start)} · ${fmtTime(nextOffice.start)}${nextOffice.end ? `–${fmtTime(nextOffice.end)}` : ""}</small>
        <strong>${esc(nextOffice.location || "The ESN office")} - drop in for your ESNcard, shop pickups, questions or just a chat</strong>
      </span>
      <span class="chev">›</span>
    </a>` : ""}
    <div id="home-partner"></div>
  `;

  // Rotating ESNcard partner (v0.118) - one deal a visit, freshly random,
  // loaded after the page paints so the homepage never waits for it.
  (async () => {
    const box = document.getElementById("home-partner");
    if (!box) return;
    try {
      if (!homePartners) homePartners = (await getDocs(collection(db, "partners"))).docs.map((d) => ({ id: d.id, ...d.data() }));
      const active = homePartners.filter((p2) => (p2.status || "active") === "active"); // ended/pipeline partners never on the homepage
      if (!active.length) return;
      const p = active[Math.floor(Math.random() * active.length)];
      box.innerHTML = `
        <h2 class="section-title">ESNcard deal</h2>
        <div class="deal-card" style="max-width:560px">
          <div class="deal-head">
            ${p.logo ? `<img class="deal-logo" src="${esc(p.logo)}" alt="" loading="lazy" />` : `<span class="deal-logo deal-logo-ph">${esc((p.name || "?")[0].toUpperCase())}</span>`}
            <strong>${esc(p.name || "")}</strong>
          </div>
          <p class="deal-text">${esc(p.deal || "")}</p>
          ${p.location ? `<p class="form-hint">${mi("location_on", "sm")} ${esc(p.location)}</p>` : ""}
          <div class="form-actions" style="margin-top:auto">
            <a class="btn btn-sm btn-cyan" href="/deals">${mi("sell", "sm")} All ESNcard deals</a>
            ${p.website ? `<a class="btn btn-sm btn-ghost btn-ink" href="${esc(p.website)}" target="_blank" rel="noopener">${mi("language", "sm")} Website</a>` : ""}
          </div>
        </div>`;
    } catch { /* the homepage works fine without a deal card */ }
  })();

  const weekIds = new Set(thisWeek.map((ev) => ev.id));
  const renderList = () => {
    const list = applyFilter();
    const box = document.getElementById("home-events");
    if (!list.length) {
      box.innerHTML = upcoming.length
        ? `<div class="empty-state"><div class="big">${mi("search_off")}</div><p>No events match your search.</p></div>`
        : `<div class="empty-state"><div class="big">${mi("event_busy")}</div><p>No upcoming events yet - check back soon!</p></div>`;
      return;
    }
    // Default view: split into "This week" / "Later" groups (each event
    // appears exactly once). Any search or filter shows one flat list.
    const grouped = !homeFilter.q.trim() && homeFilter.chip === "all" && thisWeek.length && list.length > thisWeek.length;
    box.innerHTML = grouped
      ? `<h3 class="group-title">This week</h3>
         <div class="events-grid">${list.filter((ev) => weekIds.has(ev.id)).map(eventCard).join("")}</div>
         <h3 class="group-title">Later</h3>
         <div class="events-grid">${list.filter((ev) => !weekIds.has(ev.id)).map(eventCard).join("")}</div>`
      : `<div class="events-grid">${list.map(eventCard).join("")}</div>`;
  };
  renderList();

  document.getElementById("install-dismiss")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { localStorage.setItem("esnInstallDismissed", "1"); } catch { /* fine */ }
    document.getElementById("install-strip")?.remove();
  });
  document.getElementById("filter-q").addEventListener("input", (e) => {
    homeFilter.q = e.target.value;
    renderList();
  });
  document.querySelectorAll(".filter-chips .chip").forEach((btn) => {
    btn.onclick = () => {
      homeFilter.chip = btn.dataset.chip;
      document.querySelectorAll(".filter-chips .chip").forEach((b) => b.classList.toggle("active", b === btn));
      renderList();
    };
  });
}

// Which calendar days an event occupies. A night event that just runs past
// midnight (party 23:00 → 05:00) belongs to its START day only: an end
// before 08:00 in the morning counts as the night before. Only genuinely
// longer events (trips, festivals) become multi-day.
// Belgian-calendar parts of a moment (v0.131) - day bucketing must use
// Ghent's calendar, not the phone's (a phone still on Bogota time put a
// 01:00 party on the previous day cell).
function beParts(v) {
  const d = toDate(v);
  if (!d) return null;
  const p = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ_BE, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" })
    .formatToParts(d).forEach((x) => { if (x.type !== "literal") p[x.type] = +x.value; });
  return p;
}
function eventDaySpan(ev) {
  const sp = beParts(ev.start);
  const first = new Date(sp.year, sp.month - 1, sp.day);
  let e = toDate(ev.end || ev.start);
  const s = toDate(ev.start);
  if (!e || e < s) e = s;
  const ep = beParts(e);
  let last = new Date(ep.year, ep.month - 1, ep.day);
  if (ep.hour < 8 && last > first) last.setDate(last.getDate() - 1);
  if (last < first) last = new Date(first);
  return { first, last };
}
function isMultiDayEvent(ev) {
  const { first, last } = eventDaySpan(ev);
  return last > first;
}

function eventCard(ev) {
  const accent = eventAccent(ev);
  const d = toDate(ev.start);
  const left = ticketsLeft(ev);
  const soldOut = left === 0;
  const nowD = new Date();
  const isLive = !ev.cancelled && d <= nowD && toDate(ev.end || ev.start) >= nowD && nowD - d < 14 * 86400e3;
  // "Last spots" ribbon (v0.125): ≤10% of capacity left (but not sold out).
  const lastSpots = !ev.cancelled && !soldOut && ev.capacity && left !== Infinity
    && d > nowD && left <= Math.max(1, Math.floor(ev.capacity * 0.1));
  return `
    <article class="event-card" style="--accent:${accent}" data-evlink="/event/${ev.id}">
      ${lastSpots ? `<span class="card-ribbon">Last spots!</span>` : ""}
      ${ev.image ? `<div class="card-img-wrap"><img class="card-img" loading="lazy" src="${esc(ev.image)}" alt="" /></div>` : ""}
      <div class="date-badge">
        <span class="d">${d.getDate()}</span>
        <span class="m">${d.toLocaleDateString("en-GB", { month: "short" })}</span>
      </div>
      <div class="card-body">
        <h3><a href="/event/${ev.id}">${esc(ev.title)}</a>${ev.tagName && !ev.officeHours && !ev.cancelled ? ` ${tagBadge(ev)}` : ""}</h3>
        <div class="event-meta">
          <span>${mi("event", "sm")} ${fmtDate(ev.start)} · ${fmtTime(ev.start)}${isMultiDayEvent(ev) ? ` → ${fmtDate(ev.end)}` : ""}</span>
          <span>${mi("location_on", "sm")} ${esc(ev.location || "Location TBA")}</span>
        </div>
        <p class="event-desc">${esc(plainText(ev.description).slice(0, 120))}${plainText(ev.description).length > 120 ? "…" : ""}</p>
        <div class="card-foot">
          ${isLive ? `<span class="badge badge-live">${mi("sensors", "sm")} Happening now</span> ` : ""}
          ${ev.cancelled ? `<span class="badge badge-soldout">CANCELLED</span>`
          : ev.officeHours ? `<span class="badge badge-esn">Office hours - drop in</span>`
          : ev.regMode === "none" ? `<span class="badge badge-esn">just show up${ev.price ? ` - ${fmtMoney(ev.price, ev.currency)} at the door` : ""}</span>`
          : ev.regMode === "external" ? `<span class="badge badge-pending">external sign-up</span>` : `
          <span class="price-tag ${!ev.price && !ev.options?.length ? "free" : ""}">
            ${Array.isArray(ev.options) && ev.options.length
              ? `from ${fmtMoney(Math.min(...ev.options.map((o) => o.price)), ev.currency)}`
              : ev.price ? fmtMoney(ev.price, ev.currency) : "FREE"}
            ${!ev.options?.length && ev.price && ev.priceEsn != null ? `<span class="member-note">ESNcard ${fmtMoney(ev.priceEsn, ev.currency)}</span>` : ""}
            ${ev.esnOnly ? `<span class="badge badge-esn">ESNcard only</span>` : ""}
          </span>`}
          ${!ev.cancelled && !ev.officeHours && soldOut
            ? `<span class="badge badge-soldout">Sold out</span> <a href="/event/${ev.id}" class="btn btn-sm btn-ghost btn-ink">Waitlist ›</a>`
            : `<a href="/event/${ev.id}" class="btn btn-sm" style="background:${accent};color:#fff">Details</a>`}
        </div>
      </div>
    </article>`;
}

const calMonthCache = {}; // "y-m" → events, so flipping months doesn't refetch
async function viewCalendar() {
  setLoading();
  const y = calCursor.getFullYear();
  const m = calCursor.getMonth();
  let events;
  try {
    const key = `${y}-${m}`;
    if (!calMonthCache[key]) {
      // A week of lookback so a multi-day event that STARTED late last month
      // still shows on the days it spans in this month.
      calMonthCache[key] = await fetchPublishedEvents(new Date(y, m, -6), new Date(y, m + 1, 1));
    }
    events = calMonthCache[key];
  } catch (e) { $app.innerHTML = errorState(e.message); return; }

  const monthName = calCursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date();

  // Tag filter (v0.107) - chips over the month; the pick survives month nav.
  const calTagNames = [...new Set(events.flatMap((ev) => eventTagNames(ev)))].sort();
  if (calTagFilter && !calTagNames.includes(calTagFilter)) { /* keep - may exist next month */ }
  const shownEvents = calTagFilter ? events.filter((ev) => eventTagNames(ev).includes(calTagFilter)) : events;

  // Every event appears on EVERY day it spans (trips, festivals) - later
  // days marked as continuations. Overnight parties stay on their start day.
  const byDay = {};
  for (const ev of shownEvents) {
    const { first, last } = eventDaySpan(ev);
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() === y && d.getMonth() === m) {
        (byDay[d.getDate()] ??= []).push({ ev, cont: d > first });
      }
    }
  }

  let cells = "";
  for (const dow of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
    cells += `<div class="cal-dow">${dow}</div>`;
  }
  for (let i = 0; i < firstDow; i++) cells += `<div class="cal-cell other-month"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const tp = beParts(today);
    const isToday = day === tp.day && m === tp.month - 1 && y === tp.year;
    const dayEvs = byDay[day] || [];
    const chips = dayEvs.map(({ ev, cont }) =>
      `<a class="cal-event ${cont ? "cal-cont" : ""}" style="--accent:${eventAccent(ev)}${ev.cancelled ? ";opacity:.5;text-decoration:line-through" : ""}" href="/event/${ev.id}" title="${esc(ev.title)}${ev.cancelled ? " - CANCELLED" : ""}${cont ? " - continues" : ""}">${cont ? "↳" : fmtTime(ev.start)} ${esc(ev.title)}</a>`
    ).join("");
    const dots = dayEvs.length
      ? `<span class="cal-dots">${dayEvs.slice(0, 3).map(({ ev }) => `<i style="background:${eventAccent(ev)}"></i>`).join("")}</span>`
      : "";
    cells += `<div class="cal-cell ${isToday ? "today" : ""} ${dayEvs.length ? "has-ev" : ""}" ${dayEvs.length ? `data-day="${day}"` : ""}><span class="cal-daynum">${day}</span>${chips}${dots}</div>`;
  }
  const totalCells = firstDow + daysInMonth;
  for (let i = totalCells; i % 7 !== 0; i++) cells += `<div class="cal-cell other-month"></div>`;

  $app.innerHTML = `
    <div class="calendar-header">
      <h2>${monthName}</h2>
      <div class="cal-nav-buttons">
        <button class="btn btn-dark btn-sm" id="cal-prev">‹ Prev</button>
        <button class="btn btn-ghost btn-sm" id="cal-today" style="color:var(--esn-dark)">Today</button>
        <button class="btn btn-dark btn-sm" id="cal-next">Next ›</button>
      </div>
    </div>
    ${calTagNames.length || calTagFilter ? `
    <div class="filter-chips" style="margin:0 0 12px">
      <button class="chip ${!calTagFilter ? "active" : ""}" data-ctag="">${mi("label", "sm")} All</button>
      ${calTagNames.map((tn) => `<button class="chip ${calTagFilter === tn ? "active" : ""}" data-ctag="${esc(tn)}">${esc(tn)}</button>`).join("")}
      ${calTagFilter && !calTagNames.includes(calTagFilter) ? `<button class="chip active" data-ctag="${esc(calTagFilter)}">${esc(calTagFilter)}</button>` : ""}
    </div>` : ""}
    <div class="calendar-grid">${cells}</div>
    <div class="m-only cal-agenda">
      ${Object.keys(byDay).map(Number).sort((a, b) => a - b).map((day) => `
        <div class="agenda-day" id="agenda-d${day}">
          <div class="agenda-date">${new Date(y, m, day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
          ${byDay[day].map(({ ev, cont }) => `
            <a class="agenda-item ${cont ? "cal-cont" : ""}" href="/event/${ev.id}" style="--accent:${eventAccent(ev)}${ev.cancelled ? ";opacity:.55" : ""}">
              <span class="agenda-time">${cont ? "↳" : fmtTime(ev.start)}</span>
              <span class="agenda-title" ${ev.cancelled ? `style="text-decoration:line-through"` : ""}>${esc(ev.title)}${ev.cancelled ? ` <span class="badge badge-soldout">cancelled</span>` : ""}${cont ? ` <small class="form-hint">continues</small>` : ""}</span>
              <span class="agenda-price ${!ev.price && !ev.options?.length ? "free" : ""}">${ev.cancelled ? "" : Array.isArray(ev.options) && ev.options.length ? `from ${fmtMoney(Math.min(...ev.options.map((o) => o.price)), ev.currency)}` : ev.price ? fmtMoney(ev.price, ev.currency) : "FREE"}</span>
            </a>`).join("")}
        </div>`).join("")}
      ${Object.keys(byDay).length ? "" : `<p class="form-hint" style="text-align:center;margin-top:6px">No events in this month.</p>`}
    </div>
    ${calendarSync?.calendarId ? `
    <div class="form-card" style="margin-top:18px;text-align:center">
      <strong>${mi("event_repeat", "sm")} Keep it in your own calendar</strong>
      <p class="form-hint" style="margin:6px 0 10px">Subscribe once and every ESN Gent event (and every update) appears in your personal calendar automatically.</p>
      <div class="form-actions" style="justify-content:center">
        <a class="btn btn-cyan btn-sm" target="_blank" rel="noopener" href="https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(btoa(calendarSync.calendarId).replace(/=+$/, ""))}">Subscribe in Google Calendar</a>
        <a class="btn btn-ghost btn-sm btn-ink" href="webcal://calendar.google.com/calendar/ical/${encodeURIComponent(calendarSync.calendarId)}/public/basic.ics">Subscribe on iPhone / Mac</a>
        <button class="btn btn-ghost btn-sm btn-ink" id="cal-copy-url">Copy calendar address</button>
      </div>
      <p class="form-hint" style="margin:10px 0 0">Outlook &amp; other apps: copy the address, then in your calendar choose <strong>Add calendar → Subscribe from web</strong> and paste it. Subscribing stays up to date by itself - <strong>importing a downloaded .ics file doesn't</strong>, that's a one-time snapshot.</p>
    </div>` : ""}
  `;
  document.getElementById("cal-copy-url")?.addEventListener("click", async () => {
    const url = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarSync.calendarId)}/public/basic.ics`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Calendar address copied - paste it in your calendar app under “Subscribe from web”", "success");
    } catch {
      await appAlert(`Copy this address and paste it in your calendar app under “Add calendar → Subscribe from web”:\n\n${url}`);
    }
  });
  document.querySelectorAll(".cal-cell[data-day]").forEach((cell) => {
    cell.addEventListener("click", (e) => {
      if (e.target.closest("a")) return; // desktop chip clicks keep working
      document.getElementById(`agenda-d${cell.dataset.day}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  $app.querySelectorAll("[data-ctag]").forEach((b) => {
    b.onclick = () => { calTagFilter = b.dataset.ctag || null; viewCalendar(); };
  });
  document.getElementById("cal-prev").onclick = () => { calCursor = new Date(y, m - 1, 1); viewCalendar(); };
  document.getElementById("cal-next").onclick = () => { calCursor = new Date(y, m + 1, 1); viewCalendar(); };
  document.getElementById("cal-today").onclick = () => { calCursor = new Date(); viewCalendar(); };
}

// The ticket policy every student agrees to before booking.
// Mirrors what the Cloud Functions actually enforce.
function eventCancelHours(ev) {
  return typeof ev.cancelHours === "number" && ev.cancelHours >= 0 ? ev.cancelHours : eventDefaults.defaultCancelHours;
}
function eventPolicyHtml(ev, noShows = 0) {
  const hrs = eventCancelHours(ev);
  const fee = typeof ev.refundFee === "number" && ev.refundFee >= 0 ? ev.refundFee : eventDefaults.defaultRefundFee;
  const deadline = hrs === 0 ? "until the event starts" : `until <strong>${hrs} hour${hrs === 1 ? "" : "s"} before</strong> the event starts`;
  return `
    ${noShows >= 2 ? `<p class="noshow-warn">${mi("warning", "sm")} You didn't show up to <strong>${noShows}</strong> events you had a ticket for. Spots are limited - please only register if you'll actually come (or cancel in time so someone else can go).</p>` : ""}
    <details class="policy-box" ${ev.nonRefundable ? "open" : ""}>
      <summary>Ticket policy${ev.nonRefundable ? ` · <strong style="color:var(--esn-orange)">non-refundable</strong>` : ""}</summary>
      <ul>
        <li><strong>One ticket per person</strong> - friends book with their own account. (You can transfer your own ticket from My tickets.)</li>
        <li><strong>Free registrations</strong> can be cancelled ${deadline} via My tickets - your spot goes back on sale.</li>
        ${ev.nonRefundable
          ? `<li><strong>Paid tickets are non-refundable</strong> for this event.</li>`
          : `<li><strong>Paid tickets:</strong> request a refund ${deadline} from My tickets. The treasurer reviews every request${fee ? `, and a <strong>${fmtMoney(fee)}</strong> handling fee is deducted from the refund` : ""}. After the deadline, no refunds.</li>`}
        <li>The <strong>ESNcard price</strong> applies only if your card is verified <em>at the moment you buy</em> - the difference is never refunded if you get your card later.</li>
        <li>If ESN Gent cancels the event, everyone is refunded <strong>in full</strong> automatically.</li>
      </ul>
    </details>
    <p class="form-hint policy-agree-note">By registering you agree to the ticket policy above.</p>`;
}

async function viewEvent(id) {
  setLoading();
  let ev;
  let evLoadErr = null;
  try { ev = await fetchEvent(id); } catch (err) { ev = null; evLoadErr = err; }
  if (!ev && evLoadErr && evLoadErr.code !== "permission-denied") {
    // Network / backend hiccup - NOT a missing event. Offer a retry
    // instead of a misleading "not found" (v0.130).
    $app.innerHTML = errorState(navigator.onLine ? evLoadErr.message : "You seem to be offline.");
    return;
  }
  if (!ev) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("search_off")}</div><p>Event not found (or not published).</p><p><a class="btn btn-cyan btn-sm" href="/">Browse events</a></p></div>`;
    return;
  }
  // Team-audience events: outsiders don't get the page at all. Anyone WITH
  // a team role may look (the server still decides who can register).
  if (!audienceEligible(ev) && !myRole) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("group")}</div>
      <p>This is a <strong>team event</strong> - reserved for ${esc(audienceLabel(ev.audience))}.</p>
      <p class="form-hint"><a href="/">← Back to all events</a></p></div>`;
    return;
  }
  // One ticket per person: does this user already hold one?
  // (Same fetch also counts past no-shows for the gentle warning below.)
  const regMode = ev.regMode === "none" || ev.regMode === "external" ? ev.regMode : "app";
  let myReg = null, noShows = 0;
  if (currentUser && !ev.officeHours && regMode === "app") {
    try {
      const mineSnap = await getDocs(query(
        collection(db, "registrations"),
        where("uid", "==", currentUser.uid),
      ));
      const mineAll = mineSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      myReg = mineAll.filter((r) => r.eventId === id)
        .find((r) => ["paid", "free", "pending"].includes(r.status)) || null;
      noShows = mineAll.filter((r) => ["paid", "free"].includes(r.status) && !r.checkedInAt
        && r.eventStart && (toDate(r.eventStart)?.getTime() || Infinity) < Date.now() - 3 * 3600e3).length;
    } catch { /* non-fatal - the server enforces it anyway */ }
  }
  const accent = eventAccent(ev);
  const left = ticketsLeft(ev);
  const soldOut = left === 0;
  const isPast = toDate(ev.end || ev.start) < new Date();
  const isFree = !ev.price;
  const eligible = memberEligible(ev); // member PRICES (alumni excluded on marked trips)
  // member-only ACCESS: alumni are members for life (Art. 7 §3), even on trips
  const memberBlocked = ev.esnOnly && !(hasVerifiedCard() || isAlumni());
  const effectivePrice = eligible && ev.priceEsn != null ? ev.priceEsn : ev.price;
  const discounted = eligible && ev.priceEsn != null && ev.priceEsn < ev.price;
  const options = Array.isArray(ev.options) && ev.options.length ? ev.options : null;
  const optEffective = (o) => (eligible && o.priceEsn != null ? o.priceEsn : o.price);
  const minOptPrice = options ? Math.min(...options.map(optEffective)) : null;

  $app.innerHTML = `
    <article class="event-detail" style="--accent:${accent}">
      <div class="event-detail-banner ${ev.image ? "has-img" : ""}"
        ${ev.image ? `style="background-image:linear-gradient(rgba(30,32,90,.55),rgba(30,32,90,.8)),url('${esc(ev.image)}')"` : ""}>
        <a href="/" class="back-chip">← All events</a>
        <h1>${esc(ev.title)}</h1>
        ${ev.cancelled ? `<span class="badge badge-soldout">CANCELLED</span>` : ""}
        ${ev.tagName && !ev.cancelled ? tagBadge(ev) : ""}
        ${Array.isArray(ev.audience) && ev.audience.length ? `<span class="badge badge-esn">${mi("group", "sm")} Team event - ${esc(audienceLabel(ev.audience))}</span>` : ""}
        ${ev.published ? "" : `<span class="badge badge-draft">Draft - not visible to students</span>`}
      </div>
      ${isAdmin ? `
      <div class="form-actions" style="margin:14px 18px 0">
        <a href="/admin/edit-${ev.id}" class="btn btn-orange btn-sm">${mi("edit", "sm")} Edit event</a>
        <a href="/admin/event-${ev.id}" class="btn btn-ghost btn-sm btn-ink">${mi("group", "sm")} Registrations</a>
        <a href="/admin/shifts-${ev.id}" class="btn btn-ghost btn-sm btn-ink">${mi("schedule", "sm")} Shiftlist</a>
        ${ev.dsaActivityId ? `<a href="https://dsa.ugent.be/activiteiten/${ev.dsaActivityId}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm btn-ink">${mi("school", "sm")} Open in DSA ↗</a>` : ""}
      </div>` : ""}
      <div class="event-detail-body">
        <div>
          <ul class="event-info-list">
            <li><span class="info-label">When</span><span><strong>${fmtDate(ev.start)}</strong>, ${fmtTime(ev.start)}${ev.end ? (isMultiDayEvent(ev) ? ` → <strong>${fmtDate(ev.end)}</strong>, ${fmtTime(ev.end)}` : ` – ${fmtTime(ev.end)}`) : ""}</span></li>
            <li><span class="info-label">Where</span><span>${ev.location
              ? `<a href="${mapsUrlFor(ev)}" target="_blank" rel="noopener">${esc(ev.location)}</a>${ev.lat != null ? ` ${mi("location_on", "sm")}` : ""}`
              : "Location TBA"}</span></li>
            ${ev.capacity && regMode === "app" ? `<li><span class="info-label">Tickets</span><span>${soldOut ? "Sold out" : `${left} ticket${left === 1 ? "" : "s"} left`} (capacity ${ev.capacity})</span></li>` : ""}
            ${ev.albumUrl ? `<li><span class="info-label">Photos</span><span><a href="${esc(ev.albumUrl)}" target="_blank" rel="noopener">${mi("photo_library", "sm")} Photos from this event ${mi("arrow_outward", "sm")}</a></span></li>` : ""}
          </ul>
          <div class="rich">${renderRich(ev.description)}</div>
          <div class="cal-links">
            <button class="btn btn-ghost btn-sm" style="color:var(--esn-dark)" id="btn-share-event">${mi("ios_share", "sm")} Share</button>
            <a class="btn btn-ghost btn-sm" style="color:var(--esn-dark)" href="${gcalUrl(ev)}" target="_blank" rel="noopener">Add to Google Calendar</a>
            <button class="btn btn-ghost btn-sm" style="color:var(--esn-dark)" id="btn-ics">Add to Apple/Outlook (.ics)</button>
            ${ev.location ? `<a class="btn btn-ghost btn-sm" style="color:var(--esn-dark)" href="${mapsUrlFor(ev)}" target="_blank" rel="noopener">Open in Google Maps</a>` : ""}
          </div>
          ${ev.location ? `
          <div class="map-wrap">
            <iframe class="map-embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
              src="${mapEmbedSrc(ev)}"
              title="Map: ${esc(ev.location)}"></iframe>
          </div>` : ""}
        </div>
        <div class="buy-box">
          ${ev.cancelled ? `
          <span class="badge badge-soldout">Event cancelled</span>
          ${ev.cancelReason ? `<p style="font-size:.9rem;margin-top:10px">${esc(ev.cancelReason)}</p>` : ""}
          <p class="form-hint">Paid tickets are refunded <strong>in full</strong> automatically - the money returns to the card or account you paid with within a few business days. Sorry, and see you at the <a href="/">next one</a>!</p>
          ` : ev.officeHours ? `
          <span class="badge badge-esn">Office hours</span>
          <p style="font-size:.9rem;margin-top:10px">Drop by - <strong>no ticket needed</strong>. Pick up ${cashAllowed() ? "(or pay in cash for) " : ""}your <strong>ESNcard</strong>, collect <a href="/shop">shop orders</a>, ask questions or just say hi.</p>
          <p class="form-hint"><a href="/office">All office info &amp; upcoming hours →</a></p>
          ${!ev.published ? `<p class="form-hint">${mi("edit_note")} <strong>Draft</strong> - visible to the team for shift planning.</p>` : ""}
          ` : regMode === "none" ? `
          <span class="badge badge-esn">No ticket needed</span>
          <p style="font-size:1.05rem;font-weight:800;margin:12px 0 4px">Just show up!</p>
          ${(() => {
            const door = [];
            door.push(ev.price ? `<strong>${fmtMoney(ev.price, ev.currency)}</strong> at the door` : "<strong>Free</strong> entry");
            if (ev.priceEsn != null && ev.priceEsn !== ev.price) {
              door.push(ev.priceEsn ? `<strong>${fmtMoney(ev.priceEsn, ev.currency)}</strong> with a verified ESNcard` : "<strong>FREE</strong> with a verified ESNcard");
            }
            return `<p style="font-size:.95rem;margin:0 0 10px">${door.join(" · ")}</p>`;
          })()}
          ${ev.priceEsn != null && ev.priceEsn !== ev.price ? `<p class="form-hint">Show your ESNcard at the entrance - it's on your <a href="/account">profile</a> in this app.</p>` : ""}
          <p class="form-hint">No registration needed for this one - doors handle everything.</p>
          ${!ev.published ? `<p class="form-hint">${mi("edit_note")} <strong>Draft</strong> - visible to the team only.</p>` : ""}
          ` : regMode === "external" ? `
          <span class="badge badge-pending">External sign-up</span>
          ${ev.price ? `<p style="font-size:.95rem;margin:10px 0 4px"><strong>${fmtMoney(ev.price, ev.currency)}</strong>${ev.priceEsn != null && ev.priceEsn !== ev.price ? ` · ${ev.priceEsn ? fmtMoney(ev.priceEsn, ev.currency) : "FREE"} with ESNcard` : ""}</p>` : ""}
          ${isPast ? `<p class="form-hint">This event has already taken place.</p>`
            : ev.externalUrl ? `
          <a class="btn btn-magenta btn-block" style="margin-top:10px" href="${esc(ev.externalUrl)}" target="_blank" rel="noopener">Sign up on the partner page ${mi("open_in_new", "sm")}</a>
          <p class="form-hint">Registration happens on our partner's page - this app doesn't issue tickets for this event.</p>`
            : `<p class="form-hint">The sign-up link follows soon - check back!</p>`}
          ${!ev.published ? `<p class="form-hint">${mi("edit_note")} <strong>Draft</strong> - visible to the team only.</p>` : ""}
          ` : `
          <span class="price-tag ${(options ? minOptPrice === 0 : !effectivePrice) ? "free" : ""}">
            ${options
              ? (minOptPrice === 0 && options.every((o) => optEffective(o) === 0) ? "FREE" : `from ${fmtMoney(minOptPrice, ev.currency)}`)
              : isFree ? "FREE"
              : discounted ? `<span class="price-strike">${fmtMoney(ev.price, ev.currency)}</span>${effectivePrice ? fmtMoney(effectivePrice, ev.currency) : "FREE"}`
              : fmtMoney(ev.price, ev.currency)}
          </span>
          ${!options && discounted ? `<p class="member-note">ESNcard price applied</p>`
            : !options && !isFree && ev.priceEsn != null && !eligible ? `<p class="member-note">${fmtMoney(ev.priceEsn, ev.currency)} with a verified ESNcard - <a href="/profile">link yours</a></p>` : ""}
          ${options && eligible && options.some((o) => o.priceEsn != null) ? `<p class="member-note">ESNcard prices applied</p>` : ""}
          ${ev.esnOnly ? `<p class="form-hint">This event is exclusively for ESNcard holders.</p>` : ""}
          ${ev.esnLimit ? `<p class="form-hint">Limited ESNcard-member spots for this event.</p>` : ""}
          ${!ev.published ? `<p class="form-hint">${mi("edit_note")} <strong>Draft</strong> - visible to the team for shift planning. Registration opens when it's published.</p>`
          : myReg ? `
            ${myReg.status === "pending" && !isPast
              ? `
            <span class="badge badge-pending">Payment in progress</span>
            <p class="form-hint" style="margin-top:10px">${mi("hourglass_top")} You started a checkout for this event but didn't finish it - your spot is <strong>held</strong> for you in the meantime.</p>
            ${myReg.stripeSessionUrl ? `<button class="btn btn-magenta btn-block" id="btn-resume-pay">Resume payment →</button>` : ""}
            <button class="btn btn-ghost btn-block btn-danger" id="btn-cancel-pending">Cancel checkout &amp; free my spot</button>
            <p class="form-hint">Changed your mind? Cancelling releases the spot instantly so you (or someone else) can grab it again. Unfinished checkouts also cancel themselves after ~30 minutes.</p>`
              : `<p class="form-hint">${mi("check_circle")} You ${isPast ? "attended this one with" : "already have"} a ticket for this event${isPast ? "" : " - it's <strong>one ticket per person</strong>"}.</p>
            <a href="/ticket/${myReg.id}" class="btn btn-dark btn-block">View my ticket</a>
            ${isPast && myReg.checkedInAt ? `<a href="/rate/${myReg.id}" class="btn btn-ghost btn-block btn-ink">Rate this event ★</a>` : ""}`}
          `
          : isPast ? `<p class="form-hint">This event has already taken place.</p>`
          : soldOut ? `
            <span class="badge badge-soldout">Sold out</span>
            ${currentUser
              ? `<div id="waitlist-box"><p class="form-hint">Checking waitlist…</p></div>`
              : `<button class="btn btn-google btn-block" id="btn-login-first">${googleG()}<span>Sign in to join the waitlist</span></button>`}`
          : !currentUser ? `<button class="btn btn-google btn-block" id="btn-login-first">${googleG()}<span>Sign in to ${isFree ? "register" : "buy a ticket"}</span></button>`
          : memberBlocked ? `<a href="/profile" class="btn btn-dark btn-block">Link or buy your ESNcard first</a>`
          : options ? `
            <div class="form-field">
              <label for="opt-select"><strong>Choose your ticket:</strong></label>
              <select id="opt-select">
                ${options.map((o) => {
                  const gone = o.capacity && ((ev.optionSold || {})[o.id] || 0) >= o.capacity;
                  return `<option value="${esc(o.id)}" ${gone ? "disabled" : ""}>${esc(o.name)} - ${gone ? "sold out" : optEffective(o) ? fmtMoney(optEffective(o), ev.currency) : "FREE"}</option>`;
                }).join("")}
              </select>
            </div>
            ${eventPolicyHtml(ev, noShows)}
            <button class="btn btn-magenta btn-block" id="btn-continue">Continue →</button>
            <p class="form-hint">One ticket per person. Free tickets register instantly; paid ones go through Stripe's secure checkout.</p>
          `
          : !effectivePrice ? `
            ${eventPolicyHtml(ev, noShows)}
            <button class="btn btn-green btn-block" id="btn-register-free">Register for free</button>
            <p class="form-hint">One ticket per person.${!isFree ? " Free for you as a verified ESNcard member." : ""}</p>
          `
          : `
            ${eventPolicyHtml(ev, noShows)}
            <button class="btn btn-magenta btn-block" id="btn-buy">Buy with Stripe →</button>
            <p class="form-hint">One ticket per person. You'll be redirected to Stripe's secure checkout.</p>
          `}
          `}
        </div>
      </div>
    </article>
  `;

  document.getElementById("btn-ics").onclick = () => downloadIcs(ev);
  // Share (v0.140): native share sheet where available, clipboard otherwise.
  document.getElementById("btn-share-event")?.addEventListener("click", async () => {
    const url = `${location.origin}/event/${ev.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: ev.title, text: `${ev.title} - ${fmtDate(ev.start)} · join me!`, url }); return; } catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(url); toast("Event link copied - paste it anywhere.", "success"); }
    catch { toast(url, "warn"); }
  });
  document.getElementById("btn-login-first")?.addEventListener("click", signIn);

  // Complete profile before registering: name, birthday, phone, nationality,
  // home country & city. (Home university / Instagram / LinkedIn stay optional.)
  const requireProfile = async () => {
    const missing = profileMissing();
    if (!missing.length) return true;
    await appAlert(`One quick thing first - your profile is missing: ${missing.join(", ")}.\n\nFill those in (takes ±30 seconds) and you'll land right back here to register.`, "Complete my profile");
    profileReturnTo = `/event/${ev.id}`;
    navigate("/profile");
    return false;
  };

  // Waitlist (sold-out events, signed-in users, in-app tickets only)
  if (soldOut && !isPast && currentUser && !myReg && regMode === "app") {
    (async () => {
      const box = document.getElementById("waitlist-box");
      if (!box) return;
      try {
        const mine = await getDocs(query(
          collection(db, "waitlist"),
          where("eventId", "==", ev.id),
          where("uid", "==", currentUser.uid),
        ));
        if (!mine.empty) {
          const entryId = mine.docs[0].id;
          const entry = mine.docs[0].data();
          const offerUntil = entry.offerExpiresAt ? toDate(entry.offerExpiresAt) : null;
          if (offerUntil && offerUntil > new Date()) {
            // A freed spot is being held for THIS user (window set in admin settings).
            box.innerHTML = `
              <p style="font-size:.9rem;font-weight:700;color:var(--esn-green)">${mi("celebration", "sm")} A spot is held for YOU!</p>
              <p class="form-hint">Grab it before <strong>${fmtDate(offerUntil)} ${fmtTime(offerUntil)}</strong> - after that it goes to the next person in line.</p>
              ${options ? `
              <div class="form-field"><label for="wl-opt"><strong>Choose your ticket:</strong></label>
                <select id="wl-opt">${options.map((o) => `<option value="${esc(o.id)}">${esc(o.name)} - ${optEffective(o) ? fmtMoney(optEffective(o), ev.currency) : "FREE"}</option>`).join("")}</select></div>` : ""}
              ${eventPolicyHtml(ev, noShows)}
              <button class="btn btn-magenta btn-block" id="btn-claim-spot">Claim my spot</button>`;
            const claimBtn = document.getElementById("btn-claim-spot");
            claimBtn.onclick = async () => {
              if (!(await requireProfile())) return;
              const optId = options ? document.getElementById("wl-opt").value : null;
              const opt = options ? options.find((o) => o.id === optId) : null;
              const price = options ? optEffective(opt) : effectivePrice;
              btnBusy(claimBtn, price ? "Opening secure checkout…" : "Claiming your spot…");
              try {
                if (!price) {
                  const registerFree = httpsCallable(functions, "registerFree");
                  await registerFree({ eventId: ev.id, ...(opt ? { optionId: opt.id } : {}), policyAgreed: true });
                  toast("You're in - the spot is yours!", "success");
                  navigate("/my-tickets");
                } else {
                  const createCheckoutSession = httpsCallable(functions, "createCheckoutSession");
                  const res = await createCheckoutSession({ eventId: ev.id, ...(opt ? { optionId: opt.id } : {}), policyAgreed: true });
                  window.location.href = res.data.url;
                }
              } catch (err) {
                toast(err.message || "Could not claim the spot", "error");
                btnIdle(claimBtn);
              }
            };
          } else {
            box.innerHTML = `
              <p class="form-hint">You're on the waitlist - if a spot frees up you'll get a notification and <strong>${eventDefaults.waitlistHours || 12} hours</strong> to grab it before it moves to the next person.</p>
              <button class="btn btn-ghost btn-sm" id="btn-leave-wl" style="color:var(--esn-magenta)">Leave waitlist</button>`;
            document.getElementById("btn-leave-wl").onclick = async () => {
              try {
                await deleteDoc(doc(db, "waitlist", entryId));
                toast("Removed from the waitlist", "success");
                viewEvent(ev.id);
              } catch (err) { toast(err.message, "error"); }
            };
          }
        } else {
          box.innerHTML = `
            <button class="btn btn-orange btn-block" id="btn-join-wl">Join the waitlist</button>
            <p class="form-hint">If a spot frees up, the first in line gets a notification and ${eventDefaults.waitlistHours || 12} hours to grab it.</p>`;
          document.getElementById("btn-join-wl").onclick = async (e2) => {
            e2.target.disabled = true;
            try {
              await addDoc(collection(db, "waitlist"), {
                eventId: ev.id,
                eventTitle: ev.title || "",
                eventStart: ev.start || null,
                uid: currentUser.uid,
                name: currentUser.displayName || "",
                email: currentUser.email || "",
                createdAt: serverTimestamp(),
              });
              toast("You're on the waitlist", "success");
              viewEvent(ev.id);
            } catch (err) {
              toast(err.message, "error");
              e2.target.disabled = false;
            }
          };
        }
      } catch {
        box.innerHTML = `<p class="form-hint">Couldn't check the waitlist just now.</p>
          <button class="btn btn-sm btn-ghost btn-ink" id="btn-wl-retry">Try again</button>`;
        document.getElementById("btn-wl-retry").onclick = () => viewEvent(ev.id);
      }
    })();
  }

  // Registering itself counts as agreeing to the ticket policy (the note
  // under the policy box says so) - no checkbox to tick every time.

  // Capacity failures during a rush (v0.130): the page's counts were
  // stale, someone else took the last spot or holds it. Re-render so the
  // student lands on the REAL state (sold out + waitlist button) instead
  // of a retry loop against a spot that isn't there.
  const capacityFail = (err) => {
    const msg = err?.message || "";
    if (err?.code === "functions/resource-exhausted" || /tickets left|sold out|held for someone/i.test(msg)) {
      toast(msg + " Showing the current availability…", "warn");
      viewEvent(ev.id);
      return true;
    }
    return false;
  };

  document.getElementById("btn-register-free")?.addEventListener("click", async (e) => {
    if (!(await requireProfile())) return;
    btnBusy(e.target, "Registering you…");
    try {
      // (The old Spark-era direct-write fallback is gone - it swallowed the
      // REAL error from registerFree behind a rules permission-denied.)
      const registerFree = httpsCallable(functions, "registerFree");
      await registerFree({ eventId: ev.id, policyAgreed: true });
      toast("You're registered!", "success");
      navigate("/my-tickets");
    } catch (err) {
      if (capacityFail(err)) return;
      toast(err.message || "Registration failed", "error");
      btnIdle(e.target);
    }
  });

  document.getElementById("btn-continue")?.addEventListener("click", async (e) => {
    if (!(await requireProfile())) return;
    const optId = document.getElementById("opt-select").value;
    const opt = options.find((o) => o.id === optId);
    if (!opt) return;
    const price = optEffective(opt);
    btnBusy(e.target, price === 0 ? "Registering you…" : "Opening secure checkout…");
    try {
      if (price === 0) {
        const registerFree = httpsCallable(functions, "registerFree");
        await registerFree({ eventId: ev.id, optionId: opt.id, policyAgreed: true });
        toast("You're registered!", "success");
        navigate("/my-tickets");
        return;
      }
      const createCheckoutSession = httpsCallable(functions, "createCheckoutSession");
      const res = await createCheckoutSession({ eventId: ev.id, optionId: opt.id, policyAgreed: true });
      window.location.href = res.data.url;
      return;
    } catch (err) {
      if (capacityFail(err)) return;
      toast(err.message || "Could not continue", "error");
      btnIdle(e.target);
    }
  });

  document.getElementById("btn-buy")?.addEventListener("click", async (e) => {
    if (!(await requireProfile())) return;
    btnBusy(e.target, "Opening secure checkout…");
    try {
      const createCheckoutSession = httpsCallable(functions, "createCheckoutSession");
      const res = await createCheckoutSession({ eventId: ev.id, policyAgreed: true });
      window.location.href = res.data.url;
    } catch (err) {
      if (capacityFail(err)) return;
      toast(err.message || "Could not start checkout", "error");
      btnIdle(e.target);
    }
  });

  // Pending checkout (v0.101.2): resume the still-open Stripe session, or
  // cancel it server-side (expires the session + releases the held spot).
  document.getElementById("btn-resume-pay")?.addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Opening Stripe…";
    window.location.href = myReg.stripeSessionUrl;
  });
  document.getElementById("btn-cancel-pending")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (!(await appConfirm("Cancel this checkout? Your held spot is released immediately and you can register again."))) return;
    btn.disabled = true;
    btn.textContent = "Cancelling…";
    try {
      await httpsCallable(functions, "cancelPendingCheckout")({ registrationId: myReg.id });
      toast("Checkout cancelled - the spot is free again", "success");
    } catch (err) {
      toast(err.message || "Could not cancel the checkout", "error");
    }
    viewEvent(ev.id); // re-render either way (the expiry webhook may have raced us)
  });
}

async function viewMyTickets() {
  if (!currentUser) {
    $app.innerHTML = signInState("lock", "Sign in to see your tickets and transactions.");
    document.getElementById("es-login").onclick = signIn;
    return;
  }
  setLoading();
  let regs, merchOrders = [];
  try { regs = await fetchMyRegistrations(); }
  catch (e) {
    $app.innerHTML = errorState(navigator.onLine
      ? e.message
      : "You're offline and no tickets are saved on this device yet. Open the app once while online and your tickets stay available offline.");
    return;
  }
  try {
    const ms = await getDocs(query(collection(db, "merchOrders"), where("uid", "==", currentUser.uid)));
    merchOrders = ms.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
  } catch { /* non-fatal */ }
  // v0.130: waitlist spots used to be invisible outside each event page -
  // now they live here, where people look for "my stuff".
  let myWaitlist = [];
  try {
    const ws = await getDocs(query(collection(db, "waitlist"), where("uid", "==", currentUser.uid)));
    myWaitlist = ws.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((w) => toDate(w.eventStart) ? toDate(w.eventStart) > new Date() : true)
      .sort((a, b) => (toDate(a.eventStart)?.getTime() || 0) - (toDate(b.eventStart)?.getTime() || 0));
  } catch { /* non-fatal */ }
  const myFeedback = {};
  try {
    const fs = await getDocs(query(collection(db, "feedback"), where("uid", "==", currentUser.uid)));
    fs.docs.forEach((d) => { myFeedback[d.id] = d.data(); });
  } catch { /* non-fatal */ }

  // Long lists stay short: first 12 tickets / 8 orders, then "Show all".
  let regsShown = 12, merchShown = 8, tq = "", archOpen = false;
  const render = () => {
  const match = (s) => !tq || String(s || "").toLowerCase().includes(tq);
  const regsF = tq ? regs.filter((r) => match(`${r.eventTitle} ${r.optionName || ""} ${r.status}`)) : regs;
  const merchF = tq ? merchOrders.filter((o) => match(`${o.productName} ${o.variantName || ""} ${o.status}`)) : merchOrders;
  // Ticket cards (v0.137): event date & time (not the purchase date), a
  // clear status (checked in / valid / not scanned / pending / cancelled),
  // whole card opens the ticket - buttons inside keep working.
  const tkStatus = (r, past) => {
    if (r.checkedInAt) return `<span class="badge badge-paid">${mi("verified", "sm")} Checked in · ${fmtTime(r.checkedInAt)}</span>`;
    if (r.status === "paid" || r.status === "free") {
      if (r.transferCode) return `<span class="badge badge-pending">${mi("send", "sm")} Transfer pending</span>`;
      return past ? `<span class="badge badge-soldout">${mi("event_busy", "sm")} Not scanned</span>`
        : `<span class="badge badge-esn">${mi("qr_code_2", "sm")} Valid ticket</span>`;
    }
    if (r.status === "pending") return `<span class="badge badge-pending">${mi("hourglass_top", "sm")} Payment not finished</span>`;
    return `<span class="badge badge-soldout">${esc(r.status)}</span>`;
  };
  const rowHtml = (r, past = false) => {
    const live = r.status === "paid" || r.status === "free";
    const acc = accentFor(r.eventId || r.id);
    return `
    <div class="tk-item ${past ? "past" : ""}" style="--accent:${acc}" ${live ? `data-evlink="/ticket/${r.id}"` : ""}>
      <span class="tk-ico">${mi(eventIcon({ title: r.eventTitle }))}</span>
      <div class="tk-main">
        <strong>${esc(r.eventTitle || r.eventId)}</strong>
        <small>${r.eventStart ? `${mi("event", "sm")} ${fmtDate(r.eventStart)} · ${fmtTime(r.eventStart)}` : `${mi("event", "sm")} date to be announced`}${r.optionName ? ` · ${esc(r.optionName)}` : ""}</small>
        <small>${r.quantity > 1 ? `${r.quantity} tickets` : "1 ticket"} · ${r.status === "free" || !r.amountTotal ? "free" : fmtMoney(r.amountTotal, r.currency)}${r.refundRequested ? ` · <span style="color:var(--esn-orange)">refund requested</span>` : ""}</small>
      </div>
      <div class="tk-right">
        ${tkStatus(r, past)}
        <span class="tk-actions">${live
          ? `<a class="btn btn-sm btn-dark" href="/ticket/${r.id}">${mi("qr_code_2", "sm")} Ticket</a>`
          : r.status === "pending"
          ? `${r.stripeSessionUrl ? `<a class="btn btn-sm btn-magenta" href="${esc(r.stripeSessionUrl)}">Pay</a>` : ""}<button class="btn btn-sm btn-ghost btn-cancel-pending-reg btn-danger" data-rid="${r.id}">Cancel</button>`
          : `<a class="btn btn-sm btn-ghost btn-ink" href="/event/${r.eventId}">Event</a>`}
          ${r.checkedInAt ? `<a class="btn btn-sm btn-ghost" style="color:var(--esn-orange)" href="/rate/${r.id}">${myFeedback[r.id] ? `★ ${myFeedback[r.id].rating}` : "Rate ★"}</a>` : ""}</span>
      </div>
    </div>`;
  };
  // Archive rule (v0.137): the DAY AFTER the event (Belgian date, with a
  // 06:00 grace for parties that run past midnight) a ticket can't be
  // scanned any more - it moves to the archive together with anything
  // cancelled or refunded. Active tickets: soonest event first.
  const dayKey = (d) => { const bp = beParts(d); return bp ? bp.year * 10000 + bp.month * 100 + bp.day : 0; };
  const todayKey = dayKey(new Date(Date.now() - 6 * 3600e3));
  const isPastReg = (r) => r.eventStart && dayKey(r.eventStart) < todayKey;
  const activeRegs = regsF
    .filter((r) => !isPastReg(r) && ["paid", "free", "pending"].includes(r.status))
    .sort((a, b) => (toDate(a.eventStart)?.getTime() || 0) - (toDate(b.eventStart)?.getTime() || 0));
  const archivedRegs = regsF.filter((r) => !activeRegs.includes(r));
  const checkedInCount = regs.filter((r) => r.checkedInAt).length;
  const ticketsTable = (list, past = false) => `<div class="tk-list">${list.map((r) => rowHtml(r, past)).join("")}</div>`;

  $app.innerHTML = `
    <h2 class="section-title">${mi("confirmation_number")} My tickets</h2>
    ${navigator.onLine ? "" : `<p class="form-hint" style="margin:-6px 0 14px">${mi("wifi_off", "sm")} You're offline: showing your saved tickets. The QR codes scan normally at the door.</p>`}
    ${regs.length && !tq ? `
    <div class="stat-row tk-stats" style="margin-bottom:14px">
      <div class="stat-card" style="--accent:#00AEEF"><div class="num">${activeRegs.length}</div><div class="lbl">${mi("local_activity", "sm")} Upcoming</div></div>
      <div class="stat-card" style="--accent:#7AC143"><div class="num">${checkedInCount}</div><div class="lbl">${mi("verified", "sm")} Checked in</div></div>
      ${myWaitlist.length ? `<div class="stat-card" style="--accent:#F47B20"><div class="num">${myWaitlist.length}</div><div class="lbl">${mi("hourglass_top", "sm")} Waitlists</div></div>` : ""}
    </div>` : ""}
    ${regs.length ? pushOfferHtml("Get a reminder <strong>3 hours before</strong> your events - and instant refund updates?") : ""}
    ${regs.length + merchOrders.length > 5 ? `
      <div class="filter-bar" style="margin-bottom:12px">
        <input id="tickets-q" type="search" placeholder="Search your tickets & orders…" value="${esc(tq)}" />
      </div>` : ""}
    ${regsF.length ? `
      ${activeRegs.length ? `
        <h3 class="section-title sm">${mi("local_activity", "sm")} Active &amp; upcoming ${hintIcon("A 'pending' ticket is a Stripe checkout that wasn't finished - hit Pay to complete it or Cancel to free your spot (unfinished checkouts also expire by themselves after ~30 minutes). Cancelling a CONFIRMED ticket or requesting a refund happens on the ticket itself, under Ticket options, until the event's cancellation deadline.")}</h3>
        ${ticketsTable(activeRegs)}`
      : `<div class="empty-state" style="margin-bottom:14px"><p>No upcoming tickets - <a href="/">browse events</a> for your next one!</p></div>`}
      ${archivedRegs.length ? `
        <details id="arch-details" style="margin:14px 0 10px" ${tq || archOpen ? "open" : ""}>
          <summary class="section-title sm" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">${mi("inventory_2", "sm")} Archive · past tickets (${archivedRegs.length})</summary>
          ${ticketsTable(archivedRegs.slice(0, tq ? archivedRegs.length : regsShown), true)}
          ${!tq && archivedRegs.length > regsShown ? `<div class="form-actions" style="margin:0 0 10px"><button class="btn btn-ghost btn-sm btn-ink" id="regs-more">Show all past tickets (${archivedRegs.length - regsShown} more)</button></div>` : ""}
        </details>` : ""}`
    : `<div class="empty-state"><div class="big">${mi("confirmation_number")}</div><p>${tq ? "Nothing matches your search." : `No tickets yet. <a href="/">Browse events</a> to get started!`}</p></div>`}
    ${myWaitlist.length && !tq ? `
      <h3 class="section-title sm">My waitlists</h3>
      <div class="faq-list">
        ${myWaitlist.map((w) => {
          const offer = w.offerExpiresAt && toDate(w.offerExpiresAt) > new Date();
          return `
          <div class="form-card" style="margin-bottom:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="flex:1;min-width:180px">
              <a href="/event/${w.eventId}"><strong>${esc(w.eventTitle || "Event")}</strong></a>
              <br><small class="form-hint">${w.eventStart ? fmtDate(w.eventStart) : ""}${offer ? ` · <strong style="color:var(--esn-green)">a spot is held for YOU until ${fmtTime(w.offerExpiresAt)}!</strong>` : " · waiting for a spot"}</small>
            </div>
            ${offer ? `<a class="btn btn-sm btn-green" href="/event/${w.eventId}">Claim it</a>` : `<a class="btn btn-sm btn-ghost btn-ink" href="/event/${w.eventId}">View</a>`}
            <button class="btn btn-sm btn-ghost btn-leave-wl2" data-wid="${w.id}" style="color:var(--esn-magenta)">Leave</button>
          </div>`;
        }).join("")}
      </div>` : ""}
    ${merchF.length ? `
      <h3 class="section-title sm">My shop orders</h3>
      <div class="table-wrap cards"><table>
        <thead><tr><th>Item</th><th>Ordered</th><th>Qty</th><th>Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${merchF.slice(0, tq ? merchF.length : merchShown).map((o) => `
          <tr>
            <td class="card-main"><strong>${esc(o.productName || "-")}</strong>${o.variantName ? `<br><small class="form-hint">${esc(o.variantName)}</small>` : ""}</td>
            <td data-l="Ordered">${o.createdAt ? fmtDate(o.createdAt) : "-"}</td>
            <td data-l="Qty">${o.quantity || 1}</td>
            <td data-l="Amount">${fmtMoney(o.amountTotal, o.currency)}</td>
            <td data-l="Status">${o.pickedUpAt ? `<span class="badge badge-paid">picked up</span>`
              : o.status === "paid" ? `<span class="badge badge-paid">paid - ready for pickup</span>`
              : o.status === "requested" ? `<span class="badge badge-requested">reserved - pay at pickup</span>`
              : o.status === "pending" ? `<span class="badge badge-pending">payment not finished</span>`
              : `<span class="badge badge-pending">${esc(o.status)}</span>`}</td>
            <td style="white-space:nowrap" class="card-actions">${o.pickedUpAt || o.status === "pending" ? "" : `<a class="btn btn-sm btn-dark" href="/order/${o.id}">QR</a>`}
              ${o.status === "pending" && o.stripeSessionUrl ? `<a class="btn btn-sm btn-magenta" href="${esc(o.stripeSessionUrl)}">Pay</a>` : ""}
              ${o.status === "requested" ? `<button class="btn btn-sm btn-ghost btn-cancel-merch btn-danger" data-oid="${o.id}">Cancel</button>` : ""}</td>
          </tr>`).join("")}
        </tbody>
      </table></div>
      ${!tq && merchF.length > merchShown ? `<div class="form-actions" style="margin:6px 0 0"><button class="btn btn-ghost btn-sm btn-ink" id="merch-more">Show all orders (${merchF.length - merchShown} more)</button></div>` : ""}` : ""}
  `;

  $app.querySelectorAll(".btn-leave-wl2").forEach((b) => {
    b.onclick = async () => {
      if (!await appConfirm("Leave this waitlist? You lose your place in line.")) return;
      try {
        await deleteDoc(doc(db, "waitlist", b.dataset.wid));
        toast("Removed from the waitlist", "success");
        viewMyTickets();
      } catch (err) { toast(err.message, "error"); }
    };
  });
  document.getElementById("regs-more")?.addEventListener("click", () => { regsShown = regs.length; archOpen = true; render(); });
  document.getElementById("arch-details")?.addEventListener("toggle", (e) => { archOpen = e.target.open; });
  document.getElementById("merch-more")?.addEventListener("click", () => { merchShown = merchOrders.length; render(); });
  const tqEl = document.getElementById("tickets-q");
  if (tqEl) {
    tqEl.addEventListener("input", () => {
      const pos = tqEl.selectionStart; // v0.130: don't yank the caret to the end
      tq = tqEl.value.trim().toLowerCase();
      render();
      const el = document.getElementById("tickets-q");
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }
  wirePushOffer(render);

  $app.querySelectorAll(".btn-cancel-pending-reg").forEach((btn) => {
    btn.onclick = async () => {
      if (!await appConfirm("Cancel this checkout? Your held spot is released immediately.")) return;
      btn.disabled = true;
      try {
        await httpsCallable(functions, "cancelPendingCheckout")({ registrationId: btn.dataset.rid });
        toast("Checkout cancelled", "success");
      } catch (err) { toast(err.message, "error"); }
      viewMyTickets();
    };
  });

  $app.querySelectorAll(".btn-cancel-merch").forEach((btn) => {
    btn.onclick = async () => {
      if (!await appConfirm("Cancel this reservation?")) return;
      try {
        await deleteDoc(doc(db, "merchOrders", btn.dataset.oid));
        toast("Reservation cancelled", "success");
        viewMyTickets();
      } catch (err) { toast(err.message, "error"); }
    };
  });

  }; // end render()
  render();
}

async function viewTicket(regId) {
  if (!currentUser) {
    $app.innerHTML = signInState("lock", "Sign in to view your ticket.");
    document.getElementById("es-login").onclick = signIn;
    return;
  }
  setLoading();
  let reg = null;
  try {
    const snap = await getDoc(doc(db, "registrations", regId));
    if (snap.exists()) reg = { id: snap.id, ...snap.data() };
  } catch (err) {
    // Only a rules rejection means "not yours" - anything else is a
    // connection problem and deserves a retry, not an accusation (v0.130).
    if (err?.code !== "permission-denied") {
      $app.innerHTML = errorState(navigator.onLine ? err.message : "You seem to be offline and this ticket isn't saved on this device yet.");
      return;
    }
  }
  if (!reg) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("search_off")}</div><p>Ticket not found (or it isn't yours).</p><p><a class="btn btn-cyan btn-sm" href="/my-tickets">My tickets</a></p></div>`;
    return;
  }
  if (reg.status !== "paid" && reg.status !== "free") {
    $app.innerHTML = `<div class="empty-state"><div class="big">${reg.status === "refunded" || reg.status === "cancelled" ? mi("currency_exchange") : "⏳"}</div><p>${
      reg.status === "refunded" ? "This ticket was refunded - it's no longer valid."
      : reg.status === "cancelled" ? "This registration was cancelled (the event didn't go ahead)."
      : `This ticket isn't confirmed yet (status: ${esc(reg.status)}).`}</p></div>`;
    return;
  }

  // Event data decides whether cancel/refund are still possible: they close
  // at the event's cancellation deadline and never reappear afterwards.
  let regEvent = null;
  try {
    const evSnap = await getDoc(doc(db, "events", reg.eventId));
    if (evSnap.exists()) regEvent = evSnap.data();
  } catch { /* event unreadable → no cancel options */ }
  const evStart = regEvent ? toDate(regEvent.start) : null;
  const deadlineHrs = regEvent && typeof regEvent.cancelHours === "number" && regEvent.cancelHours >= 0 ? regEvent.cancelHours : eventDefaults.defaultCancelHours;
  const deadlineAt = evStart ? new Date(evStart.getTime() - deadlineHrs * 3600e3) : null;
  const beforeDeadline = !!deadlineAt && Date.now() < deadlineAt.getTime() && !regEvent?.cancelled;
  // Transfers close the moment the event starts (a wrong end date should
  // never keep the button alive days later). Unreadable event → no transfer.
  const eventStarted = evStart ? evStart <= new Date() : true;
  const isOwner = currentUser && reg.uid === currentUser.uid;
  const canCancelFree = isOwner && reg.status === "free" && !reg.checkedInAt && beforeDeadline;
  const canRefund = isOwner && reg.status === "paid" && !reg.checkedInAt && !reg.refundRequested && !reg.transferCode && beforeDeadline && !regEvent?.nonRefundable;
  const canTransfer = isOwner && !reg.checkedInAt && !reg.refundRequested && !eventStarted;
  const checkedIn = !!reg.checkedInAt;
  const evLoc = regEvent?.location || "";
  const optCount = [canTransfer, canCancelFree, canRefund].filter(Boolean).length;
  $app.innerHTML = `
    <div class="ticket-panel ${checkedIn ? "is-in" : ""}">
      <div class="ticket-head">
        <span class="ticket-kicker">${mi("confirmation_number", "sm")} ${reg.status === "free" ? "Free registration" : "Ticket"}${reg.optionName ? ` · ${esc(reg.optionName)}` : ""}</span>
        <h1>${esc(reg.eventTitle || "Event ticket")}</h1>
        <p class="ticket-when">${evStart ? `${mi("event", "sm")} ${fmtDate(evStart)} · ${fmtTime(evStart)}` : ""}${evLoc ? ` &nbsp; ${mi("location_on", "sm")} ${esc(evLoc)}` : ""}</p>
      </div>
      <div class="ticket-body">
        <div id="tk-live">${checkedIn ? `
          <div class="tk-in">
            <span class="tk-in-ico">${mi("check_circle")}</span>
            <div><strong>You're in - have fun!</strong><br><span class="form-hint">Checked in ${fmtDate(reg.checkedInAt)} · ${fmtTime(reg.checkedInAt)} · stamp collected in your <a href="/passport">ESN Passport</a></span></div>
          </div>` : `<span class="badge badge-esn" id="tk-status">${mi("qr_code_2", "sm")} Valid - show this at the door</span>`}</div>
        ${navigator.onLine ? "" : `<p class="form-hint">You're offline - showing your saved ticket. The QR code works normally.</p>`}
        <div class="qr-box" id="qr"></div>
        <ul class="ticket-facts">
          <li><span>${mi("person", "sm")} Name</span><strong>${esc(reg.name || currentUser.displayName || "")}</strong></li>
          <li><span>${mi("groups", "sm")} Tickets</span><strong>${reg.quantity || 1}</strong></li>
          <li><span>${mi("tag", "sm")} Code</span><strong class="mono">${esc(reg.id)}</strong></li>
          ${reg.amountTotal ? `<li><span>${mi("payments", "sm")} Paid</span><strong>${fmtMoney(reg.amountTotal, reg.currency)}</strong></li>` : ""}
        </ul>
        ${reg.refundRequested ? `<p class="form-hint">${mi("currency_exchange", "sm")} Refund requested - the treasurer is reviewing it. The ticket stays valid until it's approved.</p>` : ""}
        ${reg.transferCode && isOwner ? `
          <div class="ticket-transfer">
            <p><strong>${mi("send", "sm")} Transfer pending</strong><br><span class="form-hint">Send this link to the new owner - the ticket moves to their account the moment they claim it.</span></p>
            <p class="ticket-code">${esc(`${location.origin}/claim/${reg.id}/${reg.transferCode}`)}</p>
            <p class="ticket-btns">
              <button class="btn btn-sm btn-cyan" id="btn-share-transfer">${mi("share", "sm")} Share link</button>
              <button class="btn btn-sm btn-ghost btn-danger" id="btn-cancel-transfer">Cancel transfer</button>
            </p>
          </div>
        ` : ""}
        ${!reg.transferCode && optCount ? `
          <details class="ticket-more">
            <summary>${mi("tune", "sm")} Ticket options <span class="form-hint">(${optCount})</span></summary>
            <div class="ticket-more-body">
              ${canTransfer ? `
                <button class="btn btn-sm btn-ghost btn-ink tk-opt" id="btn-transfer">${mi("send", "sm")} Transfer to someone else<small>${(reg.quantity || 1) > 1 ? `Moves the whole booking (${reg.quantity} tickets) to their account` : "The ticket moves to their account when they claim the link"}</small></button>` : ""}
              ${canCancelFree ? `
                <button class="btn btn-sm btn-ghost tk-opt" id="btn-cancel-reg" style="color:var(--esn-magenta)">${mi("cancel", "sm")} Cancel my registration<small>Your spot goes back on sale</small></button>` : ""}
              ${canRefund ? `
                <button class="btn btn-sm btn-ghost tk-opt" id="btn-refund-reg" style="color:var(--esn-magenta)">${mi("currency_exchange", "sm")} Request a refund<small>Reviewed by the treasurer${regEvent?.refundFee ? ` · fee ${fmtMoney(regEvent.refundFee)}` : ""}</small></button>` : ""}
              ${deadlineAt && (canCancelFree || canRefund) ? `<p class="form-hint">${mi("schedule", "sm")} Possible until ${fmtDate(deadlineAt)} ${fmtTime(deadlineAt)}.</p>` : ""}
            </div>
          </details>
        ` : ""}
        <p class="ticket-btns">
          <a href="/my-tickets" class="btn btn-ghost btn-sm btn-ink">${mi("arrow_back", "sm")} My tickets</a>
          <a href="/event/${reg.eventId}" class="btn btn-ghost btn-sm btn-ink">${mi("info", "sm")} Event page</a>
          ${checkedIn ? `<a href="/rate/${reg.id}" class="btn btn-sm btn-orange">${mi("star", "sm")} Rate this event</a>` : ""}
        </p>
      </div>
    </div>`;
  // QRCode comes from the qrcodejs script tag in index.html
  new QRCode(document.getElementById("qr"), {
    text: `${location.origin}/checkin/${reg.id}`,
    width: 220,
    height: 220,
  });

  // LIVE check-in (v0.107, hardened v0.116): the moment the door scans this
  // ticket, the page flips to "you're in" by itself - no refresh. The phone
  // is often LOCKED right before the scan and the realtime channel can lag
  // on wake, so besides the snapshot listener we also (a) re-check when the
  // page becomes visible again and (b) poll gently while waiting.
  const applyCheckin = (fresh) => {
    if (!fresh?.checkedInAt || reg.checkedInAt) return;
    reg.checkedInAt = fresh.checkedInAt;
    const slot = document.getElementById("tk-live");
    if (slot) slot.innerHTML = `<p class="checkin-flash" style="margin:8px 0;font-size:1rem">
      <strong style="color:#7AC143">${mi("check_circle")} You're in - have fun!</strong><br>
      <span class="form-hint">Checked in ${fmtDate(fresh.checkedInAt)} ${fmtTime(fresh.checkedInAt)} · a stamp just landed in your <a href="/passport">ESN Passport</a></span></p>`;
    document.getElementById("tk-status")?.remove();
    document.querySelector(".ticket-panel")?.classList.add("is-in");
    const qrBox = document.getElementById("qr");
    if (qrBox) {
      qrBox.style.position = "relative";
      qrBox.insertAdjacentHTML("beforeend",
        `<div class="checkin-flash" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.72);border-radius:8px;font-size:64px">✅</div>`);
    }
    // Once checked in, transfer/cancel/refund are moot - hide the options
    // so a stale page can't offer an action the rules will refuse (v0.128).
    document.querySelector(".ticket-more")?.remove();
  };
  const refreshOnce = async () => {
    if (reg.checkedInAt) return;
    try {
      const s = await getDoc(doc(db, "registrations", reg.id));
      if (s.exists()) applyCheckin(s.data());
    } catch { /* offline - snapshot listener will catch up */ }
  };
  ticketUnsub?.();
  const unsubSnap = onSnapshot(doc(db, "registrations", reg.id), (s) => {
    if (s.exists()) applyCheckin(s.data());
  }, () => { /* offline / permissions - the static view + polling stand */ });
  const onVis = () => { if (document.visibilityState === "visible") refreshOnce(); };
  document.addEventListener("visibilitychange", onVis);
  const poll = setInterval(() => {
    if (reg.checkedInAt) { clearInterval(poll); return; }
    if (document.visibilityState === "visible") refreshOnce();
  }, 15000);
  ticketUnsub = () => {
    unsubSnap();
    clearInterval(poll);
    document.removeEventListener("visibilitychange", onVis);
  };

  // Ticket transfer controls (owner only, unused tickets)
  document.getElementById("btn-transfer")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await updateDoc(doc(db, "registrations", reg.id), { transferCode: randomCode() });
      viewTicket(reg.id);
    } catch (err) {
      toast(/permission/i.test(err.message)
        ? "This ticket can't be transferred any more - it was already scanned at the door, has a refund pending, or the event has passed."
        : "Could not start transfer: " + err.message, "warn");
      e.target.disabled = false;
    }
  });
  document.getElementById("btn-cancel-transfer")?.addEventListener("click", async () => {
    try {
      await updateDoc(doc(db, "registrations", reg.id), { transferCode: "" });
      toast("Transfer cancelled - the link no longer works.", "success");
      viewTicket(reg.id);
    } catch (err) { toast(err.message, "error"); }
  });
  document.getElementById("btn-share-transfer")?.addEventListener("click", async () => {
    const url = `${location.origin}/claim/${reg.id}/${reg.transferCode}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Your ESN ticket", text: `I'm sending you my ticket for ${reg.eventTitle || "an ESN event"} - claim it here:`, url }); return; } catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(url); toast("Link copied - paste it to the new owner.", "success"); }
    catch { toast("Copy the link shown above manually.", "warn"); }
  });

  // Cancel / refund - tucked inside "Ticket options", only before the deadline
  document.getElementById("btn-cancel-reg")?.addEventListener("click", async (e) => {
    if (!await appConfirm("Cancel this registration? Your spot goes back on sale.")) return;
    e.target.disabled = true;
    try {
      try {
        const fn = httpsCallable(functions, "cancelRegistration");
        await fn({ registrationId: reg.id });
      } catch (fnErr) {
        // Fallback: direct delete - rules enforce ownership + the deadline
        try { await deleteDoc(doc(db, "registrations", reg.id)); }
        catch { throw fnErr; }
      }
      toast("Registration cancelled", "success");
      navigate("/my-tickets");
    } catch (err) {
      toast("Could not cancel: " + (err.message || ""), "error");
      e.target.disabled = false;
    }
  });
  document.getElementById("btn-refund-reg")?.addEventListener("click", async (e) => {
    if (!await appConfirm(`Request a refund for "${reg.eventTitle || "this event"}"?\n\nThe treasurer reviews every request. If the event has a refund fee, it is deducted - the exact amount is confirmed right away. Your ticket stays valid until the refund is approved.`)) return;
    e.target.disabled = true; e.target.textContent = "Requesting…";
    try {
      const fn = httpsCallable(functions, "requestTicketRefund");
      const res = await fn({ registrationId: reg.id });
      const { refundAmount, fee } = res.data || {};
      toast(`Refund requested: ${fmtMoney(refundAmount || 0)}${fee ? ` (${fmtMoney(fee)} fee deducted)` : ""} - the treasurer will review it.`, "success");
      viewTicket(reg.id);
    } catch (err) {
      toast(err.message || "Could not request a refund", "error");
      e.target.disabled = false; e.target.textContent = "Request a refund";
    }
  });
}

async function viewClaim(regId, code) {
  if (!regId || !code) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("link_off")}</div><p>This transfer link is incomplete.</p></div>`;
    return;
  }
  if (!currentUser) {
    $app.innerHTML = `<div class="checkin-panel">
      <div class="checkin-status">${mi("confirmation_number")}</div>
      <h1>Someone sent you a ticket</h1>
      <p style="margin-top:8px">Sign in to claim it - it will be moved to your account with your name on it. No account yet? The same button creates one.</p>
      <p style="margin-top:16px">${googleBtn("Sign in with Google")}</p>
    </div>`;
    document.getElementById("es-login").onclick = signIn;
    return;
  }
  $app.innerHTML = `<div class="checkin-panel">
    <div class="checkin-status">${mi("confirmation_number")}</div>
    <h1>Claim this ticket</h1>
    <p style="margin-top:8px">The ticket will be transferred to <strong>${esc(currentUser.displayName || currentUser.email)}</strong>. The sender's copy stops working.</p>
    <p style="margin-top:16px"><button class="btn btn-green" id="btn-claim" style="font-size:1.05rem">Claim ticket</button></p>
  </div>`;
  document.getElementById("btn-claim").onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Claiming…";
    try {
      // v0.131: claims go through the server so "one ticket per person"
      // also holds for transfers (rules can't check for an existing ticket).
      await httpsCallable(functions, "claimTicketTransfer")({ registrationId: regId, code });
      toast("Ticket claimed - it's yours now!", "success");
      navigate(`/ticket/${regId}`);
    } catch (err) {
      $app.innerHTML = `<div class="checkin-panel">
        <div class="checkin-status">${mi("cancel")}</div>
        <h1>Claim failed</h1>
        <p style="margin-top:8px">${esc(err?.message || "This link is invalid, already used, or cancelled.")}</p>
        <p style="margin-top:12px"><a class="btn btn-cyan btn-sm" href="/my-tickets">My tickets</a></p>
      </div>`;
    }
  };
}

async function viewCheckin(regId, justNow = false) {
  if (!currentUser || !isStaff()) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("badge")}</div><p>Ticket check-in is for ESN team members.${currentUser ? "" : " Please sign in."}</p>${currentUser ? "" : googleBtn()}</div>`;
    document.getElementById("es-login")?.addEventListener("click", signIn);
    return;
  }
  setLoading();
  let reg = null;
  try {
    const snap = await getDoc(doc(db, "registrations", regId));
    if (snap.exists()) reg = { id: snap.id, ...snap.data() };
  } catch { /* ignore */ }
  if (!reg) {
    $app.innerHTML = `<div class="checkin-panel"><div class="checkin-status" style="color:var(--esn-magenta)">${mi("cancel")}</div><h1>Invalid ticket</h1><p>No registration found for this code.</p></div>`;
    return;
  }
  const confirmed = reg.status === "paid" || reg.status === "free";
  const already = !!reg.checkedInAt && !justNow;
  // Day window (v0.125): check-in is meant for the EVENT DAY or the day
  // after (overnight parties). Outside that = warning + explicit override.
  const evD = toDate(reg.eventStart);
  const windowInfo = (() => {
    if (!evD) return { ok: true };
    const from = new Date(evD.getFullYear(), evD.getMonth(), evD.getDate());
    const to = new Date(from.getTime() + 2 * 86400e3); // event day + the next day
    const nowD = new Date();
    if (nowD >= from && nowD < to) return { ok: true };
    return { ok: false, early: nowD < from };
  })();
  const wrongDay = confirmed && !already && !justNow && !windowInfo.ok;
  const icon = !confirmed ? mi("block") : justNow ? mi("celebration") : already ? mi("error") : wrongDay ? mi("event_busy") : mi("check_circle");
  const iconColor = !confirmed ? "var(--esn-magenta)" : already || wrongDay ? "var(--esn-orange)" : "var(--esn-green)";
  const headline = !confirmed ? `NOT CONFIRMED (${esc(reg.status)})`
    : justNow ? "Checked in - welcome!"
    : already ? "Already checked in!"
    : wrongDay ? (windowInfo.early ? "Too early - wrong day!" : "Too late - event is over!") : "Valid ticket";

  $app.innerHTML = `
    <div class="checkin-panel">
      <div class="checkin-status" style="color:${iconColor}">${icon}</div>
      <h1>${headline}</h1>
      <div class="checkin-details">
        <p><strong>Event:</strong> ${esc(reg.eventTitle || reg.eventId)}</p>
        <p><strong>Name:</strong> ${esc(reg.name || "-")}</p>
        <p><strong>Email:</strong> ${esc(reg.email || "-")}</p>
        <p><strong>Tickets:</strong> ${reg.quantity || 1}</p>
        <p><strong>Status:</strong> <span class="badge badge-${reg.status}">${reg.status}</span></p>
        ${already ? `<p><strong>Checked in:</strong> ${fmtDate(reg.checkedInAt)} ${fmtTime(reg.checkedInAt)}</p>` : ""}
        ${wrongDay ? `<p style="color:var(--esn-orange)"><strong>${mi("warning", "sm")} This ticket is for ${fmtDate(reg.eventStart)}</strong> - check-in is meant for the event day (or the day after, for overnight events). ${windowInfo.early ? "The event hasn't happened yet." : "The check-in window has passed."}</p>` : ""}
      </div>
      ${confirmed && !already && !wrongDay ? `<button class="btn btn-green" id="btn-checkin" style="font-size:1.1rem">Check in now</button>` : ""}
      ${wrongDay ? `<button class="btn btn-magenta" id="btn-checkin-force">Check in anyway (board decision)</button>` : ""}
      <p style="margin-top:14px">
        <a href="/scan" class="btn btn-cyan btn-sm">Scan next</a>
        ${isAdmin ? `<a href="/admin" class="btn btn-ghost btn-sm" style="color:var(--esn-dark)">← Admin</a>` : ""}
      </p>
    </div>`;

  const doCheckin = async (btn) => {
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "registrations", reg.id), { checkedInAt: serverTimestamp() });
      toast("Checked in", "success");
      viewCheckin(regId, true);
    } catch (err) {
      toast("Check-in failed: " + err.message, "error");
      btn.disabled = false;
    }
  };
  document.getElementById("btn-checkin")?.addEventListener("click", (e) => doCheckin(e.target));
  document.getElementById("btn-checkin-force")?.addEventListener("click", async (e) => {
    const btn = e.target;
    if (!await appConfirm(`This ticket is for ${fmtDate(reg.eventStart)} - outside the normal check-in window. Let ${reg.name || "this person"} in anyway? (Board decision.)`)) return;
    doCheckin(btn);
  });
}

// ------------------------------------------------------------
// Changelog (staff only - students just see the version number)
// ------------------------------------------------------------
function viewChangelog() {
  if (!myRole) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("build")}</div><p>ESN Gent App <strong>v${APP_VERSION}</strong></p><p class="form-hint">The detailed update list is for the ESN team.</p></div>`;
    return;
  }
  $app.innerHTML = `
    <h2 class="section-title">What's new</h2>
    <p class="form-hint" style="margin:-6px 0 16px">Current version: <strong>v${APP_VERSION}</strong> - newest changes first.</p>
    <div class="faq-wrap">
      ${(() => {
        const card = (rel) => `
        <div class="form-card" style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px">
            <strong>v${esc(rel.version)}</strong>
            <span class="form-hint">${esc(rel.date)}</span>
          </div>
          <ul style="margin:10px 0 0 18px;font-size:.89rem">
            ${rel.notes.map((n) => `<li style="margin-bottom:4px">${esc(n)}</li>`).join("")}
          </ul>
        </div>`;
        return CHANGELOG.slice(0, 3).map(card).join("") + (CHANGELOG.length > 3 ? `
          <details><summary class="form-hint" style="cursor:pointer;margin-bottom:12px">Older versions (${CHANGELOG.length - 3})</summary>
            ${CHANGELOG.slice(3).map(card).join("")}
          </details>` : "");
      })()}
    </div>
  `;
}

// ------------------------------------------------------------
// Merch shop (pickup only)
// ------------------------------------------------------------
function merchVariants(p) {
  return Array.isArray(p.variants) && p.variants.length ? p.variants : null;
}
function merchUnitPrice(p, v, eligible) {
  const base = v && v.price != null ? v.price : (p.price || 0);
  const member = v && v.price != null ? v.priceEsn : p.priceEsn;
  return eligible && member != null ? member : base;
}

function productCard(p) {
  const accent = accentFor(p.id);
  const variants = merchVariants(p);
  const min = variants
    ? Math.min(...variants.map((v) => (v.price != null ? v.price : p.price || 0)))
    : (p.price || 0);
  const priceSpread = variants && variants.some((v) => v.price != null && v.price !== min);
  return `
    <article class="event-card" style="--accent:${accent}">
      ${p.image ? `<div class="card-img-wrap"><img class="card-img" loading="lazy" src="${esc(p.image)}" alt="" /></div>` : ""}
      <div class="card-body">
        <h3><a href="/product/${p.id}">${esc(p.name)}</a></h3>
        <p class="event-desc">${esc(plainText(p.description).slice(0, 100))}${plainText(p.description).length > 100 ? "…" : ""}</p>
        <div class="card-foot">
          <span class="price-tag">${priceSpread ? "from " : ""}${fmtMoney(min, p.currency)}
            ${p.priceEsn != null ? `<span class="member-note">ESNcard ${fmtMoney(p.priceEsn, p.currency)}</span>` : ""}
          </span>
          <a href="/product/${p.id}" class="btn btn-sm" style="background:${accent};color:#fff">View</a>
        </div>
      </div>
    </article>`;
}

// The ESNcard is "product number one" - the shop shows it as a status-aware
// tile for everyone who doesn't hold a verified, unexpired card yet.
function esncardShopTile(title, text, href, cta) {
  return `<div class="form-card" style="margin:0 0 16px;border-left:4px solid var(--esn-cyan);display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
    <div style="flex:1;min-width:220px">
      <strong>${mi("badge", "sm")} ${title}</strong>
      <p class="form-hint" style="margin:4px 0 0">${text}</p>
    </div>
    <a class="btn btn-magenta btn-sm" href="${href}">${cta} →</a>
  </div>`;
}
async function viewShop() {
  setLoading();
  let products;
  try {
    const snap = await getDocs(query(collection(db, "products"), where("published", "==", true)));
    products = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0));
  } catch (e) {
    $app.innerHTML = `<div class="empty-state"><p>Could not load the shop: ${esc(e.message)}</p></div>`;
    return;
  }
  let cardTile = "";
  try {
    if (!currentUser) {
      cardTile = esncardShopTile("Get your ESNcard", `${fmtMoney(cardPricing.student)} - a year of member prices here, plus thousands of student discounts across Europe.`, "/esncard", "Apply");
    } else if (!hasVerifiedCard()) {
      const as2 = await getDoc(doc(db, "esncardApplications", currentUser.uid)).catch(() => null);
      const a2 = as2 && as2.exists() ? as2.data() : null;
      const orphaned2 = a2?.status === "active" && !myProfile?.esncardCode;
      if (!a2 || orphaned2) {
        cardTile = esncardShopTile("Get your ESNcard", `${fmtMoney(cardPricing.student)} - a year of member prices here, plus thousands of student discounts across Europe.`, "/esncard", "Apply");
      } else if (a2.status === "rejected") {
        cardTile = esncardShopTile("Your ESNcard application needs a fix", "It was declined with a reason - adjust it and resubmit.", "/esncard", "Fix & resubmit");
      } else if (a2.status === "applied") {
        cardTile = (a2.price ?? cardPricing.student) === 0
          ? esncardShopTile("ESNcard - application received", "Free team card - pick it up during office hours.", "/office", "Office hours")
          : esncardShopTile("ESNcard - application received", `Almost there: pay ${fmtMoney(a2.price ?? cardPricing.student)} online from your account page${cashAllowed() ? ", or in cash during office hours" : ""}.`, "/account", "Finish payment");
      } else if (a2.status === "paid") {
        cardTile = esncardShopTile("ESNcard - being prepared", "Paid ✓ - the board is preparing your card. You'll get an e-mail the moment it's ready for pickup.", "/account", "View status");
      } else if (a2.status === "active" && !a2.pickedUpAt) {
        cardTile = esncardShopTile("Your ESNcard is ready for pickup!", "Come grab it at the office - your member prices already work in the app.", "/office", "Office hours");
      } else {
        cardTile = esncardShopTile("Renew your ESNcard", `Your card expired - renew for ${fmtMoney(cardPricing.student)} and keep the member prices.`, "/esncard", "Renew");
      }
    }
  } catch { /* the tile is a nice-to-have - the shop must always load */ }
  $app.innerHTML = `
    <h2 class="section-title">ESN Gent shop</h2>
    <p class="form-hint" style="margin:-6px 0 16px">Pickup only - collect your order at the ESN office during <a href="/office">office hours</a> (never at events).</p>
    ${cardTile}
    ${products.length
      ? `<div class="events-grid">${products.map(productCard).join("")}</div>`
      : `<div class="empty-state"><div class="big">${mi("storefront")}</div><p>Nothing in the shop yet - check back soon!</p></div>`}
  `;
}

async function viewProduct(id) {
  setLoading();
  let p = null;
  try {
    const snap = await getDoc(doc(db, "products", id));
    if (snap.exists()) p = { id: snap.id, ...snap.data() };
  } catch { /* unpublished for non-board */ }
  if (!p) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("search_off")}</div><p>Product not found.</p><p><a class="btn btn-cyan btn-sm" href="/shop">Back to the shop</a></p></div>`;
    return;
  }
  const eligible = memberEligible(); // merch: alumni count as members too
  const variants = merchVariants(p);
  const accent = accentFor(p.id);
  const initialUnit = merchUnitPrice(p, variants ? variants[0] : null, eligible);

  // Stock helpers - same fields the server checks; no stock configured = unlimited.
  const soldOf = (v) => (v ? (p.variantSold || {})[v.id] || 0 : p.sold || 0);
  const leftOf = (v) => (v && v.stock ? v.stock - soldOf(v) : !v && p.stock ? p.stock - soldOf(null) : Infinity);
  const allGone = variants ? variants.every((v) => leftOf(v) <= 0) : leftOf(null) <= 0;
  const firstOk = variants ? (variants.find((v) => leftOf(v) > 0) || variants[0]) : null;
  const hasMemberPrice = p.priceEsn != null || (variants && variants.some((v) => v.priceEsn != null));

  $app.innerHTML = `
    <article class="product-page" style="--accent:${accent}">
      <a href="/shop" class="back-chip back-chip-plain">${mi("arrow_back", "sm")} Shop</a>
      <div class="product-grid">
        <div class="product-media">
          ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" />` : `<div class="product-noimg">${mi("storefront")}</div>`}
        </div>
        <div class="product-info">
          <h1>${esc(p.name)}</h1>
          ${p.published ? "" : `<span class="badge badge-draft">Draft - not visible in the shop</span>`}
          <div class="product-price">
            <span class="price-tag" id="merch-price">${fmtMoney(initialUnit, p.currency)}</span>
            ${eligible && hasMemberPrice
              ? `<span class="member-note">${mi("verified", "sm")} ESNcard price applied</span>`
              : hasMemberPrice ? `<span class="member-note">${fmtMoney(p.priceEsn ?? variants.find((v) => v.priceEsn != null)?.priceEsn, p.currency)} with an active ESNcard - <a href="/account">link yours</a></span>` : ""}
          </div>
          ${variants ? `
            <div class="product-field">
              <span class="product-label">Choose ${variants.length > 3 ? "your size" : "an option"}</span>
              <div class="chip-row" id="merch-variants" role="radiogroup">
                ${variants.map((v) => {
                  const gone = leftOf(v) <= 0;
                  return `<button type="button" class="chip ${v === firstOk && !gone ? "active" : ""}" role="radio" aria-checked="${v === firstOk && !gone}" data-vid="${esc(v.id)}" ${gone ? "disabled" : ""} title="${gone ? "Sold out" : esc(v.name)}">${esc(v.name)}${gone ? " · sold out" : ""}</button>`;
                }).join("")}
              </div>
            </div>` : ""}
          <div class="product-field">
            <span class="product-label">Quantity</span>
            <div class="qty-step" id="merch-qty-step">
              <button type="button" class="qty-btn" data-d="-1" aria-label="One less">${mi("remove", "sm")}</button>
              <input type="number" id="merch-qty" value="1" min="1" max="10" inputmode="numeric" aria-label="Quantity" />
              <button type="button" class="qty-btn" data-d="1" aria-label="One more">${mi("add", "sm")}</button>
            </div>
            <span class="form-hint" id="merch-left"></span>
          </div>
          ${allGone
            ? `<span class="badge badge-soldout">Sold out</span><p class="form-hint" style="margin-top:8px">All gone for now - ask at <a href="/office">office hours</a> whether a restock is coming.</p>`
            : !currentUser
              ? `<button class="btn btn-google btn-block" id="btn-login-first">${googleG()}<span>Sign in to order</span></button>`
              : `<button class="btn btn-magenta btn-block product-cta" id="btn-merch-buy">${mi("shopping_bag", "sm")} Order · <span id="merch-total">${fmtMoney(initialUnit, p.currency)}</span></button>
                 <button class="btn btn-ghost btn-block btn-ink" id="btn-merch-reserve">${mi("storefront", "sm")} Reserve - pay cash at pickup</button>`}
          <ol class="product-steps">
            <li><span>${mi("credit_card", "sm")}</span>Pay securely online</li>
            <li><span>${mi("meeting_room", "sm")}</span>Pick it up at the ESN office during <a href="/office">office hours</a></li>
            <li><span>${mi("qr_code_2", "sm")}</span>Show the order QR from <a href="/my-tickets">My tickets</a> - never at events</li>
          </ol>
        </div>
      </div>
      ${plainText(p.description).trim() ? `<div class="product-desc rich">${renderRich(p.description)}</div>` : ""}
    </article>
  `;

  document.getElementById("btn-login-first")?.addEventListener("click", signIn);

  let selVid = firstOk ? firstOk.id : null;
  const currentVariant = () => (variants ? variants.find((v) => v.id === selVid) || variants[0] : null);
  const qtyEl = document.getElementById("merch-qty");
  const refreshPrice = () => {
    const v = currentVariant();
    const unit = merchUnitPrice(p, v, eligible);
    const left = leftOf(v);
    const qty = Math.max(1, Math.min(10, parseInt(qtyEl.value, 10) || 1));
    qtyEl.value = qty;
    document.getElementById("merch-price").textContent = fmtMoney(unit, p.currency);
    const tot = document.getElementById("merch-total");
    if (tot) tot.textContent = fmtMoney(unit * qty, p.currency);
    const leftEl = document.getElementById("merch-left");
    if (leftEl) leftEl.textContent = left === Infinity ? "" : left <= 0 ? "Sold out" : left <= 5 ? `Only ${left} left` : `${left} in stock`;
  };
  document.querySelectorAll("#merch-variants .chip").forEach((b) => {
    b.onclick = () => {
      selVid = b.dataset.vid;
      document.querySelectorAll("#merch-variants .chip").forEach((x) => { x.classList.toggle("active", x === b); x.setAttribute("aria-checked", x === b); });
      refreshPrice();
    };
  });
  document.getElementById("btn-merch-reserve")?.addEventListener("click", async (e) => {
    const v = currentVariant();
    const qty = Math.max(1, Math.min(10, parseInt(qtyEl.value, 10) || 1));
    if (merchLeft(v) < qty) { toast(merchLeft(v) <= 0 ? "This item is sold out." : `Only ${merchLeft(v)} left.`, "warn"); return; }
    btnBusy(e.target, "Reserving…");
    try {
      const res = await httpsCallable(functions, "reserveMerchOrder")({ productId: p.id, variantId: v ? v.id : null, quantity: qty });
      toast(`Reserved! Pay ${fmtMoney(res.data.amount, p.currency)} in cash at office hours - your order QR is in My tickets.`, "success");
      navigate("/order/" + res.data.orderId);
      return;
    } catch (err) {
      toast(err?.message || "Could not reserve.", err?.code === "functions/already-exists" ? "warn" : "error");
    }
    btnIdle(e.target);
  });
  document.querySelectorAll("#merch-qty-step .qty-btn").forEach((b) => {
    b.onclick = () => { qtyEl.value = (parseInt(qtyEl.value, 10) || 1) + parseInt(b.dataset.d, 10); refreshPrice(); };
  });
  qtyEl?.addEventListener("input", refreshPrice);
  refreshPrice();

  const merchLeft = leftOf;
  document.getElementById("btn-merch-buy")?.addEventListener("click", async (e) => {
    const v = currentVariant();
    const qty = Math.max(1, Math.min(10, parseInt(document.getElementById("merch-qty").value, 10) || 1));
    if (merchLeft(v) < qty) {
      toast(merchLeft(v) <= 0 ? "This item is sold out." : `Only ${merchLeft(v)} left.`, "warn");
      viewProduct(p.id);
      return;
    }
    btnBusy(e.target, "Opening secure checkout…");
    try {
      const createMerchCheckout = httpsCallable(functions, "createMerchCheckout");
      const res = await createMerchCheckout({ productId: p.id, variantId: v ? v.id : null, quantity: qty });
      window.location.href = res.data.url;
      return;
    } catch (err) {
      // v0.130: a failed checkout is NEVER silently turned into a
      // "reservation" - sold out / validation errors surface honestly.
      if (err?.code === "functions/resource-exhausted" || /sold out/i.test(err?.message || "")) {
        toast(err.message, "warn");
        viewProduct(p.id);
        return;
      }
      toast("Could not start the payment: " + (err?.message || "unknown error"), "error");
    }
    btnIdle(e.target);
  });
}

// ------------------------------------------------------------
// Merch order QR (student) + pickup page (staff)
// ------------------------------------------------------------
async function viewOrder(orderId) {
  if (!currentUser) {
    $app.innerHTML = signInState("storefront", "Sign in to view your order.");
    document.getElementById("es-login").onclick = signIn;
    return;
  }
  setLoading();
  let o = null;
  try {
    const snap = await getDoc(doc(db, "merchOrders", orderId));
    if (snap.exists()) o = { id: snap.id, ...snap.data() };
  } catch { /* not yours */ }
  if (!o) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("search_off")}</div><p>Order not found (or it isn't yours).</p></div>`;
    return;
  }
  $app.innerHTML = `
    <div class="ticket-panel">
      <div class="ticket-head">
        <h1>${esc(o.productName || "Order")}${o.variantName ? ` - ${esc(o.variantName)}` : ""}</h1>
        <p>${o.quantity || 1} × · ${fmtMoney(o.amountTotal, o.currency)}</p>
      </div>
      <div class="ticket-body">
        ${o.pickedUpAt ? `<span class="badge badge-paid">picked up</span>`
          : o.status === "paid" ? `<span class="badge badge-paid">paid - ready for pickup</span>`
          : o.status === "pending" ? `<span class="badge badge-pending">payment not finished</span>
            ${o.stripeSessionUrl ? `<p style="margin:10px 0 0"><a class="btn btn-sm btn-magenta" href="${esc(o.stripeSessionUrl)}">Finish the payment</a></p>` : ""}
            <p class="form-hint" style="margin-top:8px">This order isn't confirmed yet - if the payment stays unfinished it disappears automatically within the hour, and nothing is reserved.</p>`
          : `<span class="badge badge-requested">reserved - pay ${fmtMoney(o.amountTotal, o.currency)} at pickup</span>`}
        <div class="qr-box" id="qr"></div>
        <hr class="ticket-divider" />
        <p class="form-hint">Show this code at the ESN office during <a href="/office">office hours</a> to collect your order - pickup only there, never at events.</p>
        <p class="ticket-code">Order: ${esc(o.id)}</p>
        <a href="/my-tickets" class="btn btn-ghost btn-sm" style="color:var(--esn-dark)">← My tickets</a>
      </div>
    </div>`;
  new QRCode(document.getElementById("qr"), {
    text: `${location.origin}/pickup/${o.id}`,
    width: 220,
    height: 220,
  });
}

async function viewPickup(orderId) {
  if (!currentUser || !isStaff()) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("badge")}</div><p>Order pickup is for ESN team members.${currentUser ? "" : " Please sign in."}</p>${currentUser ? "" : googleBtn()}</div>`;
    document.getElementById("es-login")?.addEventListener("click", signIn);
    return;
  }
  setLoading();
  let o = null;
  try {
    const snap = await getDoc(doc(db, "merchOrders", orderId));
    if (snap.exists()) o = { id: snap.id, ...snap.data() };
  } catch { /* ignore */ }
  if (!o) {
    $app.innerHTML = `<div class="checkin-panel"><div class="checkin-status" style="color:var(--esn-magenta)">${mi("cancel")}</div><h1>Invalid order code</h1></div>`;
    return;
  }
  const state = o.pickedUpAt ? "done" : o.status === "paid" ? "paid" : o.status === "requested" ? "due" : "pending";
  $app.innerHTML = `
    <div class="checkin-panel">
      <div class="checkin-status" style="color:${state === "done" ? "var(--esn-orange)" : state === "paid" ? "var(--esn-green)" : "var(--esn-cyan)"}">${state === "done" ? mi("error") : state === "paid" ? mi("check_circle") : state === "due" ? mi("payments") : mi("hourglass_top")}</div>
      <h1>${state === "done" ? "Already picked up!"
        : state === "paid" ? "Paid - hand it over"
        : state === "due" ? `Collect ${fmtMoney(o.amountTotal, o.currency)}`
        : "Payment in progress"}</h1>
      <div class="checkin-details">
        <p><strong>Item:</strong> ${esc(o.productName || "-")}${o.variantName ? ` - ${esc(o.variantName)}` : ""}</p>
        <p><strong>Quantity:</strong> ${o.quantity || 1}</p>
        <p><strong>Buyer:</strong> ${esc(o.name || "-")} (${esc(o.email || "-")})</p>
        <p><strong>Amount:</strong> ${fmtMoney(o.amountTotal, o.currency)}</p>
        ${o.pickedUpAt ? `<p><strong>Picked up:</strong> ${fmtDate(o.pickedUpAt)} ${fmtTime(o.pickedUpAt)}</p>` : ""}
      </div>
      ${state === "due" ? `<button class="btn btn-green" id="btn-pickup-paid" style="font-size:1.05rem">Paid in cash - hand over ✓</button>` : ""}
      ${state === "paid" ? `<button class="btn btn-green" id="btn-pickup-done" style="font-size:1.05rem">Picked up ✓</button>` : ""}
      <p style="margin-top:14px"><a href="/scan" class="btn btn-cyan btn-sm">Scan next</a></p>
    </div>`;

  document.getElementById("btn-pickup-paid")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await updateDoc(doc(db, "merchOrders", o.id), {
        status: "paid", paidAt: serverTimestamp(), pickedUpAt: serverTimestamp(),
      });
      toast("Order completed", "success");
      viewPickup(orderId);
    } catch (err) { toast(err.message, "error"); e.target.disabled = false; }
  });
  document.getElementById("btn-pickup-done")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await updateDoc(doc(db, "merchOrders", o.id), { pickedUpAt: serverTimestamp() });
      toast("Handed over", "success");
      viewPickup(orderId);
    } catch (err) { toast(err.message, "error"); e.target.disabled = false; }
  });
}

// ------------------------------------------------------------
// Kiosk mode - continuous door scanning with automatic check-in
// ------------------------------------------------------------
async function viewKiosk() {
  if (!currentUser || !isStaff()) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("qr_code_scanner")}</div><p>Kiosk mode is for ESN team members.</p></div>`;
    return;
  }
  $app.innerHTML = `
    <div class="scan-panel">
      <h2 class="section-title">Kiosk mode</h2>
      <p class="form-hint" style="margin:-6px 0 12px">Continuous scanning - valid tickets are checked in automatically. Keep this phone at the door.</p>
      <div class="scan-video-wrap">
        <video id="scan-video" playsinline muted autoplay></video>
        <div class="scan-frame"></div>
        <div id="kiosk-result" class="kiosk-result hidden"></div>
      </div>
      <p class="form-hint" id="scan-status" style="text-align:center;margin:12px 0">Starting camera…</p>
      <p style="text-align:center"><a href="/scan" class="btn btn-ghost btn-sm" style="color:var(--esn-dark)">Exit kiosk</a></p>
    </div>`;

  const video = document.getElementById("scan-video");
  const status = document.getElementById("scan-status");
  const resultEl = document.getElementById("kiosk-result");
  if (!window.jsQR) { status.textContent = "QR decoder didn't load - refresh and try again."; return; }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  } catch {
    status.textContent = "Camera access was blocked - allow it in your browser settings.";
    return;
  }
  video.srcObject = scanStream;
  try { await video.play(); } catch { /* auto-plays */ }
  status.textContent = "Ready - scan tickets.";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let busy = false;
  let lastId = null;
  let lastAt = 0;

  const showResult = (cls, html, ms) => new Promise((resolve) => {
    resultEl.className = `kiosk-result ${cls}`;
    resultEl.innerHTML = html;
    if (ms) {
      setTimeout(() => { resultEl.classList.add("hidden"); resolve(); }, ms);
    } else {
      resultEl.innerHTML += `<p style="margin-top:8px"><button class="btn btn-sm btn-dark" id="kiosk-dismiss">Continue scanning</button></p>`;
      document.getElementById("kiosk-dismiss").onclick = () => { resultEl.classList.add("hidden"); resolve(); };
    }
  });

  const handleScan = async (kind, id) => {
    busy = true;
    if (navigator.vibrate) navigator.vibrate(60);
    try {
      if (kind === "pickup") {
        await showResult("kiosk-warn", `<h3>Merch order</h3><p>Open it outside kiosk mode.</p>`, 1800);
        return;
      }
      const snap = await getDoc(doc(db, "registrations", id));
      if (!snap.exists()) {
        await showResult("kiosk-bad", `<h3>${mi("cancel", "sm")} Invalid ticket</h3>`);
        return;
      }
      const reg = snap.data();
      if (reg.status !== "paid" && reg.status !== "free") {
        await showResult("kiosk-bad", `<h3>${mi("block", "sm")} Not confirmed</h3><p>${esc(reg.name || "")} - status: ${esc(reg.status)}</p>`);
        return;
      }
      if (reg.checkedInAt) {
        await showResult("kiosk-warn", `<h3>${mi("error", "sm")} Already checked in</h3><p>${esc(reg.name || "")} · ${fmtTime(reg.checkedInAt)}</p>`);
        return;
      }
      // Wrong-day guard (v0.125): the kiosk never auto-admits a ticket
      // outside its event day (+1) - a board member overrides via /checkin.
      const evD2 = toDate(reg.eventStart);
      if (evD2) {
        const from2 = new Date(evD2.getFullYear(), evD2.getMonth(), evD2.getDate());
        const now2 = new Date();
        if (now2 < from2 || now2 >= new Date(from2.getTime() + 2 * 86400e3)) {
          await showResult("kiosk-warn", `<h3>${mi("event_busy", "sm")} Wrong day</h3><p>${esc(reg.name || "")} - ticket for ${fmtDate(reg.eventStart)}. A board member can override by scanning it outside kiosk mode.</p>`);
          return;
        }
      }
      await updateDoc(doc(db, "registrations", id), { checkedInAt: serverTimestamp() });
      await showResult("kiosk-ok", `<h3>${mi("check_circle", "sm")} ${esc(reg.name || "Welcome!")}</h3><p>${esc(reg.eventTitle || "")} · ${reg.quantity || 1} ticket${(reg.quantity || 1) > 1 ? "s" : ""}</p>`, 2000);
    } catch (err) {
      await showResult("kiosk-bad", `<h3>Error</h3><p>${esc(err.message)}</p>`);
    } finally {
      busy = false;
    }
  };

  const tick = () => {
    if (!scanStream) return;
    if (!busy && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        const m = code.data.match(/(?:#\/|\/)(checkin|pickup)\/([A-Za-z0-9_-]+)/);
        if (m) {
          const now = Date.now();
          if (!(m[2] === lastId && now - lastAt < 5000)) {
            lastId = m[2];
            lastAt = now;
            handleScan(m[1] === "pickup" ? "pickup" : "checkin", m[2]);
          }
        }
      }
    }
    scanRAF = requestAnimationFrame(tick);
  };
  scanRAF = requestAnimationFrame(tick);
}

// ------------------------------------------------------------
// Event feedback (stars, from checked-in attendees)
// ------------------------------------------------------------
async function viewRate(regId) {
  if (!currentUser) {
    $app.innerHTML = signInState("star", "Sign in to rate the event.");
    document.getElementById("es-login").onclick = signIn;
    return;
  }
  setLoading();
  let reg = null, existing = null;
  try {
    const [rSnap, fSnap] = await Promise.all([
      getDoc(doc(db, "registrations", regId)),
      getDoc(doc(db, "feedback", regId)),
    ]);
    if (rSnap.exists()) reg = rSnap.data();
    if (fSnap.exists()) existing = fSnap.data();
  } catch { /* not yours */ }
  if (!reg || reg.uid !== currentUser.uid) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("search_off")}</div><p>Ticket not found (or it isn't yours).</p><p><a class="btn btn-cyan btn-sm" href="/my-tickets">My tickets</a></p></div>`;
    return;
  }
  if (!reg.checkedInAt) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("star")}</div><p>Ratings open after you've attended the event.</p></div>`;
    return;
  }
  let rating = existing?.rating || 0;
  $app.innerHTML = `
    <div class="checkin-panel">
      <h1 style="font-size:1.3rem">How was ${esc(reg.eventTitle || "the event")}?</h1>
      <div class="star-row" id="star-row">
        ${[1, 2, 3, 4, 5].map((n) => `<button class="star" data-n="${n}">★</button>`).join("")}
      </div>
      <div class="form-field" style="text-align:left;margin-top:14px">
        <label for="fb-comment">Anything to tell the board? (optional)</label>
        <textarea id="fb-comment" rows="3" maxlength="600">${esc(existing?.comment || "")}</textarea>
      </div>
      <div class="form-actions" style="justify-content:center">
        <button class="btn btn-green" id="fb-submit">${existing ? "Update rating" : "Send rating"}</button>
      </div>
      <p class="form-hint">Ratings are only visible to the ESN Gent board.</p>
    </div>`;

  const paint = () => {
    document.querySelectorAll("#star-row .star").forEach((s) => {
      s.classList.toggle("on", +s.dataset.n <= rating);
    });
  };
  paint();
  document.querySelectorAll("#star-row .star").forEach((s) => {
    s.onclick = () => { rating = +s.dataset.n; paint(); };
  });
  document.getElementById("fb-submit").onclick = async (e) => {
    if (!rating) { toast("Pick a number of stars first.", "error"); return; }
    e.target.disabled = true;
    try {
      await setDoc(doc(db, "feedback", regId), {
        uid: currentUser.uid,
        eventId: reg.eventId,
        eventTitle: reg.eventTitle || "",
        rating,
        comment: document.getElementById("fb-comment").value.trim(),
        updatedAt: serverTimestamp(),
        ...(existing ? {} : { createdAt: serverTimestamp() }),
      }, { merge: true });
      toast("Thanks for the feedback!", "success");
      navigate("/my-tickets");
    } catch (err) {
      toast("Could not save: " + err.message, "error");
      e.target.disabled = false;
    }
  };
}

// ------------------------------------------------------------
// Office page - where & when to find ESN Gent in real life.
// Every "office hours" mention in the app links here.
// ------------------------------------------------------------
async function viewOffice() {
  setLoading();
  // Office-hours sessions are normal (published) events with the
  // officeHours flag - fetch the next two months and filter client-side.
  let sessions = [];
  try {
    const to = new Date();
    to.setDate(to.getDate() + 62);
    sessions = (await fetchPublishedEvents(new Date(), to)).filter((e) => e.officeHours === true);
  } catch { /* the static info below still helps */ }

  const now = new Date();
  const next = sessions[0] || null;
  const isOpenNow = (s2) => toDate(s2.start) <= now && toDate(s2.end || s2.start) >= now;
  const openNow = sessions.find(isOpenNow) || null;
  const rel = (s2) => {
    const d = Math.round((toDate(s2.start).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400e3);
    return d === 0 ? "Today" : d === 1 ? "Tomorrow" : `in ${d} days`;
  };
  $app.innerHTML = `
    <h2 class="section-title">${mi("meeting_room")} The ESN Gent office</h2>
    <div class="office-hero ${openNow ? "open" : ""}">
      <div class="office-hero-main">
        <span class="office-kicker">${openNow ? `<span class="badge badge-live">Open now</span>` : next ? "Next office hours" : "Office hours"}</span>
        ${openNow ? `<strong>Until ${fmtTime(openNow.end || openNow.start)} - come by!</strong>`
          : next ? `<strong>${fmtDate(next.start)} · ${fmtTime(next.start)}${next.end ? ` – ${fmtTime(next.end)}` : ""}</strong><small>${rel(next)}</small>`
          : `<strong>${esc(orgInfo.officeHoursText)}</strong><small>during the semester - sessions appear here as the board plans them</small>`}
      </div>
      <a class="btn btn-cyan btn-sm" href="${mapsSearchUrl(orgInfo.officeAddress)}" target="_blank" rel="noopener">${mi("directions", "sm")} Directions</a>
    </div>

    <div class="office-grid">
      <div>
        <ul class="office-facts">
          <li>${mi("location_on", "sm")}<span><strong>${esc(orgInfo.officeAddress)}</strong></span></li>
          <li>${mi("schedule", "sm")}<span>Usually <strong>${esc(orgInfo.officeHoursText)}</strong> - confirmed dates below and in the <a href="/calendar">calendar</a></span></li>
          <li>${mi("mail", "sm")}<span><a href="mailto:${esc(orgInfo.contactEmail)}">${esc(orgInfo.contactEmail)}</a> · <a href="/contact">message the board in the app</a></span></li>
          ${socialIconsHtml() ? `<li>${mi("share", "sm")}<span>${socialIconsHtml()}</span></li>` : ""}
        </ul>

        <h3 class="section-title sm">What you can do here</h3>
        <div class="office-tiles">
          <div class="office-tile">${mi("badge")}<strong>ESNcard</strong><small>${cashAllowed() ? "Pick up your card, pay in cash if you didn't online." : "Pick up your card (paid online in the app)."} Bring proof of exchange.</small></div>
          <div class="office-tile">${mi("shopping_bag")}<strong>Shop orders</strong><small>Collect (and pay for) merch - show the order QR from <a href="/my-tickets">My tickets</a>.</small></div>
          <div class="office-tile">${mi("forum")}<strong>Questions &amp; a chat</strong><small>Events, trips, life in Ghent… come say hi.</small></div>
        </div>
        <p class="form-hint">${mi("info", "sm")} Cards and orders are handed out <strong>only during office hours</strong> - never at events.</p>

        <h3 class="section-title sm">Upcoming office hours</h3>
        ${sessions.length ? `
          <div class="cal-agenda">
            ${sessions.slice(0, 10).map((s2) => `
              <a class="agenda-item" href="/event/${s2.id}" style="--accent:${isOpenNow(s2) ? "var(--esn-green)" : "var(--esn-cyan)"}">
                <span class="agenda-time">${fmtDate(s2.start)}${isOpenNow(s2) ? ` <span class="badge badge-live">Open now</span>` : rel(s2) === "Today" || rel(s2) === "Tomorrow" ? ` <span class="badge badge-esn">${rel(s2)}</span>` : ""}</span>
                <span class="agenda-title">${fmtTime(s2.start)}${s2.end ? ` – ${fmtTime(s2.end)}` : ""}${s2.location && s2.location !== orgInfo.officeAddress ? ` <small class="form-hint">· ${esc(s2.location)}</small>` : ""}</span>
              </a>`).join("")}
          </div>`
        : `<p class="form-hint">No sessions in the app for the coming weeks yet - the board adds them here and to the <a href="/calendar">calendar</a>. The regular rhythm is ${esc(orgInfo.officeHoursText)}.</p>`}
      </div>
      <div class="map-wrap office-map">
        <iframe class="map-embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
          src="https://maps.google.com/maps?q=${encodeURIComponent(orgInfo.officeAddress)}&z=16&output=embed"
          title="Map: ESN Gent office"></iframe>
      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// Notification settings - enable per device, choose categories.
// ------------------------------------------------------------
async function viewNotifications() {
  if (!currentUser) {
    $app.innerHTML = signInState("notifications", "Sign in to manage your notifications.");
    document.getElementById("es-login").onclick = signIn;
    return;
  }
  setLoading();
  let prefs = {};
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid));
    prefs = snap.exists() ? (snap.data().notifyPrefs || {}) : {};
  } catch { /* defaults */ }
  const supported = await pushSupported();
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  const enabledHere = pushEnabledHere();
  const cats = PUSH_CATEGORIES.filter(([key]) => key !== "shifts" || myRole);

  $app.innerHTML = `
    <h2 class="section-title">Notifications</h2>
    <div class="form-card" style="max-width:640px;margin-bottom:16px">
      <strong>${mi("notifications", "sm")} This device</strong>
      ${!pushConfig.vapidKey ? `<p class="form-hint" style="margin-top:8px">Notifications aren't switched on for the app yet - the board is setting this up.</p>`
      : !supported ? `<p class="form-hint" style="margin-top:8px">${isIOS() && !isStandalone()
          ? `On iPhone, notifications only work from the <strong>installed</strong> app - follow the 30-second <a href="/install">install guide</a> first, then come back here from the app icon.`
          : "This browser doesn't support notifications."}</p>`
      : perm === "denied" ? `<p class="form-hint" style="margin-top:8px">Notifications are <strong>blocked</strong> in your browser settings for this site - re-allow them there first, then come back.</p>`
      : enabledHere ? `
        <p class="form-hint" style="margin-top:8px">Notifications are <strong>ON</strong> for this device.</p>
        <div class="form-actions" style="margin-top:8px"><button class="btn btn-ghost btn-sm" id="push-off" style="color:var(--esn-magenta)">Turn off on this device</button></div>`
      : `
        <p class="form-hint" style="margin-top:8px">Get a heads-up for the things you choose below - your browser will ask for permission once.</p>
        <div class="form-actions" style="margin-top:8px"><button class="btn btn-cyan" id="push-on">Turn on notifications</button></div>`}
    </div>

    ${!pushConfig.vapidKey || !supported || perm === "denied" ? `
    <div class="form-card" style="max-width:640px">
      <strong>${mi("tune", "sm")} What do you want to hear about?</strong>
      <p class="form-hint" style="margin:8px 0 0">${isIOS() && !isStandalone()
        ? `The choices unlock once you use the <strong>installed</strong> app - it takes 30 seconds via the <a href="/install">install guide</a>, and notifications are the best part: waitlist spots, ticket updates and event reminders.`
        : perm === "denied"
        ? `Re-allow notifications for this site in your browser settings first - then the choices appear here.`
        : `This device can't receive notifications, so there's nothing to configure yet.`}</p>
      ${isIOS() && !isStandalone() ? `<div class="form-actions" style="margin-top:10px"><a class="btn btn-cyan btn-sm" href="/install">${mi("install_mobile", "sm")} Install the app</a></div>` : ""}
    </div>` : `
    <div class="form-card" style="max-width:640px">
      <strong>${mi("tune", "sm")} What do you want to hear about?</strong>
      <p class="form-hint" style="margin:6px 0 10px">Applies to all your devices. Everything is on by default.</p>
      ${cats.map(([key, label, desc]) => `
        <div class="checkbox-row" style="align-items:flex-start;margin-bottom:10px">
          <input type="checkbox" id="np-${key}" ${prefs[key] === false ? "" : "checked"} />
          <label for="np-${key}"><strong>${label}</strong><br><span class="form-hint">${desc}</span></label>
        </div>`).join("")}
      <div class="form-actions"><button class="btn btn-green btn-sm" id="np-save">Save preferences</button></div>
    </div>`}
    <p class="form-hint" style="max-width:640px;margin-top:12px">Notifications are always only about your own tickets, shifts and applications - never marketing spam. You can turn everything off anytime.</p>
  `;

  document.getElementById("push-on")?.addEventListener("click", async () => {
    if (await enablePush()) viewNotifications();
  });
  document.getElementById("push-off")?.addEventListener("click", async () => {
    await disablePushHere();
    viewNotifications();
  });
  document.getElementById("np-save")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    const notifyPrefs = {};
    cats.forEach(([key]) => { notifyPrefs[key] = document.getElementById(`np-${key}`).checked; });
    try {
      await setDoc(doc(db, "users", currentUser.uid), { notifyPrefs, updatedAt: serverTimestamp() }, { merge: true });
      toast("Notification preferences saved.", "success");
    } catch (err) { toast("Save failed: " + err.message, "error"); }
    e.target.disabled = false;
  });
}

// ------------------------------------------------------------
// FAQ - sections appear based on your role
// ------------------------------------------------------------
function faqItem(q, a) {
  return `<details class="faq-item"><summary>${q}</summary><div class="faq-a">${a}</div></details>`;
}

// ------------------------------------------------------------
// /install - step-by-step "get the app on your phone" page (v0.125),
// linked from the FAQ and from the dismissible banner on the homepage.
// ------------------------------------------------------------
const isInstalledApp = () => {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  } catch { return false; }
};
function viewInstall() {
  const step = (n, txt) => `
    <li class="inst-step"><span class="inst-num">${n}</span><span>${txt}</span></li>`;
  $app.innerHTML = `
    <h2 class="section-title">${mi("install_mobile")} Get the app on your phone</h2>
    <p class="form-hint" style="margin:-6px 0 16px">The ESN Gent App installs straight from the browser - no app store, 30 seconds. You get an app icon, full-screen mode, offline tickets and push notifications.</p>
    ${isInstalledApp() ? `<div class="form-card" style="margin-bottom:16px;border-left:4px solid var(--esn-green)"><strong>${mi("check_circle", "sm")} You're already using the installed app - nice!</strong> <span class="form-hint">Just check the notifications section below.</span></div>` : ""}

    <div class="form-card" style="margin-bottom:16px">
      <strong style="font-size:1.05rem">${mi("android", "sm")} Android (Chrome)</strong>
      <ol class="inst-list">
        ${step(1, `Open <strong>app.esngent.org</strong> in <strong>Chrome</strong>.`)}
        ${step(2, `Tap the <strong>⋮ menu</strong> (top right).`)}
        ${step(3, `Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>) → <strong>Install</strong>.`)}
        ${step(4, `The ${mi("mobile_friendly", "sm")} ESN icon appears with your other apps - open it from there from now on.`)}
      </ol>
      <p class="form-hint" style="margin:8px 0 0"><strong>Notifications on Android:</strong> open the installed app → Profile → <a href="/notifications">Notifications</a> → turn them on and allow the permission popup. Done.</p>
    </div>

    <div class="form-card" style="margin-bottom:16px">
      <strong style="font-size:1.05rem">${mi("ios_share", "sm")} iPhone &amp; iPad (Safari)</strong>
      <ol class="inst-list">
        ${step(1, `Open <strong>app.esngent.org</strong> in <strong>Safari</strong> (not Instagram's browser - tap ⋯ → Open in Safari first).`)}
        ${step(2, `Tap the <strong>Share</strong> button ${mi("ios_share", "sm")} (the square with the arrow, bottom bar).`)}
        ${step(3, `Scroll down → <strong>Add to Home Screen</strong> → <strong>Add</strong>.`)}
        ${step(4, `Open the ESN icon on your home screen - that's the app.`)}
      </ol>
      <p class="form-hint" style="margin:8px 0 0"><strong>Notifications on iPhone:</strong> they only work from the <em>installed</em> icon (iOS 16.4 or newer) - so install first, then open the app → Profile → <a href="/notifications">Notifications</a> → turn them on and tap Allow.</p>
    </div>

    <div class="form-card">
      <strong>Why bother?</strong>
      <ul style="margin:8px 0 0 18px;font-size:.9rem">
        <li style="margin-bottom:4px">${mi("qr_code_2", "sm")} Your tickets work <strong>offline</strong> - they scan at the door even with zero signal.</li>
        <li style="margin-bottom:4px">${mi("notifications_active", "sm")} Push for new events, your waitlist spot, ticket &amp; ESNcard updates and passport stamps.</li>
        <li style="margin-bottom:4px">${mi("workspace_premium", "sm")} One tap from your home screen to your <a href="/passport">ESN Passport</a>.</li>
      </ul>
      <p class="form-hint" style="margin:10px 0 0">Problems installing? Ask at <a href="/office">office hours</a> or any event - we've done this a few hundred times. 😉</p>
    </div>
  `;
}

// ------------------------------------------------------------
// /alumni - the alumni network overview (v0.125). Board + the alumni
// coordinator: everyone flagged alumni, their board-function history,
// and add/remove controls. The alumnicoord role may only toggle the
// alumni flag (rules-enforced); full user admin stays board-only.
// ------------------------------------------------------------
async function viewAlumni() {
  const allowed = isAdmin || myRole === "alumnicoord";
  if (!currentUser || !allowed) { $app.innerHTML = errorState("This page is for the board and the alumni coordinator."); return; }
  setLoading();
  let alumni = [];
  try {
    const snap = await getDocs(query(collection(db, "users"), where("alumni", "==", true)));
    alumni = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || ""));
  } catch (e) { $app.innerHTML = errorState(e.message); return; }

  const row = (u) => `
    <tr data-uid="${u.id}">
      <td class="card-main" data-l="Name">
        ${isAdmin ? `<a href="/admin/user-${u.id}"><strong>${esc(u.displayName || "-")}</strong></a>` : `<strong>${esc(u.displayName || "-")}</strong>`}
        <br><small class="form-hint">${esc(u.email || "")}</small>
      </td>
      <td data-l="Nationality">${esc(u.nationality || "-")}</td>
      <td data-l="History"><button class="btn btn-sm btn-ghost al-hist" data-uid="${u.id}">${mi("history", "sm")} History</button></td>
      <td class="card-actions"><button class="btn btn-sm btn-ghost btn-danger al-remove" data-uid="${u.id}" title="Remove from alumni">✕</button></td>
    </tr>
    <tr class="al-hist-row" data-uid="${u.id}" hidden><td colspan="4"><div class="al-hist-box form-hint">Loading…</div></td></tr>`;

  $app.innerHTML = `
    <h2 class="section-title">${mi("school")} Alumni network</h2>
    <p class="form-hint" style="margin:-6px 0 16px">Everyone flagged as an ESN Gent alumnus/-a - they keep member pricing and appear in the friendship tree. <strong>History</strong> shows their board functions over the years.${isAdmin ? "" : " As alumni coordinator you can add and remove people here; the full user pages stay board-only."}</p>

    <div class="table-wrap cards"><table>
      <thead><tr><th>Alumnus/-a (${alumni.length})</th><th>Nationality</th><th>Board history</th><th></th></tr></thead>
      <tbody id="al-body">${alumni.length ? alumni.map(row).join("") : `<tr><td colspan="4" class="form-hint">No alumni yet - add the first one below.</td></tr>`}</tbody>
    </table></div>

    <h3 class="section-title sm">Add an alumnus/-a</h3>
    <div class="form-card">
      <p class="form-hint" style="margin-bottom:10px">Search by name or e-mail - the person must have signed in to the app at least once.</p>
      <div class="form-field" style="max-width:360px;margin:0">
        <input id="al-search" type="search" placeholder="Search by name or e-mail…" autocomplete="off" />
      </div>
      <div id="al-results" style="max-width:360px"></div>
    </div>
  `;

  // Board-function history (userHistory/{uid}.board - appended by the
  // team page on every add/update/remove).
  $app.querySelectorAll(".al-hist").forEach((btn) => {
    btn.onclick = async () => {
      const uid = btn.dataset.uid;
      const tr = $app.querySelector(`.al-hist-row[data-uid="${uid}"]`);
      if (!tr.hidden) { tr.hidden = true; return; }
      tr.hidden = false;
      const box = tr.querySelector(".al-hist-box");
      try {
        const h = await getDoc(doc(db, "userHistory", uid));
        const entries = ((h.exists() ? h.data().board : null) || [])
          .slice().sort((a, b) => (toDate(a.at)?.getTime() || 0) - (toDate(b.at)?.getTime() || 0));
        box.innerHTML = entries.length
          ? entries.map((en) => {
              const what = en.action === "removed" ? "left the team" : en.action === "added" ? "joined the team" : "role updated";
              const role = [en.boardFunction, en.role].filter(Boolean).join(" · ");
              return `<div style="margin:2px 0">${mi(en.action === "removed" ? "logout" : en.action === "added" ? "person_add" : "sync", "sm")} <strong>${esc(what)}</strong>${role ? ` - ${esc(role)}` : ""} <span style="opacity:.7">(${en.at ? fmtDate(toDate(en.at)) : "date unknown"})</span></div>`;
            }).join("")
          : "No recorded board history - the audit trail only goes back to when role changes started being logged in the app.";
      } catch (err) { box.textContent = "Couldn't load history: " + err.message; }
    };
  });

  $app.querySelectorAll(".al-remove").forEach((btn) => {
    btn.onclick = async () => {
      const u = alumni.find((x) => x.id === btn.dataset.uid);
      if (!await appConfirm(`Remove ${u?.displayName || "this person"} from the alumni network? Their account stays - only the alumni flag (and its member pricing) is removed.`)) return;
      btn.disabled = true;
      try {
        await updateDoc(doc(db, "users", btn.dataset.uid), { alumni: false });
        logUserHistory(btn.dataset.uid, "alumni", { action: "removed" });
        toast("Removed from alumni", "success");
        viewAlumni();
      } catch (err) { toast("Failed: " + err.message, "error"); btn.disabled = false; }
    };
  });

  // Prefix search (same pattern as the team page) with a "Make alumni" button.
  const alSearch = document.getElementById("al-search");
  const alResults = document.getElementById("al-results");
  let alTimer = null;
  alSearch.addEventListener("input", () => {
    clearTimeout(alTimer);
    const qraw = alSearch.value.trim();
    if (qraw.length < 2) { alResults.innerHTML = ""; return; }
    alTimer = setTimeout(async () => {
      const variants = [...new Set([qraw, qraw.toLowerCase(), qraw[0].toUpperCase() + qraw.slice(1).toLowerCase()])];
      try {
        const snaps = await Promise.all(variants.flatMap((v) => [
          getDocs(query(collection(db, "users"), where("email", ">=", v.toLowerCase()), where("email", "<=", v.toLowerCase() + ""), limit(6))),
          getDocs(query(collection(db, "users"), where("displayName", ">=", v), where("displayName", "<=", v + ""), limit(6))),
        ]));
        const seen = new Set();
        const hits = snaps.flatMap((s) => s.docs).map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => !seen.has(u.id) && seen.add(u.id))
          .filter((u) => u.alumni !== true)
          .slice(0, 8);
        alResults.innerHTML = hits.length
          ? `<div class="geo-results">${hits.map((u, i) => `<button type="button" class="geo-hit" data-i="${i}">${mi("person_add", "sm")}<span><strong>${esc(u.displayName || "-")}</strong><br><small>${esc(u.email || "")}</small></span></button>`).join("")}</div>`
          : `<p class="form-hint">No matching account (or they're already an alumnus/-a).</p>`;
        alResults.querySelectorAll(".geo-hit").forEach((b) => {
          b.onclick = async () => {
            const u = hits[+b.dataset.i];
            if (!await appConfirm(`Make ${u.displayName || u.email || "this person"} an alumnus/-a? They get alumni pricing and join the friendship-tree circle.`)) return;
            try {
              await updateDoc(doc(db, "users", u.id), { alumni: true });
              logUserHistory(u.id, "alumni", { action: "added" });
              toast(`${u.displayName || "Person"} added to the alumni network`, "success");
              viewAlumni();
            } catch (err) { toast("Failed: " + err.message, "error"); }
          };
        });
      } catch (err) { alResults.innerHTML = `<p class="form-hint">${esc(err.message)}</p>`; }
    }, 350);
  });
}

// Student FAQ as data (v0.129) - the FAQ page renders it, and the contact
// page searches it live so questions get answered before they get sent.
function faqStudentItems() {
  const customStudent = (faqCustom || []).map(({ q, a }) => [esc(q), renderRich(a)]);
  // v0.130: board-written items go ON TOP of the built-in answers - one
  // custom question used to silently delete all 16 defaults (and gut the
  // /contact deflection search with them).
  return [
    ...customStudent,
    ["Where can I find ESN Gent in person?",
      `Our office: <strong>${esc(orgInfo.officeAddress)}</strong> - office hours <strong>${esc(orgInfo.officeHoursText)}</strong>. See the <a href="/office">Office page</a> for the map and the upcoming sessions. Come by for your ESNcard, questions or just a chat.`],
    ["How do I sign in?",
      `With your Google account - tap <strong>Sign in</strong> and pick your Gmail. No separate password needed.`],
    ["Can I sign in without a Google account?",
      `Not at the moment - Google sign-in is the only method, which keeps the app password-free and your account protected by Google's security. Any Google account works (it doesn't have to be your university one), and creating one is free at <a href="https://accounts.google.com" target="_blank" rel="noopener">accounts.google.com</a>.`],
    ["How do I register for an event?",
      `Open the event and tap <strong>Register</strong> (free events) or <strong>Buy</strong> (paid events, secure checkout via Stripe). Your ticket appears under <a href="/my-tickets">My tickets</a>.`],
    ["Where is my ticket?",
      `<a href="/my-tickets">My tickets</a> → <strong>Ticket</strong>. Show the QR code at the entrance. If you install the app, your tickets even work without internet.`],
    ["Can I cancel a registration or get a refund?",
      `Open your ticket in <a href="/my-tickets">My tickets</a> and look under <strong>Ticket options</strong> - cancel a free registration or request a refund there, until the event's cancellation deadline (shown in its ticket policy). Free cancellations release your spot instantly; refund requests go to the treasurer, and if approved the money returns via Stripe (some events deduct a small refund fee; some are marked non-refundable). After the deadline the options disappear - no refunds. If ESN cancels an event, everyone is automatically refunded in full.`],
    ["The event is sold out - now what?",
      `Tap <strong>Join the waitlist</strong> on the event page. When a spot frees up, the first person in line automatically gets a notification with a personal hold - <strong>normally 12 hours</strong> - to grab it; miss the window and it passes to the next person. Turn on notifications so you don't miss yours!`],
    ["Can I give my ticket to a friend?",
      `Yes - open your ticket, tap <strong>Transfer this ticket</strong>, and send the link. The ticket moves to their account when they claim it (and your copy stops working). Not possible once the event has started or after the ticket has been scanned, and for a multi-ticket booking the whole booking transfers.`],
    ["What is the ESNcard and why would I want one?",
      `The ${fmtMoney(cardPricing.student)} membership card of the Erasmus Generation: member prices on ESN Gent events and trips, access to member-only events, plus <a href="https://www.esn.org/esncard" target="_blank" rel="noopener">100+ international deals</a>. Apply on <a href="/account">your account page</a> (2-minute form with proof of exchange) - submitting takes you straight to the <strong>secure online payment</strong>, or choose to pay cash during <a href="/office">office hours</a> instead. Pick your card up during <a href="/office">office hours</a> - it's activated on the spot and valid ${cardPricing.validityMonths} months.`],
    ["Where do I pick up my ESNcard or shop order?",
      `Only at the ESN office during <a href="/office">office hours</a> - never at ESN events. Bring your proof of exchange for the ESNcard, or your order QR code for merch. ESNcard payments themselves are final and can't be cancelled - the only exception: if the board can't approve your application, anything you paid online is refunded automatically.`],
    ["How do I install the app on my phone?",
      `See the step-by-step <a href="/install">install page</a> - iPhone and Android each have their own 30-second recipe, plus how to turn on notifications per system. You get an app icon, full-screen mode and offline tickets.`],
    ["Can I add events to my own calendar?",
      `Two ways. <strong>Best: subscribe once</strong> on the <a href="/calendar">calendar page</a> (Google, Apple or any calendar app) - every event <em>and every change</em> then syncs to your own calendar automatically. Or add a single event from its event page (<strong>Add to Google Calendar</strong> / <strong>Add to Apple/Outlook</strong>) - note that a downloaded .ics file is a one-time snapshot: it won't update by itself if the event changes.`],
    ["Can I rate an event afterwards?",
      `Yes - once you've been checked in at an event, a <strong>Rate ★</strong> button appears next to that ticket in <a href="/my-tickets">My tickets</a>. Ratings and comments go only to the ESN Gent board.`],
    ["Can the app send me notifications?",
      `Yes - turn them on under <a href="/notifications">Account → Notifications</a> and pick what you want: ticket &amp; refund updates, a reminder 3 hours before your events, new events, waitlist spots and ESNcard updates. On iPhone, first install the app (Share → <strong>Add to Home Screen</strong>), then enable them from inside the app. Never marketing - only your own stuff, and you can switch any category off.`],
    ["Is there a dark mode?",
      `Yes - the app follows your phone's setting automatically, or pick Light/Dark yourself via <a href="/account">your account</a> → Appearance.`],
    ["What happens with my data?",
      `Read the <a href="/privacy">privacy policy</a> - it lists exactly what we store and why. You can edit your profile anytime and delete your account (and data) yourself.`],
    ["How do I contact the board?",
      `Use the <a href="/contact">contact page</a>: pick a category, send your message, and the board answers you right in the app - you get a notification and an e-mail when they reply. For a chat in person, come by <a href="/office">office hours</a>.`],
  ];
}

function viewFaq() {
  const student = faqStudentItems();

  // v0.125: everything about SCANNING grouped together; the confusing
  // merch-QR item was dropped (the pickup page explains itself).
  const scanning = [
    ["How do I scan tickets at the door?",
      `Open <a href="/scan">Scan</a> → <strong>Start camera</strong> → point at the student's QR code. The result page shows who it is and a <strong>Check in now</strong> button. Then <strong>Scan next</strong> - repeat all night.`],
    ["What do the scan results mean?",
      `<strong>Checked in - welcome!</strong> means all good, let them in. <strong>Already checked in</strong> means this ticket was used before - check with the person. <strong>Not confirmed</strong> means the ticket was never paid/confirmed - send them to a board member. <strong>Wrong day</strong> means the ticket isn't for today's event (too early or too late) - a board member can still let them in with the override button.`],
    ["What is kiosk mode?",
      `A hands-free version of the scanner for busy doors: open <a href="/scan">Scan</a> → <strong>Kiosk mode</strong>. Valid tickets are checked in automatically with a green flash; problems (already used, unpaid, wrong day) stay on screen until you dismiss them.`],
    ["The camera won't start - what do I check?",
      `Allow camera access when the browser asks (or fix it in your browser's site settings). On iPhone, if the installed app misbehaves, open the site in Safari instead - scanning works the same there.`],
    ["Do I need internet while scanning?",
      `Yes - checking a ticket looks it up live, so you need signal. (The student's QR itself works offline, so it's your connection that matters.)`],
    ["I checked someone in by mistake.",
      `Ask a board member - they can reset the check-in on that registration.`],
  ];
  const volunteer = [
    ["How do shiftlists work?",
      `Open <a href="/shifts">Shifts</a> → pick an event → tap <strong>I'll take this shift</strong> on an open spot (leave again if plans change - not last-minute please). Your upcoming shifts and your shift count are at the top. Some events appear here before they're public - that's normal, students can't see them yet. And keep an eye on the board WhatsApp: last-minute open or freed shifts are called out there - jump in if you can.`],
    ["I paid something for ESN - how do I get it back?",
      `Account menu → <a href="/reimburse">Reimbursements</a>. Fill in the expense (linked to an event or not), add photos of the receipts, and submit. The treasurer &amp; president review it and pay it to your IBAN - you can follow the status on the same page.`],
  ];

  const board = [
    ["How do I create an event?",
      `Admin → <strong>+ New event</strong>. Fill in the details, optionally add an image (it's compressed automatically), set price and capacity, and tick <strong>Published</strong> when it should go live. Saving also pushes it to the public Google Calendar.`],
    ["How do descriptions support formatting?",
      `In the description: <code>**bold**</code>, <code>*italic*</code>, <code>[link text](https://...)</code>, lines starting with <code>- </code> become bullets, <code>## </code> makes a subheading.`],
    ["How do ticket types work (e.g. with/without brewery visit)?",
      `In the event form, add <strong>Ticket types</strong> - each with its own price, optional ESNcard price and optional capacity. Buyers pick one; the choice shows on the registration list and CSV export.`],
    ["How do ESNcard discounts and member-only events work?",
      `Set an <strong>ESNcard price</strong> on the event (verified members pay it automatically), tick <strong>ESNcard only</strong> to restrict registration to verified members, or set <strong>max member spots</strong> to cap them.`],
    ["Where do I see who registered?",
      `Admin → the event → full list with status, check-ins and ticket types, plus <strong>Export CSV</strong>. The waitlist (with a copy-all-emails button) is below the registrations.`],
    ["How do I verify someone's ESNcard?",
      `Admin → <strong>Users → ESNcard</strong>. <strong>To assign</strong> (default) lists everyone who paid: type the number on the physical card and press Enter - the app checks it on esncard.org (typos, duplicates, blocked cards), links it and e-mails the student. <strong>Office - unpaid</strong> lists people paying at the desk: click <strong>Paid?</strong>, confirm you received the money, then the card field appears. <strong>To pick up</strong>: one click on <strong>Handed over</strong> when you give them the card. <strong>Reject…</strong> asks for a reason the student sees and can fix; online payments are refunded automatically. <em>Details</em> under a name shows everything they filled in. Numbers and charts live under <strong>Insights → Members &amp; map</strong>; the treasurer/president adjust card prices under Settings → ESNcard, and the superadmin edits the "card ready" e-mail there too.`],
    ["How do I put office hours in the app?",
      `Admin → <strong>+ Office hours</strong> - a mini-form (date, times, done; never a price) that can create a whole <strong>weekly series</strong> in one go. Each session appears on the <a href="/office">Office page</a> and the calendar, students see a drop-in note instead of a ticket button, and a shiftlist with <strong>2 board spots</strong> is created automatically - board members sign up under <a href="/shifts">Shifts</a>, and office shifts are counted separately on everyone's account.`],
    ["How do event tags & colours work?",
      `Admin dashboard → <strong>Event tags &amp; colours</strong>: create categories like Party, Sport, Trip, Partner event - each with its own colour. Pick the tag in the event form; the colour becomes the event's accent on cards and the calendar, and the tag name shows as a badge. Editing a tag recolours all its events at once.`],
    ["How do ticket refunds and event cancellations work?",
      `Every event has a <strong>cancellation deadline</strong> (hours before start, set in the event form; default 2), an optional <strong>refund fee</strong> and an optional <strong>non-refundable</strong> flag - students agree to this policy when booking, and it's <strong>one ticket per person</strong>. Free cancellations are instant; paid-ticket refund requests land in Admin → <strong>Finance</strong>, where the finance role approves (Stripe refund minus the fee, spot released) or rejects them. To scrap a whole event: open its registration page → <strong>Cancel event…</strong> - every paid ticket is refunded <em>in full</em> automatically, free registrations are cancelled, and the event stays visible with a CANCELLED banner. ESNcard payments are never refundable this way (only via declining the application).`],
    ["How does the Google Calendar sync behave?",
      `Fully automatic and server-side - <strong>no Google sign-in popups anymore</strong>. Creating, editing, publishing, cancelling or deleting an event updates the public calendar within seconds; board meetings do the same on the board calendar ([SOLD OUT] and [CANCELLED] markers included). Individual events can stay off the calendar with the switch under the event's Advanced settings (works like the DSA switch). The <strong>Sync calendar</strong> button forces a full re-push of all upcoming events if something ever looks out of date. One-time setup: enable the Calendar API and share both calendars with the functions' service account.`],
    ["How do I pin an event's exact location?",
      `In the event form, type the location and hit <strong>Pin on map</strong> - pick the right match and the exact coordinates are saved. Students then get a precise map and directions, and Insights counts <strong>events per location</strong> reliably (pinned locations group by coordinates, not by how the text was spelled).`],
    ["How do I undo a wrong check-in?",
      `Open the registration in the Firebase console (Firestore → registrations) and delete the <code>checkedInAt</code> field - the ticket becomes scannable again.`],
    ["Where do I follow up reimbursement requests?",
      `Admin → <strong>Finance</strong> - visible only to team members with the <strong>finance</strong> role (treasurer &amp; president; the superadmin assigns it in Team). Approve a request, pay it to the shown IBAN, then <strong>Mark paid</strong> - or reject with a short reason the requester sees. Other board members can't see IBANs or requests at all.`],
    ["How do shiftlists work for the board?",
      `Admin → open the event → <strong>${mi("schedule")} Shiftlist</strong>. Add shifts (task, time, board + volunteer spots, note) or apply a board-managed <strong>template</strong> (Party, Therminal event, Cantus, …) - save any good list as a template for next time. The team signs up on <a href="/shifts">Shifts</a>; you can also assign people directly. A <strong>draft</strong> event with a shiftlist is already visible to the team (never to students) - so you can staff it before publishing. The Shifts page shows the per-person shift count (like the old spreadsheet).`],
    ["How do board meetings work in the app?",
      `<a href="/board">Board</a> (also via the Admin dashboard) → plan the bi-weekly meeting; it's added to the internal board calendar. Each meeting page auto-reports every event since the previous meeting (tickets, attendance, revenue and the students' ★ ratings) and what's coming up, and holds the minutes - write them during the meeting and <strong>Export (.md)</strong> for the archive. Advisory board members can read everything but not edit.`],
  ];

  const superadmin = [
    ["How do I add board members, volunteers, advisory board or the alumni coordinator?",
      `Admin → <strong>Team</strong>. The person must have signed in to the site once; then pick them, choose a role, and Add. The hierarchy (see the organigram on the Team tab): <strong>superadmin</strong> → <strong>board</strong> → <strong>advisory</strong> (meetings read-only) → <strong>alumnicoord</strong> (meetings read-only + alumni network) → alumni (a flag on the user, set on their detail page) → <strong>volunteer</strong> (shifts, scan &amp; check-in). You can also give each member a <strong>function</strong> (President, Treasurer, …).`],
    ["Why can't I change or remove my own account in Team?",
      `Deliberate lock-out protection - so the organisation can never accidentally lose its last superadmin. Another superadmin could change your role.`],
    ["When do role changes take effect?",
      `The next time that person reloads the site.`],
    ["What still requires the Firebase console or CLI?",
      `Bootstrapping the very first admin, undoing check-ins, deploying updates (<code>firebase deploy</code> from the project folder), and - later - the Stripe secrets and Cloud Functions.`],
    ["How does ESNcard verification work (technical)?",
      `Cards are checked live against <strong>esncard.org</strong> from our server. ESN International gave us a Cloudflare-bypass header (<code>x-bypass-cf-api</code>) that lives in Firebase Secret Manager as <code>ESNCARD_BYPASS_KEY</code> - never in the app code. The Cloud Function <code>verifyEsncard</code>/<code>linkEsncard</code>/<code>assignEsncard</code> calls <code>esncard.org/services/1.0/card.json?code=…</code> and reads the status.<br><br>
      <strong>The five states</strong> esncard.org returns: <code>active</code> (valid member - section + expiry come back), <code>available</code> (a real card that ESN owns but nobody activated yet - no expiry), <code>expired</code>, <code>blocked</code>, and empty (unknown code).<br><br>
      <strong>Student links a card</strong> (Account → Already have a card): if it's <em>active</em>, it's verified instantly, the section, expiry, code &amp; tid are saved and member prices apply - <em>no board check</em>. If it's <em>available</em>, it's linked but marked "not activated"; the student activates it on esncard.org and taps Refresh. Expired/blocked/unknown are refused with a reason.<br><br>
      <strong>Board assigns a card</strong> (Admin → ESNcards, or a member's Details page): the <strong>Check</strong> button shows the live status without saving; <strong>Assign</strong> / <strong>Verify &amp; assign</strong> verifies the number, links it and flips the application to "active" so the pickup e-mail goes out. Only <em>available</em> cards can be assigned - an already-active card belongs to the person who registered it and only they can link it; blocked, expired and unknown cards are refused. Nobody can tick "verified" by hand any more.<br><br>
      <strong>Fallback switch</strong> (Settings → ESNcard, superadmin only): <em>Also accept "available" cards as members</em>. Standard is OFF - only an active card counts. Switch it ON when students can't register on esncard.org or the API is down: a linked-but-not-activated card then gives member prices, ESNcard-only access and the perks too, in the app AND in the Cloud Functions (they re-read the setting within a minute). Switch it back OFF once esncard.org works again.<br><br>
      <strong>Guarantees</strong>: one card can never sit on two LIVE accounts (checked server-side against every user + application; the kept issue-record of a deleted account does not reserve the number, so a returning owner can relink their own card on a new login); expiry is taken from esncard.org (never guessed); when a card expires the member simply links a newer one; and every link/assign is written to that person's card history (their user detail page). If a check ever says "esncard.org refused the request", the bypass key was changed or disabled - ask ESN International and re-set the secret with <code>firebase functions:secrets:set ESNCARD_BYPASS_KEY</code>.`],
  ];

  const section = (title, items) => `
    <h3 class="section-title sm">${title}</h3>
    <div class="faq-list">${items.map(([q, a]) => faqItem(q, a)).join("")}</div>`;

  $app.innerHTML = `
    <h2 class="section-title">Help &amp; FAQ</h2>
    <div class="filter-bar" style="margin-bottom:14px">
      <input id="faq-q" type="search" placeholder="Search the FAQ…" autocomplete="off" />
    </div>
    <div class="faq-wrap" id="faq-wrap">
      ${section("For students", student)}
      ${isStaff() ? section("Scanning & check-in at the door", scanning) : ""}
      ${isStaff() ? section("For volunteers - shifts & expenses", volunteer) : ""}
      ${isAdmin ? section("For board members - organising events", board) : ""}
      ${myRole === "superadmin" ? section("For the superadmin", superadmin) : ""}
      <p class="form-hint hidden" id="faq-empty">Nothing in the FAQ matches that - but the board can help.</p>
      <div class="form-card" style="margin-top:20px">
        <strong>${mi("forum", "sm")} Question not answered?</strong>
        <p class="form-hint" style="margin:6px 0 10px">Send it straight to the board - they reply in the app and you get a notification &amp; e-mail.</p>
        <a class="btn btn-cyan btn-sm" href="/contact">Contact the board</a>
      </div>
    </div>
  `;

  // Live FAQ search (v0.129): filters every question by its full text,
  // opens the matches, hides emptied sections.
  const faqQ = document.getElementById("faq-q");
  faqQ.addEventListener("input", () => {
    const q = faqQ.value.trim().toLowerCase();
    const items = [...$app.querySelectorAll(".faq-item")];
    let any = false;
    items.forEach((it) => {
      const hit = !q || it.textContent.toLowerCase().includes(q);
      it.hidden = !hit;
      if (hit) any = true;
      if (q.length >= 2) it.open = hit; else it.open = false;
    });
    // hide section headings whose list has no visible items left
    $app.querySelectorAll("#faq-wrap .faq-list").forEach((list) => {
      const empty = ![...list.querySelectorAll(".faq-item")].some((it) => !it.hidden);
      list.hidden = empty;
      const h = list.previousElementSibling;
      if (h && h.classList.contains("section-title")) h.hidden = empty;
    });
    document.getElementById("faq-empty").classList.toggle("hidden", any || !q);
  });
}

// ------------------------------------------------------------
// Contact the board (v0.129) - FAQ-first: typing your question shows
// matching FAQ answers live; the form sits below for what's left.
// Messages become threads the board answers in /admin/inbox.
// ------------------------------------------------------------
const CONTACT_CATEGORIES = ["ESNcard", "Events & tickets", "Payments & refunds", "App problem", "Suggestion", "Other"];
const CONTACT_STATUS = { open: ["badge-pending", "waiting for the board"], answered: ["badge-paid", "answered"], closed: ["badge-free", "closed"] };

async function viewContact() {
  if (!currentUser) {
    $app.innerHTML = signInState("forum", "Sign in to contact the board - replies land right here in the app.");
    document.getElementById("es-login").onclick = signIn;
    return;
  }
  setLoading();
  let myMsgs = [];
  try {
    const snap = await getDocs(query(collection(db, "contactMessages"), where("uid", "==", currentUser.uid)));
    myMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (toDate(b.lastReplyAt || b.createdAt)?.getTime() || 0) - (toDate(a.lastReplyAt || a.createdAt)?.getTime() || 0));
  } catch { /* the form still works */ }

  const faqItems = faqStudentItems();
  const msgRow = (m) => {
    const [cls, label] = CONTACT_STATUS[m.status] || CONTACT_STATUS.open;
    return `
    <details class="faq-item" data-mid="${m.id}">
      <summary>
        <span class="badge ${cls}">${label}</span>
        <strong style="margin-left:6px">${esc(m.category || "Other")}</strong>
        <span class="form-hint" style="margin-left:6px">${fmtDate(m.createdAt)}</span>
      </summary>
      <div class="faq-a">
        <p style="white-space:pre-wrap;margin:0 0 8px">${esc(m.message || "")}</p>
        <div class="ct-thread" data-mid="${m.id}"><p class="form-hint">Loading replies…</p></div>
        ${m.status !== "closed" ? `
        <div class="form-field" style="margin:10px 0 0">
          <textarea class="ct-reply" data-mid="${m.id}" rows="2" maxlength="2000" placeholder="Write a reply…"></textarea>
        </div>
        <div class="form-actions" style="margin:8px 0 0">
          <button class="btn btn-sm btn-cyan ct-send" data-mid="${m.id}">Send reply</button>
          <button class="btn btn-sm btn-ghost btn-ink ct-close" data-mid="${m.id}">Mark solved</button>
        </div>` : ""}
      </div>
    </details>`;
  };

  $app.innerHTML = `
    <h2 class="section-title">${mi("forum")} Contact the board</h2>
    <p class="form-hint" style="margin:-6px 0 14px">Type your question first - most answers are already in the FAQ. Still stuck? Send it below and the board replies in the app (you get a notification &amp; e-mail).</p>
    <div class="filter-bar" style="margin-bottom:8px">
      <input id="ct-q" type="search" placeholder="What's your question?" autocomplete="off" maxlength="200" />
    </div>
    <div id="ct-faq-hits" style="margin-bottom:14px"></div>
    <div class="form-card" style="margin-bottom:20px">
      <strong>${mi("send", "sm")} Send it to the board</strong>
      <div class="form-grid" style="margin-top:10px">
        <div class="form-field">
          <label for="ct-cat">Category</label>
          <select id="ct-cat">${CONTACT_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("")}</select>
        </div>
        <div class="form-field full">
          <label for="ct-msg">Your message</label>
          <textarea id="ct-msg" rows="4" maxlength="2000" placeholder="Tell us what's up - the more detail, the faster we can help."></textarea>
        </div>
      </div>
      <div class="form-actions" style="margin-top:6px">
        <button class="btn btn-green" id="ct-submit">Send to the board</button>
        <span class="form-hint">Sent as ${esc(currentUser.displayName || currentUser.email || "you")}</span>
      </div>
    </div>
    ${myMsgs.length ? `
    <h3 class="section-title sm">My messages</h3>
    <div class="faq-list">${myMsgs.map(msgRow).join("")}</div>` : ""}
  `;

  // FAQ-first deflection: live matches while typing (question ≥ 3 chars).
  const ctQ = document.getElementById("ct-q");
  const hits = document.getElementById("ct-faq-hits");
  ctQ.addEventListener("input", () => {
    const q = ctQ.value.trim().toLowerCase();
    if (q.length < 3) { hits.innerHTML = ""; return; }
    const found = faqItems.filter(([qq, aa]) => (qq + " " + aa).toLowerCase().includes(q)).slice(0, 5);
    hits.innerHTML = found.length
      ? `<p class="form-hint" style="margin:0 0 6px">${mi("lightbulb", "sm")} These FAQ answers might already help:</p>
         <div class="faq-list">${found.map(([qq, aa]) => `<details class="faq-item" open><summary>${qq}</summary><div class="faq-a">${aa}</div></details>`).join("")}</div>`
      : "";
  });

  // Send a new message
  document.getElementById("ct-submit").onclick = async (e) => {
    const msg = document.getElementById("ct-msg").value.trim();
    if (msg.length < 5) { toast("Tell us a bit more - at least a full sentence.", "warn"); return; }
    e.target.disabled = true;
    try {
      await addDoc(collection(db, "contactMessages"), {
        uid: currentUser.uid,
        name: currentUser.displayName || "",
        email: currentUser.email || "",
        category: document.getElementById("ct-cat").value,
        message: msg,
        status: "open",
        createdAt: serverTimestamp(),
        lastReplyAt: serverTimestamp(),
      });
      toast("Sent! The board will get back to you - watch for a notification.", "success");
      viewContact();
    } catch (err) { toast("Could not send: " + err.message, "error"); e.target.disabled = false; }
  };

  // Threads: load replies when a message is opened; send/close handlers.
  const loadThread = async (mid) => {
    const box = $app.querySelector(`.ct-thread[data-mid="${mid}"]`);
    if (!box || box.dataset.loaded) return;
    box.dataset.loaded = "1";
    try {
      const rs = await getDocs(query(collection(db, "contactMessages", mid, "replies"), orderBy("at", "asc")));
      box.innerHTML = rs.docs.map((d) => {
        const r = d.data();
        const mine = r.uid === currentUser.uid;
        return `<div class="ct-bubble ${mine ? "mine" : "board"}">
          <small>${mine ? "You" : esc(r.name || "ESN Gent board")} · ${fmtDate(r.at)} ${fmtTime(r.at)}</small>
          <p style="white-space:pre-wrap;margin:2px 0 0">${esc(r.text || "")}</p>
        </div>`;
      }).join("") || `<p class="form-hint">No reply yet - the board usually answers within a day or two.</p>`;
    } catch { box.innerHTML = `<p class="form-hint">Couldn't load the replies - check your connection and reopen this message.</p>`; }
  };
  $app.querySelectorAll("details[data-mid]").forEach((det) => {
    det.addEventListener("toggle", () => { if (det.open) loadThread(det.dataset.mid); });
  });
  $app.querySelectorAll(".ct-send").forEach((btn) => {
    btn.onclick = async () => {
      const mid = btn.dataset.mid;
      const ta = $app.querySelector(`.ct-reply[data-mid="${mid}"]`);
      const text = ta.value.trim();
      if (!text) return;
      btn.disabled = true;
      try {
        await addDoc(collection(db, "contactMessages", mid, "replies"), {
          uid: currentUser.uid, name: currentUser.displayName || "", text, at: serverTimestamp(),
        });
        toast("Reply sent.", "success");
        viewContact();
      } catch (err) { toast("Failed: " + err.message, "error"); btn.disabled = false; }
    };
  });
  $app.querySelectorAll(".ct-close").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await updateDoc(doc(db, "contactMessages", btn.dataset.mid), { status: "closed" });
        toast("Marked as solved - thanks!", "success");
        viewContact();
      } catch (err) { toast("Failed: " + err.message, "error"); }
    };
  });
}

// ------------------------------------------------------------
// Privacy & account deletion (GDPR)
// ------------------------------------------------------------
function viewPrivacy() {
  $app.innerHTML = `
    <h2 class="section-title">Privacy policy</h2>
    <div class="form-card rich" style="max-width:760px">
      <p><em>Last updated: 23 August 2026 · ESN Gent · Contact: <a href="mailto:esn.gent@gmail.com">esn.gent@gmail.com</a></em></p>

      <h3>Who we are</h3>
      <p>This website is run by ESN Gent (Erasmus Student Network Gent) to let students discover events, register, buy tickets and manage their ESNcard. ESN Gent is the data controller for the personal data described below.</p>

      <h3>What we store, and why</h3>
      <ul>
        <li><strong>Account basics</strong> - your name, email address and profile photo from your Google account, used to sign you in and identify your tickets.</li>
        <li><strong>Profile details you choose to add</strong> - birthday, phone number, nationality and home university. These are optional and help us organise events (e.g. contacting you about a trip). You can edit or remove them at any time on your profile page.</li>
        <li><strong>Registrations &amp; tickets</strong> - which events you registered for, ticket type, amount paid, and whether your ticket was scanned at the entrance. Board members (admins) can see this to run events.</li>
        <li><strong>ESNcard</strong> - your card application (exchange details, stay period, home university and your proof-of-exchange file), your card number, and its status and validity dates.</li>
        <li><strong>Waitlist entries</strong> - your name and email for events you queued for.</li>
        <li><strong>App preferences</strong> - your notification choices, your personal bucketlist progress on the Ghent guide, and (if you enable notifications) a push token that identifies your device to deliver them. Your event check-ins are shown back to you as stamps in your ESN Passport.</li>
      </ul>

      <h3>E-mails we send</h3>
      <p>We send service e-mails from <strong>app@esngent.org</strong> about things you did or that affect you: ticket confirmations, ESNcard pickup notices, waitlist offers, refund decisions, ticket transfers and event cancellations. These are part of running your registrations - they are not marketing, and we don't send newsletters without asking you first.</p>

      <h3>Payments</h3>
      <p>Online payments are processed by <a href="https://stripe.com/privacy" target="_blank" rel="noopener">Stripe</a>. We never see or store your card number. Stripe keeps its own records of payments as required for financial processing.</p>

      <h3>Analytics</h3>
      <p>We use <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google Analytics</a> to understand how the app is used - which pages are visited, on what kind of device, and roughly from where. This helps a small volunteer team improve the app. Analytics data is aggregated usage data processed by Google on our behalf; we don't use it to identify you personally, we don't use it for advertising, and it is separate from your account data above. You can block analytics with your browser's tracking protection or a content blocker without affecting how the app works.</p>

      <h3>AI features (board tools only)</h3>
      <p>Board members can use an AI assistant ("Jacob", powered by Google Gemini) to draft event descriptions, summarise anonymous event feedback and recap board-meeting minutes. Only board-written text and anonymous ratings/comments are processed - <strong>your personal data (name, e-mail, profile, tickets) is never sent to the AI</strong>.</p>

      <h3>Where your data lives</h3>
      <p>Data is stored in Google Firebase (Cloud Firestore); our database region is in Europe. Google acts as a data processor. Signing in uses Google Sign-In.</p>

      <h3>What we don't do</h3>
      <p>We don't sell your data and we show no ads. Beyond sign-in and the analytics described above, the only browser storage used is what's strictly necessary for the app to work. Events published to our public Google Calendar contain event information only - never your personal data.</p>

      <h3>How long we keep it</h3>
      <p>Until you delete your account (below) or ask us to remove it. Records of payments may be retained in anonymised form for accounting purposes.</p>

      <h3>Your rights</h3>
      <p>Under the GDPR you can access, correct, export or erase your data, and object to processing. Most of this is self-service: edit your profile anytime, and use the button below (or on your profile page) to delete your account. For anything else, email <a href="mailto:esn.gent@gmail.com">esn.gent@gmail.com</a>. You also have the right to complain to the Belgian Data Protection Authority (<a href="https://www.dataprotectionauthority.be" target="_blank" rel="noopener">gegevensbeschermingsautoriteit.be</a>).</p>

      <h3>Deleting your account</h3>
      <p>Deleting your account removes your profile, notification tokens, waitlist entries, messages to the board, open reimbursement requests, upcoming shift sign-ups, any team role and your login. Past tickets, shop orders, ratings and past shifts stay as anonymous records (no name or e-mail) for attendance counts and accounting. If an ESNcard was issued to you, the issue record (name + card number) is kept as proof of the issued card; all other details on it are erased. This cannot be undone.</p>
      ${currentUser ? `<p><button class="btn btn-ghost btn-danger" id="btn-delete-account">Delete my account &amp; data</button></p>` : `<p class="form-hint">Sign in to delete your account, or email us.</p>`}
    </div>
  `;
  document.getElementById("btn-delete-account")?.addEventListener("click", deleteMyAccount);
}

async function deleteMyAccount() {
  if (!currentUser) return;
  const uid0 = currentUser.uid;

  // Guard: warn if upcoming tickets would become unusable
  try {
    const regs = await getDocs(query(collection(db, "registrations"), where("uid", "==", uid0)));
    const upcoming = [];
    for (const d of regs.docs) {
      const r = d.data();
      if (r.status !== "paid" && r.status !== "free") continue;
      try {
        const evSnap = await getDoc(doc(db, "events", r.eventId));
        if (evSnap.exists() && toDate(evSnap.data().start) > new Date()) {
          upcoming.push(r.eventTitle || "an event");
        }
      } catch { /* event unpublished/removed - ignore */ }
    }
    if (upcoming.length) {
      const list = upcoming.slice(0, 3).join(", ") + (upcoming.length > 3 ? "…" : "");
      if (!await appConfirm(`⚠️ You still have ${upcoming.length} upcoming ticket${upcoming.length === 1 ? "" : "s"} (${list}).\n\nThese become unusable if you delete your account - cancel them first if you want your spot freed, or contact the board about paid tickets.\n\nContinue with deletion anyway?`)) {
        toast("Deletion cancelled - your tickets are untouched.");
        return;
      }
    }
  } catch { /* guard is best-effort; deletion itself still confirms below */ }

  const check = await appPrompt(
    "This permanently deletes your account: profile, notifications, waitlist entries, messages to the board, shift sign-ups and any team role. Past tickets, orders and ratings stay as anonymous records (no name or e-mail). This cannot be undone.\n\nType DELETE to confirm:"
  );
  if (check !== "DELETE") { toast("Deletion cancelled - nothing was removed."); return; }
  toast("Deleting your data…");
  // v0.138: one server-side sweep (deleteMyAccount) removes or anonymises
  // EVERY record tied to this account - including the ones client rules
  // never allowed us to touch (push tokens, team role, contact threads,
  // shift sign-ups) - and deletes the login last. No re-auth dance needed.
  let res;
  try {
    res = (await httpsCallable(functions, "deleteMyAccount")({})).data || {};
  } catch (err) {
    toast("Deletion failed - nothing was removed. Please try again or email esn.gent@gmail.com. (" + (err?.message || "") + ")", "error");
    return;
  }
  try { localStorage.setItem("esn-signed-in", "0"); } catch { /* fine */ }
  try { await signOut(auth); } catch { /* the login is already gone */ }
  navigate("/");
  if (!res.loginDeleted) {
    toast("Your data was removed, but the login itself could not be deleted - email esn.gent@gmail.com and we'll finish it.", "error");
  } else if (res.problems?.length) {
    toast(`Account deleted. A few records (${res.problems.join(", ")}) could not be removed automatically - email esn.gent@gmail.com to finish.`, "error");
  } else {
    toast("Your account and data have been deleted. Goodbye!", "success");
  }
}

// ------------------------------------------------------------
// Profile & ESNcard
// ------------------------------------------------------------
function renderEsncard(p) {
  const hasCard = profileHasCard(p);
  return `
    <div class="esncard ${hasCard ? "" : "esncard-grey"}">
      <div class="esncard-left">
        <div class="esncard-brand">ESNcard</div>
        <div class="esncard-sub">Member of the<br />Erasmus Generation</div>
        <div class="esncard-photo">
          ${currentUser.photoURL
            ? `<img src="${esc(currentUser.photoURL)}" referrerpolicy="no-referrer" alt="" />`
            : `<span>PHOTO</span>`}
        </div>
        ${(() => {
          // v0.136: the replica shows the card's dates here (activation when
          // the API gave us one; validity as the fallback for older links).
          const dot = (d) => toDate(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ_BE }).replace(/\//g, ".");
          return `<div class="esncard-notvalid">${p.esncardActivatedAt ? `Activated ${dot(p.esncardActivatedAt)}` : p.esncardExpiresAt ? `Valid until ${dot(p.esncardExpiresAt)}` : ""}</div>`;
        })()}
      </div>
      <div class="esncard-right">
        <div class="esncard-field">
          <div class="esncard-label">Name &amp; Surname</div>
          <div class="esncard-value">${esc(p.displayName || currentUser.displayName || "")}</div>
        </div>
        <div class="esncard-frow">
          <div class="esncard-field" style="flex:1.4">
            <div class="esncard-label">Nationality</div>
            <div class="esncard-value">${esc(p.nationality || "")}</div>
          </div>
          <div class="esncard-field">
            <div class="esncard-label">Date of Birth</div>
            <div class="esncard-value">${p.birthday ? esc(p.birthday.split("-").reverse().join(".")) : ""}</div>
          </div>
        </div>
        <div class="esncard-field">
          <div class="esncard-label">Studies At</div>
          <div class="esncard-value">${esc(p.university || "")}</div>
        </div>
        <div class="esncard-field">
          <div class="esncard-label">ESN Section</div>
          <div class="esncard-value">ESN Gent</div>
        </div>
        <div class="esncard-bottom">
          <div class="esncard-field" style="flex:0 1 auto;min-width:38%">
            <div class="esncard-label">ESNcard №</div>
            <div class="esncard-value mono">${esc(p.esncardCode || "")}</div>
          </div>
          ${p.esncardCode ? `<svg class="esncard-barcode" id="esncard-barcode"></svg>` : `<div class="esncard-barcode-empty"></div>`}
        </div>
      </div>
    </div>`;
}

function renderEsncardBarcode(p) {
  const el = document.getElementById("esncard-barcode");
  if (!el || !p.esncardCode) return;
  if (!window.JsBarcode) { el.remove(); return; }
  try {
    window.JsBarcode(el, p.esncardCode, {
      format: "CODE128",
      displayValue: false,
      height: 34,
      width: 1.5,
      margin: 0,
      background: "transparent",
      lineColor: "#1c1d3a",
    });
  } catch { el.remove(); }
}

// ESNcard verification result -> a compact badge (v0.132). Shared by the
// admin assign flow and the student link flow.
function esncardCheckBadge(r) {
  if (!r || !r.found) return `<span class="badge badge-soldout">${mi("help", "sm")} not found on esncard.org</span>`;
  const active = r.status === "active" && !r.expired;
  const cls = active ? "badge-paid" : r.status === "available" ? "badge-requested" : "badge-soldout";
  const bits = [r.status || "?"];
  if (r.section) bits.push(r.section);
  if (r.expiry) bits.push(`until ${r.expiry}`);
  if (r.expired) bits.push("EXPIRED");
  return `<span class="badge ${cls}">${mi(active ? "verified" : "error", "sm")} ${esc(bits.join(" · "))}</span>`;
}
function esncardStatusLine(p) {
  if (cardExpiredFor(p)) return `${mi("event_busy", "sm")} Card expired ${fmtDate(p.esncardExpiresAt)} - member prices stopped`;
  return p.esncardVerified === true
    ? `${mi("verified", "sm")} Verified - member prices apply automatically`
    : profileHasCard(p)
      ? `${mi("verified", "sm")} Card linked - member prices apply (ESN Gent currently accepts cards awaiting activation)`
    : p.alumni === true
      ? `${mi("school", "sm")} Alumni - lifetime member prices (except some trips)`
      : p.esncardCode && p.esncardStatus === "available"
        ? `${mi("hourglass_top", "sm")} Card linked - activate it on esncard.org to unlock member prices`
        : p.esncardCode
          ? "Card linked - refresh to check its status"
          : "No card linked yet - the card activates once linked and verified";
}

// One place that turns a user doc into an ESNcard status for the admin views.
// Verification is done by the system (esncard.org), never ticked by hand - so
// these are derived, read-only labels. Keys double as the Users-list filters.
function userCardStatus(u) {
  if (!u.esncardCode) return { key: "none", label: "No card", cls: "badge-soldout", icon: "credit_card_off" };
  const exp = u.esncardExpiresAt ? toDate(u.esncardExpiresAt).getTime() : null;
  if (exp && exp < Date.now()) return { key: "expired", label: "Expired", cls: "badge-soldout", icon: "event_busy" };
  if (u.esncardStatus === "available") return { key: "available", label: "Available", cls: "badge-requested", icon: "hourglass_top" };
  if (u.esncardVerified === true || u.esncardStatus === "active") return { key: "active", label: "Active", cls: "badge-paid", icon: "verified" };
  return { key: "linked", label: "Linked", cls: "badge-esn", icon: "link" }; // legacy: code but no status yet
}
function userCardBadge(u) {
  const s = userCardStatus(u);
  return `<span class="badge ${s.cls}">${mi(s.icon, "sm")} ${s.label}</span>`;
}

async function loadMyCardData() {
  let application = null;
  try {
    const [profSnap, appSnap] = await Promise.all([
      getDoc(doc(db, "users", currentUser.uid)),
      getDoc(doc(db, "esncardApplications", currentUser.uid)),
    ]);
    myProfile = profSnap.exists() ? profSnap.data() : {};
    if (appSnap.exists()) application = appSnap.data();
  } catch { myProfile = myProfile || {}; }
  return application;
}

// Shortcut tiles on the profile page - ONLY the destinations missing from
// this user's bottom bar, so nothing is shown twice on mobile. The grid is
// hidden on desktop entirely (the top nav already has every destination).
// Must mirror the bottom-bar role logic in the auth handler above.
function quickTiles() {
  const advisory = ["advisory", "alumnicoord"].includes(myRole);
  const inBar = new Set(["home", "my-tickets", "account"]);
  if (!isStaff()) inBar.add("calendar");
  if (!isStaff() && !advisory) inBar.add("shop");
  if (advisory) inBar.add("board");
  if (isStaff() && !isAdmin) inBar.add("shifts");
  if (isStaff()) inBar.add("scan");
  if (isAdmin) inBar.add("admin");
  const tiles = [
    ["calendar", "calendar_month", "Calendar", true],
    ["shop", "storefront", "Shop", true],
    ["shifts", "schedule", "Shifts", isStaff()],
    ["scan", "qr_code_scanner", "Scan", isStaff()],
    ["board", "event_note", "Board", canMeetings()],
    ["admin", "admin_panel_settings", "Admin", isAdmin],
  ].filter(([k, , , ok]) => ok && !inBar.has(k));
  if (!tiles.length) return "";
  return `<nav class="quick-grid" aria-label="Shortcuts">
    ${tiles.map(([k, icon, label]) => `<a href="/${k}">${mi(icon)}<span>${label}</span></a>`).join("")}
  </nav>`;
}

// Account screen: the ESNcard front and centre, actions below.
async function viewAccount() {
  if (!currentUser) {
    $app.innerHTML = signInState("person", "Sign in to see your ESNcard and account.");
    document.getElementById("es-login").onclick = signIn;
    return;
  }
  setLoading();
  const application = await loadMyCardData();
  const p = myProfile;
  const hasCard = profileHasCard(p);

  // (v0.131: the shift record moved to the ESN Passport's Volunteer block -
  // the account hub stays focused on identity, card and navigation.)

  // ESN Passport level, front and centre (v0.124): the card glows in the
  // level colour, and card + strip click through to the passport.
  const ppXp = p.passportXp || 0;
  const ppLvl = p.passportLevel || (passportLevelFor(ppXp) + 1);
  const ppMeta = PASSPORT_LEVELS[ppLvl - 1] || PASSPORT_LEVELS[0];
  const ppNext = PASSPORT_LEVELS[ppLvl] || null;
  const ppFrac = ppNext ? Math.max(0, Math.min(1, (ppXp - ppMeta.xp) / (ppNext.xp - ppMeta.xp))) : 1;

  $app.innerHTML = `
    <div class="account-wrap">
      <div class="account-left">
      <a class="esncard-stage pp-glow-${ppLvl}" href="/passport" title="Open your ESN Passport">
        <div class="esncard-tilt" id="esncard-tilt">${renderEsncard(p)}</div>
        <div class="pp-level-strip">
          <span class="pp-strip-ring" style="background:conic-gradient(${ppMeta.color} ${Math.round(ppFrac * 360)}deg, rgba(128,128,160,.25) 0deg)">
            ${currentUser.photoURL ? `<img src="${esc(currentUser.photoURL)}" referrerpolicy="no-referrer" alt="" />` : `<b>${ppLvl}</b>`}
            <i style="background:${ppMeta.color}">${ppLvl}</i>
          </span>
          <span class="pp-strip-main">
            <strong style="color:${ppMeta.color}">Level ${ppLvl} - ${esc(ppMeta.name)}</strong>
            <span class="pp-strip-bar"><i style="width:${Math.round(ppFrac * 100)}%;background:${ppMeta.color}"></i></span>
            <small>${ppXp} XP${ppNext ? ` · ${ppNext.xp - ppXp} XP to ${esc(ppNext.name)}` : " · max level"} - tap for your ESN Passport</small>
          </span>
          <span class="chev">›</span>
        </div>
      </a>

      ${profileMissing().length ? `
      <a class="news-strip" href="/profile" style="border-left:4px solid var(--esn-orange)">
        <span class="news-strip-icon">${mi("person_alert")}</span>
        <span class="news-strip-main">
          <small>±30 seconds</small>
          <strong>Finish your profile (${profileMissing().join(", ")}) - needed the first time you register for an event</strong>
        </span>
        <span class="chev">›</span>
      </a>` : ""}
      <div class="form-card acct-member" style="margin:0">
        <p class="account-role" style="margin:0 0 10px">${myRole ? `<span class="badge badge-esn">${esc(roleLabel())}</span> ` : ""}<span class="form-hint">${esc(currentUser.email || "")}</span></p>
        ${cardExpiredFor(p) ? `
          <p class="acct-state"><span class="badge badge-soldout">${mi("event_busy", "sm")} Card expired ${fmtDate(p.esncardExpiresAt)}</span></p>
          <p class="acct-note">Member prices stopped. Still an international student in Ghent? Apply for a new card${myCardPrice() ? ` (${fmtMoney(myCardPrice())})` : ""}.</p>
          <div class="form-actions"><a href="/esncard-apply" class="btn btn-magenta btn-sm">Renew my ESNcard</a></div>
        ` : hasCard && application?.status === "active" && !application.pickedUpAt ? `
          <p class="acct-state"><span class="badge badge-paid">${mi("verified", "sm")} Active${p.esncardExpiresAt ? ` until ${fmtDate(p.esncardExpiresAt)}` : ""}</span> <span class="badge badge-requested">${mi("meeting_room", "sm")} physical card at the office</span></p>
          <p class="acct-note">Member prices already apply. Collect the plastic card <strong>${esc(application.cardNumber || "")}</strong> during <a href="/office">office hours</a> (never at events).</p>
        ` : hasCard ? `
          <p class="acct-state"><span class="badge badge-paid">${mi("verified", "sm")} ${p.esncardVerified === true ? "Active" : "Accepted"}${p.esncardExpiresAt ? ` until ${fmtDate(p.esncardExpiresAt)}` : ""}</span></p>
          <p class="acct-note">Member prices apply automatically - on events, trips and in the shop. <a href="/deals">Partner deals ›</a></p>
        ` : application && application.status === "applied" ? `
          <p class="acct-state"><span class="badge badge-requested">${mi("hourglass_top", "sm")} Application received</span></p>
          <p class="acct-note">${myCardPrice() === 0
            ? `Your card is <strong>free</strong> (team) - the board assigns a number and e-mails you.`
            : cashAllowed()
              ? `Pay <strong>${fmtMoney(myCardPrice())}</strong> online or in cash at <a href="/office">office hours</a> - then the board assigns your number and e-mails you.`
              : `Not paid yet - pay <strong>${fmtMoney(myCardPrice())}</strong> online below and the board assigns your number and e-mails you.`}</p>
          <div class="form-actions">
            ${myCardPrice() > 0 ? `<button class="btn btn-cyan btn-sm" id="btn-card-pay">Pay ${fmtMoney(myCardPrice())} online</button>` : ""}
            <a href="/esncard-apply" class="btn btn-ghost btn-sm btn-ink">Edit application</a>
          </div>
          ${myCardPrice() > 0 ? `<p class="form-hint">Payments are final - refunded automatically only if the board can't approve the application.</p>` : ""}
        ` : application && application.status === "paid" ? `
          <p class="acct-state"><span class="badge badge-paid">${mi("check_circle", "sm")} Paid - number on its way</span></p>
          <p class="acct-note">As soon as the board assigns your card number you get an e-mail. Register it on <a href="https://esncard.org" target="_blank" rel="noopener">esncard.org</a>, then pick up the physical card at <a href="/office">office hours</a>.</p>
        ` : p.esncardCode && p.esncardStatus === "available" ? `
          <p class="acct-state"><span class="badge badge-requested">${mi("hourglass_top", "sm")} Linked - not activated yet</span></p>
          <p class="acct-note">Register card <strong>${esc(p.esncardCode)}</strong> on <a href="https://esncard.org" target="_blank" rel="noopener">esncard.org</a>, then tap Refresh - member prices switch on the moment it's active.</p>
          <div class="form-actions"><button class="btn btn-cyan btn-sm" id="btn-refresh-card">${mi("refresh", "sm")} Refresh status</button></div>
          <p class="form-hint">Trouble activating? Ask at <a href="/office">office hours</a> or <a href="/contact">contact the board</a>.</p>
        ` : (p.esncardCode && !application) || application?.status === "active" ? `
          <p class="acct-state"><span class="badge badge-requested">${mi("sync", "sm")} Linked - checking</span></p>
          <p class="acct-note">Card${p.esncardCode ? ` <strong>${esc(p.esncardCode)}</strong>` : ""} is registered. Refresh to check its status on esncard.org.</p>
          <div class="form-actions"><button class="btn btn-cyan btn-sm" id="btn-refresh-card">${mi("refresh", "sm")} Refresh status</button></div>
        ` : application && application.status === "rejected" ? `
          <p class="acct-state"><span class="badge badge-soldout">${mi("block", "sm")} Application declined</span></p>
          <p class="acct-note">${application.declineReason ? `<em>${esc(application.declineReason)}</em> - ` : ""}fix it and resubmit, or come by during <a href="/office">office hours</a>.${application.refunded ? " Your online payment has been refunded (a few business days)." : application.paidOnline || application.paidAt ? " Paid already? Sort out the refund at office hours." : ""}</p>
          <div class="form-actions"><a href="/esncard-apply" class="btn btn-orange btn-sm">Edit &amp; resubmit</a></div>
        ` : `
          <p class="acct-state"><span class="badge badge-soldout">${mi("credit_card_off", "sm")} No ESNcard yet</span></p>
          <p class="acct-note">Member prices on events &amp; trips, the ESN Passport, guide and codex, plus 100+ partner deals - <strong>${myCardPrice() ? fmtMoney(myCardPrice()) : "free for team members"}</strong>.</p>
          <div class="form-actions"><a href="/esncard-apply" class="btn btn-magenta btn-sm">Apply for an ESNcard</a></div>
          <details style="margin-top:10px">
            <summary style="font-size:.88rem;font-weight:700;cursor:pointer">${mi("badge", "sm")} Already have a card? Link it</summary>
            <div class="form-actions" style="margin-top:8px">
              <input id="p-card-code" class="inline-input" style="width:180px" placeholder="ESNcard number" value="${esc(p.esncardCode || "")}" />
              <button class="btn btn-cyan btn-sm" id="btn-link-card">Link card</button>
            </div>
            <p class="form-hint">Checked live on esncard.org - an active card is verified instantly.</p>
          </details>
        `}
      </div>
      </div>

      <div class="account-right">
      ${quickTiles()}
      <nav class="account-menu">
        <div class="menu-group">My account</div>
        <a href="/profile">${mi("person", "sm")}Edit profile<span class="chev">›</span></a>
        <a href="/notifications">${mi("notifications", "sm")}Notifications<span class="chev">›</span></a>
        <button id="btn-theme">${mi("dark_mode", "sm")}Appearance<span class="menu-value" id="theme-label"></span><span class="chev">›</span></button>
        ${myRole ? `
        <div class="menu-group">ESN team</div>
        <a href="/tasks">${mi("task_alt", "sm")}My ESN tasks<span class="chev">›</span></a>
        <a href="/reimburse">${mi("receipt_long", "sm")}Reimbursements<span class="chev">›</span></a>` : ""}
        <div class="menu-group">Member perks${hasVerifiedCard() || isAlumni() || myRole ? "" : ` <span class="menu-lock">${mi("lock", "sm")} with an active ESNcard</span>`}</div>
        <a href="/passport">${mi("workspace_premium", "sm")}ESN Passport${myProfile?.passportLevel ? `<span class="menu-value" style="color:${PASSPORT_LEVELS[myProfile.passportLevel - 1]?.color || "var(--muted)"}">Lv ${myProfile.passportLevel}</span>` : ""}<span class="chev">›</span></a>
        <a href="/guide">${mi("explore", "sm")}Ghent guide &amp; bucketlist<span class="chev">›</span></a>
        <a href="/codex">${mi("music_note", "sm")}Cantus Codex<span class="chev">›</span></a>
        <a href="/deals">${mi("sell", "sm")}ESNcard deals<span class="chev">›</span></a>
        ${friendshipEligible() ? `<a href="/friends">${mi("diversity_3", "sm")}Friendship tree<span class="chev">›</span></a>` : ""}
        ${isAdmin || myRole === "alumnicoord" ? `<a href="/alumni">${mi("school", "sm")}Alumni network<span class="chev">›</span></a>` : ""}
        <a href="/news">${mi("campaign", "sm")}News<span class="chev">›</span></a>
        <div class="menu-group">More</div>
        <a href="/office">${mi("meeting_room", "sm")}ESN office &amp; hours<span class="chev">›</span></a>
        <a href="/install">${mi("install_mobile", "sm")}Install the app<span class="chev">›</span></a>
        <a href="/contact">${mi("forum", "sm")}Contact the board<span class="chev">›</span></a>
        <a href="/faq">${mi("help", "sm")}Help &amp; FAQ<span class="chev">›</span></a>
        <button id="btn-signout-account">${mi("logout", "sm")}Sign out</button>
      </nav>
      <p class="account-foot-links">
        <a href="/privacy">Privacy policy</a>${myRole ? ` · <a href="/changelog">What's new</a>` : ""} · v${APP_VERSION}
      </p>
      </div>
    </div>
  `;
  renderEsncardBarcode(p);

  // Interactive card: subtle 3D tilt + sheen following the pointer
  // (hover devices only - touch keeps the intro animation).
  const tiltEl = document.getElementById("esncard-tilt");
  if (tiltEl && window.matchMedia?.("(hover: hover)").matches) {
    tiltEl.addEventListener("pointermove", (e) => {
      const r = tiltEl.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      tiltEl.style.setProperty("--tiltY", `${(x - 0.5) * 10}deg`);
      tiltEl.style.setProperty("--tiltX", `${(0.5 - y) * 8}deg`);
      tiltEl.style.setProperty("--mx", `${x * 100}%`);
      tiltEl.style.setProperty("--my", `${y * 100}%`);
      tiltEl.style.setProperty("--sheen", "1");
    });
    tiltEl.addEventListener("pointerleave", () => {
      tiltEl.style.setProperty("--tiltX", "0deg");
      tiltEl.style.setProperty("--tiltY", "0deg");
      tiltEl.style.setProperty("--sheen", "0");
    });
  }

  document.getElementById("btn-signout-account").onclick = () => signOut(auth);

  document.getElementById("btn-card-pay")?.addEventListener("click", async (e) => {
    btnBusy(e.target, "Opening secure checkout…");
    try {
      const fn = httpsCallable(functions, "createEsncardCheckout");
      const res = await fn({});
      location.href = res.data.url;
    } catch (err) {
      toast(`Online payment isn't available right now - please try again in a minute${cashAllowed() ? ", or pay in cash during office hours" : ""}. (` + (err.message || "") + ")", "error");
      btnIdle(e.target);
    }
  });

  const themeLabel = document.getElementById("theme-label");
  const labelFor = (v) => (v === "light" ? "Light" : v === "dark" ? "Dark" : "Auto");
  themeLabel.textContent = labelFor(themePref());
  document.getElementById("btn-theme").onclick = () => {
    const cur = themePref();
    const next = cur === null ? "light" : cur === "light" ? "dark" : null;
    setThemePref(next);
    applyTheme();
    themeLabel.textContent = labelFor(next);
  };

  const linkCard = async (code, btn) => {
    if (btn) { btn.disabled = true; }
    try {
      // Server verifies on esncard.org and links by real status (v0.133):
      // active = verified instantly, available = linked pending activation.
      const r = (await httpsCallable(functions, "linkEsncard")({ code })).data;
      if (r.status === "active") toast(`Card verified${r.section ? ` (${r.section})` : ""} - member prices apply now!`, "success");
      else if (r.status === "available") toast("Card linked - activate it on esncard.org, then Refresh.", "warn");
      else toast("Card linked.", "success");
      viewAccount();
    } catch (err) {
      toast(err?.message || "Linking failed.", err?.code === "functions/failed-precondition" ? "warn" : "error");
      if (btn) btn.disabled = false;
    }
  };
  document.getElementById("btn-link-card")?.addEventListener("click", (e) => {
    const code = document.getElementById("p-card-code").value.trim().toUpperCase().replace(/\s+/g, "");
    if (code.length < 6) { toast("That code looks too short.", "warn"); return; }
    linkCard(code, e.target);
  });
  // Refresh an already-linked card (available -> active once the student
  // activates it on esncard.org).
  document.getElementById("btn-refresh-card")?.addEventListener("click", (e) => {
    if (p.esncardCode) linkCard(p.esncardCode, e.target);
  });

}

// Edit-profile screen (reached from the account screen)
async function viewProfile() {
  if (!currentUser) {
    $app.innerHTML = signInState("person", "Sign in to manage your profile.");
    document.getElementById("es-login").onclick = signIn;
    return;
  }
  setLoading();
  try {
    const profSnap = await getDoc(doc(db, "users", currentUser.uid));
    myProfile = profSnap.exists() ? profSnap.data() : {};
  } catch { myProfile = myProfile || {}; }
  const p = myProfile;

  $app.innerHTML = `
    <h2 class="section-title">Edit profile</h2>
    <div class="form-actions" style="margin:0 0 16px">
      <a href="/account" class="btn btn-ghost btn-sm" style="color:var(--esn-dark)">← My account</a>
    </div>
    <div class="profile-grid">
      <form class="form-card" id="profile-form">
        <div class="form-grid">
          <div class="form-field">
            <label for="p-first">First name *</label>
            <input id="p-first" maxlength="60" required value="${esc(p.firstName || (p.displayName || currentUser.displayName || "").split(" ")[0] || "")}" />
          </div>
          <div class="form-field">
            <label for="p-last">Last name *</label>
            <input id="p-last" maxlength="60" required value="${esc(p.lastName || (p.displayName || currentUser.displayName || "").split(" ").slice(1).join(" ") || "")}" />
          </div>
          <div class="form-field">
            <label for="p-bday">Birthday *</label>
            <input id="p-bday" type="date" required value="${esc(p.birthday || "")}" />
          </div>
          <div class="form-field">
            <label for="p-phone">Phone *</label>
            <input id="p-phone" type="tel" maxlength="30" value="${esc(p.phone || "")}" placeholder="+32 ..." />
            <span class="form-hint">Also used for your WhatsApp link.</span>
          </div>
          <div class="form-field">
            <label for="p-nationality">Nationality *</label>
            <select id="p-nationality">
              <option value="">- select -</option>
              ${NATIONALITIES.map((c) => `<option value="${esc(c)}" ${p.nationality === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
              ${p.nationality && !NATIONALITIES.includes(p.nationality)
                ? `<option value="${esc(p.nationality)}" selected>${esc(p.nationality)}</option>` : ""}
            </select>
          </div>
          <div class="form-field">
            <label for="p-home-country">Home country *</label>
            <select id="p-home-country">
              <option value="">- select -</option>
              ${NATIONALITIES.map((c) => `<option value="${esc(c)}" ${p.homeCountry === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label for="p-home-city">Home city *</label>
            <input id="p-home-city" maxlength="80" value="${esc(p.homeCity || "")}" placeholder="e.g. Sevilla" />
          </div>
          <div class="form-field full">
            <label for="p-university">Home university <span class="form-hint">(optional)</span></label>
            <input id="p-university" maxlength="120" value="${esc(p.university || "")}" />
          </div>
          <div class="form-field">
            <label for="p-instagram">Instagram <span class="form-hint">(optional)</span></label>
            <input id="p-instagram" maxlength="40" placeholder="username" value="${esc(p.instagram || "")}" />
          </div>
          <div class="form-field">
            <label for="p-linkedin">LinkedIn <span class="form-hint">(optional)</span></label>
            <input id="p-linkedin" maxlength="120" placeholder="profile URL or username" value="${esc(p.linkedin || "")}" />
          </div>
          <div class="form-field full">
            <label>Email</label>
            <input value="${esc(currentUser.email || "")}" disabled />
            <span class="form-hint">Comes from your Google account.</span>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-green">Save profile</button>
        </div>
        <p class="form-hint" style="margin-top:10px">Fields with * are required - you need a complete profile to register for events. These details also fill in your ESNcard.</p>
      </form>

      <div>
        <div class="form-card">
          <p style="font-size:.85rem"><strong>Privacy.</strong> Read our <a href="/privacy">privacy policy</a> to see exactly what we store and why.</p>
          <div class="form-actions" style="margin-top:10px">
            <button class="btn btn-ghost btn-sm btn-danger" id="btn-delete-account">Delete my account &amp; data</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-delete-account")?.addEventListener("click", deleteMyAccount);
  wireCityPicker("p-home-city", "p-home-country");

  document.getElementById("profile-form").onsubmit = async (e) => {
    e.preventDefault();
    const val = (id) => document.getElementById(id).value.trim();
    const required = [
      ["p-first", "first name"], ["p-last", "last name"], ["p-bday", "birthday"],
      ["p-phone", "phone"], ["p-nationality", "nationality"],
      ["p-home-country", "home country"], ["p-home-city", "home city"],
    ];
    for (const [id, label] of required) {
      if (!val(id)) {
        const el = document.getElementById(id);
        el.classList.add("field-error");
        el.addEventListener("input", () => el.classList.remove("field-error"), { once: true });
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus({ preventScroll: true });
        toast(`Please fill in your ${label}.`, "warn");
        return;
      }
    }
    const data = {
      firstName: val("p-first"),
      lastName: val("p-last"),
      displayName: `${val("p-first")} ${val("p-last")}`.trim(),
      birthday: val("p-bday"),
      phone: val("p-phone"),
      nationality: val("p-nationality"),
      homeCountry: val("p-home-country"),
      homeCity: val("p-home-city"),
      university: val("p-university"),
      instagram: val("p-instagram")
        .replace(/^@/, "")
        .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
        .replace(/\/+$/, ""),
      linkedin: val("p-linkedin"),
      email: currentUser.email || "",
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, "users", currentUser.uid), data, { merge: true });
      Object.assign(myProfile, data);
      toast("Profile saved", "success");
      // Sent here from an event to complete the profile? Go straight back.
      if (profileReturnTo) {
        const back = profileReturnTo;
        profileReturnTo = null;
        navigate(back);
      }
    } catch (err) {
      toast("Save failed: " + err.message, "error");
    }
  };
}


// ------------------------------------------------------------
// ESNcard application (replaces the old buy button)
// ------------------------------------------------------------
// HOST_INSTITUTIONS & STUDY_FIELDS are board-editable org lists (Admin →
// Settings → Org lists, settings/lists) since v0.106 - these are fallbacks.
let HOST_INSTITUTIONS = [
  "Ghent University", "HOGENT", "Artevelde University of Applied Sciences",
  "KU Leuven (Ghent campus)", "LUCA School of Arts", "Odisee", "Other",
];
const STAY_TYPES = [
  "Erasmus+ exchange", "Exchange (non-Erasmus)", "Internship / traineeship",
  "Full international degree student", "Other",
];
let STUDY_FIELDS = [
  "Arts & Humanities", "Business & Economics", "Communication & Media",
  "Education", "Engineering & Technology", "IT & Computer Science", "Law",
  "Medicine & Health Sciences", "Natural Sciences", "Psychology",
  "Social & Political Sciences", "Other",
];
let DISCOVERY_OPTIONS = [
  "Instagram", "Facebook / social media", "Friends", "My university / orientation days",
  "ESN website", "Google", "Other",
];

async function viewEsncardApply() {
  if (!currentUser) {
    $app.innerHTML = signInState("badge", "Sign in to apply for an ESNcard.");
    document.getElementById("es-login").onclick = signIn;
    return;
  }
  setLoading();
  let existing = null;
  let existingProof = null;
  try {
    const [ps, as, prs] = await Promise.all([
      getDoc(doc(db, "users", currentUser.uid)),
      getDoc(doc(db, "esncardApplications", currentUser.uid)),
      getDoc(doc(db, "applicationProofs", currentUser.uid)).catch(() => null),
    ]);
    myProfile = ps.exists() ? ps.data() : {};
    if (as.exists()) existing = as.data();
    if (prs && prs.exists()) existingProof = prs.data(); // {image} or {file (PDF URL), contentType}
  } catch { myProfile = myProfile || {}; }
  // 'applied' can still be edited; 'rejected' can be fixed & resubmitted;
  // an 'active' application whose card EXPIRED can be renewed.
  const renewal = existing?.status === "active"
    && ((existing.expiresAt && toDate(existing.expiresAt) < new Date()) || cardExpiredFor(myProfile));
  // The board removed the card from this account (lost card, mistake, …)
  // while the application doc still says "active" - without this branch the
  // student would be locked out ("already being processed") forever.
  const orphaned = existing?.status === "active" && !renewal && !myProfile?.esncardCode;
  if (existing && existing.status !== "applied" && existing.status !== "rejected" && !renewal && !orphaned) {
    toast("Your application is already being processed.", "success");
    navigate("/account");
    return;
  }
  const resubmit = existing?.status === "rejected";
  const p = myProfile;
  const a = existing || {};
  const nameParts = (p.displayName || currentUser.displayName || "").split(" ");
  const firstGuess = a.firstName || nameParts[0] || "";
  const lastGuess = a.lastName || nameParts.slice(1).join(" ") || "";
  const disc = a.discovery || [];
  const proofRequired = cardPricing.proofRequired !== false; // welcome-week switch
  const proofPrefill = existingProof?.image || a.proofImage || null; // inline image (a.proofImage = pre-1.4 docs)
  const proofPdfPrefill = existingProof?.file || null;              // previously uploaded PDF

  const btnLabel = resubmit ? "Resubmit" : existing ? "Update" : "Submit";
  const priceNow = myCardPrice();
  // "Other" anywhere in a list gets a free-text field next to it (v1.2.0).
  const isOther = (v) => /^other\b/i.test(String(v || ""));
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const now = new Date();
  const monthOptions = (sel, blank) => (blank ? `<option value="">- month -</option>` : "")
    + MONTHS.map((m, i) => `<option value="${String(i + 1).padStart(2, "0")}" ${sel === String(i + 1).padStart(2, "0") ? "selected" : ""}>${m}</option>`).join("");
  const yearOptions = (sel, blank) => (blank ? `<option value="">- year -</option>` : "")
    + [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2, now.getFullYear() + 3]
      .map((y) => `<option value="${y}" ${String(sel) === String(y) ? "selected" : ""}>${y}</option>`).join("");
  const [fromY, fromM] = (a.stayFrom || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`).split("-");
  const [toY, toM] = (a.stayUntil || "-").split("-");
  const untilOpen = a.stayUntilUnknown === true || (!a.stayUntil && !!existing);
  $app.innerHTML = `
    <h2 class="section-title">${renewal ? "Renew your ESNcard" : orphaned ? "Apply again for an ESNcard" : resubmit ? "Fix &amp; resubmit your ESNcard application" : existing ? "Edit your ESNcard application" : "Apply for your ESNcard"}</h2>
    <p class="form-hint" style="margin:-8px 0 14px">${renewal
      ? "Your previous card expired - check that everything below is still correct, submit, and you'll get a fresh card with a new number."
      : orphaned ? "Your previous card is no longer linked to this account - check that everything below is still correct and submit to apply for a new one."
      : `Takes about two minutes. ${priceNow === 0 ? "Your card is free as a team member." : `The card costs <strong>${fmtMoney(priceNow)}</strong>${priceNow === cardPricing.volunteer && priceNow > 0 ? " (volunteer/alumni price)" : ""} and is valid ${cardPricing.validityMonths || 12} months.`} You pick it up at <a href="/office">office hours</a>.`}</p>
    ${resubmit && a.declineReason ? `<div class="form-card" style="margin:0 0 14px;border-left:4px solid var(--esn-orange)"><p style="margin:0;font-size:.9rem"><strong>Why it was declined:</strong> ${esc(a.declineReason)}</p></div>` : ""}
    <form class="form-card" id="esncard-form" style="max-width:760px">

      <div class="form-section first">
        <div class="form-section-head">
          <span class="form-step">1</span>
          <div><strong>You</strong><p class="form-hint">Name exactly as on your ID - it goes on the card.</p></div>
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label for="ea-first">First name *</label>
            <input id="ea-first" required maxlength="60" autocomplete="given-name" value="${esc(firstGuess)}" />
          </div>
          <div class="form-field">
            <label for="ea-last">Last name *</label>
            <input id="ea-last" required maxlength="60" autocomplete="family-name" value="${esc(lastGuess)}" />
          </div>
          <div class="form-field">
            <label for="ea-bday">Date of birth *</label>
            <input id="ea-bday" type="date" required autocomplete="bday" value="${esc(a.birthday || p.birthday || "")}" />
          </div>
          <div class="form-field">
            <label for="ea-nat">Nationality *</label>
            <select id="ea-nat" required>
              <option value="">- select -</option>
              ${NATIONALITIES.map((c) => `<option value="${esc(c)}" ${(a.nationality || p.nationality) === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label for="ea-phone">Phone (optional)</label>
            <input id="ea-phone" type="tel" maxlength="30" autocomplete="tel" placeholder="+32 ..." value="${esc(a.phone || p.phone || "")}" />
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-head">
          <span class="form-step">2</span>
          <div><strong>Your exchange</strong><p class="form-hint">Where you study in Ghent${proofRequired ? ", plus one document that proves it" : ""}.</p></div>
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label for="ea-host">Institution in Ghent *</label>
            <select id="ea-host" required>
              <option value="">- select -</option>
              ${HOST_INSTITUTIONS.map((h) => `<option value="${esc(h)}" ${a.hostInstitution === h ? "selected" : ""}>${esc(h)}</option>`).join("")}
              ${a.hostInstitution && !HOST_INSTITUTIONS.includes(a.hostInstitution)
                ? `<option value="${esc(a.hostInstitution)}" selected>${esc(a.hostInstitution)}</option>` : ""}
            </select>
            <input id="ea-host-other" class="other-input ${isOther(a.hostInstitution) ? "" : "hidden"}" maxlength="100" placeholder="Which institution?" value="${esc(a.hostInstitutionOther || "")}" />
          </div>
          <div class="form-field">
            <label for="ea-stay">Type of stay *</label>
            <select id="ea-stay" required>
              <option value="">- select -</option>
              ${STAY_TYPES.map((t) => `<option value="${esc(t)}" ${a.stayType === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
            </select>
            <input id="ea-stay-other" class="other-input ${isOther(a.stayType) ? "" : "hidden"}" maxlength="100" placeholder="What kind of stay?" value="${esc(a.stayTypeOther || "")}" />
          </div>
          <div class="form-field">
            <label>Staying in Ghent from *</label>
            <div class="month-row">
              <select id="ea-from-m" required>${monthOptions(fromM)}</select>
              <select id="ea-from-y" required>${yearOptions(fromY)}</select>
            </div>
          </div>
          <div class="form-field">
            <label>Until</label>
            <div class="month-row">
              <select id="ea-to-m" ${untilOpen ? "disabled" : ""}>${monthOptions(toM, true)}</select>
              <select id="ea-to-y" ${untilOpen ? "disabled" : ""}>${yearOptions(toY, true)}</select>
            </div>
            <label class="checkbox-row" style="margin-top:6px"><input type="checkbox" id="ea-to-open" ${untilOpen ? "checked" : ""} /> <span style="text-transform:none;letter-spacing:0;font-weight:500">I don't know the end date yet</span></label>
          </div>
          <div class="form-field">
            <label for="ea-homeuni">Home university</label>
            <input id="ea-homeuni" maxlength="120" value="${esc(a.homeUniversity || p.university || "")}" />
          </div>
          <div class="form-field">
            <label for="ea-homecountry">Home country</label>
            <select id="ea-homecountry">
              <option value="">- select -</option>
              ${NATIONALITIES.map((c) => `<option value="${esc(c)}" ${(a.homeCountry || p.homeCountry) === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label for="ea-homecity">Home city</label>
            <input id="ea-homecity" maxlength="80" placeholder="Start typing - pick from the list" autocomplete="off" value="${esc(a.homeCity || p.homeCity || "")}" />
          </div>
          ${proofRequired ? `
          <div class="form-field full">
            <label>Proof of exchange *</label>
            <div class="attach-box" id="ea-proof-box">
              <input id="ea-proof-file" type="file" accept="image/*,application/pdf" class="hidden" />
              <button type="button" class="btn btn-sm btn-ink btn-ghost" id="ea-proof-pick">${mi("attach_file", "sm")} Attach a file</button>
              <span id="ea-proof-name" class="attach-name ${proofPrefill || proofPdfPrefill ? "" : "form-hint"}">${proofPdfPrefill ? "PDF attached ✓" : proofPrefill ? "Photo attached ✓" : "JPG or PNG (photo / screenshot), or a PDF - max 5 MB"}</span>
              <button type="button" class="btn btn-sm btn-ghost btn-danger ${proofPrefill || proofPdfPrefill ? "" : "hidden"}" id="ea-proof-clear">Remove</button>
            </div>
            <img id="ea-proof-preview" class="img-preview ${proofPrefill ? "" : "hidden"}" src="${esc(proofPrefill || "")}" alt="" style="margin-top:8px" />
            <span id="ea-proof-pdf" class="hidden"></span>
            <span class="form-hint">Your acceptance letter, student card or exchange confirmation. One file: <strong>JPG, PNG or PDF</strong>, max <strong>5 MB</strong> (photos are shrunk automatically, so a phone picture is fine). Proofs are deleted a few months after your card is activated.</span>
          </div>` : ""}
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-head">
          <span class="form-step">3</span>
          <div><strong>Submit</strong><p class="form-hint">${priceNow === 0
            ? `Free card - you pick it up during <a href="/office">office hours</a>.`
            : cashAllowed()
              ? `Pay <strong>${fmtMoney(priceNow)}</strong> online now (card or Bancontact), or in cash when you pick the card up at <a href="/office">office hours</a>.`
              : `Pay <strong>${fmtMoney(priceNow)}</strong> online (card or Bancontact) - you're taken to the secure payment right after submitting. Pick up the card at <a href="/office">office hours</a>.`}</p></div>
        </div>
        <details class="form-optional" style="margin:0 0 14px">
          <summary class="form-hint" style="cursor:pointer">Optional: field of studies, how you found us, event ideas</summary>
          <div class="form-grid" style="margin-top:10px">
            <div class="form-field full">
              <label for="ea-field">Field of studies</label>
              <select id="ea-field">
                <option value="">- select -</option>
                ${STUDY_FIELDS.map((f2) => `<option value="${esc(f2)}" ${a.fieldOfStudies === f2 ? "selected" : ""}>${esc(f2)}</option>`).join("")}
                ${a.fieldOfStudies && !STUDY_FIELDS.includes(a.fieldOfStudies)
                  ? `<option value="${esc(a.fieldOfStudies)}" selected>${esc(a.fieldOfStudies)}</option>` : ""}
              </select>
              <input id="ea-field-other" class="other-input ${isOther(a.fieldOfStudies) ? "" : "hidden"}" maxlength="100" placeholder="Which field?" value="${esc(a.fieldOfStudiesOther || "")}" />
            </div>
            <div class="form-field full">
              <label>How did you find out about ESN Gent?</label>
              <div class="chip-row">
                ${DISCOVERY_OPTIONS.map((d, i) => `
                  <label class="chip-check"><input type="checkbox" id="ea-disc-${i}" data-other="${isOther(d) ? "1" : ""}" ${disc.includes(d) ? "checked" : ""} /> ${esc(d)}</label>`).join("")}
              </div>
              <input id="ea-disc-other" class="other-input ${disc.some(isOther) ? "" : "hidden"}" maxlength="100" placeholder="Where did you hear about us?" value="${esc(a.discoveryOther || "")}" />
            </div>
            <div class="form-field full">
              <label for="ea-ideas">Any event you'd love us to organise?</label>
              <textarea id="ea-ideas" rows="2" maxlength="400">${esc(a.ideas || "")}</textarea>
            </div>
          </div>
        </details>
        <div class="checkbox-row">
          <input type="checkbox" id="ea-privacy" ${a.privacyAccepted ? "checked" : ""} />
          <label for="ea-privacy">I have read and accept the <a href="/privacy" target="_blank">privacy policy</a> *</label>
        </div>
        <div class="form-actions">
          ${priceNow > 0 ? `
            <button type="submit" class="btn btn-magenta" id="ea-submit-pay">${btnLabel} &amp; pay ${fmtMoney(priceNow)} online</button>
            ${cashAllowed() ? `<button type="submit" class="btn btn-ghost btn-ink" id="ea-submit-cash">${btnLabel} - I'll pay cash at the office</button>` : ""}
          ` : `
            <button type="submit" class="btn btn-magenta">${btnLabel} application</button>
          `}
          <a href="/account" class="btn btn-ghost btn-danger">Cancel</a>
        </div>
      </div>
    </form>
  `;

  let proofImage = proofPrefill;
  let proofPdf = null; // freshly picked PDF File (uploaded to Storage at submit)
  let proofChanged = false;
  wireCityPicker("ea-homecity", "ea-homecountry");
  // "Other" → show the free-text field right under the list (v1.2.0)
  for (const [selId, otherId] of [["ea-host", "ea-host-other"], ["ea-stay", "ea-stay-other"], ["ea-field", "ea-field-other"]]) {
    const sel = document.getElementById(selId), other = document.getElementById(otherId);
    if (!sel || !other) continue;
    sel.addEventListener("change", () => {
      const show = isOther(sel.value);
      other.classList.toggle("hidden", !show);
      if (show) other.focus();
    });
  }
  document.querySelectorAll('[id^="ea-disc-"][data-other="1"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const other = document.getElementById("ea-disc-other");
      other?.classList.toggle("hidden", !cb.checked);
      if (cb.checked) other?.focus();
    });
  });
  document.getElementById("ea-to-open")?.addEventListener("change", (e) => {
    for (const id of ["ea-to-m", "ea-to-y"]) {
      const el = document.getElementById(id);
      el.disabled = e.target.checked;
      if (e.target.checked) el.value = "";
    }
  });
  // Proof attachment (v1.1.0): one file, picked through a real button.
  // Images are compressed client-side (any size in, ≤ ~400 KB out);
  // PDFs go to Storage as-is, so they're capped at 5 MB (rules-enforced).
  let proofRemoved = false;
  const proofName = document.getElementById("ea-proof-name");
  const proofClear = document.getElementById("ea-proof-clear");
  const proofPrev = document.getElementById("ea-proof-preview");
  const showProof = (label, ok) => {
    if (!proofName) return;
    proofName.textContent = label;
    proofName.classList.toggle("form-hint", !ok);
    proofClear?.classList.toggle("hidden", !ok);
  };
  document.getElementById("ea-proof-pick")?.addEventListener("click", () => document.getElementById("ea-proof-file")?.click());
  proofClear?.addEventListener("click", () => {
    proofImage = null; proofPdf = null; proofChanged = true; proofRemoved = true;
    const input = document.getElementById("ea-proof-file"); if (input) input.value = "";
    proofPrev?.classList.add("hidden");
    showProof("JPG or PNG (photo / screenshot), or a PDF - max 5 MB", false);
  });
  document.getElementById("ea-proof-file")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const short = file.name.length > 34 ? file.name.slice(0, 30) + "…" + file.name.slice(-4) : file.name;
    try {
      if (file.type === "application/pdf") {
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`That PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB - the limit is 5 MB. A photo or screenshot of the letter works too.`);
        }
        proofPdf = file; proofImage = null; proofChanged = true; proofRemoved = false;
        proofPrev?.classList.add("hidden");
        showProof(`${short} (${(file.size / 1024).toFixed(0)} KB) ✓`, true);
      } else if (file.type.startsWith("image/")) {
        if (file.size > 25 * 1024 * 1024) throw new Error("That photo is over 25 MB - please pick a smaller one or a screenshot.");
        showProof("Preparing photo…", false);
        proofImage = await compressImage(file);
        proofPdf = null; proofChanged = true; proofRemoved = false;
        if (proofPrev) { proofPrev.src = proofImage; proofPrev.classList.remove("hidden"); }
        showProof(`${short} ✓`, true);
      } else {
        throw new Error("Only JPG, PNG or PDF files are accepted - a photo or screenshot of the document works too.");
      }
    } catch (err) {
      toast(err.message, "error");
      e.target.value = "";
      if (!proofImage && !proofPdf) showProof("JPG or PNG (photo / screenshot), or a PDF - max 5 MB", false);
    }
  });

  document.getElementById("esncard-form").onsubmit = async (e) => {
    e.preventDefault();
    // Two submit buttons: online payment is the default path; cash is the
    // explicit opt-out ("automatically online unless they click otherwise").
    const payCash = e.submitter?.id === "ea-submit-cash";
    const submitBtns = [...e.target.querySelectorAll('button[type="submit"]')];
    const submitBtn = e.submitter || submitBtns[0];
    const val = (id) => document.getElementById(id).value.trim();
    const req = [["ea-first", "your first name"], ["ea-bday", "your date of birth"], ["ea-nat", "your nationality"], ["ea-host", "your institution in Ghent"], ["ea-stay", "your type of stay"]];
    for (const [id, what] of req) {
      if (!val(id)) {
        const el = document.getElementById(id);
        el.classList.add("field-error");
        el.addEventListener("input", () => el.classList.remove("field-error"), { once: true });
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        toast(`Please fill in ${what}.`, "error");
        return;
      }
    }
    // "Other" needs the actual answer
    for (const [selId, otherId, what] of [["ea-host", "ea-host-other", "which institution you study at"], ["ea-stay", "ea-stay-other", "what kind of stay it is"], ["ea-field", "ea-field-other", "your field of studies"]]) {
      if (isOther(val(selId)) && !val(otherId)) {
        document.getElementById(otherId).focus();
        toast(`Please tell us ${what} (you picked "Other").`, "error");
        return;
      }
    }
    const discOtherOn = [...document.querySelectorAll('[id^="ea-disc-"][data-other="1"]')].some((cb) => cb.checked);
    if (discOtherOn && !val("ea-disc-other")) { document.getElementById("ea-disc-other").focus(); toast("Please tell us where you heard about ESN Gent (you ticked \"Other\").", "error"); return; }
    // Stay period: start required, end optional (or explicitly unknown), end after start
    const untilUnknown = document.getElementById("ea-to-open").checked;
    const stayFrom = `${val("ea-from-y")}-${val("ea-from-m")}`;
    const stayUntil = !untilUnknown && val("ea-to-m") && val("ea-to-y") ? `${val("ea-to-y")}-${val("ea-to-m")}` : "";
    if (!untilUnknown && (val("ea-to-m") || val("ea-to-y")) && !stayUntil) { toast("Please pick both the month and the year of your end date - or tick 'I don't know the end date yet'.", "error"); return; }
    if (stayUntil && stayUntil < stayFrom) { toast("Your end date is before your start date - please check the months.", "error"); return; }
    if (proofRequired && !proofImage && !proofPdf && (!proofPdfPrefill || proofRemoved)) { toast("Please attach your proof of exchange (photo, screenshot or PDF).", "error"); return; }
    if (!document.getElementById("ea-privacy").checked) { toast("Please accept the privacy policy.", "error"); return; }
    submitBtns.forEach((b) => { b.disabled = true; });
    if (submitBtn) submitBtn.textContent = "Submitting…";

    const data = {
      uid: currentUser.uid,
      email: currentUser.email || "",
      firstName: val("ea-first"),
      lastName: val("ea-last"),
      birthday: val("ea-bday"),
      nationality: val("ea-nat"),
      phone: val("ea-phone"),
      hostInstitution: val("ea-host"),
      hostInstitutionOther: isOther(val("ea-host")) ? val("ea-host-other") : "",
      stayType: val("ea-stay"),
      stayTypeOther: isOther(val("ea-stay")) ? val("ea-stay-other") : "",
      stayFrom,                      // "YYYY-MM"
      stayUntil,                     // "YYYY-MM" or "" when open-ended
      stayUntilUnknown: untilUnknown,
      homeUniversity: val("ea-homeuni"),
      homeCountry: val("ea-homecountry"),
      homeCity: val("ea-homecity"),
      fieldOfStudies: val("ea-field"),
      fieldOfStudiesOther: isOther(val("ea-field")) ? val("ea-field-other") : "",
      discovery: DISCOVERY_OPTIONS.filter((d, i) => document.getElementById(`ea-disc-${i}`).checked),
      discoveryOther: discOtherOn ? val("ea-disc-other") : "",
      ideas: val("ea-ideas"),
      // the proof itself lives in applicationProofs/{uid} (inline image or
      // a Storage-PDF pointer). With the welcome-week switch OFF there may
      // legitimately be no proof at all.
      hasProof: !!(proofImage || proofPdf || (proofPdfPrefill && !proofRemoved)),
      price: myCardPrice(), // €0 board/AB · €7.50 volunteer/alumni · €15 student
      privacyAccepted: true,
      status: "applied",
      updatedAt: serverTimestamp(),
      ...(existing ? { createdAt: a.createdAt || serverTimestamp() } : { createdAt: serverTimestamp() }),
    };
    try {
      // The (large) proof is stored apart from the application so the
      // board's list view doesn't download every file at once. Images go
      // inline (compressed ≤ ~400 KB); PDFs go to Cloud Storage (≤ 5 MB,
      // rules-enforced) with only the URL in the doc.
      if (proofPdf) {
        if (submitBtn) submitBtn.textContent = "Uploading PDF…";
        const r = storageRef(storage, `proofs/${currentUser.uid}/proof.pdf`);
        await uploadBytes(r, proofPdf, { contentType: "application/pdf" });
        const url = await getDownloadURL(r);
        await setDoc(doc(db, "applicationProofs", currentUser.uid), {
          file: url, contentType: "application/pdf",
          name: String(proofPdf.name || "proof.pdf").slice(0, 120), size: proofPdf.size,
          updatedAt: serverTimestamp(),
        });
        if (submitBtn) submitBtn.textContent = "Submitting…";
      } else if (proofRemoved && !proofImage && !proofPdf) {
        // proof taken away (only possible when the welcome-week switch made it optional)
        await deleteDoc(doc(db, "applicationProofs", currentUser.uid)).catch(() => {});
        if (proofPdfPrefill) deleteObject(storageRef(storage, `proofs/${currentUser.uid}/proof.pdf`)).catch(() => {});
      } else if (proofImage && (proofChanged || !existingProof)) {
        await setDoc(doc(db, "applicationProofs", currentUser.uid), {
          image: proofImage,
          updatedAt: serverTimestamp(),
        });
        // an older PDF replaced by an image: clean the Storage file up
        if (proofPdfPrefill) deleteObject(storageRef(storage, `proofs/${currentUser.uid}/proof.pdf`)).catch(() => {});
      }
      await setDoc(doc(db, "esncardApplications", currentUser.uid), data);
      // Snapshot of this submission (v1.3.0) - the board sees previous
      // submissions on the user page even after edits and renewals.
      // Never blocks the application: a failed snapshot is only logged.
      addDoc(collection(db, "esncardApplications", currentUser.uid, "history"), {
        ...data,
        createdAt: existing?.createdAt || null,
        updatedAt: null,
        submittedAt: serverTimestamp(),
        kind: renewal ? "renewal" : orphaned ? "reapply" : resubmit ? "resubmit" : existing ? "update" : "new",
        payChoice: myCardPrice() === 0 ? "free" : payCash ? "cash" : "online",
        version: APP_VERSION,
      }).catch((err) => logError("app", "submission snapshot: " + (err?.message || err)));
      // Keep the profile in sync (fills the card replica and the event
      // registration profile too). Only what was actually filled in is
      // written - an empty optional field never blanks a profile value.
      const profileSync = {
        firstName: data.firstName,
        lastName: data.lastName,
        displayName: `${data.firstName} ${data.lastName}`.trim(),
        birthday: data.birthday,
        nationality: data.nationality,
        phone: data.phone,
        university: data.homeUniversity,
        homeCity: data.homeCity,
        // Home country from the form (v1.2.0); nationality is the fallback so
        // finishing the ESNcard flow also completes the event-registration
        // profile instead of bouncing the student into a second form.
        homeCountry: data.homeCountry || myProfile?.homeCountry || data.nationality,
        hostInstitution: data.hostInstitution,
        email: currentUser.email || "",
      };
      for (const k of Object.keys(profileSync)) if (!profileSync[k]) delete profileSync[k];
      await setDoc(doc(db, "users", currentUser.uid), { ...profileSync, updatedAt: serverTimestamp() }, { merge: true });
      // Default path: straight to the secure online payment. Cash is the
      // explicit opt-out; free (team) cards skip payment entirely.
      if (myCardPrice() > 0 && !payCash) {
        btnBusy(submitBtn, "Opening secure payment…");
        toast("Application saved - taking you to the secure payment.", "success");
        try {
          const fn = httpsCallable(functions, "createEsncardCheckout");
          const res = await fn({});
          location.href = res.data.url;
          return;
        } catch (payErr) {
          toast(`Application saved, but the payment page couldn't open - you can pay from your account page${cashAllowed() ? ", or in cash during office hours" : ""}. (` + (payErr.message || "") + ")", "error");
          navigate("/account");
          return;
        }
      }
      toast(resubmit ? "Application resubmitted - the board takes a fresh look."
        : myCardPrice() === 0 ? "Application submitted! Pick up your free card during office hours."
        : `Application submitted! Pay ${fmtMoney(myCardPrice())} in cash during office hours - or online anytime from your account page.`, "success");
      navigate("/account");
    } catch (err) {
      toast("Could not submit: " + err.message, "error");
      submitBtns.forEach((b) => { b.disabled = false; });
      if (submitBtn) submitBtn.textContent = resubmit ? "Resubmit application" : existing ? "Update application" : "Submit application";
    }
  };
}

// ------------------------------------------------------------
// In-app QR scanner (admins) - uses the camera + jsQR
// ------------------------------------------------------------
let scanStream = null;
let scanRAF = null;

function stopScanner() {
  if (scanRAF) { cancelAnimationFrame(scanRAF); scanRAF = null; }
  if (scanStream) { scanStream.getTracks().forEach((t) => t.stop()); scanStream = null; }
}

async function viewScan() {
  if (!currentUser || !isStaff()) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("qr_code_scanner")}</div><p>The ticket scanner is for ESN team members.${currentUser ? "" : " Please sign in."}</p>${currentUser ? "" : googleBtn()}</div>`;
    document.getElementById("es-login")?.addEventListener("click", signIn);
    return;
  }
  $app.innerHTML = `
    <div class="scan-panel">
      <h2 class="section-title">${mi("qr_code_scanner")} Scan tickets</h2>
      <div class="scan-video-wrap hidden" id="scan-wrap">
        <video id="scan-video" playsinline muted autoplay></video>
        <div class="scan-frame"></div>
      </div>
      <p class="form-hint" id="scan-status" style="text-align:center;margin:12px 0">Works for event tickets and shop pickups - internet needed while scanning.</p>
      <div class="scan-modes">
        <div class="scan-mode">
          <span>${mi("center_focus_strong")}</span>
          <strong>Scanner ${hintIcon("You scan, see WHO it is and their ticket status, then tap 'Check in now' yourself. Best when you also collect cash or check ESNcards at the door.")}</strong>
          <p class="form-hint" style="margin:0">Scan → see the person → confirm each check-in yourself.</p>
          <button class="btn btn-cyan" id="btn-start-scan" style="margin-top:auto">${mi("photo_camera", "sm")} Start camera</button>
        </div>
        <div class="scan-mode">
          <span>${mi("bolt")}</span>
          <strong>Kiosk mode ${hintIcon("Hands-free for busy doors: valid tickets check in AUTOMATICALLY with a green flash; problems (already used, unpaid, wrong day) stay on screen until dismissed. Wrong-day overrides need the normal scanner.")}</strong>
          <p class="form-hint" style="margin:0">Auto check-in with a green flash - for the big queues.</p>
          <a href="/kiosk" class="btn btn-ghost btn-ink" style="margin-top:auto">${mi("bolt", "sm")} Open kiosk mode</a>
        </div>
      </div>
      <div id="scan-now"></div>
    </div>`;
  document.getElementById("btn-start-scan").addEventListener("click", startScanner);

  // Today's scannable events with live door stats (v0.131). Check-in
  // window = event day + the day after, so "today ± a day" covers it.
  (async () => {
    const box = document.getElementById("scan-now");
    if (!box) return;
    try {
      const from = new Date(Date.now() - 30 * 3600e3), to = new Date(Date.now() + 24 * 3600e3);
      const snap = await getDocs(query(collection(db, "events"),
        where("published", "==", true), where("start", ">=", from), where("start", "<", to), orderBy("start", "asc")));
      const evs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((ev) => !ev.cancelled);
      if (!evs.length) {
        box.innerHTML = `<p class="form-hint" style="text-align:center">No events in the check-in window right now - tickets scan on the event day (or the day after, for overnight parties).</p>`;
        return;
      }
      box.innerHTML = `
        <h3 class="section-title sm">Scannable now</h3>
        <div class="scan-now">${evs.map((ev) => `
          <div class="scan-ev" data-sev="${ev.id}">
            <span class="scan-ev-ico">${mi(eventIcon(ev))}</span>
            <span style="flex:1;min-width:140px">
              <strong>${esc(ev.title)}</strong><br>
              <small class="form-hint">${fmtTime(ev.start)}${ev.location ? ` · ${esc(ev.location)}` : ""}</small>
            </span>
            <span class="form-hint" data-sst="${ev.id}">${ev.ticketsSold || 0} ticket${(ev.ticketsSold || 0) === 1 ? "" : "s"} sold</span>
            <span class="scan-ev-bar"><i data-sbar="${ev.id}" style="width:0%"></i></span>
          </div>`).join("")}
        </div>`;
      // Door stats need registration aggregates - board only (volunteers
      // keep the sold count from the event card).
      for (const ev of evs) {
        try {
          const [inAgg, sAgg] = await Promise.all([
            getAggregateFromServer(query(collection(db, "registrations"), where("eventId", "==", ev.id), where("checkedInAt", ">", new Date(0))), { v: sum("quantity") }),
            getAggregateFromServer(query(collection(db, "registrations"), where("eventId", "==", ev.id), where("status", "in", ["paid", "free"])), { v: sum("quantity") }),
          ]);
          const inN = inAgg.data().v || 0, soldN = sAgg.data().v || 0;
          const el = document.querySelector(`[data-sst="${ev.id}"]`);
          const bar = document.querySelector(`[data-sbar="${ev.id}"]`);
          if (el) el.innerHTML = `<strong>${inN}</strong> / ${soldN} in${soldN ? ` · <strong>${Math.round((inN / soldN) * 100)}%</strong>` : ""} · ${Math.max(0, soldN - inN)} to go`;
          if (bar && soldN) bar.style.width = `${Math.min(100, Math.round((inN / soldN) * 100))}%`;
        } catch { break; /* volunteer - no aggregate permission, sold counts stand */ }
      }
    } catch { box.innerHTML = ""; }
  })();
}

async function startScanner() {
  const video = document.getElementById("scan-video");
  const status = document.getElementById("scan-status");
  const startBtn = document.getElementById("btn-start-scan");
  if (!window.jsQR) {
    status.textContent = "The QR decoder library didn't load (network/CDN issue). Refresh the page and try again.";
    return;
  }
  status.textContent = "Starting camera…";
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch (err) {
    status.textContent = "Camera access was blocked. Allow camera for this site in your browser settings, then tap Start again. (Camera only works on https or localhost.)";
    return;
  }
  // The camera prompt is async - the user may have navigated away before
  // granting it, leaving these elements gone (was a null .classList crash).
  const scanWrap = document.getElementById("scan-wrap");
  if (!scanWrap || !document.body.contains(video)) { stopScanner(); return; }
  startBtn.classList.add("hidden");
  scanWrap.classList.remove("hidden");
  video.srcObject = scanStream;
  try { await video.play(); } catch { /* some browsers auto-play */ }
  status.textContent = "Point the camera at a ticket QR code…";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const tick = () => {
    if (!scanStream) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        const m = code.data.match(/(?:#\/|\/)(checkin|pickup)\/([A-Za-z0-9_-]+)/);
        if (m) {
          stopScanner();
          if (navigator.vibrate) navigator.vibrate(100);
          navigate(`/${m[1]}/${m[2]}`);
          return;
        }
        status.textContent = "That QR code isn't an ESN ticket or order - keep scanning…";
      }
    }
    scanRAF = requestAnimationFrame(tick);
  };
  scanRAF = requestAnimationFrame(tick);
}

function viewSuccess() {
  // v0.130: don't just ASSERT "payment received" - Stripe sends us back
  // with the session_id, so watch the matching registration until the
  // webhook flips it to paid. Prevents the panic where /success says paid
  // while My tickets still shows pending + a Cancel button.
  const render = (state) => {
    $app.innerHTML = `
    <div class="success-panel">
      <div class="big">${state === "paid" ? mi("task_alt") : state === "slow" ? mi("hourglass_top") : mi("progress_activity")}</div>
      <h1>${state === "paid" ? "Payment received!" : state === "slow" ? "Almost there…" : "Confirming your payment…"}</h1>
      <p>${state === "paid"
        ? "Thanks - your ticket is confirmed and waiting in My tickets."
        : state === "slow"
        ? "The payment went through at Stripe but the confirmation is taking longer than usual. Your ticket appears in My tickets within a few minutes - no need to pay again."
        : "One moment - Stripe is telling us the payment landed."}</p>
      <p style="margin-top:18px">
        <a href="/my-tickets" class="btn btn-cyan">View my tickets</a>
        <a href="/" class="btn btn-ghost" style="color:var(--esn-dark)">Back to events</a>
      </p>
    </div>
    <div style="max-width:520px;margin:16px auto 0">
      ${pushOfferHtml("Want a reminder <strong>3 hours before</strong> your events start?")}
    </div>`;
    wirePushOffer();
  };
  const sessionId = new URLSearchParams(location.search).get("session_id");
  if (!sessionId || !currentUser) { render("paid"); return; } // legacy links keep the old page
  render("checking");
  (async () => {
    const started = Date.now();
    while (Date.now() - started < 20000) {
      try {
        const snap = await getDocs(query(collection(db, "registrations"),
          where("uid", "==", currentUser.uid), where("stripeSessionId", "==", sessionId), limit(1)));
        const r = snap.docs[0]?.data();
        if (r && (r.status === "paid" || r.status === "free")) { render("paid"); return; }
      } catch { /* keep polling */ }
      if (location.pathname !== "/success") return; // user navigated away
      await new Promise((res) => setTimeout(res, 2500));
    }
    if (location.pathname === "/success") render("slow");
  })();
}

// ------------------------------------------------------------
// Admin
// ------------------------------------------------------------
async function viewAdmin(sub) {
  if (!currentUser) {
    $app.innerHTML = signInState("lock", "Admin area - please sign in.");
    document.getElementById("es-login").onclick = signIn;
    return;
  }
  if (!isAdmin) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("block")}</div><p>You are signed in as ${esc(currentUser.email)}, but this account is not an admin.</p><p class="form-hint">Ask a board member with admin access to add you in Admin → Team.</p></div>`;
    return;
  }
  // Open-contact-messages badge on the Inbox tab (v0.131) - filled after
  // whichever admin page renders; retried once for slower loads.
  const fillInboxBadge = async () => {
    try {
      const c = await getCountFromServer(query(collection(db, "contactMessages"), where("status", "==", "open")));
      const n = c.data().count;
      const el = document.getElementById("inbox-tab-badge");
      if (el) { el.textContent = n; el.classList.toggle("hidden", !n); }
      const a = document.getElementById("attn-inbox");
      if (a) {
        a.hidden = !n;
        const num = document.getElementById("attn-inbox-n");
        if (num) num.textContent = n;
        a.lastChild.textContent = ` open student message${n === 1 ? "" : "s"}`;
      }
    } catch { /* badge is a nicety */ }
  };
  setTimeout(fillInboxBadge, 600);
  setTimeout(fillInboxBadge, 2500);
  if (sub && sub.startsWith("shifts-")) return viewAdminShifts(sub.slice(7));
  if (sub && sub.startsWith("event-")) return viewAdminEventDetail(sub.slice(6));
  if (sub && sub.startsWith("user-")) return viewAdminUserDetail(sub.slice(5));
  if (sub === "new-office") return viewAdminOfficeForm();
  if (sub === "new" || (sub && sub.startsWith("edit-"))) return viewAdminEventForm(sub.startsWith("edit-") ? sub.slice(5) : null);
  if (sub && sub.startsWith("dup-")) return viewAdminEventForm(null, sub.slice(4));
  if (sub === "analytics") return viewAdminAnalytics();
  if (sub === "reimbursements") return viewAdminReimbursements();
  if (sub === "users") return viewAdminUsers();
  if (sub === "accounts") return viewAdminUsers(ayStartYear(), false, "users");
  if (sub === "members") return viewAdminMembers();
  if (sub === "team") return viewAdminTeam();
  if (sub === "inbox") return viewAdminInbox();
  if (sub === "settings") return viewAdminSettings();
  if (sub === "merch") return viewAdminMerch();
  if (sub === "merch-new" || (sub && sub.startsWith("merch-edit-"))) {
    return viewAdminMerchForm(sub.startsWith("merch-edit-") ? sub.slice(11) : null);
  }
  return viewAdminList();
}

async function viewAdminUserDetail(uid) {
  setLoading();
  let u, regs, notes = "";
  let userShifts = [], hist = {}, teamDoc = null, subs = [], currentApp = null;
  try {
    [u, regs, notes, userShifts, hist, teamDoc, subs, currentApp] = await Promise.all([
      getDoc(doc(db, "users", uid)).then((s) => (s.exists() ? { id: s.id, ...s.data() } : null)),
      getDocs(query(collection(db, "registrations"), where("uid", "==", uid), orderBy("createdAt", "desc")))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      getDoc(doc(db, "adminNotes", uid)).then((s) => (s.exists() ? s.data().text || "" : "")),
      getDocs(query(collection(db, "shiftSignups"), where("uid", "==", uid)))
        .then((s) => s.docs.map((d) => d.data())).catch(() => []),
      getDoc(doc(db, "userHistory", uid)).then((s) => (s.exists() ? s.data() : {})).catch(() => ({})),
      getDoc(doc(db, "admins", uid)).then((s) => (s.exists() ? s.data() : null)).catch(() => null),
      // Previous ESNcard submissions (v1.3.0): every submit of the form is
      // snapshotted, so renewals and edits stay visible to the board.
      getDocs(query(collection(db, "esncardApplications", uid, "history"), orderBy("submittedAt", "desc"), limit(30)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []),
      getDoc(doc(db, "esncardApplications", uid)).then((s) => (s.exists() ? s.data() : null)).catch(() => null),
    ]);
  } catch (e) { $app.innerHTML = errorState(e.message); return; }
  if (!u) { $app.innerHTML = `<div class="empty-state"><p>User not found.</p></div>`; return; }
  const KIND_LABEL = { new: "New application", update: "Edited application", resubmit: "Resubmitted after rejection", renewal: "Renewal", reapply: "Applied again" };
  const submissionsHtml = () => {
    if (!subs.length && !currentApp) return "";
    const cur = currentApp ? `<p style="margin:0 0 10px;font-size:.92rem">Current application: <strong>${esc(currentApp.status || "-")}</strong>${currentApp.cardNumber ? ` · card <code>${esc(currentApp.cardNumber)}</code>` : ""}${currentApp.createdAt ? ` · applied ${fmtDate(currentApp.createdAt)} ${fmtTime(currentApp.createdAt)}` : ""} - <a href="/admin/users">handle it in the work queue</a></p>` : "";
    const list = subs.length ? subs.map((x, i) => `
      <details class="app-full" ${i === 0 ? "" : ""} style="margin:0 0 6px">
        <summary class="form-hint" style="cursor:pointer">${mi("history", "sm")} <strong>${x.submittedAt ? `${fmtDate(x.submittedAt)} ${fmtTime(x.submittedAt)}` : "-"}</strong> · ${esc(KIND_LABEL[x.kind] || x.kind || "submission")}${x.payChoice ? ` · ${x.payChoice === "cash" ? "wants to pay cash" : x.payChoice === "online" ? "went to online payment" : "free card"}` : ""}${x.version ? ` <small>(app ${esc(x.version)})</small>` : ""}</summary>
        ${applicationFieldsHtml(x)}
      </details>`).join("")
      : `<p class="form-hint" style="margin:0">No snapshot of the form yet - snapshots are kept from v1.3.0 onwards, so only submissions made after that show up here.</p>`;
    return `
    <h3 class="section-title sm">ESNcard submissions</h3>
    <div class="form-card" style="margin-bottom:18px">
      ${cur}
      ${list}
    </div>`;
  };
  const shiftsDone = userShifts.filter((s) => toDate(s.eventStart) < new Date());
  const officeShiftsDone = shiftsDone.filter((s) => s.officeHours === true);

  const confirmed = regs.filter((r) => r.status === "paid" || r.status === "free");
  const spent = regs.filter((r) => r.status === "paid").reduce((s, r) => s + (r.amountTotal || 0), 0);
  const tickets = confirmed.reduce((s, r) => s + (r.quantity || 1), 0);
  const attended = confirmed.filter((r) => r.checkedInAt).length;
  const noShows = confirmed.filter((r) => !r.checkedInAt && toDate(r.createdAt)).length;
  const age = u.birthday ? Math.floor((Date.now() - new Date(u.birthday).getTime()) / (365.25 * 24 * 3600 * 1000)) : null;

  // History (recorded since v0.102 - earlier changes aren't in it)
  const byAt = (a, b) => (toDate(b.at)?.getTime() || 0) - (toDate(a.at)?.getTime() || 0);
  const cardHist = (hist.card || []).slice().sort(byAt);
  const boardHist = (hist.board || []).slice().sort(byAt);
  const cardHistLine = (e2) => {
    const verb = e2.action === "assigned" ? `assigned <code>${esc(e2.code || "")}</code>${e2.expires ? ` (valid until ${fmtDate(e2.expires)})` : ""}${e2.section ? ` · ${esc(e2.section)}` : ""}`
      : e2.action === "activated" ? `verified <code>${esc(e2.code || "")}</code> on esncard.org${e2.section ? ` · ${esc(e2.section)}` : ""}${e2.expiry ? ` (until ${esc(e2.expiry)})` : ""}`
      : e2.action === "linked-available" ? `linked <code>${esc(e2.code || "")}</code> (awaiting activation)`
      : e2.action === "linked" ? `linked <code>${esc(e2.code || "")}</code> manually`
      : e2.action === "replaced" ? `replaced <code>${esc(e2.prevCode || "")}</code> → <code>${esc(e2.code || "")}</code>`
      : `removed <code>${esc(e2.code || "")}</code>`;
    return `<li><span class="info-label">${e2.at ? fmtDate(e2.at) : "-"}</span><span>${verb}</span></li>`;
  };
  const boardHistLine = (e2) => {
    const what = e2.action === "added" ? `joined the team as <strong>${esc(e2.role || "-")}</strong>`
      : e2.action === "removed" ? `left the team${e2.role ? ` (was ${esc(e2.role)}${e2.boardFunction ? ` - ${esc(e2.boardFunction)}` : ""})` : ""}`
      : `role → <strong>${esc(e2.role || "-")}</strong>${e2.boardFunction ? ` - ${esc(e2.boardFunction)}` : ""}`;
    return `<li><span class="info-label">${e2.at ? fmtDate(e2.at) : "-"}</span><span>${what}</span></li>`;
  };

  const regRows = regs.map((r) => `
    <tr>
      <td class="card-main"><a href="/admin/event-${r.eventId}"><strong>${esc(r.eventTitle || r.eventId)}</strong></a>${r.optionName ? `<br><small class="form-hint">${esc(r.optionName)}</small>` : ""}</td>
      <td data-l="Date">${r.createdAt ? fmtDate(r.createdAt) : "-"}</td>
      <td data-l="Qty">${r.quantity || 1}</td>
      <td data-l="Amount">${r.status === "free" ? "-" : fmtMoney(r.amountTotal, r.currency)}</td>
      <td data-l="Status"><span class="badge badge-${r.status}">${r.status}</span></td>
      <td data-l="Checked in">${r.checkedInAt ? "✓" : "-"}</td>
    </tr>`).join("");

  $app.innerHTML = `
    <h2 class="section-title">${esc(u.displayName || "User")}</h2>
    <div class="form-actions" style="margin:0 0 18px">
      <a href="/admin/accounts" class="btn btn-ghost btn-sm" style="color:var(--esn-dark)">← All users</a>
    </div>
    <div class="stat-row">
      <div class="stat-card" style="--accent:#00AEEF"><div class="num">${confirmed.length}</div><div class="lbl">Registrations</div></div>
      <div class="stat-card" style="--accent:#7AC143"><div class="num">${tickets}</div><div class="lbl">Tickets</div></div>
      <div class="stat-card" style="--accent:#EC008C"><div class="num">${fmtMoney(spent)}</div><div class="lbl">Total spent</div></div>
      <div class="stat-card" style="--accent:#2E3192"><div class="num">${attended}</div><div class="lbl">Attended</div></div>
      <div class="stat-card" style="--accent:#9a9cb5"><div class="num">${noShows}</div><div class="lbl">No-shows</div></div>
      ${shiftsDone.length ? `<div class="stat-card" style="--accent:#7AC143"><div class="num">${shiftsDone.length}</div><div class="lbl">Shifts done</div></div>` : ""}
      ${shiftsDone.length ? `<div class="stat-card" style="--accent:#00AEEF"><div class="num">${officeShiftsDone.length}</div><div class="lbl">Office shifts</div></div>` : ""}
    </div>

    <div class="profile-grid">
      <div class="form-card">
        <h3 style="margin-bottom:12px">Profile</h3>
        <ul class="event-info-list">
          <li><span class="info-label">Email</span><span>${esc(u.email || "-")}</span></li>
          <li><span class="info-label">Birthday</span><span>${esc(u.birthday || "-")}${age != null ? ` (${age} y)` : ""}</span></li>
          <li><span class="info-label">Phone</span><span>${esc(u.phone || "-")}</span></li>
          <li><span class="info-label">Nationality</span><span>${esc(u.nationality || "-")}</span></li>
          <li><span class="info-label">Home</span><span>${esc([u.homeCity, u.homeCountry].filter(Boolean).join(", ") || "-")}</span></li>
          <li><span class="info-label">University</span><span>${esc(u.university || "-")}</span></li>
          <li><span class="info-label">Socials</span><span>${[
            u.instagram ? `<a href="https://instagram.com/${esc(u.instagram)}" target="_blank" rel="noopener">Instagram</a>` : null,
            u.phone ? `<a href="https://wa.me/${esc(u.phone.replace(/[^0-9]/g, ""))}" target="_blank" rel="noopener">WhatsApp</a>` : null,
            u.linkedin ? `<a href="${esc(u.linkedin.startsWith("http") ? u.linkedin : `https://www.linkedin.com/in/${u.linkedin}`)}" target="_blank" rel="noopener">LinkedIn</a>` : null,
          ].filter(Boolean).join(" · ") || "-"}</span></li>
          <li><span class="info-label">Last login</span><span>${u.lastLogin ? `${fmtDate(u.lastLogin)} ${fmtTime(u.lastLogin)}` : "-"}</span></li>
        </ul>
      </div>
      <div class="form-card">
        <h3 style="margin-bottom:12px">ESNcard</h3>
        <div style="margin-bottom:12px">
          ${userCardBadge(u)}
          ${u.esncardCode ? `<ul class="event-info-list" style="margin-top:10px">
            <li><span class="info-label">Number</span><span><code>${esc(u.esncardCode)}</code></span></li>
            ${u.esncardSection ? `<li><span class="info-label">Section</span><span>${esc(u.esncardSection)}</span></li>` : ""}
            <li><span class="info-label">Valid until</span><span>${u.esncardExpiresAt ? fmtDate(u.esncardExpiresAt) : "-"}</span></li>
          </ul>` : `<p class="form-hint" style="margin:8px 0 0">No card linked yet.</p>`}
        </div>
        <details class="ud-card-edit" ${u.esncardCode ? "" : "open"} style="margin-bottom:14px">
          <summary style="cursor:pointer;font-weight:600">${u.esncardCode ? "Change or remove card" : "Assign a card"}</summary>
          <div class="form-field" style="margin-top:10px">
            <label for="ud-code">Card number</label>
            <input id="ud-code" value="${esc(u.esncardCode || "")}" placeholder="number printed on the physical card" autocomplete="off" />
          </div>
          <div class="form-actions">
            <button class="btn btn-green" id="ud-assign">${mi("verified", "sm")} Verify &amp; assign</button>
            ${u.esncardCode ? `<button class="btn btn-ghost btn-danger" id="ud-remove">Remove card</button>` : ""}
          </div>
          <p class="form-hint" style="margin:8px 0 0">Cards are checked live on esncard.org - a wrong number can't be saved. Only <strong>available</strong> (not-yet-registered) cards can be assigned here; an already-active card belongs to the student and only they can link it from their own account. Assigning sends the pickup e-mail with the number.</p>
        </details>
        <div class="checkbox-row" style="margin:10px 0">
          <input type="checkbox" id="ud-alumni" ${u.alumni ? "checked" : ""} />
          <label for="ud-alumni">Alumni - lifetime member prices (Art. 7 §3; not on trips marked “no alumni discount”)</label>
        </div>
        <div class="form-field">
          <label for="ud-notes">Board notes (only admins see this)</label>
          <textarea id="ud-notes" rows="3">${esc(notes)}</textarea>
        </div>
        <div class="form-actions"><button class="btn btn-green" id="ud-save">Save alumni &amp; notes</button></div>
        <details style="margin-top:12px">
          <summary style="cursor:pointer"><strong>Card history</strong> <span class="form-hint">(${cardHist.length} change${cardHist.length === 1 ? "" : "s"} recorded)</span></summary>
          ${cardHist.length
            ? `<ul class="event-info-list" style="margin-top:8px">${cardHist.map(cardHistLine).join("")}</ul>`
            : `<p class="form-hint" style="margin-top:8px">No changes recorded yet - the history builds up from every assign / link / removal from now on.</p>`}
        </details>
      </div>
    </div>

    ${submissionsHtml()}

    ${(teamDoc || boardHist.length) ? `
    <h3 class="section-title sm">Board &amp; team</h3>
    <div class="form-card" style="margin-bottom:18px">
      <p style="margin:0 0 ${boardHist.length ? "10px" : "0"};font-size:.92rem">${teamDoc
        ? `Currently on the team: <strong>${esc(teamDoc.role || "-")}</strong>${teamDoc.boardFunction ? ` - <strong>${esc(teamDoc.boardFunction)}</strong>` : ""}`
        : `Not on the team right now - but has a recorded team past:`}</p>
      ${boardHist.length ? `<ul class="event-info-list">${boardHist.map(boardHistLine).join("")}</ul>` : ""}
    </div>` : ""}

    <h3 class="section-title sm">Registration history</h3>
    ${regs.length ? `
      <div class="table-wrap cards"><table>
        <thead><tr><th>Event</th><th>Date</th><th>Qty</th><th>Amount</th><th>Status</th><th>In</th></tr></thead>
        <tbody>${regRows}</tbody>
      </table></div>`
    : `<div class="empty-state"><p>No registrations yet.</p></div>`}
  `;

  // Verify + assign in one action: the server checks the number on esncard.org,
  // refuses wrong / blocked / expired / already-active cards, links it and
  // sends the pickup e-mail. No manual "verified" tick, no free-form expiry -
  // the API result is the single source of truth, so a wrong card can't stick.
  const assignBtn = document.getElementById("ud-assign");
  if (assignBtn) assignBtn.onclick = async (e) => {
    const code = document.getElementById("ud-code").value.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9]{6,20}$/.test(code)) { toast("That doesn't look like a card number - letters and digits only.", "warn"); return; }
    if (code === (u.esncardCode || "").toUpperCase()) { toast("That card is already linked to this account.", "warn"); return; }
    e.target.disabled = true;
    try {
      await httpsCallable(functions, "assignEsncard")({ uid, code });
      toast(`Card ${code} verified & assigned - the pickup e-mail is on its way.`, "success");
      viewAdminUserDetail(uid);
    } catch (err) {
      toast(err?.message || "Couldn't assign that card.", err?.code === "functions/failed-precondition" ? "warn" : "error");
      e.target.disabled = false;
    }
  };

  const removeBtn = document.getElementById("ud-remove");
  if (removeBtn) removeBtn.onclick = async (e) => {
    if (!await appConfirm(`Remove card ${u.esncardCode} from this account? Member prices stop and the number is freed up.`)) return;
    e.target.disabled = true;
    const prevCode = (u.esncardCode || "").toUpperCase();
    try {
      await updateDoc(doc(db, "users", uid), {
        esncardCode: deleteField(),
        esncardVerified: false,
        esncardExpiresAt: deleteField(),
        esncardActivatedAt: deleteField(),
        esncardStatus: deleteField(),
        esncardSection: deleteField(),
        esncardTid: deleteField(),
        updatedAt: serverTimestamp(),
      });
      // Free the number on the application too, so it can be re-assigned later.
      try {
        const appSnap = await getDoc(doc(db, "esncardApplications", uid));
        if (appSnap.exists() && (appSnap.data().cardNumber || "").toUpperCase() === prevCode) {
          await updateDoc(doc(db, "esncardApplications", uid), { cardNumber: deleteField(), esncardStatus: deleteField() });
        }
      } catch { /* application may not exist - fine */ }
      logUserHistory(uid, "card", { action: "removed", code: prevCode });
      toast("Card removed.", "success");
      viewAdminUserDetail(uid);
    } catch (err) { toast("Remove failed: " + err.message, "error"); e.target.disabled = false; }
  };

  document.getElementById("ud-save").onclick = async (e) => {
    e.target.disabled = true;
    try {
      await updateDoc(doc(db, "users", uid), {
        alumni: document.getElementById("ud-alumni").checked,
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, "adminNotes", uid), {
        text: document.getElementById("ud-notes").value.trim(),
        updatedAt: serverTimestamp(),
      });
      toast("Saved", "success");
    } catch (err) { toast("Save failed: " + err.message, "error"); }
    e.target.disabled = false;
  };
}

// Admin sections - 5 grouped tabs instead of 7 flat ones (v0.82):
// Insights bundles the old Member stats + Analytics as sub-views.
// ------------------------------------------------------------
// Board inbox (v0.129) - the contact messages students send via
// /contact. Reply here; the student gets a push + e-mail automatically
// (the Cloud Function also flips the status to "answered").
// ------------------------------------------------------------
let inboxFilter = { status: "open", cat: "all" };
async function viewAdminInbox() {
  setLoading();
  let msgs = [];
  try {
    const snap = await getDocs(query(collection(db, "contactMessages"), orderBy("lastReplyAt", "desc"), limit(200)));
    msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { $app.innerHTML = errorState(e.message); return; }

  const counts = { all: msgs.length, open: 0, answered: 0, closed: 0 };
  msgs.forEach((m) => { counts[m.status] = (counts[m.status] || 0) + 1; });

  const render = () => {
    const shown = msgs
      .filter((m) => inboxFilter.status === "all" || m.status === inboxFilter.status)
      .filter((m) => inboxFilter.cat === "all" || (m.category || "Other") === inboxFilter.cat);
    const row = (m) => {
      const [cls, label] = CONTACT_STATUS[m.status] || CONTACT_STATUS.open;
      return `
      <details class="faq-item" data-mid="${m.id}">
        <summary>
          <span class="badge ${cls}">${label}</span>
          <strong style="margin-left:6px">${esc(m.name || m.email || "?")}</strong>
          <span class="form-hint" style="margin-left:6px">${esc(m.category || "Other")} · ${fmtDate(m.lastReplyAt || m.createdAt)}</span>
        </summary>
        <div class="faq-a">
          <p class="form-hint" style="margin:0 0 6px"><a href="/admin/user-${m.uid}">${esc(m.name || "?")}</a> · ${esc(m.email || "")} · sent ${fmtDate(m.createdAt)} ${fmtTime(m.createdAt)}</p>
          <p style="white-space:pre-wrap;margin:0 0 8px">${esc(m.message || "")}</p>
          <div class="ct-thread" data-mid="${m.id}"><p class="form-hint">Loading replies…</p></div>
          <div class="form-field" style="margin:10px 0 0">
            <textarea class="ib-reply" data-mid="${m.id}" rows="3" maxlength="2000" placeholder="Reply to ${esc((m.name || "the student").split(" ")[0])} - they get a push + this text by e-mail…"></textarea>
          </div>
          <div class="form-actions" style="margin:8px 0 0">
            <button class="btn btn-sm btn-cyan ib-send" data-mid="${m.id}">${mi("send", "sm")} Send reply</button>
            ${m.status !== "closed" ? `<button class="btn btn-sm btn-ghost btn-ink ib-close" data-mid="${m.id}">Close</button>`
              : `<button class="btn btn-sm btn-ghost btn-ink ib-reopen" data-mid="${m.id}">Reopen</button>`}
          </div>
        </div>
      </details>`;
    };
    document.getElementById("ib-list").innerHTML = shown.length
      ? `<div class="faq-list">${shown.map(row).join("")}</div>`
      : `<div class="empty-state"><div class="big">${mi("forum")}</div><p>${inboxFilter.status === "open" ? "No open messages - inbox zero! 🎉" : "Nothing here."}</p></div>`;

    const loadThread = async (mid) => {
      const box = $app.querySelector(`.ct-thread[data-mid="${mid}"]`);
      if (!box || box.dataset.loaded) return;
      box.dataset.loaded = "1";
      try {
        const rs = await getDocs(query(collection(db, "contactMessages", mid, "replies"), orderBy("at", "asc")));
        const m = msgs.find((x) => x.id === mid);
        box.innerHTML = rs.docs.map((d) => {
          const r = d.data();
          const student = r.uid === m.uid;
          return `<div class="ct-bubble ${student ? "board" : "mine"}">
            <small>${esc(student ? (m.name || "Student") : (r.name || "Board"))} · ${fmtDate(r.at)} ${fmtTime(r.at)}</small>
            <p style="white-space:pre-wrap;margin:2px 0 0">${esc(r.text || "")}</p>
          </div>`;
        }).join("") || `<p class="form-hint">No replies yet.</p>`;
      } catch { box.innerHTML = `<p class="form-hint">Couldn't load the replies - reopen to retry.</p>`; }
    };
    $app.querySelectorAll("details[data-mid]").forEach((det) => {
      det.addEventListener("toggle", () => { if (det.open) loadThread(det.dataset.mid); });
    });
    $app.querySelectorAll(".ib-send").forEach((btn) => {
      btn.onclick = async () => {
        const mid = btn.dataset.mid;
        const ta = $app.querySelector(`.ib-reply[data-mid="${mid}"]`);
        const text = ta.value.trim();
        if (!text) { toast("Write the reply first.", "warn"); return; }
        btn.disabled = true;
        try {
          await addDoc(collection(db, "contactMessages", mid, "replies"), {
            uid: currentUser.uid, name: (currentUser.displayName || "").split(" ")[0] + " (ESN Gent)", text, at: serverTimestamp(),
          });
          toast("Reply sent - the student gets a push + e-mail.", "success");
          viewAdminInbox();
        } catch (err) { toast("Failed: " + err.message, "error"); btn.disabled = false; }
      };
    });
    const setStatus = async (mid, status) => {
      try {
        await updateDoc(doc(db, "contactMessages", mid), { status });
        toast(status === "closed" ? "Closed." : "Reopened.", "success");
        viewAdminInbox();
      } catch (err) { toast("Failed: " + err.message, "error"); }
    };
    $app.querySelectorAll(".ib-close").forEach((b) => { b.onclick = () => setStatus(b.dataset.mid, "closed"); });
    $app.querySelectorAll(".ib-reopen").forEach((b) => { b.onclick = () => setStatus(b.dataset.mid, "open"); });
  };

  const cats = [...new Set(msgs.map((m) => m.category || "Other"))];
  $app.innerHTML = `
    <h2 class="section-title">Inbox</h2>
    ${adminTabs("inbox")}
    <p class="form-hint" style="margin:-4px 0 12px">Messages from the in-app <a href="/contact">contact page</a>. Replying notifies the student by push and e-mail; students see the FAQ first, so what lands here usually needs a human.</p>
    <div class="filter-bar" style="margin-bottom:12px">
      <div class="filter-chips" id="ib-chips">
        ${["open", "answered", "closed", "all"].map((s) => `<button class="chip ${inboxFilter.status === s ? "active" : ""}" data-st="${s}">${s[0].toUpperCase() + s.slice(1)} (${counts[s] || 0})</button>`).join("")}
      </div>
      ${cats.length > 1 ? `<select id="ib-cat" class="inline-input"><option value="all">All categories</option>${cats.map((c) => `<option value="${esc(c)}" ${inboxFilter.cat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>` : ""}
    </div>
    <div id="ib-list"></div>
  `;
  document.getElementById("ib-chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    inboxFilter.status = b.dataset.st;
    document.querySelectorAll("#ib-chips .chip").forEach((c) => c.classList.toggle("active", c === b));
    render();
  });
  document.getElementById("ib-cat")?.addEventListener("change", (e) => { inboxFilter.cat = e.target.value; render(); });
  render();
}

function adminTabs(active) {
  const insightsActive = active === "analytics" || active === "members";
  const tab = (key, icon, label, hash, isActive) =>
    `<button class="${isActive ? "active" : ""}" onclick="go('${hash}')">${mi(icon, "sm")} ${label}</button>`;
  return `<div class="admin-tabs">
    ${tab("events", "celebration", "Events", "/admin", active === "events")}
    ${tab("users", "group", "Users", "/admin/users", active === "users")}
    ${tab("insights", "monitoring", "Insights", "/admin/analytics", insightsActive)}
    ${isFinance() ? tab("finance", "payments", "Finance", "/admin/reimbursements", active === "finance") : ""}
    ${tab("merch", "storefront", "Shop", "/admin/merch", active === "merch")}
    ${tab("inbox", "forum", `Inbox<span class="tab-badge hidden" id="inbox-tab-badge"></span>`, "/admin/inbox", active === "inbox")}
    ${myRole === "superadmin" ? tab("team", "group", "Team", "/admin/team", active === "team") : ""}
    ${isFinance() ? tab("settings", "settings", "Settings", "/admin/settings", active === "settings") : ""}
  </div>`;
}

// Sub-navigation inside the Insights tab.
function insightsSubnav(active) {
  return `<div class="filter-chips" style="margin:-10px 0 18px">
    <button class="chip ${active === "analytics" ? "active" : ""}" onclick=\"go('/admin/analytics')\">${mi("bar_chart", "sm")} Events &amp; revenue</button>
    <button class="chip ${active === "members" ? "active" : ""}" onclick=\"go('/admin/members')\">${mi("public", "sm")} Members &amp; map</button>
  </div>`;
}

// ------------------------------------------------------------
// Analytics (board) - simple single-hue SVG bar charts
// ------------------------------------------------------------
function barChart(items, { money = false } = {}) {
  if (!items.length) return `<p class="form-hint">No data yet.</p>`;
  const W = 620, H = 190, padB = 26, padT = 18;
  const bw = Math.min(48, (W - 20) / items.length - 8);
  const max = Math.max(1, ...items.map((i) => i.value));
  const maxIdx = items.findIndex((i) => i.value === max);
  const fmtV = (v) => (money ? fmtMoney(v) : String(v));
  const bars = items.map((it, i) => {
    const x = 10 + i * ((W - 20) / items.length) + ((W - 20) / items.length - bw) / 2;
    const h = Math.round(((H - padB - padT) * it.value) / max);
    const y = H - padB - h;
    // selective direct labels: the max bar and the latest bar
    const labeled = it.value > 0 && (i === maxIdx || i === items.length - 1);
    return `
      <g>
        <title>${esc(it.label)}: ${esc(fmtV(it.value))}</title>
        <rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, it.value > 0 ? 3 : 0)}" rx="4" fill="#0b8ed9" />
        ${labeled ? `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" class="chart-val">${esc(fmtV(it.value))}</text>` : ""}
        <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" class="chart-lbl">${esc(it.label)}</text>
      </g>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">
    <line x1="8" y1="${H - padB}" x2="${W - 8}" y2="${H - padB}" class="chart-axis" />
    ${bars}
  </svg>`;
}

async function viewAdminAnalytics() {
  setLoading();
  const now = new Date();
  // Bounded window: analytics reads the last ~6 months instead of the
  // whole registrations collection (which grows forever).
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
  let regs, morders, yearCount = null, locEvents = [], allTags = [];
  try {
    [regs, morders, yearCount, locEvents, allTags] = await Promise.all([
      getDocs(query(collection(db, "registrations"), where("createdAt", ">=", windowStart)))
        .then((s) => s.docs.map((d) => d.data())),
      getDocs(query(collection(db, "merchOrders"), where("createdAt", ">=", windowStart)))
        .then((s) => s.docs.map((d) => d.data())),
      getCountFromServer(query(collection(db, "events"),
        where("published", "==", true), where("start", ">=", yearStart), where("start", "<", yearEnd)))
        .then((s) => s.data().count).catch(() => null),
      // Locations + tags: this calendar year's published events.
      getDocs(query(collection(db, "events"),
        where("published", "==", true), where("start", ">=", yearStart), where("start", "<", yearEnd)))
        .then((s) => s.docs.map((d) => ({
          id: d.id,
          location: d.data().location || "", lat: d.data().lat ?? null, lng: d.data().lng ?? null,
          cancelled: !!d.data().cancelled,
          tagNames: eventTagNames(d.data()),
        })))
        .catch(() => []),
      fetchEventTags().catch(() => []),
    ]);
  } catch (e) { $app.innerHTML = errorState(e.message); return; }

  // ---- Per tag & ESN cause (v0.107, reworked v0.118): tags are ONE list
  // now, each LINKED to a cause (eventTags.esnCause) - cause stats aggregate
  // over those links, plus any legacy cause TAGS still on older events.
  const legacyCauseNames = new Set(allTags.filter((t) => t.cause === true).map((t) => t.name));
  const causeLinkOf = Object.fromEntries(allTags.filter((t) => t.esnCause).map((t) => [t.name, t.esnCause]));
  const tagColorOf = Object.fromEntries(allTags.map((t) => [t.name, t.color || "#2E3192"]));
  const tagsByEvent = Object.fromEntries(locEvents.map((e2) => [e2.id, e2.tagNames]));
  const causesOfNames = (names) => {
    const s = new Set();
    names.forEach((tn) => {
      if (legacyCauseNames.has(tn)) s.add(tn);
      if (causeLinkOf[tn]) s.add(causeLinkOf[tn]);
    });
    return [...s];
  };
  const byTag = {}, byCause = {};
  const bump = (obj, key, fn) => fn((obj[key] ??= { events: 0, tickets: 0, checkedIn: 0, revenue: 0 }));
  locEvents.filter((e2) => !e2.cancelled).forEach((e2) => {
    e2.tagNames.filter((tn) => !legacyCauseNames.has(tn)).forEach((tn) => bump(byTag, tn, (t) => t.events++));
    causesOfNames(e2.tagNames).forEach((cn) => bump(byCause, cn, (t) => t.events++));
  });
  regs.filter((r) => r.status === "paid" || r.status === "free").forEach((r) => {
    const names = tagsByEvent[r.eventId] || [];
    const add = (t) => {
      t.tickets += r.quantity || 1;
      if (r.checkedInAt) t.checkedIn += r.quantity || 1;
      if (r.status === "paid") t.revenue += r.amountTotal || 0;
    };
    names.filter((tn) => !legacyCauseNames.has(tn)).forEach((tn) => { if (byTag[tn]) add(byTag[tn]); });
    causesOfNames(names).forEach((cn) => { if (byCause[cn]) add(byCause[cn]); });
  });
  const tagRows = [
    ...Object.entries(byTag).map(([name, t]) => ({ name, ...t, cause: false })),
    ...Object.entries(byCause).map(([name, t]) => ({ name, ...t, cause: true })),
  ].sort((a, b) => (a.cause === b.cause ? b.tickets - a.tickets : a.cause ? 1 : -1));
  const missingCauses = ESN_CAUSES.filter((c) => !byCause[c]);

  // Events per location (this year). Pinned coordinates group exactly;
  // otherwise the location text (normalised) is the key.
  const locGroups = {};
  locEvents.filter((e) => !e.cancelled && (e.location || e.lat != null)).forEach((e) => {
    const key = e.lat != null ? `${(+e.lat).toFixed(4)},${(+e.lng).toFixed(4)}` : e.location.trim().toLowerCase().replace(/\s+/g, " ");
    (locGroups[key] ??= { name: e.location || `${e.lat}, ${e.lng}`, n: 0, lat: e.lat, lng: e.lng });
    locGroups[key].n++;
  });
  const locRows = Object.values(locGroups).sort((a, b) => b.n - a.n);

  const confirmed = regs.filter((r) => r.status === "paid" || r.status === "free");

  // Signups per week (last 12 weeks, weeks starting Monday)
  const weekStart = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  const thisWeek = weekStart(now);
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - i * 7);
    weeks.push({ start, label: `${start.getDate()}/${start.getMonth() + 1}`, value: 0 });
  }
  confirmed.forEach((r) => {
    const d = toDate(r.createdAt);
    if (!d) return;
    const ws = weekStart(d).getTime();
    const bucket = weeks.find((w) => w.start.getTime() === ws);
    if (bucket) bucket.value += r.quantity || 1;
  });

  // Revenue per month (last 6 months): paid tickets + paid merch
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ y: m.getFullYear(), m: m.getMonth(), label: m.toLocaleDateString("en-GB", { month: "short" }), value: 0 });
  }
  const addRevenue = (list) => list.forEach((r) => {
    if (r.status !== "paid") return;
    const d = toDate(r.paidAt || r.createdAt);
    if (!d) return;
    const bucket = months.find((mo) => mo.y === d.getFullYear() && mo.m === d.getMonth());
    if (bucket) bucket.value += r.amountTotal || 0;
  });
  addRevenue(regs);
  addRevenue(morders);

  // Top events by tickets (within the window), with attendance
  const byEvent = {};
  confirmed.forEach((r) => {
    (byEvent[r.eventId] ??= { title: r.eventTitle || r.eventId, tickets: 0, checkedIn: 0 });
    byEvent[r.eventId].tickets += r.quantity || 1;
    if (r.checkedInAt) byEvent[r.eventId].checkedIn += r.quantity || 1;
  });
  const top = Object.entries(byEvent)
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => b.tickets - a.tickets)
    .slice(0, 10);
  // Ratings only for the events actually shown ('in' supports up to 10 ids)
  try {
    if (top.length) {
      const fb = await getDocs(query(collection(db, "feedback"), where("eventId", "in", top.map((e) => e.id))));
      fb.docs.map((d) => d.data()).forEach((f) => {
        const t = top.find((e) => e.id === f.eventId);
        if (t) (t.ratings ??= []).push(f.rating);
      });
    }
  } catch { /* ratings are optional */ }

  $app.innerHTML = `
    <h2 class="section-title">Insights</h2>
    ${adminTabs("analytics")}
    ${insightsSubnav("analytics")}
    ${yearCount != null ? `
    <div class="form-card" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div><strong>Activities in ${now.getFullYear()}: ${yearCount}</strong> ${hintIcon("Published events this calendar year, planned ones included. ESN Gent reports at least 10 activities per year to the DSA.")}</div>
      <button class="btn btn-dark btn-sm" id="btn-dsa">DSA list (CSV)</button>
    </div>` : ""}
    <div class="form-card" style="margin-bottom:16px">
      <strong>Ticket signups per week</strong>
      <p class="form-hint" style="margin-bottom:8px">Confirmed tickets (paid + free), last 12 weeks - hover a bar for its value.</p>
      ${barChart(weeks.map((w) => ({ label: w.label, value: w.value })))}
    </div>
    ${tagRows.length ? `
    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("label", "sm")} Per tag &amp; ESN cause</strong>
      <p class="form-hint" style="margin-bottom:8px">Events = published this calendar year (multi-tagged events count for each tag). Tickets, attendance &amp; revenue from the last ~6 months. The ${mi("public", "sm")} rows are the ESN causes, counted via each tag's linked cause - the "where can we improve" view.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Tag</th><th>Events</th><th>Tickets</th><th>Attendance</th><th>Revenue</th></tr></thead>
        <tbody>
          ${tagRows.map((t) => `
          <tr>
            <td><span class="badge" style="background:${esc(tagColorOf[t.name] || "#2E3192")}">${esc(t.name)}</span>${t.cause ? ` ${mi("public", "sm")}` : ""}</td>
            <td>${t.events}</td>
            <td>${t.tickets}</td>
            <td>${t.tickets ? `${Math.round((t.checkedIn / t.tickets) * 100)}%` : "-"}</td>
            <td>${t.revenue ? fmtMoney(t.revenue) : "-"}</td>
          </tr>`).join("")}
        </tbody>
      </table></div>
      ${missingCauses.length ? `<p class="form-hint" style="margin-top:8px">${mi("warning", "sm")} <strong>Causes without any event this year:</strong> ${missingCauses.map(esc).join(" · ")} - something for the next planning meeting.</p>` : ""}
    </div>` : ""}
    <div class="form-card" style="margin-bottom:16px">
      <strong>Revenue per month</strong>
      <p class="form-hint" style="margin-bottom:8px">Paid tickets + paid merch, last 6 months.</p>
      ${barChart(months.map((m) => ({ label: m.label, value: m.value })), { money: true })}
    </div>
    <h3 class="section-title sm">Top events (last 6 months)</h3>
    ${top.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Event</th><th>Tickets</th><th>Attended</th><th>Rating</th></tr></thead>
        <tbody>
          ${top.map((e) => `
          <tr>
            <td><a href="/admin/event-${e.id}"><strong>${esc(e.title)}</strong></a></td>
            <td>${e.tickets}</td>
            <td>${e.checkedIn ? `${e.checkedIn} (${Math.round((e.checkedIn / e.tickets) * 100)}%)` : "-"}</td>
            <td>${e.ratings?.length ? `★ ${(e.ratings.reduce((s, r) => s + r, 0) / e.ratings.length).toFixed(1)} (${e.ratings.length})` : "-"}</td>
          </tr>`).join("")}
        </tbody>
      </table></div>`
    : `<div class="empty-state"><p>No registrations in the last 6 months.</p></div>`}

    <h3 class="section-title sm">Events per location (${now.getFullYear()})</h3>
    ${locRows.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Location</th><th style="text-align:right">Events</th><th style="width:40%"></th></tr></thead>
        <tbody>${locRows.slice(0, 12).map((l) => `
          <tr>
            <td>${l.lat != null ? `<a href="${mapsUrlFor(l)}" target="_blank" rel="noopener">${esc(l.name)}</a> ${mi("location_on", "sm")}` : esc(l.name)}</td>
            <td style="text-align:right"><strong>${l.n}</strong></td>
            <td><div style="height:10px;border-radius:5px;background:var(--esn-magenta);width:${Math.max(3, Math.round((l.n / locRows[0].n) * 100))}%"></div></td>
          </tr>`).join("")}</tbody>
      </table></div>
      ${locRows.length > 12 ? `<details style="margin-top:6px"><summary class="form-hint" style="cursor:pointer">Show the other ${locRows.length - 12}</summary>
        <div class="table-wrap" style="margin-top:6px"><table><tbody>${locRows.slice(12).map((l) => `<tr><td>${esc(l.name)}</td><td style="text-align:right"><strong>${l.n}</strong></td></tr>`).join("")}</tbody></table></div>
      </details>` : ""}
      <p class="form-hint" style="margin-top:6px">Locations pinned on the map (${mi("location_on", "sm")} in the event form) group exactly by coordinates; unpinned ones group by their text. Cancelled events aren't counted.</p>`
    : `<p class="form-hint">No published events this year yet.</p>`}
  `;

  document.getElementById("btn-dsa")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const evs = await fetchPublishedEvents(yearStart, yearEnd);
      const csvEsc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [
        ["Date", "Activity", "Location"].map(csvEsc).join(","),
        ...evs.map((ev) => [
          toDate(ev.start)?.toLocaleDateString("en-GB") || "", ev.title, ev.location || "",
        ].map(csvEsc).join(",")),
      ];
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `esn-gent-activities-${now.getFullYear()}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) { toast("Export failed: " + err.message, "error"); }
    e.target.disabled = false;
  });
}

const ROLE_LABELS = {
  superadmin: "Superadmin - everything, incl. managing this team",
  finance: "Finance - everything board can do + reimbursements & IBANs (meant for the treasurer; the president can have it too but does not need to)",
  board: "Board - events, users, ESNcards, registrations, board meetings",
  volunteer: "Volunteer - scan tickets & check people in only",
  advisory: "Advisory Board (AB) - ALUMNI extension of the board, not board members: meetings & minutes read-only, advice (AB President + Advisors)",
  alumnicoord: "Alumni coordinator - part of the alumni network (with the previous board members): board meetings (read) & the alumni network, free ESNcard",
};
const TEAM_ROLES = ["superadmin", "finance", "board", "volunteer", "advisory", "alumnicoord"];
// Official functions from the ESN Gent statutes (Bijlage A, 01/07/2023) +
// the Advisory Board roles (Artikel 9: 1 AB President + max 3 Advisors).
let BOARD_FUNCTIONS = [
  "President", "Vice-President", "Treasurer", "Secretary",
  "Event Coordinator", "Responsible Party Coordinator", "Sports Coordinator",
  "Project Manager", "Communication Manager", "IT Manager",
  "Partnership Manager", "Trip Coordinator", "Local Representative",
  "AB President", "Advisor",
];

// ------------------------------------------------------------
// Admin → Settings - the "complex knobs" live here, away from the
// day-to-day tabs: ESNcard pricing (finance), event tags (superadmin),
// push setup (superadmin) and the beta reset (superadmin).
// ------------------------------------------------------------
async function viewAdminSettings() {
  if (!isFinance()) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("lock")}</div><p>Settings are for the treasurer/president and the superadmin.</p></div>`;
    return;
  }
  setLoading();
  let tags = [];
  let linktreeContent = DEFAULT_LINKTREE;
  try { tags = await fetchEventTags(); } catch { /* section shows an error state */ }
  try {
    const lt = await getDoc(doc(db, "settings", "linktree"));
    if (lt.exists() && typeof lt.data().content === "string" && lt.data().content.trim()) linktreeContent = lt.data().content;
  } catch { /* default shown */ }
  let emailCfg = {};
  try {
    const em = await getDoc(doc(db, "settings", "email"));
    if (em.exists()) emailCfg = em.data();
  } catch { /* empty form */ }
  const isSuperUser = myRole === "superadmin";

  $app.innerHTML = `
    <h2 class="section-title">Settings</h2>
    ${adminTabs("settings")}

    <h3 class="settings-group">${mi("celebration", "sm")} Events</h3>
    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("tune", "sm")} Event defaults</strong> ${hintIcon("Every NEW event starts with these; events without their own value fall back to them too. Individual events can still override both under Advanced settings.")}
      <div class="form-actions" style="margin:12px 0 0;align-items:flex-end">
        <div class="form-field" style="margin:0"><label for="ed-cancel">Cancellation deadline (h)</label>
          <input id="ed-cancel" type="number" min="0" step="1" style="width:110px" value="${eventDefaults.defaultCancelHours}" /></div>
        <div class="form-field" style="margin:0"><label for="ed-fee">Standard refund fee €</label>
          <input id="ed-fee" type="number" min="0" step="0.01" style="width:110px" value="${(eventDefaults.defaultRefundFee / 100).toFixed(2)}" /></div>
        <div class="form-field" style="margin:0"><label for="ed-wait">Waitlist reply time (h) ${hintIcon("How long someone from the waitlist gets to claim a freed-up spot before it moves to the next person. Applies to offers made from then on.")}</label>
          <input id="ed-wait" type="number" min="1" max="168" step="1" style="width:110px" value="${eventDefaults.waitlistHours}" /></div>
        <button class="btn btn-sm btn-green" id="ed-save">Save defaults</button>
      </div>
    </div>
    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("label", "sm")} Event tags &amp; colours</strong> ${hintIcon("Categories like Party, Sport, Trip - the colour becomes the event's accent on cards and the calendar. Renaming or recolouring updates all events using the tag.")}
      ${isSuperUser
        ? `<div id="tags-box" style="margin-top:12px"><p class="form-hint">Loading…</p></div>`
        : `<p class="form-hint" style="margin-top:8px">Managed by the superadmin. Current tags: ${tags.length ? tags.map((t) => `<span class="badge" style="background:${esc(t.color || "#2E3192")}">${esc(t.name)}</span>`).join(" ") : "none yet"}</p>`}
    </div>
    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("event_available", "sm")} Google Calendar sync</strong> ${hintIcon("Sync is fully automatic on every event/meeting change. This button is only for the one-time setup and for forcing a full re-push if the calendar ever looks out of date.")}
      <div class="form-actions" style="margin-top:10px">
        <button class="btn btn-ghost btn-sm btn-ink" id="btn-cal-sync">${mi("sync", "sm")} Force full re-sync</button>
      </div>
    </div>

    <h3 class="settings-group">${mi("badge", "sm")} ESNcard</h3>
    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("payments", "sm")} ESNcard pricing</strong> ${hintIcon("Used everywhere instantly: the apply form, the online payment (server-side) and the admin buttons. Board/AB/team cards stay free per the statutes. Statutory defaults: €15 / €7.50.")}
      <div class="form-actions" style="margin:12px 0 0;align-items:flex-end">
        <div class="form-field" style="margin:0"><label for="cp-student">Student price €</label>
          <input id="cp-student" type="number" min="0" step="0.5" style="width:110px" value="${(cardPricing.student / 100).toFixed(2)}" /></div>
        <div class="form-field" style="margin:0"><label for="cp-vol">Volunteer / alumni €</label>
          <input id="cp-vol" type="number" min="0" step="0.5" style="width:110px" value="${(cardPricing.volunteer / 100).toFixed(2)}" /></div>
        <div class="form-field" style="margin:0"><label for="cp-valid">Validity (months)</label>
          <input id="cp-valid" type="number" min="1" step="1" style="width:110px" value="${cardPricing.validityMonths}" /></div>
        <button class="btn btn-sm btn-green" id="cp-save">Save prices</button>
      </div>
      <div class="checkbox-row" style="margin:14px 0 0">
        <input type="checkbox" id="cp-proof" ${cardPricing.proofRequired !== false ? "checked" : ""} />
        <label for="cp-proof"><strong>Require proof of exchange</strong> on the application form ${hintIcon("Switch OFF during a busy welcome week: the upload disappears from the form and applications go through without it (the board can still ask for proof at the desk). Switch back ON afterwards. Uploaded proofs are deleted automatically ~3 months after a card is activated, and always at the end of the academic year.")}</label>
      </div>
      ${isSuperUser ? `
      <div class="checkbox-row" style="margin:10px 0 0">
        <input type="checkbox" id="cp-cash" ${cardPricing.cashEnabled ? "checked" : ""} />
        <label for="cp-cash"><strong>Allow paying cash at the office</strong> <span class="badge ${cardPricing.cashEnabled ? "badge-pending" : "badge-esn"}">${cardPricing.cashEnabled ? "CASH ON" : "online only"}</span> ${hintIcon("OFF (default): the application form only offers online payment (card/Bancontact) and every text says so; unpaid applications still show under Users → ESNcard → Office, and the board can always register cash it did receive with the 'Paid?' button. ON: the form gets an 'I'll pay cash at the office' option again. Superadmin only.")}</label>
      </div>
      <div class="checkbox-row" style="margin:10px 0 0">
        <input type="checkbox" id="cp-avail" ${cardPricing.acceptAvailable ? "checked" : ""} />
        <label for="cp-avail"><strong>Also accept "available" cards as members</strong> <span class="badge ${cardPricing.acceptAvailable ? "badge-pending" : "badge-esn"}">${cardPricing.acceptAvailable ? "FALLBACK ON" : "active only"}</span> ${hintIcon("Standard: only a card that is ACTIVE on esncard.org gives member prices and unlocks the passport, codex and guide. Switch this ON as a fallback when students can't register their card on esncard.org or the esncard.org API is down: a card that is linked but still 'available' then counts as a member card too (prices, ESNcard-only events, perks - app and server alike). Switch it back OFF once esncard.org works again. Superadmin only.")}</label>
      </div>` : ""}
    </div>
    ${isSuperUser ? `
    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("mail", "sm")} "Card ready" e-mail</strong> ${hintIcon("Sent automatically the moment a card number is assigned to a student. Placeholders are filled in per student. Empty fields use the built-in text. Sending only happens while confirmation e-mails are enabled under System. Superadmin only.")}
      <div class="form-field" style="margin-top:12px"><label for="tpl-card-subject">Subject</label>
        <input id="tpl-card-subject" maxlength="150" placeholder="Your ESNcard number is ready" /></div>
      <div class="form-field"><label for="tpl-card-body">Message</label>
        <textarea id="tpl-card-body" rows="9" placeholder="Hi {firstName},&#10;&#10;Good news - your ESNcard number is {cardNumber}.&#10;&#10;{activationNote}&#10;&#10;You can pick up the physical card during our office hours: {officeHours} (at the ESN office, never at events).&#10;&#10;Your card and barcode are already in the app under your profile.&#10;&#10;See you soon!&#10;The ESN Gent team"></textarea></div>
      <p class="form-hint">Placeholders: <code>{firstName}</code> <code>{name}</code> <code>{cardNumber}</code> <code>{activationNote}</code> <code>{expires}</code> <code>{officeHours}</code> (office hours come from Organisation below). <strong>{activationNote}</strong> becomes a "register it on esncard.org" line for cards that aren't activated yet, or the validity date for active ones - keep it in your text.</p>
      <div class="form-actions">
        <button class="btn btn-sm btn-dark" id="tpl-card-save">Save template</button>
        <button class="btn btn-sm btn-ghost btn-ink" id="tpl-card-test">${mi("send", "sm")} Send me a preview</button>
        <span class="form-hint" id="tpl-card-hint">Loading…</span>
      </div>
    </div>` : ""}

    <h3 class="settings-group">${mi("apartment", "sm")} Organisation</h3>


    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("apartment", "sm")} Organisation info</strong> ${hintIcon("Shown in the footer, on the Office page and in the FAQ - update these when the office, hours or contact address change (new semester, new board).")}
      <div class="form-grid" style="margin-top:12px">
        <div class="form-field full"><label for="org-address">Office address</label>
          <input id="org-address" maxlength="120" value="${esc(orgInfo.officeAddress)}" /></div>
        <div class="form-field"><label for="org-hours">Office hours (text)</label>
          <input id="org-hours" maxlength="80" value="${esc(orgInfo.officeHoursText)}" /></div>
        <div class="form-field"><label for="org-email">Contact e-mail</label>
          <input id="org-email" type="email" maxlength="80" value="${esc(orgInfo.contactEmail)}" /></div>
      </div>
      <p style="margin:14px 0 0"><strong style="font-size:.85rem">Socials</strong> ${hintIcon("Full links (https://…). Only the ones you fill in appear as icons at the bottom of every page - leave a field empty to hide that icon.")}</p>
      <div class="form-grid" style="margin-top:8px">
        ${SOCIAL_DEFS.map(([k, label]) => `
        <div class="form-field"><label for="org-${k}">${label}</label>
          <input id="org-${k}" type="url" maxlength="200" placeholder="https://…" value="${esc(orgInfo[k] || "")}" /></div>`).join("")}
      </div>
      <div class="form-actions"><button class="btn btn-sm btn-green" id="org-save">Save organisation info</button></div>
    </div>

    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("quiz", "sm")} Student FAQ</strong> ${hintIcon("Leave empty to use the app's built-in FAQ. To customise: one block per question - first line is the question, the following lines the answer. Separate blocks with a blank line. Formatting: **bold**, [link text](https://…) or [Office page](#/office).")}
      <div class="form-field" style="margin-top:10px">
        <textarea id="faq-editor" rows="10" placeholder="How do I get my ESNcard?&#10;Apply on your account page, pay online and pick it up during [office hours](#/office).&#10;&#10;Next question…&#10;Its answer…">${faqCustom ? esc(faqCustom.map((it) => `${it.q}\n${it.a}`).join("\n\n")) : ""}</textarea>
      </div>
      <div class="form-actions"><button class="btn btn-sm btn-green" id="faq-save">Save FAQ</button></div>
    </div>

    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("link", "sm")} Link-in-bio page</strong> ${hintIcon("The app's own Linktree at app.esngent.org/links - put THAT link in the Instagram bio. The top of the page always shows the next 3 events automatically; below come these links. Board members can also edit them via the pencil on the page itself.")}
      <p class="form-hint" style="margin:8px 0">Public URL: <code>https://app.esngent.org/links</code> - one link per line as <code>Label | https://url</code>, section titles start with <code>## </code>.</p>
      <div class="form-field"><textarea id="lt-editor" rows="10">${esc(linktreeContent)}</textarea></div>
      <div class="form-actions">
        <button class="btn btn-sm btn-green" id="lt-save">Save link page</button>
        <a class="btn btn-sm btn-ghost btn-ink" href="/links">${mi("open_in_new", "sm")} View the page</a>
      </div>
    </div>

    ${isSuperUser ? `
    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("format_list_bulleted", "sm")} Org lists</strong> ${hintIcon("These change over the years, so they live here instead of in code. One item per line. Leave a box empty to keep the app's built-in list. Renaming here does not change data already saved with the old names.")}
      <div class="form-grid" style="margin-top:12px">
        <div class="form-field"><label for="ol-functions">Board functions (Team tab)</label>
          <textarea id="ol-functions" rows="6">${esc(BOARD_FUNCTIONS.join("\n"))}</textarea></div>
        <div class="form-field"><label for="ol-tasks">Shift task names (shiftlists)</label>
          <textarea id="ol-tasks" rows="6">${esc(SHIFT_TASKS.join("\n"))}</textarea></div>
        <div class="form-field"><label for="ol-discovery">"How did you find us" options (ESNcard form)</label>
          <textarea id="ol-discovery" rows="6">${esc(DISCOVERY_OPTIONS.join("\n"))}</textarea></div>
        <div class="form-field"><label for="ol-institutions">Higher-education institutions (ESNcard form)</label>
          <textarea id="ol-institutions" rows="6">${esc(HOST_INSTITUTIONS.join("\n"))}</textarea></div>
        <div class="form-field"><label for="ol-fields">Study fields (ESNcard form)</label>
          <textarea id="ol-fields" rows="6">${esc(STUDY_FIELDS.join("\n"))}</textarea></div>
      </div>
      <div class="form-actions"><button class="btn btn-sm btn-green" id="ol-save">Save org lists</button></div>
    </div>` : ""}


    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("home_pin", "sm")} Event locations</strong> ${hintIcon("Venue profiles for places you use all the time (sports hall, 't Kofschip, Therminal…). Each has an address, a default picture (used when an event has none), default tags (pre-ticked when picked) and its own statistics. In the event form they appear as a 'saved venue' picker above the Location field.")}
      <div id="venues-box" style="margin-top:10px"><p class="form-hint">Loading venues…</p></div>
    </div>

    <h3 class="settings-group">${mi("build", "sm")} System</h3>

    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("campaign", "sm")} Site banner</strong> ${hintIcon("A strip shown at the top of every page for everyone - warnings ('tonight's party moved!'), big announcements. A CHANGED message reappears even for people who dismissed the old one. While nothing is saved (or it's switched off), no banner shows.")}
      <div class="form-field" style="margin-top:10px">
        <textarea id="bn-text" rows="2" maxlength="300" placeholder="e.g. Tonight's party moved to Vooruit - doors at 22:00!"></textarea>
      </div>
      <div class="form-actions" style="align-items:center;flex-wrap:wrap">
        <label class="checkbox-row" style="margin:0"><input type="checkbox" id="bn-enabled" /> Show the banner</label>
        <select id="bn-kind" class="inline-input"><option value="warn">Warning (orange)</option><option value="info">Info (blue)</option></select>
        <label class="checkbox-row" style="margin:0"><input type="checkbox" id="bn-dismiss" checked /> Dismissible ${hintIcon("Ticked: people can close it (it stays closed on their device until you change the text). Unticked: it stays until you turn it off here.")}</label>
        <button class="btn btn-sm btn-green" id="bn-save">Save banner</button>
      </div>
      <p class="form-hint" style="margin-top:8px" id="bn-hint">Loading current banner…</p>
    </div>

    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("school", "sm")} UGent DSA sync</strong> ${hintIcon("Pushes published events to the university's activity site (dsa.ugent.be) automatically - creating, updating and removing them as you edit. Per-event opt-out lives in the event form under Advanced. One-time setup: run 'firebase functions:secrets:set DSA_API_KEY' with the key you got from DSA, redeploy the functions, save your association abbreviation here, then hit 'Push all upcoming events'.")}
      <div class="form-actions" style="margin-top:10px;align-items:center;flex-wrap:wrap">
        <label class="checkbox-row" style="margin:0"><input type="checkbox" id="dsa-enabled" /> Enable DSA sync</label>
        <input class="inline-input" id="dsa-assoc" style="width:160px" placeholder="association abv (e.g. esn)" title="Your association abbreviation on DSA - find it via dsa.ugent.be or the /api/verenigingen list" />
        <button class="btn btn-sm btn-green" id="dsa-save">Save</button>
        <button class="btn btn-sm btn-cyan" id="dsa-resync">${mi("sync", "sm")} Push all upcoming events</button>
      </div>
      <p class="form-hint" style="margin-top:8px" id="dsa-hint">Loading current settings…</p>
    </div>

    <div class="form-card" style="margin-bottom:16px">
      <strong>${jacobImg("jacob-sm")} Jacob - AI features</strong> ${hintIcon("Jacob (named after our mascot) is the board-only AI helper, powered by Google Gemini on the existing Google billing: he drafts event descriptions, digests event feedback and recaps board-meeting minutes. One-time setup: create an API key at aistudio.google.com/apikey, then run 'firebase functions:secrets:set GEMINI_API_KEY' and redeploy the functions. Costs at our scale: well under €1/month.")}
      <div class="form-actions" style="margin-top:10px;align-items:center">
        <label class="checkbox-row" style="margin:0"><input type="checkbox" id="ai-enabled" ${aiConfig.enabled ? "checked" : ""} /> Enable Jacob (board only)</label>
        <input class="inline-input" id="ai-model" style="width:200px" placeholder="gemini-3.6-flash" value="${esc(aiConfig.model)}" title="Gemini model name" />
        <button class="btn btn-sm btn-dark" id="ai-save">Save</button>
      </div>
      <p class="form-hint" style="margin-top:8px">Off = every AI button disappears and the server refuses AI requests. Student data never goes into prompts.</p>
    </div>

    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("mail", "sm")} Confirmation e-mails</strong> ${hintIcon("Sends a ticket-confirmation e-mail from the section's own mailbox whenever a registration is paid or free. One-time setup: create a mailbox (e.g. app@esngent.org) in the hosting panel's Mail Manager, fill in its SMTP settings here, and store the mailbox password once with 'firebase functions:secrets:set SMTP_PASSWORD' before deploying. Works with any SMTP provider - moving to e.g. Brevo later is just new values here plus a new password secret, no code changes.")}
      <div class="form-grid" style="margin-top:12px">
        <div class="form-field"><label for="em-host">SMTP server</label>
          <input id="em-host" maxlength="120" placeholder="mail.s702.sureserver.com" value="${esc(emailCfg.host || "")}" /></div>
        <div class="form-field"><label for="em-port">Port</label>
          <input id="em-port" type="number" placeholder="465" value="${esc(String(emailCfg.port || 465))}" /></div>
        <div class="form-field"><label for="em-user">Mailbox (SMTP login)</label>
          <input id="em-user" maxlength="120" placeholder="app@esngent.org" value="${esc(emailCfg.user || "")}" /></div>
        <div class="form-field"><label for="em-from">From address</label>
          <input id="em-from" type="email" maxlength="120" placeholder="app@esngent.org" value="${esc(emailCfg.fromAddress || "")}" /></div>
        <div class="form-field"><label for="em-from-name">From name</label>
          <input id="em-from-name" maxlength="80" placeholder="ESN Gent" value="${esc(emailCfg.fromName || "ESN Gent")}" /></div>
        <div class="form-field"><label for="em-replyto">Reply-to (optional)</label>
          <input id="em-replyto" type="email" maxlength="120" placeholder="info@esngent.org" value="${esc(emailCfg.replyTo || "")}" /></div>
      </div>
      <div class="form-actions" style="margin-top:10px;align-items:center">
        <label class="checkbox-row" style="margin:0"><input type="checkbox" id="em-enabled" ${emailCfg.enabled ? "checked" : ""} /> Send confirmation e-mails</label>
        <button class="btn btn-sm btn-dark" id="em-save">Save</button>
        <button class="btn btn-sm btn-ghost btn-ink" id="em-test">${mi("send", "sm")} Send me a test</button>
      </div>
      <p class="form-hint" style="margin-top:8px">Save first, then test - the test goes to your own address and works while the switch is still off. Flip it on once the test arrives (check spam the first time; DKIM in the hosting panel helps).</p>
    </div>

    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("bug_report", "sm")} Error log</strong> ${hintIcon("Every error users actually see, plus crashes and server-side sync/push failures - newest first, with timestamp, place and app version. Cleared entries are gone for good.")}
      <div class="form-actions" style="margin:10px 0">
        <button class="btn btn-sm btn-ghost btn-ink" id="err-refresh">${mi("refresh", "sm")} Refresh</button>
        <button class="btn btn-sm btn-ghost btn-ink" id="err-csv" title="Every entry (up to 2000), newest first - opens in Excel/Numbers/Sheets">${mi("download", "sm")} Download CSV</button>
        <button class="btn btn-sm btn-ghost btn-danger" id="err-clear">Clear shown entries</button>
      </div>
      <div id="err-box"><p class="form-hint">Loading…</p></div>
    </div>

    ${isSuperUser ? `
    <div class="form-card" style="margin-bottom:16px">
      <strong>${mi("notifications", "sm")} Push notifications</strong>
      ${pushConfig.vapidKey
        ? ` <span class="badge badge-paid">configured</span> ${hintIcon("Only needs touching if the Web Push key pair is ever regenerated in Firebase console → Project settings → Cloud Messaging.")}`
        : ` ${hintIcon("One-time: Firebase console → Project settings → Cloud Messaging → Web configuration → Generate key pair → paste the public key here.")}`}
      <div class="form-actions" style="align-items:center;margin-top:10px">
        <input class="inline-input" id="vapid-key" placeholder="VAPID public key (starts with B…)" style="flex:1;min-width:220px" value="${esc(pushConfig.vapidKey || "")}" />
        <button class="btn btn-dark btn-sm" id="vapid-save">Save</button>
      </div>
    </div>` : ""}
  `;

  // ---- Settings sub-tabs (v0.120): the page grew huge, so the four
  // settings-group sections (Events / ESNcard / Organisation / System)
  // become switchable panels. Pure post-render DOM work - every card and
  // its wiring stays exactly where it was; hidden panels keep their ids.
  (() => {
    const heads = [...$app.querySelectorAll("h3.settings-group")];
    if (heads.length < 2) return;
    const groups = [];
    let cur = null;
    [...heads[0].parentElement.children].forEach((el) => {
      if (el.tagName === "H3" && el.classList.contains("settings-group")) {
        // Label WITHOUT the icon ligature text ("celebration Events" bug):
        const clone = el.cloneNode(true);
        clone.querySelectorAll(".material-symbols-rounded").forEach((ic) => ic.remove());
        cur = { head: el, els: [el], label: clone.textContent.trim() };
        groups.push(cur);
      } else if (cur) cur.els.push(el);
    });
    const bar = document.createElement("div");
    bar.className = "filter-chips";
    bar.style.margin = "0 0 16px";
    bar.innerHTML = groups.map((g, i) => `<button class="chip" data-sg="${i}">${esc(g.label)}</button>`).join("");
    heads[0].parentElement.insertBefore(bar, heads[0]);
    const show = (idx) => {
      settingsGroupTab = idx;
      groups.forEach((g, i) => g.els.forEach((el) => { el.style.display = i === idx ? "" : "none"; }));
      bar.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", +c.dataset.sg === idx));
    };
    bar.querySelectorAll(".chip").forEach((c) => { c.onclick = () => show(+c.dataset.sg); });
    show(Math.min(settingsGroupTab, groups.length - 1));
  })();

  // ---- Event defaults ----
  document.getElementById("ed-save")?.addEventListener("click", async (e) => {
    const hrs = parseInt(document.getElementById("ed-cancel").value, 10);
    const fee = Math.round(parseFloat(document.getElementById("ed-fee").value || "0") * 100);
    const wait = parseInt(document.getElementById("ed-wait").value, 10);
    if (!Number.isFinite(hrs) || hrs < 0 || !Number.isFinite(fee) || fee < 0) { toast("Enter valid numbers.", "error"); return; }
    if (!Number.isFinite(wait) || wait < 1 || wait > 168) { toast("Waitlist reply time must be between 1 and 168 hours.", "error"); return; }
    e.target.disabled = true;
    try {
      await setDoc(doc(db, "settings", "events"), {
        defaultCancelHours: hrs,
        defaultRefundFee: fee,
        waitlistHours: wait, // read by the promoteWaitlist function (v0.125)
        updatedBy: currentUser.uid,
        updatedAt: serverTimestamp(),
      });
      eventDefaults = { defaultCancelHours: hrs, defaultRefundFee: fee, waitlistHours: wait };
      toast("Event defaults saved - applies to new events right away.", "success");
    } catch (err) { toast("Save failed: " + err.message, "error"); }
    e.target.disabled = false;
  });

  // ---- Org lists (year-changing dropdown contents) ----
  document.getElementById("ol-save")?.addEventListener("click", async (e) => {
    const parse = (id) => document.getElementById(id).value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 40);
    const boardFunctions = parse("ol-functions");
    const shiftTasks = parse("ol-tasks");
    const discoveryOptions = parse("ol-discovery");
    const hostInstitutions = parse("ol-institutions");
    const studyFields = parse("ol-fields");
    e.target.disabled = true;
    try {
      await setDoc(doc(db, "settings", "lists"), {
        boardFunctions, shiftTasks, discoveryOptions, hostInstitutions, studyFields,
        updatedBy: currentUser.uid, updatedAt: serverTimestamp(),
      }, { merge: true }); // merge: keeps legacy .locations for the datalist fallback
      if (boardFunctions.length) BOARD_FUNCTIONS = boardFunctions;
      if (hostInstitutions.length) HOST_INSTITUTIONS = hostInstitutions;
      if (studyFields.length) STUDY_FIELDS = studyFields;
      if (shiftTasks.length) SHIFT_TASKS = shiftTasks;
      if (discoveryOptions.length) DISCOVERY_OPTIONS = discoveryOptions;
      toast("Org lists saved - forms and dropdowns use them immediately.", "success");
    } catch (err) { toast("Save failed: " + err.message, "error"); }
    e.target.disabled = false;
  });

  // ---- Event locations / venue profiles (v0.115) ----
  (async () => {
    const box = document.getElementById("venues-box");
    if (!box) return;
    let venues = [], vTags = [];
    try {
      [venues, vTags] = await Promise.all([
        getDocs(query(collection(db, "venues"), orderBy("name"))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        fetchEventTags().catch(() => []),
      ]);
    } catch (err) { box.innerHTML = `<p class="form-hint">Couldn't load venues (${esc(err.message)}) - deploy the v0.115 Firestore rules first.</p>`; return; }
    const render = () => {
      box.innerHTML = `
        ${venues.map((v) => `
          <div class="form-card venue-row" data-vid="${v.id}" style="margin:0 0 10px;padding:12px">
            <div class="form-actions" style="margin:0;align-items:center;flex-wrap:wrap">
              ${v.image ? `<img src="${esc(v.image)}" alt="" style="width:64px;height:36px;object-fit:cover;border-radius:6px" />` : `<span class="form-hint" style="width:64px;text-align:center">no pic</span>`}
              <input class="inline-input vn-name" value="${esc(v.name || "")}" maxlength="60" placeholder="Name" style="width:150px" />
              <input class="inline-input vn-addr" value="${esc(v.address || "")}" maxlength="120" placeholder="Address" style="width:210px" />
              <select class="inline-input vn-terrain" style="width:170px" title="DSA location type of this venue - picking the venue in the event form fills the 'Location type - for DSA' select automatically (e.g. sports hall → UGent-domein).">
                <option value="">DSA location: -</option>
                ${DSA_TERRAINS_UI.map(([val, l]) => `<option value="${val}" ${v.dsaTerrain === val ? "selected" : ""}>${l.split(" - ")[0]}</option>`).join("")}
              </select>
              <label class="btn btn-sm btn-ghost btn-ink" style="cursor:pointer">${mi("image", "sm")} Picture<input type="file" accept="image/*" class="vh-input vn-img" /></label>
              <button class="btn btn-sm btn-green vn-save">Save</button>
              <button class="btn btn-sm btn-ghost btn-ink vn-stats">${mi("insights", "sm")} Stats</button>
              <button class="btn btn-sm btn-ghost vn-del btn-danger" title="Delete venue">✕</button>
            </div>
            <div class="form-actions" style="margin:8px 0 0;flex-wrap:wrap;gap:10px">
              <span class="form-hint">Default tags:</span>
              ${vTags.filter((t) => t.cause !== true).map((t) => `<label class="checkbox-row" style="margin:0;white-space:nowrap"><input type="checkbox" class="vn-tag" value="${t.id}" ${(v.tagIds || []).includes(t.id) ? "checked" : ""} /> <small>${esc(t.name)}</small></label>`).join("")}
            </div>
            <div class="vn-stats-box" style="margin-top:8px"></div>
          </div>`).join("")}
        <div class="form-actions" style="margin:0;align-items:center">
          <input class="inline-input" id="vn-new-name" maxlength="60" placeholder="New venue (e.g. Sports hall GUSB)" style="width:210px" />
          <input class="inline-input" id="vn-new-addr" maxlength="120" placeholder="Address (optional)" style="width:210px" />
          <button class="btn btn-sm btn-dark" id="vn-add">Add venue</button>
        </div>
        ${venues.length ? "" : `<p class="form-hint" style="margin-top:8px">No venues yet - add your regular spots once (sports hall, 't Kofschip…) and the event form reuses their address, picture and tags.</p>`}`;
      wire();
    };
    const wire = () => {
      box.querySelectorAll(".venue-row").forEach((row) => {
        const v = venues.find((x) => x.id === row.dataset.vid);
        let newImg = null; // picked but not yet saved
        row.querySelector(".vn-img").addEventListener("change", async (e2) => {
          const file = e2.target.files[0];
          if (!file) return;
          newImg = await compressCardImage(file);
          toast("Picture ready - hit Save on this venue.", "success");
        });
        row.querySelector(".vn-save").onclick = async (e2) => {
          const name = row.querySelector(".vn-name").value.trim();
          if (!name) { toast("Give the venue a name.", "error"); return; }
          const address = row.querySelector(".vn-addr").value.trim();
          const tagIds = [...row.querySelectorAll(".vn-tag:checked")].map((c) => c.value);
          const dsaTerrain = row.querySelector(".vn-terrain").value || null;
          e2.target.disabled = true;
          try {
            let image = v.image || null;
            if (newImg) {
              image = await storeImage(newImg, "venues");
              if (v.image && v.image !== image) deleteStoredImage(v.image);
            }
            await updateDoc(doc(db, "venues", v.id), { name, address, tagIds, image, dsaTerrain, updatedAt: serverTimestamp(), updatedBy: currentUser.uid });
            Object.assign(v, { name, address, tagIds, image, dsaTerrain });
            toast(`Venue "${name}" saved.`, "success");
            render();
          } catch (err) { toast("Save failed: " + err.message, "error"); e2.target.disabled = false; }
        };
        row.querySelector(".vn-del").onclick = async () => {
          if (!await appConfirm(`Delete venue "${v.name}"? Existing events keep their location text & picture.`)) return;
          try {
            await deleteDoc(doc(db, "venues", v.id));
            // Image file stays: existing events may still show it.
            venues = venues.filter((x) => x.id !== v.id);
            toast("Venue deleted.", "success");
            render();
          } catch (err) { toast("Failed: " + err.message, "error"); }
        };
        row.querySelector(".vn-stats").onclick = async (e2) => {
          const sb = row.querySelector(".vn-stats-box");
          if (sb.innerHTML) { sb.innerHTML = ""; return; } // toggle
          e2.target.disabled = true;
          try {
            const snap = await getDocs(query(collection(db, "events"), where("venueId", "==", v.id)));
            const evs = snap.docs.map((d) => d.data()).filter((x) => !x.cancelled);
            const now = new Date();
            const mk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const perMonth = {};
            let sold = 0, upcoming = 0;
            for (const x of evs) {
              const d = toDate(x.start);
              perMonth[mk(d)] = (perMonth[mk(d)] || 0) + 1;
              sold += x.ticketsSold || 0;
              if (d >= now) upcoming++;
            }
            const months = Object.keys(perMonth).sort().slice(-12);
            sb.innerHTML = evs.length ? `
              <p class="form-hint" style="margin:0"><strong>${evs.length}</strong> event${evs.length === 1 ? "" : "s"} here (${upcoming} upcoming) · <strong>${sold}</strong> tickets sold · avg <strong>${(sold / evs.length).toFixed(1)}</strong> per event</p>
              <p class="form-hint" style="margin:4px 0 0">Per month: ${months.map((m) => `<strong>${m}</strong> ×${perMonth[m]}`).join(" · ")}</p>`
              : `<p class="form-hint" style="margin:0">No events counted yet - statistics cover events saved with this venue picked in the form (from v0.115 on).</p>`;
          } catch (err) { sb.innerHTML = `<p class="form-hint">Stats failed: ${esc(err.message)}</p>`; }
          e2.target.disabled = false;
        };
      });
      document.getElementById("vn-add").onclick = async (e2) => {
        const name = document.getElementById("vn-new-name").value.trim();
        if (!name) { toast("Give the venue a name.", "error"); return; }
        const address = document.getElementById("vn-new-addr").value.trim();
        e2.target.disabled = true;
        try {
          const ref = await addDoc(collection(db, "venues"), { name, address, tagIds: [], image: null, dsaTerrain: null, createdAt: serverTimestamp(), updatedBy: currentUser.uid });
          venues.push({ id: ref.id, name, address, tagIds: [], image: null, dsaTerrain: null });
          venues.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
          toast(`Venue "${name}" added - now give it a picture & default tags.`, "success");
          render();
        } catch (err) { toast("Failed: " + err.message, "error"); e2.target.disabled = false; }
      };
    };
    render();
  })();

  // ---- UGent DSA sync (v0.110) ----
  (async () => {
    try {
      const s = await getDoc(doc(db, "settings", "dsa"));
      const d = s.exists() ? s.data() : {};
      const en = document.getElementById("dsa-enabled");
      const ab = document.getElementById("dsa-assoc");
      if (en) en.checked = d.enabled !== false && !!d.association;
      if (ab) ab.value = d.association || "";
      const h = document.getElementById("dsa-hint");
      if (h) h.textContent = d.association
        ? `Syncing as "${d.association}". New events push automatically when published; the per-event switch sits under Advanced.`
        : "Not set up yet - save the association abbreviation (and set the DSA_API_KEY secret) to start syncing.";
    } catch { /* card stays with defaults */ }
  })();
  document.getElementById("dsa-save")?.addEventListener("click", async (e) => {
    const enabled = document.getElementById("dsa-enabled").checked;
    const association = document.getElementById("dsa-assoc").value.trim().toLowerCase();
    if (enabled && !association) { toast("Fill in your DSA association abbreviation first.", "error"); return; }
    e.target.disabled = true;
    try {
      await setDoc(doc(db, "settings", "dsa"), {
        enabled, association,
        updatedBy: currentUser.uid, updatedAt: serverTimestamp(),
      });
      toast(enabled ? `DSA sync on as "${association}" - published events push automatically.` : "DSA sync off - nothing is pushed or removed.", "success");
    } catch (err) { toast("Save failed: " + err.message, "error"); }
    e.target.disabled = false;
  });
  document.getElementById("dsa-resync")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (!await appConfirm("Push all upcoming PUBLISHED events to dsa.ugent.be now? Office hours and team events (registered as non-public) go too; only events with the DSA switch unticked are skipped or removed there.")) return;
    btn.disabled = true;
    const old = btn.innerHTML;
    btn.innerHTML = `${mi("hourglass_top", "sm")} Syncing…`;
    try {
      const res = await httpsCallable(functions, "dsaResyncAll")({});
      const { synced, removed, failed } = res.data || {};
      if (failed?.length) {
        // Show the REAL per-event errors (HTTP status + DSA response body) -
        // that's what you need to fix a 401 key / 422 validation problem.
        await appAlert(
          `DSA: ${synced || 0} pushed/updated${removed ? `, ${removed} removed` : ""} - ${failed.length} failed:\n\n`
          + failed.map((f) => `• ${f.title || f.id}\n${f.error}`).join("\n\n").slice(0, 2500),
          "Close");
        toast(`DSA: ${failed.length} event${failed.length === 1 ? "" : "s"} failed to push.`, "error");
      } else {
        toast(`DSA: ${synced || 0} pushed/updated${removed ? `, ${removed} removed` : ""}.`, "success");
      }
    } catch (err) { toast(err.message || "DSA sync failed", "error"); }
    btn.disabled = false;
    btn.innerHTML = old;
  });

  // ---- AI features ----
  document.getElementById("ai-save")?.addEventListener("click", async (e) => {
    const enabled = document.getElementById("ai-enabled").checked;
    const model = document.getElementById("ai-model").value.trim() || "gemini-3.6-flash";
    e.target.disabled = true;
    try {
      await setDoc(doc(db, "settings", "ai"), {
        enabled, model,
        updatedBy: currentUser.uid, updatedAt: serverTimestamp(),
      });
      aiConfig.enabled = enabled;
      aiConfig.model = model;
      toast(enabled ? "Jacob is awake - his buttons appear for board members." : "Jacob is asleep - AI is off everywhere.", "success");
    } catch (err) { toast("Save failed: " + err.message, "error"); }
    e.target.disabled = false;
  });

  // ---- Confirmation e-mails ----
  document.getElementById("em-save")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await setDoc(doc(db, "settings", "email"), {
        enabled: document.getElementById("em-enabled").checked,
        host: document.getElementById("em-host").value.trim(),
        port: Number(document.getElementById("em-port").value) || 465,
        user: document.getElementById("em-user").value.trim(),
        fromAddress: document.getElementById("em-from").value.trim(),
        fromName: document.getElementById("em-from-name").value.trim() || "ESN Gent",
        replyTo: document.getElementById("em-replyto").value.trim(),
        updatedBy: currentUser.uid, updatedAt: serverTimestamp(),
      });
      toast("E-mail settings saved.", "success");
    } catch (err) { toast("Save failed: " + err.message, "error"); }
    e.target.disabled = false;
  });
  document.getElementById("em-test")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const old = btn.innerHTML;
    btn.innerHTML = `${mi("hourglass_top", "sm")} Sending…`;
    try {
      const fn = httpsCallable(functions, "sendTestEmail");
      const res = await fn({});
      toast(`Test sent to ${res.data.to} - check the inbox (and spam).`, "success");
    } catch (err) { toast(err.message || "Test failed", "error"); }
    btn.disabled = false;
    btn.innerHTML = old;
  });

  // ---- Link-in-bio page ----
  document.getElementById("lt-save")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await setDoc(doc(db, "settings", "linktree"), {
        content: document.getElementById("lt-editor").value.trim(),
        updatedBy: currentUser.uid, updatedAt: serverTimestamp(),
      });
      toast("Link page saved - live immediately at #/links.", "success");
    } catch (err) { toast("Save failed: " + err.message, "error"); }
    e.target.disabled = false;
  });

  // ---- Student FAQ ----
  document.getElementById("faq-save")?.addEventListener("click", async (e) => {
    const raw = document.getElementById("faq-editor").value.trim();
    const items = raw ? raw.split(/\n\s*\n/).map((b) => {
      const lines = b.trim().split("\n");
      return { q: lines[0].trim().slice(0, 200), a: lines.slice(1).join("\n").trim().slice(0, 2000) };
    }).filter((it) => it.q && it.a) : [];
    e.target.disabled = true;
    try {
      await setDoc(doc(db, "settings", "faq"), { items, updatedBy: currentUser.uid, updatedAt: serverTimestamp() });
      faqCustom = items.length ? items : null;
      toast(items.length ? `FAQ saved - ${items.length} question${items.length === 1 ? "" : "s"} live.` : "Custom FAQ cleared - the built-in FAQ is back.", "success");
    } catch (err) { toast("Save failed: " + err.message, "error"); }
    e.target.disabled = false;
  });

  // ---- Organisation info ----
  document.getElementById("org-save")?.addEventListener("click", async (e) => {
    const officeAddress = document.getElementById("org-address").value.trim();
    const officeHoursText = document.getElementById("org-hours").value.trim();
    const contactEmail = document.getElementById("org-email").value.trim();
    if (!officeAddress || !officeHoursText || !contactEmail) { toast("Fill in address, hours and e-mail.", "error"); return; }
    const socials = {};
    for (const [k, label] of SOCIAL_DEFS) {
      let v = (document.getElementById(`org-${k}`)?.value || "").trim();
      if (v && !/^https?:\/\//i.test(v)) v = "https://" + v;
      if (v && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(v)) { toast(`${label}: that doesn't look like a link.`, "error"); return; }
      socials[k] = v;
    }
    e.target.disabled = true;
    try {
      await setDoc(doc(db, "settings", "org"), {
        officeAddress, officeHoursText, contactEmail, ...socials,
        updatedBy: currentUser.uid, updatedAt: serverTimestamp(),
      });
      Object.assign(orgInfo, { officeAddress, officeHoursText, contactEmail }, socials);
      applyOrgInfo();
      toast("Organisation info saved - footer, Office page and FAQ update immediately.", "success");
    } catch (err) { toast("Save failed: " + err.message, "error"); }
    e.target.disabled = false;
  });

  // ---- Google Calendar: force resync (setup happens here too) ----
  document.getElementById("btn-cal-sync")?.addEventListener("click", async (e) => {
    if (!calendarSync?.calendarId) {
      toast("Calendar sync isn't set up yet - add the calendar IDs in calendar-config.js", "error");
      return;
    }
    e.target.disabled = true;
    e.target.textContent = "Syncing…";
    try {
      await setDoc(doc(db, "settings", "calendar"), {
        publicCalendarId: calendarSync.calendarId,
        boardCalendarId: calendarSync.boardCalendarId || null,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      const fn = httpsCallable(functions, "syncCalendarAll");
      const res = await fn({});
      const { synced, failed } = res.data || {};
      toast(failed?.length
        ? `Synced ${synced} events, ${failed.length} failed - is the Calendar API enabled and are both calendars shared with the functions' service account?`
        : `Calendar re-sync done: ${synced} upcoming event${synced === 1 ? "" : "s"}.`,
        failed?.length ? "error" : "success");
    } catch (err) {
      toast("Sync failed: " + (err.message || ""), "error");
    }
    e.target.disabled = false;
    e.target.innerHTML = `${mi("sync", "sm")} Force full re-sync`;
  });

  // ---- Error log ----
  let shownErrors = [];
  const loadErrors = async () => {
    const box = document.getElementById("err-box");
    try {
      const snap = await getDocs(query(collection(db, "errorLog"), orderBy("ts", "desc"), limit(50)));
      shownErrors = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      box.innerHTML = shownErrors.length ? `
        <div class="table-wrap cards"><table>
          <thead><tr><th>When</th><th>Where</th><th>Message</th><th>Who</th><th>Page</th><th>Version</th></tr></thead>
          <tbody>${shownErrors.map((r) => `
            <tr>
              <td data-l="When" style="white-space:nowrap">${r.ts ? `${fmtDate(r.ts)} ${fmtTime(r.ts)}` : "-"}</td>
              <td data-l="Where"><span class="badge ${r.where?.startsWith("fn:") ? "badge-esn" : r.where === "crash" || r.where === "promise" ? "badge-soldout" : "badge-requested"}">${esc(r.where || "-")}</span>${r.code ? `<br /><small class="form-hint">${esc(r.code)}</small>` : ""}</td>
              <td class="card-main" style="max-width:320px;overflow-wrap:anywhere">${esc(r.message || "")}${r.detail ? `<details><summary class="form-hint" style="cursor:pointer">details</summary><small style="overflow-wrap:anywhere">${esc(r.detail)}</small></details>` : ""}</td>
              <td data-l="Who" style="overflow-wrap:anywhere">${r.email ? `<a href="${r.uid ? `/admin/user-${esc(r.uid)}` : `mailto:${esc(r.email)}`}">${esc(r.email)}</a>` : r.uid ? `<a href="/admin/user-${esc(r.uid)}"><small>${esc(r.uid.slice(0, 8))}…</small></a>` : "-"}</td>
              <td>${esc(r.hash || "")}</td>
              <td>${esc(r.version || "")}</td>
            </tr>`).join("")}</tbody>
        </table></div>
        <p class="form-hint" style="margin-top:6px">Newest 50 - Download CSV for everything. "fn:" entries come from the server (payments, calendar, push). Students see a plain-language version of these; this is the raw text.</p>`
      : `<p class="form-hint">No errors logged - quiet is good.</p>`;
    } catch (err) { box.innerHTML = `<p class="form-hint">Could not load the log: ${esc(err.message)}</p>`; }
  };
  loadErrors();
  // ---- Error log → CSV (v1.1.0): every entry, newest first ----
  document.getElementById("err-csv")?.addEventListener("click", async (e) => {
    btnBusy(e.target, "Preparing…");
    try {
      const snap = await getDocs(query(collection(db, "errorLog"), orderBy("ts", "desc"), limit(2000)));
      const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const iso = (ts) => { const d = toDate(ts); return d ? d.toLocaleString("sv-SE", { timeZone: TZ_BE }) : ""; };
      const rows = [["when (Brussels)", "where", "code", "message", "who", "uid", "page", "version", "detail", "browser"]];
      snap.docs.forEach((d) => {
        const r = d.data();
        rows.push([iso(r.ts), r.where, r.code, r.message, r.email, r.uid, r.hash, r.version, r.detail, r.ua]);
      });
      const csv = "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `esn-gent-error-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast(`${snap.size} entr${snap.size === 1 ? "y" : "ies"} exported.`, "success");
    } catch (err) { toast("Export failed: " + err.message, "error"); }
    btnIdle(e.target);
  });
  // ---- Site banner (v0.131) ----
  (async () => {
    try {
      const s = await getDoc(doc(db, "settings", "announcement"));
      const b = s.exists() ? s.data() : null;
      if (b) {
        document.getElementById("bn-text").value = b.text || "";
        document.getElementById("bn-enabled").checked = b.enabled === true;
        document.getElementById("bn-kind").value = b.kind === "info" ? "info" : "warn";
        document.getElementById("bn-dismiss").checked = b.dismissible !== false;
        document.getElementById("bn-hint").textContent = b.enabled ? "Banner is LIVE for everyone." : "Banner is saved but switched off.";
      } else {
        document.getElementById("bn-hint").textContent = "Nothing configured yet - no banner is shown.";
      }
    } catch { document.getElementById("bn-hint").textContent = ""; }
  })();
  // ---- "Card ready" e-mail template (moved here from the ESNcard tab, v1.3.0) ----
  if (document.getElementById("tpl-card-save")) {
    (async () => {
      try {
        const ts = await getDoc(doc(db, "settings", "emailTemplates"));
        const t = ts.exists() && ts.data().esncardReady ? ts.data().esncardReady : {};
        document.getElementById("tpl-card-subject").value = t.subject || "";
        document.getElementById("tpl-card-body").value = t.body || "";
        document.getElementById("tpl-card-hint").textContent = t.subject || t.body ? "Custom text in use." : "Built-in text in use - edit to customise.";
      } catch { document.getElementById("tpl-card-hint").textContent = ""; }
    })();
    document.getElementById("tpl-card-save").addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        await setDoc(doc(db, "settings", "emailTemplates"), {
          esncardReady: {
            subject: document.getElementById("tpl-card-subject").value.trim(),
            body: document.getElementById("tpl-card-body").value.trim(),
          },
          updatedBy: currentUser.uid, updatedAt: serverTimestamp(),
        }, { merge: true });
        toast("Template saved - used for the next card-ready mails.", "success");
        document.getElementById("tpl-card-hint").textContent = "Custom text in use.";
      } catch (err) { toast("Save failed: " + err.message, "error"); }
      e.target.disabled = false;
    });
    document.getElementById("tpl-card-test").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btnBusy(btn, "Sending…");
      try {
        const fn = httpsCallable(functions, "sendTestEmail");
        const res = await fn({ template: "esncardReady" });
        toast(`Preview sent to ${res.data.to} with sample data - it uses the SAVED template, so save first.`, "success");
      } catch (err) { toast(err.message || "Preview failed", "error"); }
      btnIdle(btn);
    });
  }
  document.getElementById("bn-save")?.addEventListener("click", async (e) => {
    const text = document.getElementById("bn-text").value.trim();
    const enabled = document.getElementById("bn-enabled").checked;
    if (enabled && !text) { toast("Write the banner text first (or untick 'Show the banner').", "warn"); return; }
    e.target.disabled = true;
    try {
      await setDoc(doc(db, "settings", "announcement"), {
        text, enabled,
        kind: document.getElementById("bn-kind").value,
        dismissible: document.getElementById("bn-dismiss").checked,
        updatedBy: currentUser.uid,
        updatedAt: serverTimestamp(),
      });
      toast(enabled ? "Banner saved - it shows for everyone on their next page load." : "Banner switched off.", "success");
      document.getElementById("bn-hint").textContent = enabled ? "Banner is LIVE for everyone." : "Banner is saved but switched off.";
    } catch (err) { toast("Save failed: " + err.message, "error"); }
    e.target.disabled = false;
  });
  document.getElementById("err-refresh").onclick = loadErrors;
  document.getElementById("err-clear").onclick = async (e) => {
    if (!shownErrors.length) { toast("Nothing to clear.", "success"); return; }
    if (!await appConfirm(`Delete the ${shownErrors.length} shown entries?`)) return;
    e.target.disabled = true;
    try {
      for (const r of shownErrors) await deleteDoc(doc(db, "errorLog", r.id));
      toast("Cleared.", "success");
      loadErrors();
    } catch (err) { toast("Failed: " + err.message, "error"); }
    e.target.disabled = false;
  };

  // ---- ESNcard pricing ----
  document.getElementById("cp-save")?.addEventListener("click", async (e) => {
    const s = Math.round(parseFloat(document.getElementById("cp-student").value) * 100);
    const v = Math.round(parseFloat(document.getElementById("cp-vol").value) * 100);
    const months = parseInt(document.getElementById("cp-valid").value, 10);
    if (!Number.isFinite(s) || s < 0 || !Number.isFinite(v) || v < 0 || !Number.isInteger(months) || months < 1) { toast("Enter valid prices (0 or more) and a validity of at least 1 month.", "error"); return; }
    e.target.disabled = true;
    try {
      const proofRequired = document.getElementById("cp-proof").checked;
      // The superadmin-only fallback switch keeps its stored value when a
      // finance user (who doesn't see it) saves prices.
      const availEl = document.getElementById("cp-avail");
      const acceptAvailable = availEl ? availEl.checked : cardPricing.acceptAvailable === true;
      const cashEl = document.getElementById("cp-cash");
      const cashEnabled = cashEl ? cashEl.checked : cardPricing.cashEnabled === true;
      await setDoc(doc(db, "settings", "esncard"), {
        priceStudent: s, priceVolunteer: v, validityMonths: months, proofRequired, acceptAvailable, cashEnabled,
        updatedBy: currentUser.uid, updatedByName: currentUser.displayName || "",
        updatedAt: serverTimestamp(),
      });
      cardPricing.student = s; cardPricing.volunteer = v; cardPricing.validityMonths = months; cardPricing.proofRequired = proofRequired; cardPricing.acceptAvailable = acceptAvailable; cardPricing.cashEnabled = cashEnabled;
      toast(`ESNcard settings saved: ${fmtMoney(s)} student · ${fmtMoney(v)} volunteer/alumni · valid ${months} months · proof ${proofRequired ? "required" : "OFF (welcome-week mode)"}${cashEl ? ` · cash at the office ${cashEnabled ? "ON" : "OFF (online only)"}` : ""}${availEl ? ` · ${acceptAvailable ? "FALLBACK: available cards count as members (server picks it up within a minute)" : "active cards only"}` : ""}.`, acceptAvailable ? "warn" : "success");
    } catch (err) { toast("Save failed: " + err.message, "error"); }
    e.target.disabled = false;
  });

  // ---- Event tags (superadmin) ----
  if (isSuperUser) {
    const tagsBox = document.getElementById("tags-box");
    const renderTags = () => {
      tagsBox.innerHTML = `
        ${tags.map((t) => `
          <div class="form-actions tag-row" data-tid="${t.id}" style="margin:0 0 8px;align-items:center">
            <input type="color" class="tag-color" value="${esc(t.color || "#2E3192")}" title="Tag colour" style="width:44px;height:32px;padding:2px;border:1px solid var(--border);border-radius:8px;background:var(--card)" />
            <button type="button" class="btn btn-sm btn-ghost btn-ink tag-icon" data-icon="${esc(t.icon || "")}" title="Standard event icon for this tag (shown on passport stamps) - click to pick">${mi(t.icon || iconForName(t.name))}${t.icon ? "" : `<small class="form-hint" style="margin-left:4px">auto</small>`}</button>
            <input class="inline-input tag-name" value="${esc(t.name || "")}" maxlength="30" style="width:170px" />
            ${t.cause === true ? `<span class="badge badge-requested" title="Old-style cause tag - causes are now LINKED per tag instead. Hidden from the event form; still counted on old events. Delete it once no upcoming event needs it.">legacy cause</span>` : `
            <select class="inline-input tag-esncause" style="width:170px" title="ESN cause this tag contributes to - feeds the per-cause statistics in Insights automatically.">
              <option value="">Cause: -</option>
              ${ESN_CAUSES.map((c) => `<option value="${c}" ${t.esnCause === c ? "selected" : ""}>${c}</option>`).join("")}
            </select>
            <select class="inline-input tag-dsatype" style="width:150px" title="DSA 'Type activiteit' this tag maps to - when an event is pushed to dsa.ugent.be, the first of its tags WITH a link decides the type. No link on any tag = Andere (office hours: Permanentie, board meetings: Vergadering).">
              <option value="">DSA type: -</option>
              ${DSA_TYPES.map((v) => `<option value="${v}" ${t.dsaType === v ? "selected" : ""}>${v}</option>`).join("")}
            </select>`}
            <button class="btn btn-sm btn-green tag-save">Save</button>
            <button class="btn btn-sm btn-ghost tag-del btn-danger" title="Delete tag">✕</button>
          </div>`).join("")}
        <div class="form-actions" style="margin:0;align-items:center">
          <input type="color" id="tag-new-color" value="#EC008C" style="width:44px;height:32px;padding:2px;border:1px solid var(--border);border-radius:8px;background:var(--card)" />
          <input class="inline-input" id="tag-new-name" placeholder="New tag (e.g. Party)" maxlength="30" style="width:170px" />
          <select class="inline-input" id="tag-new-esncause" style="width:170px"><option value="">Cause: -</option>${ESN_CAUSES.map((c) => `<option value="${c}">${c}</option>`).join("")}</select>
          <select class="inline-input" id="tag-new-dsatype" style="width:150px"><option value="">DSA type: -</option>${DSA_TYPES.map((v) => `<option value="${v}">${v}</option>`).join("")}</select>
          <button class="btn btn-sm btn-dark" id="tag-add">Add tag</button>
        </div>
        <div class="form-actions" style="margin:10px 0 0">
          <button class="btn btn-sm btn-cyan" id="tag-seed-starter">${mi("label", "sm")} Load the ESN Gent starter tags</button>
          <span class="form-hint">${STARTER_TAGS.length} activity tags with their ESN cause &amp; DSA type pre-linked (Party, Trip, Sports, Cantus, …) - existing names are skipped.</span>
        </div>
        <p class="form-hint" style="margin:10px 0 0">${mi("interests", "sm")} The icon button sets the tag's <strong>standard event icon</strong> (passport stamps &amp; cards): "auto" guesses from the name; a set icon applies to every event with this tag as its first, unless the event picks its own in the form.</p>
        <p class="form-hint" style="margin:10px 0 0">${mi("public", "sm")} <strong>One list since v0.118</strong>: every tag carries its <strong>ESN cause</strong> (per-cause statistics in Insights) and its <strong>DSA type</strong> ("Type activiteit" on dsa.ugent.be - the first tag on an event with a link decides; office hours → Permanentie, board meetings → Vergadering, no link → Andere). Old cause tags show as <em>legacy</em>: hidden from the event form, still counted on old events - delete them once re-tagged. DSA link changes apply to future pushes; "Push all upcoming events" (System → DSA) re-pushes existing ones.</p>`;
      tagsBox.querySelectorAll(".tag-row").forEach((row) => {
        const t = tags.find((x) => x.id === row.dataset.tid);
        // Per-tag standard icon (v0.126): opens the visual picker dialog;
        // the choice is stored on the button and saved with the row.
        row.querySelector(".tag-icon").onclick = async (e) => {
          const btn = e.currentTarget;
          const picked = await pickIconDialog(btn.dataset.icon || null);
          if (picked === undefined) return;
          btn.dataset.icon = picked;
          btn.innerHTML = `${mi(picked || iconForName(row.querySelector(".tag-name").value))}${picked ? "" : `<small class="form-hint" style="margin-left:4px">auto</small>`}`;
        };
        row.querySelector(".tag-save").onclick = async (e) => {
          const name = row.querySelector(".tag-name").value.trim();
          const color = row.querySelector(".tag-color").value;
          const icon = row.querySelector(".tag-icon")?.dataset.icon || null;
          const dsaType = row.querySelector(".tag-dsatype")?.value || null;
          const esnCause = row.querySelector(".tag-esncause")?.value || null;
          if (!name) { toast("Give the tag a name.", "error"); return; }
          e.target.disabled = true;
          try {
            // cause flag untouched - legacy rows keep it, normal rows never get it.
            await updateDoc(doc(db, "eventTags", t.id), t.cause === true
              ? { name, color, icon }
              : { name, color, icon, dsaType, esnCause });
            // Propagate to events: legacy single-tag fields (primary tag)…
            const evs = await getDocs(query(collection(db, "events"), where("tagId", "==", t.id)));
            for (const d of evs.docs) await updateDoc(d.ref, { tagName: name, tagColor: color });
            // …and the multi-tag arrays (v0.103; cause flag since v0.107).
            const evsArr = await getDocs(query(collection(db, "events"), where("tagIds", "array-contains", t.id)));
            for (const d of evsArr.docs) {
              const tags2 = (d.data().tags || []).map((x) => (x.id === t.id
                ? { id: x.id, name, color, ...(t.cause === true ? { cause: true } : {}), ...(esnCause ? { esnCause } : {}), ...(icon ? { icon } : {}) } : x));
              await updateDoc(d.ref, { tags: tags2 });
            }
            t.name = name; t.color = color; t.icon = icon;
            if (t.cause !== true) { t.dsaType = dsaType; t.esnCause = esnCause; }
            toast(`Tag saved${evs.size ? ` - ${evs.size} event${evs.size === 1 ? "" : "s"} recoloured` : ""}.`, "success");
            renderTags();
          } catch (err) { toast("Failed: " + err.message, "error"); e.target.disabled = false; }
        };
        row.querySelector(".tag-del").onclick = async () => {
          if (!await appConfirm(`Delete the tag "${t.name}"? Events keep working but lose this label.`)) return;
          try {
            await deleteDoc(doc(db, "eventTags", t.id));
            // Remove from the multi-tag arrays first, then fix the legacy
            // fields (the next remaining tag becomes the primary one).
            const evsArr = await getDocs(query(collection(db, "events"), where("tagIds", "array-contains", t.id)));
            for (const d of evsArr.docs) {
              const tags2 = (d.data().tags || []).filter((x) => x.id !== t.id);
              const first = tags2[0] || null;
              await updateDoc(d.ref, {
                tags: tags2.length ? tags2 : null,
                tagIds: tags2.length ? tags2.map((x) => x.id) : null,
                tagId: first ? first.id : null, tagName: first ? first.name : null, tagColor: first ? (first.color || null) : null,
              });
            }
            const evs = await getDocs(query(collection(db, "events"), where("tagId", "==", t.id)));
            for (const d of evs.docs) await updateDoc(d.ref, { tagId: null, tagName: null, tagColor: null });
            tags = tags.filter((x) => x.id !== t.id);
            toast("Tag deleted.", "success");
            renderTags();
          } catch (err) { toast("Failed: " + err.message, "error"); }
        };
      });
      document.getElementById("tag-add").onclick = async (e) => {
        const name = document.getElementById("tag-new-name").value.trim();
        const color = document.getElementById("tag-new-color").value;
        if (!name) { toast("Give the tag a name.", "error"); return; }
        if (tags.some((t) => (t.name || "").toLowerCase() === name.toLowerCase())) { toast("That tag already exists.", "error"); return; }
        const esnCause = document.getElementById("tag-new-esncause").value || null;
        const dsaType = document.getElementById("tag-new-dsatype").value || null;
        e.target.disabled = true;
        try {
          const ref = await addDoc(collection(db, "eventTags"), { name, color, esnCause, dsaType, createdAt: serverTimestamp() });
          tags.push({ id: ref.id, name, color, esnCause, dsaType });
          tags.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
          toast(`Tag "${name}" added.`, "success");
          renderTags();
        } catch (err) { toast("Failed: " + err.message, "error"); e.target.disabled = false; }
      };
      // One-click seed of the unified starter set (v0.118): activity tags
      // with ESN cause + DSA type pre-linked; existing names are skipped.
      document.getElementById("tag-seed-starter")?.addEventListener("click", async (e) => {
        e.target.disabled = true;
        try {
          let added = 0;
          for (const [name, color, dsaType, esnCause] of STARTER_TAGS) {
            if (tags.some((t) => (t.name || "").toLowerCase() === name.toLowerCase())) continue;
            const ref = await addDoc(collection(db, "eventTags"), { name, color, dsaType, esnCause, createdAt: serverTimestamp() });
            tags.push({ id: ref.id, name, color, dsaType, esnCause });
            added++;
          }
          tags.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
          toast(added ? `${added} starter tag${added === 1 ? "" : "s"} added - cause & DSA type included.` : "All starter tags already exist.", "success");
          renderTags();
        } catch (err) { toast("Failed: " + err.message, "error"); e.target.disabled = false; }
      });
    };
    renderTags();

    // ---- Push setup ----
    document.getElementById("vapid-save").onclick = async (e) => {
      const key = document.getElementById("vapid-key").value.trim();
      if (key.length < 40) { toast("That doesn't look like a VAPID public key.", "error"); return; }
      e.target.disabled = true;
      try {
        await setDoc(doc(db, "settings", "push"), { vapidKey: key, updatedAt: serverTimestamp() }, { merge: true });
        pushConfig.vapidKey = key;
        toast("Push key saved - notifications can now be enabled.", "success");
      } catch (err) { toast("Save failed: " + err.message, "error"); }
      e.target.disabled = false;
    };
  }
}

async function viewAdminTeam() {
  if (myRole !== "superadmin") {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("block")}</div><p>Team management is reserved for the superadmin account.</p></div>`;
    return;
  }
  setLoading();
  // Scalability: the team list never loads the users collection - the
  // admins docs carry name/email, and new members are found via a
  // server-side prefix search instead of a dropdown of everyone.
  let team, alumniCount = 0;
  try {
    [team, alumniCount] = await Promise.all([
      getDocs(collection(db, "admins")).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      getCountFromServer(query(collection(db, "users"), where("alumni", "==", true)))
        .then((s) => s.data().count).catch(() => 0),
    ]);
  } catch (e) { $app.innerHTML = `<div class="empty-state"><p>Error: ${esc(e.message)}</p></div>`; return; }

  const userById = Object.fromEntries(team.map((t) => [t.id, { displayName: t.name, email: t.email }]));
  team.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const roleSelect = (id, current, disabled) => `
    <select class="t-role" data-uid="${id}" ${disabled ? "disabled" : ""}>
      ${TEAM_ROLES.map((r) => `<option value="${r}" ${(current || "superadmin") === r ? "selected" : ""}>${r}</option>`).join("")}
    </select>`;

  const rows = team.map((t) => {
    const u = userById[t.id];
    const isMe = t.id === currentUser.uid;
    return `
    <tr>
      <td class="card-main"><strong>${esc(u?.displayName || t.name || "-")}</strong>${isMe ? ` <span class="form-hint">(you)</span>` : ""}<br><small class="form-hint">${esc(u?.email || t.email || "")}</small></td>
      <td data-l="Role">${roleSelect(t.id, t.role, isMe)}</td>
      <td data-l="Function"><input class="inline-input t-func" data-uid="${t.id}" list="board-functions" value="${esc(t.boardFunction || "")}" placeholder="e.g. President" ${isMe && myRole !== "superadmin" ? "disabled" : ""} /></td>
      <td style="white-space:nowrap" class="card-actions">
        ${isMe ? `
          <button class="btn btn-sm btn-dark t-save" data-uid="${t.id}">Save</button>
          <span class="form-hint">You can't change your own role</span>` : `
          <button class="btn btn-sm btn-dark t-save" data-uid="${t.id}">Save</button>
          <button class="btn btn-sm btn-ghost btn-danger t-remove" data-uid="${t.id}">Remove</button>`}
      </td>
    </tr>`;
  }).join("");

  const names = (list) => list.map((t) => {
    const n = (userById[t.id]?.displayName || t.name || "-").split(" ")[0];
    return t.boardFunction ? `${esc(n)} <small>(${esc(t.boardFunction)})</small>` : esc(n);
  }).join(", ") || "-";
  const byRole = (r) => team.filter((t) => (t.role || "superadmin") === r);
  // Real organigram (v0.120): Management (President / Vice-President /
  // Treasurer) on top, rest of the board below, volunteers under the board.
  // The Advisory Board hangs off the side as an ALUMNI extension of the
  // board (AB members are not board), with the alumni network under it.
  const funcOf = (t) => (t.boardFunction || "").trim().toLowerCase();
  const isMgmtFn = (t) => /^(president|vice[- ]?president|treasurer)$/.test(funcOf(t));
  const boardish = team.filter((t) => ["superadmin", "board", "finance"].includes(t.role || "superadmin"));
  const mgmtRank = (t) => (funcOf(t).startsWith("vice") ? 1 : funcOf(t) === "president" ? 0 : 2);
  const mgmt = boardish.filter(isMgmtFn).sort((a, b) => mgmtRank(a) - mgmtRank(b));
  const restBoard = boardish.filter((t) => !isMgmtFn(t));
  const ab = byRole("advisory");
  const alumniTeam = byRole("alumnicoord");
  const vols = byRole("volunteer");
  const node = (cls, title, who, perm) => `
    <div class="orgc-node ${cls}"><strong>${title}</strong>
      <span class="org-who">${who}</span>
      <span class="org-perm">${perm}</span>
    </div>`;
  const orgChart = `
    <div class="form-card" style="margin-bottom:22px">
      <strong>Organigram</strong>
      <p class="form-hint" style="margin-bottom:10px">Management (President · Vice-President · Treasurer) leads the board. The Advisory Board is an <strong>alumni extension</strong> of the board - AB members are not board members. The alumni network holds the alumni coordinator &amp; previous board members. App permissions stay: superadmin → finance → board → advisory → alumnicoord → volunteer.</p>
      <div class="orgc">
        ${node("orgc-mgmt", "Management", names(mgmt) || "assign the President / Vice-President / Treasurer functions below", "daily lead & finances - the statutory management positions")}
        <div class="orgc-stem"></div>
        <div class="orgc-row">
          <div class="orgc-branch">
            ${node("", "Board", names(restBoard), "events, users, ESNcards, merch, meetings, shiftlists")}
            <div class="orgc-stem"></div>
            ${node("", "Volunteers", names(vols), "shiftlists, scanning & check-in, tasks")}
          </div>
          <div class="orgc-branch">
            ${node("orgc-dashed", "Advisory Board (AB)", names(ab), "alumni extension of the board - advice, meetings & minutes (read); led by the AB President")}
            <div class="orgc-stem orgc-stem-dashed"></div>
            ${node("orgc-dashed", "Alumni network", `${names(alumniTeam)}${alumniTeam.length ? " · " : ""}${alumniCount} alumn${alumniCount === 1 ? "us" : "i"}`, "alumni coordinator & previous board members - lifetime member prices")}
          </div>
        </div>
      </div>
    </div>`;

  $app.innerHTML = `
    <h2 class="section-title">Team</h2>
    ${adminTabs("team")}
    ${orgChart}
    <div class="form-card" style="max-width:760px">
      <p style="font-size:.86rem;margin-bottom:8px"><strong>Roles</strong></p>
      <ul style="font-size:.84rem;color:var(--muted);margin:0 0 0 18px">
        <li>${ROLE_LABELS.superadmin}</li>
        <li>${ROLE_LABELS.board}</li>
        <li>${ROLE_LABELS.finance}</li>
        <li>${ROLE_LABELS.volunteer}</li>
        <li>${ROLE_LABELS.advisory}</li>
        <li>${ROLE_LABELS.alumnicoord}</li>
      </ul>
      <p class="form-hint" style="margin-top:8px">The <strong>function</strong> (President, Treasurer, …) is a label shown in the team list and board-meeting exports - pick one from the list or type your own.</p>
    </div>
    <datalist id="board-functions">${BOARD_FUNCTIONS.map((f) => `<option value="${esc(f)}"></option>`).join("")}</datalist>
    <div class="table-wrap cards"><table>
      <thead><tr><th>Member</th><th>Role</th><th>Function</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>

    <h3 class="section-title sm">Add a team member</h3>
    <div class="form-card">
      <p class="form-hint" style="margin-bottom:10px">Type their name or e-mail - the person must have signed in to the app at least once.</p>
      <div class="form-field" style="max-width:360px;margin:0 0 6px">
        <input id="t-search" type="search" placeholder="Search by name or e-mail…" autocomplete="off" />
      </div>
      <div id="t-results" style="max-width:360px"></div>
      <div class="form-actions" style="margin:10px 0 0">
        <select id="t-add-role" style="padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-family:inherit">
          <option value="volunteer">volunteer</option>
          <option value="board">board</option>
          <option value="finance">finance</option>
          <option value="advisory">advisory</option>
          <option value="alumnicoord">alumnicoord</option>
          <option value="superadmin">superadmin</option>
        </select>
        <button class="btn btn-green" id="t-add" disabled>Add</button>
      </div>
    </div>
  `;

  // Prefix search over users (email + displayName) - a handful of reads
  // instead of downloading the whole collection.
  let pickedUser = null;
  const tSearch = document.getElementById("t-search");
  const tResults = document.getElementById("t-results");
  let tTimer = null;
  tSearch.addEventListener("input", () => {
    clearTimeout(tTimer);
    pickedUser = null;
    document.getElementById("t-add").disabled = true;
    const qraw = tSearch.value.trim();
    if (qraw.length < 2 || qraw.includes(" · ")) { tResults.innerHTML = ""; return; }
    tTimer = setTimeout(async () => {
      const variants = [...new Set([qraw, qraw.toLowerCase(), qraw[0].toUpperCase() + qraw.slice(1).toLowerCase()])];
      try {
        const snaps = await Promise.all(variants.flatMap((v) => [
          getDocs(query(collection(db, "users"), where("email", ">=", v.toLowerCase()), where("email", "<=", v.toLowerCase() + "\uf8ff"), limit(6))),
          getDocs(query(collection(db, "users"), where("displayName", ">=", v), where("displayName", "<=", v + "\uf8ff"), limit(6))),
        ]));
        const seen = new Set();
        const hits = snaps.flatMap((s) => s.docs).map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => !seen.has(u.id) && seen.add(u.id))
          .filter((u) => !team.some((t) => t.id === u.id))
          .slice(0, 8);
        tResults.innerHTML = hits.length
          ? `<div class="geo-results">${hits.map((u, i) => `<button type="button" class="geo-hit" data-i="${i}">${mi("person", "sm")}<span><strong>${esc(u.displayName || "-")}</strong><br><small>${esc(u.email || "")}</small></span></button>`).join("")}</div>`
          : `<p class="form-hint">No matching account - they need to sign in to the app once first.</p>`;
        tResults.querySelectorAll(".geo-hit").forEach((b) => {
          b.onclick = () => {
            pickedUser = hits[+b.dataset.i];
            tSearch.value = `${pickedUser.displayName || ""} · ${pickedUser.email || ""}`;
            tResults.innerHTML = "";
            document.getElementById("t-add").disabled = false;
          };
        });
      } catch (err) { tResults.innerHTML = `<p class="form-hint">${esc(err.message)}</p>`; }
    }, 350);
  });

  $app.querySelectorAll(".t-save").forEach((btn) => {
    btn.onclick = async () => {
      const uid = btn.dataset.uid;
      const role = $app.querySelector(`.t-role[data-uid="${uid}"]`).value;
      const boardFunction = $app.querySelector(`.t-func[data-uid="${uid}"]`).value.trim();
      btn.disabled = true;
      try {
        const u = userById[uid] || {};
        await setDoc(doc(db, "admins", uid), {
          role, boardFunction, email: u.email || "", name: u.displayName || "", updatedAt: serverTimestamp(),
        });
        const t = team.find((tt) => tt.id === uid);
        if (t && (t.role !== role || (t.boardFunction || "") !== boardFunction)) {
          logUserHistory(uid, "board", { action: "updated", role, boardFunction: boardFunction || null });
          t.role = role; t.boardFunction = boardFunction;
        }
        toast("Member updated", "success");
      } catch (err) { toast("Failed: " + err.message, "error"); }
      btn.disabled = false;
    };
  });
  $app.querySelectorAll(".t-remove").forEach((btn) => {
    btn.onclick = async () => {
      const u = userById[btn.dataset.uid];
      if (!await appConfirm(`Remove ${u?.displayName || "this member"} from the team? They keep their normal user account.`)) return;
      try {
        const t = team.find((tt) => tt.id === btn.dataset.uid);
        await deleteDoc(doc(db, "admins", btn.dataset.uid));
        logUserHistory(btn.dataset.uid, "board", { action: "removed", role: t?.role || null, boardFunction: t?.boardFunction || null });
        toast("Removed from team", "success");
        viewAdminTeam();
      } catch (err) { toast("Failed: " + err.message, "error"); }
    };
  });
  document.getElementById("t-add").onclick = async (e) => {
    if (!pickedUser) { toast("Search and pick a person first.", "warn"); return; }
    const role = document.getElementById("t-add-role").value;
    e.target.disabled = true;
    try {
      await setDoc(doc(db, "admins", pickedUser.id), {
        role, email: pickedUser.email || "", name: pickedUser.displayName || "", addedAt: serverTimestamp(),
      });
      logUserHistory(pickedUser.id, "board", { action: "added", role });
      toast(`${pickedUser.displayName || "Member"} added as ${role}`, "success");
      viewAdminTeam();
    } catch (err) {
      toast("Failed: " + err.message, "error");
      e.target.disabled = false;
    }
  };

  // Push setup & beta reset moved to Admin → Settings (v0.84).
}

async function viewAdminMerch(yearSel = ayStartYear()) {
  setLoading();
  let products, orders;
  const shopYr = ayRange(yearSel);
  try {
    [products, orders] = await Promise.all([
      getDocs(collection(db, "products")).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      // Orders of the selected academic year only (year picker = archive)
      getDocs(query(collection(db, "merchOrders"),
        where("createdAt", ">=", shopYr.from), where("createdAt", "<", shopYr.to)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    ]);
  } catch (e) { $app.innerHTML = errorState(e.message); return; }

  products.sort((a, b) => (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0));
  orders.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
  const orderFilter = { q: "", chip: "open" }; // open | done | all

  const productRows = products.map((p) => {
    const variants = merchVariants(p);
    return `
    <tr>
      <td><strong>${esc(p.name)}</strong>${variants ? `<br><small class="form-hint">${variants.map((v) => esc(v.name)).join(" · ")}</small>` : ""}</td>
      <td>${variants
        ? `from ${fmtMoney(Math.min(...variants.map((v) => (v.price != null ? v.price : p.price || 0))), p.currency)}`
        : fmtMoney(p.price || 0, p.currency)}</td>
      <td><span class="badge badge-${p.published ? "published" : "draft"}">${p.published ? "published" : "draft"}</span></td>
      <td><a class="btn btn-sm btn-orange" href="/admin/merch-edit-${p.id}">Edit</a></td>
    </tr>`;
  }).join("");

  $app.innerHTML = `
    <h2 class="section-title">Merch</h2>
    ${adminTabs("merch")}
    <div id="m-stats"></div>
    <div class="form-actions" style="margin:0 0 14px">
      <a href="/admin/merch-new" class="btn btn-green">+ New product</a>
    </div>
    ${products.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Product</th><th>Price</th><th>Status</th><th></th></tr></thead>
        <tbody>${productRows}</tbody>
      </table></div>`
    : `<div class="empty-state"><p>No products yet.</p></div>`}

    <h3 class="section-title sm">Orders</h3>
    <p class="form-hint" style="margin:-8px 0 12px">Flow: <strong>reserved</strong> → Mark paid when they pay at pickup (online payments arrive as paid automatically) → <strong>Picked up ✓</strong>. Scanning a pickup QR does this for you.</p>
    <div class="filter-bar">
      <input id="m-q" type="search" placeholder="Search buyer, email or product…" />
      ${yearPickerHtml("m-year", yearSel)}
      <div class="filter-chips" id="m-chips"></div>
    </div>
    <div id="m-orders"></div>
  `;

  const renderStats = () => {
    const openOrders = orders.filter((o) => !o.pickedUpAt).length;
    const revenue = orders.filter((o) => o.status === "paid").reduce((s, o) => s + (o.amountTotal || 0), 0);
    document.getElementById("m-stats").innerHTML = `
      <div class="stat-row">
        <div class="stat-card" style="--accent:#00AEEF"><div class="num">${products.filter((p) => p.published).length}</div><div class="lbl">Products live</div></div>
        <div class="stat-card" style="--accent:#F47B20"><div class="num">${openOrders}</div><div class="lbl">Open orders</div></div>
        <div class="stat-card" style="--accent:#EC008C"><div class="num">${fmtMoney(revenue)}</div><div class="lbl">Paid revenue</div></div>
      </div>`;
  };

  const orderMatches = (o) => {
    if (orderFilter.chip === "open" && o.pickedUpAt) return false;
    if (orderFilter.chip === "done" && !o.pickedUpAt) return false;
    const q = orderFilter.q.trim().toLowerCase();
    if (!q) return true;
    return `${o.name || ""} ${o.email || ""} ${o.productName || ""} ${o.variantName || ""}`.toLowerCase().includes(q);
  };

  const renderOrders = () => {
    const open = orders.filter((o) => !o.pickedUpAt).length;
    const chipsEl = document.getElementById("m-chips");
    chipsEl.innerHTML = [
      ["open", `Open (${open})`], ["done", `Picked up (${orders.length - open})`], ["all", `All (${orders.length})`],
    ].map(([k, label]) => `<button class="chip ${orderFilter.chip === k ? "active" : ""}" data-chip="${k}">${label}</button>`).join("");
    chipsEl.querySelectorAll(".chip").forEach((btn) => {
      btn.onclick = () => { orderFilter.chip = btn.dataset.chip; renderOrders(); };
    });

    const list = orders.filter(orderMatches);
    const box = document.getElementById("m-orders");
    box.innerHTML = list.length ? `
      <div class="table-wrap cards"><table>
        <thead><tr><th>Buyer</th><th>Item</th><th>Qty</th><th>Amount</th><th>Status</th><th>Date</th><th></th></tr></thead>
        <tbody>${list.map((o) => `
          <tr>
            <td class="card-main"><strong>${esc(o.name || "-")}</strong><br><small class="form-hint">${esc(o.email || "")}</small></td>
            <td data-l="Item">${esc(o.productName || "-")}${o.variantName ? `<br><small class="form-hint">${esc(o.variantName)}</small>` : ""}</td>
            <td data-l="Qty">${o.quantity || 1}</td>
            <td data-l="Amount">${fmtMoney(o.amountTotal, o.currency)}</td>
            <td data-l="Status">${o.pickedUpAt ? `<span class="badge badge-paid">picked up</span>`
              : o.status === "paid" ? `<span class="badge badge-paid">paid</span>`
              : `<span class="badge badge-requested">${esc(o.status)}</span>`}</td>
            <td data-l="Date">${o.createdAt ? fmtDate(o.createdAt) : "-"}</td>
            <td style="white-space:nowrap" class="card-actions">
              ${o.status === "requested" ? `<button class="btn btn-sm btn-green m-order-paid" data-oid="${o.id}">Mark paid</button>` : ""}
              ${o.status === "paid" && !o.pickedUpAt ? `<button class="btn btn-sm btn-dark m-order-pickup" data-oid="${o.id}">Picked up ✓</button>` : ""}
              <button class="btn btn-sm btn-ghost m-order-del btn-danger" data-oid="${o.id}" title="Remove order" aria-label="Remove order">✕</button>
            </td>
          </tr>`).join("")}</tbody>
      </table></div>`
    : `<div class="empty-state"><p>${orders.length ? "No orders match." : "No orders yet."}</p></div>`;

    box.querySelectorAll(".m-order-paid").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await updateDoc(doc(db, "merchOrders", btn.dataset.oid), { status: "paid", paidAt: serverTimestamp() });
          const o = orders.find((x) => x.id === btn.dataset.oid);
          if (o) o.status = "paid";
          toast("Marked paid", "success");
          renderOrders(); renderStats();
        } catch (err) { toast(err.message, "error"); }
      };
    });
    box.querySelectorAll(".m-order-pickup").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await updateDoc(doc(db, "merchOrders", btn.dataset.oid), { pickedUpAt: serverTimestamp() });
          const o = orders.find((x) => x.id === btn.dataset.oid);
          if (o) o.pickedUpAt = Timestamp.now();
          toast("Marked picked up", "success");
          renderOrders(); renderStats();
        } catch (err) { toast(err.message, "error"); }
      };
    });
    box.querySelectorAll(".m-order-del").forEach((btn) => {
      btn.onclick = async () => {
        if (!await appConfirm("Remove this order? This cannot be undone.")) return;
        try {
          await deleteDoc(doc(db, "merchOrders", btn.dataset.oid));
          const i = orders.findIndex((x) => x.id === btn.dataset.oid);
          if (i >= 0) orders.splice(i, 1);
          toast("Order removed", "success");
          renderOrders(); renderStats();
        } catch (err) { toast(err.message, "error"); }
      };
    });
  };

  renderStats();
  renderOrders();
  document.getElementById("m-q").addEventListener("input", (e) => { orderFilter.q = e.target.value; renderOrders(); });
  document.getElementById("m-year")?.addEventListener("change", (e) => viewAdminMerch(parseInt(e.target.value, 10)));
}

async function viewAdminMerchForm(productId) {
  setLoading();
  let p = null;
  if (productId) {
    try {
      const snap = await getDoc(doc(db, "products", productId));
      if (snap.exists()) p = { id: snap.id, ...snap.data() };
    } catch { /* fallthrough */ }
    if (!p) { $app.innerHTML = `<div class="empty-state"><p>Product not found.</p></div>`; return; }
  }

  $app.innerHTML = `
    <h2 class="section-title">${p ? "Edit product" : "New product"}</h2>
    ${adminTabs("merch")}
    <form class="form-card" id="product-form">
      <div class="form-grid">
        <div class="form-field full">
          <label for="m-name">Name *</label>
          <input id="m-name" required maxlength="100" value="${esc(p?.name || "")}" />
        </div>
        <div class="form-field full">
          <label for="m-desc">Description</label>
          <textarea id="m-desc" rows="4">${esc(p?.description || "")}</textarea>
          <span class="form-hint">Same formatting as events: **bold**, *italic*, [link](https://...), "- " bullets.</span>
        </div>
        <div class="form-field">
          <label for="m-price">Price in € *</label>
          <input id="m-price" type="number" min="0" step="0.01" value="${p ? ((p.price || 0) / 100).toFixed(2) : ""}" />
        </div>
        <div class="form-field">
          <label for="m-price-esn">ESNcard price in € (optional)</label>
          <input id="m-price-esn" type="number" min="0" step="0.01" value="${p?.priceEsn != null ? (p.priceEsn / 100).toFixed(2) : ""}" />
        </div>
        <div class="form-field full">
          <label>Variants (optional - e.g. sizes S / M / L)</label>
          <div id="m-variants"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="m-add-variant" style="align-self:flex-start">+ Add variant</button>
          <span class="form-hint">Leave a variant's price empty to use the product price. Stock is enforced once online payments are live.</span>
        </div>
        <div class="form-field full">
          <label for="m-image-file">Photo (optional)</label>
          <div class="img-upload-row">
            <img id="m-image-preview" class="img-preview ${p?.image ? "" : "hidden"}" src="${esc(p?.image || "")}" alt="" />
            <input id="m-image-file" type="file" accept="image/*" />
            <button type="button" id="m-image-remove" class="btn btn-ghost btn-sm btn-danger ${p?.image ? "" : "hidden"}">Remove photo</button>
          </div>
        </div>
        <div class="form-field">
          <label>Visibility</label>
          <div class="checkbox-row">
            <input id="m-published" type="checkbox" ${p?.published ? "checked" : ""} />
            <label for="m-published">Published (visible in the shop)</label>
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-green">${p ? "Save changes" : "Create product"}</button>
        <a href="/admin/merch" class="btn btn-ghost btn-danger">Cancel</a>
        ${p ? `<button type="button" id="m-delete" class="btn btn-ghost btn-danger" style="margin-left:auto;color:var(--esn-magenta);border-color:var(--esn-magenta)">Delete product</button>` : ""}
      </div>
    </form>
  `;

  const variantsState = (p?.variants || []).map((v) => ({ ...v }));
  const collectVariants = () => {
    document.querySelectorAll("#m-variants .option-row").forEach((row) => {
      const i = +row.dataset.i;
      const priceVal = row.querySelector(".opt-price").value;
      const esnVal = row.querySelector(".opt-price-esn").value;
      const stockVal = parseInt(row.querySelector(".opt-cap").value, 10);
      variantsState[i] = {
        id: variantsState[i]?.id || (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : String(Math.random()).slice(2, 10)),
        name: row.querySelector(".opt-name").value.trim(),
        price: priceVal === "" ? null : Math.round((parseFloat(priceVal) || 0) * 100),
        priceEsn: esnVal === "" ? null : Math.round((parseFloat(esnVal) || 0) * 100),
        stock: Number.isFinite(stockVal) && stockVal > 0 ? stockVal : null,
      };
    });
  };
  const renderVariantRows = () => {
    document.getElementById("m-variants").innerHTML =
      (variantsState.length ? `<div class="option-head"><span>Name</span><span>Price €</span><span>ESNcard €</span><span>Stock</span><span></span></div>` : "") +
      variantsState.map((v, i) => `
      <div class="option-row" data-i="${i}">
        <input class="opt-name" placeholder="Name (e.g. Size M)" maxlength="60" value="${esc(v.name || "")}" />
        <input class="opt-price" type="number" min="0" step="0.01" placeholder="€" title="Price (blank = product price)" value="${v.price != null ? (v.price / 100).toFixed(2) : ""}" />
        <input class="opt-price-esn" type="number" min="0" step="0.01" placeholder="Member €" title="ESNcard price" value="${v.priceEsn != null ? (v.priceEsn / 100).toFixed(2) : ""}" />
        <input class="opt-cap" type="number" min="1" placeholder="stock" title="Stock" value="${v.stock || ""}" />
        <button type="button" class="btn btn-sm btn-ghost opt-del btn-danger" title="Remove">✕</button>
      </div>`).join("");
    document.querySelectorAll("#m-variants .opt-del").forEach((b) => {
      b.onclick = () => {
        collectVariants();
        variantsState.splice(+b.closest(".option-row").dataset.i, 1);
        renderVariantRows();
      };
    });
  };
  renderVariantRows();
  document.getElementById("m-add-variant").onclick = () => {
    collectVariants();
    variantsState.push({ name: "", price: null, priceEsn: null, stock: null });
    renderVariantRows();
  };

  let imageData = p?.image || null;
  const mPreview = document.getElementById("m-image-preview");
  const mRemove = document.getElementById("m-image-remove");
  document.getElementById("m-image-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      imageData = await compressCardImage(file);
      mPreview.src = imageData;
      mPreview.classList.remove("hidden");
      mRemove.classList.remove("hidden");
    } catch (err) {
      toast(err.message, "error");
      e.target.value = "";
    }
  });
  mRemove.addEventListener("click", () => {
    imageData = null;
    mPreview.classList.add("hidden");
    mRemove.classList.add("hidden");
    document.getElementById("m-image-file").value = "";
  });

  document.getElementById("product-form").onsubmit = async (e) => {
    e.preventDefault();
    collectVariants();
    const priceEur = parseFloat(document.getElementById("m-price").value);
    const esnVal = document.getElementById("m-price-esn").value;
    const data = {
      name: document.getElementById("m-name").value.trim(),
      description: document.getElementById("m-desc").value.trim(),
      price: Number.isFinite(priceEur) && priceEur >= 0 ? Math.round(priceEur * 100) : 0,
      priceEsn: esnVal === "" ? null : Math.round((parseFloat(esnVal) || 0) * 100),
      variants: (() => { const vs = variantsState.filter((v) => v.name); return vs.length ? vs : null; })(),
      image: imageData,
      currency: "eur",
      published: document.getElementById("m-published").checked,
      updatedAt: serverTimestamp(),
    };
    if (!data.name) { toast("Give the product a name.", "error"); return; }
    try {
      data.image = await storeImage(imageData, "products");
      if (p?.image && p.image !== data.image) deleteStoredImage(p.image);
      if (p) {
        await updateDoc(doc(db, "products", p.id), data);
        toast("Product updated", "success");
      } else {
        const ref = await addDoc(collection(db, "products"), { ...data, createdAt: serverTimestamp() });
        logAudit("created", "merch item", data.name, ref.id);
        toast("Product created", "success");
      }
      navigate("/admin/merch");
    } catch (err) {
      toast("Save failed: " + err.message, "error");
    }
  };

  document.getElementById("m-delete")?.addEventListener("click", async () => {
    if (!await appConfirm(`Delete “${p.name}”? Existing orders are kept.`)) return;
    try {
      await deleteDoc(doc(db, "products", p.id));
      logAudit("deleted", "merch item", p.name, p.id);
      deleteStoredImage(p.image);
      toast("Product deleted", "success");
      navigate("/admin/merch");
    } catch (err) { toast(err.message, "error"); }
  });
}

// ---- Interactive nationality map (board-only, on the Users tab) ----
const extScripts = {};
function loadScript(src) {
  if (!extScripts[src]) {
    extScripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(s);
    });
  }
  return extScripts[src];
}

// world-atlas country names → our nationality list where they differ
const MAP_ALIASES = {
  "United States of America": "United States",
  "Dem. Rep. Congo": "Congo (DRC)",
  "Congo": "Congo (Republic)",
  "Côte d'Ivoire": "Ivory Coast",
  "Bosnia and Herz.": "Bosnia and Herzegovina",
  "Central African Rep.": "Central African Republic",
  "Dominican Rep.": "Dominican Republic",
  "Eq. Guinea": "Equatorial Guinea",
  "S. Sudan": "South Sudan",
  "Solomon Is.": "Solomon Islands",
  "Macedonia": "North Macedonia",
  "Swaziland": "Eswatini",
  "eSwatini": "Eswatini",
  "Marshall Is.": "Marshall Islands",
  "St. Kitts and Nevis": "Saint Kitts and Nevis",
  "St. Vin. and Gren.": "Saint Vincent and the Grenadines",
  "São Tomé and Principe": "Sao Tome and Principe",
  "Vatican": "Vatican City",
  "Czech Republic": "Czechia",
};

async function renderNationalityMap(users, onSelect) {
  const el = document.getElementById("nat-map");
  if (!el) return;
  const counts = {};
  users.forEach((u) => { if (u.nationality) counts[u.nationality] = (counts[u.nationality] || 0) + 1; });
  if (!Object.keys(counts).length) {
    el.innerHTML = `<p class="form-hint">The map fills up as members set their nationality on their profile.</p>`;
    return;
  }
  try {
    await loadScript("https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js");
    await loadScript("https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js");
    const world = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json").then((r) => r.json());
    const countries = window.topojson.feature(world, world.objects.countries).features;
    const nameFor = (f) => MAP_ALIASES[f.properties.name] || f.properties.name;

    const max = Math.max(...Object.values(counts));
    // Sequential single hue (magnitude): light → dark ESN blue
    const color = window.d3.scaleSqrt().domain([0, max]).range(["#e4f2fc", "#0b5c93"]);

    const width = el.clientWidth || 760;
    const height = Math.round(width * 0.52);
    const svg = window.d3.select(el).html("").append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr("aria-label", "World map of member nationalities");
    const proj = window.d3.geoNaturalEarth1().fitSize([width, height], { type: "Sphere" });
    const path = window.d3.geoPath(proj);
    svg.append("path").attr("d", path({ type: "Sphere" })).attr("fill", "#f6f9fd");

    const tip = document.getElementById("map-tip");
    const card = document.getElementById("nat-map-card");
    svg.selectAll("path.country").data(countries).join("path")
      .attr("class", "country")
      .attr("d", path)
      .attr("fill", (d) => (counts[nameFor(d)] ? color(counts[nameFor(d)]) : "#eceef5"))
      .style("cursor", (d) => (counts[nameFor(d)] ? "pointer" : "default"))
      .on("mousemove", (ev, d) => {
        const name = nameFor(d);
        const n = counts[name] || 0;
        tip.textContent = `${name}: ${n} member${n === 1 ? "" : "s"}`;
        tip.classList.remove("hidden");
        const rect = card.getBoundingClientRect();
        tip.style.left = `${ev.clientX - rect.left + 14}px`;
        tip.style.top = `${ev.clientY - rect.top - 8}px`;
      })
      .on("mouseleave", () => tip.classList.add("hidden"))
      .on("click", (ev, d) => {
        const name = nameFor(d);
        if (counts[name]) onSelect(name);
      });

    document.getElementById("map-legend").innerHTML = `
      <span>0</span>
      <span class="map-grad" style="background:linear-gradient(90deg,#e4f2fc,#0b5c93)"></span>
      <span>${max}</span>`;

    const matched = new Set(countries.map(nameFor));
    const unmatched = Object.keys(counts).filter((n) => !matched.has(n));
    document.getElementById("map-extra").textContent = unmatched.length
      ? "Not on the map: " + unmatched.map((n) => `${n} (${counts[n]})`).join(", ")
      : "";
  } catch (e) {
    el.innerHTML = `<p class="form-hint">Map could not load: ${esc(e.message)}</p>`;
  }
}

// ------------------------------------------------------------
// Member stats - the demographics moved OUT of the pipeline tab:
// world map, cards per university, cards per country.
// ------------------------------------------------------------
async function viewAdminMembers(yearSel = ayStartYear()) {
  setLoading();
  const yr = ayRange(yearSel);
  let users, applications;
  try {
    // Scoped to ONE academic year: users active in it, applications made
    // in it. Past years stay reachable through the year picker (archive).
    [users, applications] = await Promise.all([
      getDocs(query(collection(db, "users"),
        where("lastLogin", ">=", yr.from), where("lastLogin", "<", yr.to)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      getDocs(query(collection(db, "esncardApplications"),
        where("createdAt", ">=", yr.from), where("createdAt", "<", yr.to)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    ]);
  } catch (e) { $app.innerHTML = errorState(e.message); return; }

  const activeCards = applications.filter((a) => a.status === "active");
  const pickedUp = activeCards.filter((a) => a.pickedUpAt).length;
  const openApps = applications.filter((a) => a.status === "applied" || a.status === "paid").length;
  const last7 = applications.filter((a) => { const d = toDate(a.createdAt); return d && Date.now() - d.getTime() < 7 * 24 * 3600 * 1000; }).length;
  const countBy = (list, keyFn) => {
    const m = {};
    list.forEach((x) => { const k = (keyFn(x) || "").trim(); if (k) m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const byUni = countBy(activeCards, (a) => a.hostInstitution);
  const byCountry = countBy(activeCards, (a) => a.nationality);
  const natCounts = countBy(users, (u) => u.nationality);

  const countTable = (rows, colName, total) => {
    if (!rows.length) return `<p class="form-hint">No active cards yet - this fills up as cards are assigned.</p>`;
    const rowHtml = ([name, n]) => `
        <tr><td>${esc(name)}</td><td style="text-align:right"><strong>${n}</strong></td>
        <td><div style="height:10px;border-radius:5px;background:var(--esn-cyan);width:${Math.max(3, Math.round((n / rows[0][1]) * 100))}%"></div></td></tr>`;
    const TOP = 12;
    return `
    <div class="table-wrap"><table>
      <thead><tr><th>${colName}</th><th style="text-align:right">Cards</th><th style="width:45%"></th></tr></thead>
      <tbody>${rows.slice(0, TOP).map(rowHtml).join("")}</tbody>
    </table></div>
    ${rows.length > TOP ? `
    <details style="margin-top:6px"><summary class="form-hint" style="cursor:pointer">Show the other ${rows.length - TOP}</summary>
      <div class="table-wrap" style="margin-top:6px"><table><tbody>${rows.slice(TOP).map(rowHtml).join("")}</tbody></table></div>
    </details>` : ""}
    <p class="form-hint" style="margin-top:6px">${total} active card${total === 1 ? "" : "s"} in total.</p>`;
  };

  $app.innerHTML = `
    <h2 class="section-title">Insights</h2>
    ${adminTabs("members")}
    ${insightsSubnav("members")}
    <div class="form-actions" style="margin:0 0 14px;align-items:center">
      <span class="form-hint">Academic year:</span> ${yearPickerHtml("mem-year", yearSel)}
    </div>
    <div class="stat-row">
      <div class="stat-card" style="--accent:#00AEEF"><div class="num">${users.length}</div><div class="lbl">Active users</div></div>
      <div class="stat-card" style="--accent:#2E3192"><div class="num">${applications.length}</div><div class="lbl">Applications</div></div>
      <div class="stat-card" style="--accent:#F47B20"><div class="num">${openApps}</div><div class="lbl">Open applications</div></div>
      <div class="stat-card" style="--accent:#EC008C"><div class="num">${last7}</div><div class="lbl">Applied last 7 days</div></div>
      <div class="stat-card" style="--accent:#7AC143"><div class="num">${activeCards.length}</div><div class="lbl">Active ESNcards</div></div>
      <div class="stat-card" style="--accent:#F47B20"><div class="num">${activeCards.length - pickedUp}</div><div class="lbl">Awaiting pickup</div></div>
      <div class="stat-card" style="--accent:#9a9cb5"><div class="num">${natCounts.length}</div><div class="lbl">Nationalities</div></div>
    </div>

    <details class="form-card apps-overview" open style="margin:0 0 22px">
      <summary><strong>${mi("donut_small", "sm")} ESNcard applications</strong> <span class="form-hint">- who is applying in ${ayLabel(yearSel)} (${applications.length} application${applications.length === 1 ? "" : "s"}) · handle them under <a href="/admin/users">Users → ESNcard</a></span></summary>
      <div class="donut-grid">${applicationDonutsHtml(applications)}</div>
    </details>
    ${natCounts.length ? `<p class="form-hint" style="margin:-8px 0 18px">Top nationalities (users active in ${ayLabel(yearSel)}): ${natCounts.slice(0, 5).map(([n, c]) => `${esc(n)} (${c})`).join(" · ")}</p>` : ""}

    <div class="form-card" id="nat-map-card" style="position:relative;margin-bottom:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <strong>Where our members come from</strong>
        <span class="form-hint">Hover for counts · click a country to list its members</span>
      </div>
      <div id="nat-map" style="margin-top:10px"></div>
      <div class="map-legend" id="map-legend"></div>
      <p class="form-hint" id="map-extra" style="margin-top:6px"></p>
      <div id="map-tip" class="map-tip hidden"></div>
    </div>
    <div id="country-members"></div>

    <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;align-items:start">
      <div>
        <h3 class="section-title sm">Cards per university</h3>
        ${countTable(byUni, "Institution in Ghent", activeCards.length)}
      </div>
      <div>
        <h3 class="section-title sm">Cards per country</h3>
        ${countTable(byCountry, "Nationality", activeCards.length)}
      </div>
    </div>
    <p class="form-hint" style="margin-top:14px">Counts come from <strong>active</strong> ESNcards (assigned card numbers). The pipeline itself lives under <a href="/admin/users">Users → ESNcard</a>.</p>
  `;

  renderNationalityMap(users, (name) => {
    const box = document.getElementById("country-members");
    const list = users.filter((u) => u.nationality === name)
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
    box.innerHTML = `
      <div class="form-card" style="margin-bottom:22px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <strong>${esc(name)} - ${list.length} member${list.length === 1 ? "" : "s"}</strong>
          <button class="btn btn-sm btn-ghost btn-danger" id="cm-close">✕ close</button>
        </div>
        <div class="table-wrap" style="margin-top:10px"><table>
          <thead><tr><th>Name</th><th>Email</th><th>ESNcard</th></tr></thead>
          <tbody>${list.map((u) => `
            <tr><td><a href="/admin/user-${u.id}">${esc(u.displayName || "-")}</a></td>
            <td>${esc(u.email || "-")}</td>
            <td>${u.esncardVerified ? `<span class="badge badge-paid">verified</span>` : "-"}</td></tr>`).join("")}</tbody>
        </table></div>
      </div>`;
    document.getElementById("cm-close").onclick = () => { box.innerHTML = ""; };
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("mem-year")?.addEventListener("change", (e) => viewAdminMembers(parseInt(e.target.value, 10)));
}

// ------------------------------------------------------------
// Academic years - the app's archive unit. A year runs 1 July → 30 June
// (July onwards belongs to the NEW year, so the summer changeover starts
// each board on a fresh, fast dataset). Old years stay fully readable
// through the year pickers - nothing is moved or deleted, queries are
// simply scoped, which is what keeps every list fast at 5+ years of data.
// ------------------------------------------------------------
const FIRST_ACADEMIC_YEAR = 2025; // the app went live in the 2025–26 year
function ayStartYear(d = new Date()) {
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; // July = month 6
}
function ayRange(startYear) {
  return { from: new Date(startYear, 6, 1), to: new Date(startYear + 1, 6, 1) };
}
function ayLabel(startYear) {
  return `${startYear}–${String(startYear + 1).slice(2)}`;
}
function academicYearStart() {
  return ayRange(ayStartYear()).from;
}
// <select> of academic years, newest first, for the archive pickers.
function yearPickerHtml(id, selected = ayStartYear(), extra = "") {
  const years = [];
  for (let y = ayStartYear(); y >= FIRST_ACADEMIC_YEAR; y--) years.push(y);
  return `<select id="${id}" class="inline-input year-picker" title="Academic year (July–June)">
    ${years.map((y) => `<option value="${y}" ${y === selected ? "selected" : ""}>${ayLabel(y)}${y === ayStartYear() ? " (current)" : ""}</option>`).join("")}
    ${extra}
  </select>`;
}

// Institution colour chips (v1.3.0) - the same colours the section uses on
// its website tags, matched on a keyword so renamed list entries still map.
const INSTITUTION_COLORS = [
  [/howest/i, "#5B2C8E", "#fff"],
  [/ghent university|ugent|universiteit gent/i, "#1E4FA3", "#fff"],
  [/odisee/i, "#A11C1C", "#fff"],
  [/artevelde/i, "#3B7A4E", "#fff"],
  [/hogent/i, "#3A3A3A", "#fff"],
  [/sint-?lucas/i, "#F5E6A3", "#3a3000"],
  [/luca/i, "#7A4A0B", "#fff"],
  [/ku ?leuven/i, "#2D5A6B", "#fff"],
];
function instChip(name, other) {
  const n = String(name || "").trim();
  if (!n) return `<span class="form-hint">-</span>`;
  const hit = INSTITUTION_COLORS.find(([re]) => re.test(n));
  const [bg, fg] = hit ? [hit[1], hit[2]] : ["#E0E2EA", "#2b2d42"];
  const label = /^other\b/i.test(n) && other ? `Other · ${other}` : n.replace(" University of Applied Sciences", "").replace(" (Ghent campus)", "");
  return `<span class="inst-chip" style="background:${bg};color:${fg}" title="${esc(n)}${other ? ` (${esc(other)})` : ""}">${esc(label)}</span>`;
}
function withOtherText(v, other) { return other ? `${v || "Other"} (${other})` : (v || ""); }

// Every field of an ESNcard submission as a definition grid (v1.3.0) -
// used by the work queue (Full submission) and the user page (history).
function applicationFieldsHtml(x) {
  const row = (k, v) => v ? `<div class="sub-row"><span class="sub-k">${k}</span><span class="sub-v">${v}</span></div>` : "";
  const price = x.price ?? cardPricing.student;
  return `<div class="sub-grid">
    ${row("Name", esc(`${x.firstName || ""} ${x.lastName || ""}`.trim()))}
    ${row("E-mail", x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : "")}
    ${row("Date of birth", esc(x.birthday || ""))}
    ${row("Nationality", esc(x.nationality || ""))}
    ${row("Phone", x.phone ? `<a href="tel:${esc(x.phone)}">${esc(x.phone)}</a>` : "")}
    ${row("Institution in Ghent", esc(withOtherText(x.hostInstitution, x.hostInstitutionOther)))}
    ${row("Type of stay", esc(withOtherText(x.stayType, x.stayTypeOther)))}
    ${row("Stay period", esc(stayPeriodText(x)))}
    ${row("Home university", esc([x.homeUniversity, x.homeCity, x.homeCountry].filter(Boolean).join(", ")))}
    ${row("Field of studies", esc(withOtherText(x.fieldOfStudies, x.fieldOfStudiesOther)))}
    ${row("Found ESN via", esc((x.discovery || []).map((d) => /^other\b/i.test(d) && x.discoveryOther ? `Other (${x.discoveryOther})` : d).join(", ")))}
    ${row("Event ideas", esc(x.ideas || ""))}
    ${row("Proof", x.hasProof === false ? "none attached" : x.hasProof ? "attached" : "")}
    ${row("Price", price === 0 ? "free (team)" : fmtMoney(price))}
    ${row("Payment", x.status === "applied" ? "not yet" : x.paidOnline ? `online${x.paidAt ? " · " + fmtDate(x.paidAt) : ""}` : x.paidAt ? `cash · ${fmtDate(x.paidAt)}` : "")}
    ${row("Applied", x.createdAt ? `${fmtDate(x.createdAt)} ${fmtTime(x.createdAt)}` : "")}
    ${row("Last edited", x.updatedAt && x.createdAt && toDate(x.updatedAt)?.getTime() !== toDate(x.createdAt)?.getTime() ? `${fmtDate(x.updatedAt)} ${fmtTime(x.updatedAt)}` : "")}
    ${row("Card", x.cardNumber ? `<code>${esc(x.cardNumber)}</code>${x.expiresAt ? ` · until ${fmtDate(x.expiresAt)}` : ""}` : "")}
    ${row("Picked up", x.pickedUpAt ? `${fmtDate(x.pickedUpAt)} ${fmtTime(x.pickedUpAt)}` : "")}
    ${row("Rejected", x.declineReason ? esc(x.declineReason) : "")}
  </div>`;
}

// Donut overview of a set of applications (v1.2.0, moved to Insights in v1.3.0).
function applicationDonutsHtml(applications) {
  if (!applications.length) return `<p class="form-hint">Charts appear with the first application.</p>`;
  const count = (fn) => {
    const m = new Map();
    for (const x of applications) { for (const k of [].concat(fn(x) ?? [])) { const key = String(k || "").trim() || "(blank)"; m.set(key, (m.get(key) || 0) + 1); } }
    return [...m.entries()].map(([label, value]) => ({ label, value }));
  };
  const STATUS_LABEL = { applied: "Unpaid", paid: "Paid, card to assign", active: "Card active", rejected: "Rejected" };
  const MONTHS_S = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLabel = (ym) => { const [y, m] = String(ym || "").split("-"); return m ? `${MONTHS_S[+m - 1]} ${y}` : "(blank)"; };
  return [
    donutChart("Status", count((x) => STATUS_LABEL[x.status] || x.status), { order: Object.values(STATUS_LABEL) }),
    donutChart("Institution in Ghent", count((x) => x.hostInstitution)),
    donutChart("Type of stay", count((x) => x.stayType)),
    donutChart("Nationality", count((x) => x.nationality)),
    donutChart("Arriving", count((x) => monthLabel(x.stayFrom)), { sortKey: true }),
    donutChart("Leaving", count((x) => x.stayUntilUnknown || !x.stayUntil ? "Not sure yet" : monthLabel(x.stayUntil)), { sortKey: true }),
    donutChart("How they found ESN", count((x) => x.discovery)),
    donutChart("Home country", count((x) => x.homeCountry)),
    donutChart("Paid how", count((x) => x.status === "applied" ? "Not yet" : x.status === "rejected" ? "Rejected" : x.paidOnline ? "Online" : x.price === 0 ? "Free (team)" : "Cash")),
  ].join("");
}

// Stay period as text: "Sep 2026 - Jan 2027" / "Sep 2026 - (not sure yet)".
function stayPeriodText(x) {
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const f = (ym) => { const [y, m] = String(ym || "").split("-"); return m ? `${M[+m - 1]} ${y}` : ""; };
  if (!x.stayFrom) return "";
  return `${f(x.stayFrom)} - ${x.stayUntilUnknown || !x.stayUntil ? "(not sure yet)" : f(x.stayUntil)}`;
}

// Donut chart (v1.2.0) - plain SVG, no library. Max 5 named slices, the
// tail folds into "Other"; legend doubles as the table (count + share).
// Palette validated for colour-vision deficiency on light AND dark surfaces.
const DONUT_COLORS = ["#0A9BD8", "#D6007F", "#55A028", "#6B6FD9", "#E06A10"];
const DONUT_OTHER = "#9AA0B8";
function donutChart(title, rows, opts = {}) {
  const total = rows.reduce((n, r) => n + r.value, 0);
  if (!total) return `<div class="donut"><h4>${esc(title)}</h4><p class="form-hint">No data yet.</p></div>`;
  let data = rows.filter((r) => r.value > 0);
  if (opts.order) data.sort((a, b) => opts.order.indexOf(a.label) - opts.order.indexOf(b.label));
  else if (opts.sortKey) data.sort((a, b) => { const p = (l) => { const [m, y] = l.split(" "); const i = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(m); return i < 0 ? 9e9 : (+y) * 12 + i; }; return p(a.label) - p(b.label); });
  else data.sort((a, b) => b.value - a.value);
  if (data.length > 6) {
    const head = data.slice(0, 5);
    const tail = data.slice(5).reduce((n, r) => n + r.value, 0);
    data = [...head, { label: `Other (${data.length - 5})`, value: tail, other: true }];
  }
  const R = 42, C = 2 * Math.PI * R, GAP = 2;
  let offset = 0;
  const arcs = data.map((r, i) => {
    const len = (r.value / total) * C;
    const color = r.other ? DONUT_OTHER : DONUT_COLORS[i % DONUT_COLORS.length];
    const seg = `<circle r="${R}" cx="50" cy="50" fill="none" stroke="${color}" stroke-width="14"
      stroke-dasharray="${Math.max(0, len - GAP).toFixed(2)} ${(C - Math.max(0, len - GAP)).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"
      transform="rotate(-90 50 50)"><title>${esc(r.label)}: ${r.value} (${Math.round((r.value / total) * 100)}%)</title></circle>`;
    offset += len;
    return seg;
  }).join("");
  const legend = data.map((r, i) => `
    <li><span class="sw" style="background:${r.other ? DONUT_OTHER : DONUT_COLORS[i % DONUT_COLORS.length]}"></span>
      <span class="lb">${esc(r.label)}</span><span class="ct">${r.value}</span><span class="pc">${Math.round((r.value / total) * 100)}%</span></li>`).join("");
  return `<div class="donut">
    <h4>${esc(title)}</h4>
    <div class="donut-body">
      <svg viewBox="0 0 100 100" role="img" aria-label="${esc(title)}: ${data.map((r) => `${r.label} ${r.value}`).join(", ")}">
        <circle r="${R}" cx="50" cy="50" fill="none" stroke="var(--border)" stroke-width="14" />
        ${arcs}
        <text x="50" y="47" text-anchor="middle" class="donut-num">${total}</text>
        <text x="50" y="60" text-anchor="middle" class="donut-cap">total</text>
      </svg>
      <ul class="donut-legend">${legend}</ul>
    </div>
  </div>`;
}

async function viewAdminUsers(yearSel = ayStartYear(), allUsers = false, tab = "esncard") {
  setLoading();
  const yr = ayRange(yearSel);
  let users, applications, team;
  try {
    [users, applications, team] = await Promise.all([
      // Users: by default only accounts ACTIVE this academic year - the
      // full list (every account ever) loads on demand only.
      getDocs(allUsers
        ? collection(db, "users")
        : query(collection(db, "users"), where("lastLogin", ">=", academicYearStart())))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      // Applications: the selected academic year (July–June) - the year
      // picker is the archive.
      getDocs(query(collection(db, "esncardApplications"),
        where("createdAt", ">=", yr.from), where("createdAt", "<", yr.to)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      // Team roles (v1.3.0): board / volunteers / AB get a flag in the user list.
      getDocs(collection(db, "admins")).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []),
    ]);
  } catch (e) { $app.innerHTML = errorState(e.message); return; }

  users.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  applications.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
  const roleByUid = Object.fromEntries(team.map((t) => [t.id, { role: t.role || "superadmin", fn: t.boardFunction || "" }]));
  users.forEach((u) => { u._role = roleByUid[u.id]?.role || ""; u._fn = roleByUid[u.id]?.fn || ""; });

  const PAGE = 100;
  let usersShown = PAGE;
  let appsShown = PAGE;
  let natFilter = null;
  // Users sub-tab: card-status chip + dropdown filters (v1.3.0)
  const userFilter = { q: "", chip: "all", inst: "", nat: "", role: "" };  // chip: all | active | available | expired | linked | none | team | alumni
  // ESNcard sub-tab: office-hours work queue - lands on everything that
  // still needs a hand (unpaid, to assign, to pick up).
  const appFilter = { q: "", chip: "assign", inst: "", nat: "", stay: "", pay: "", proof: "", arrive: "" };
  const uniq = (list, fn) => {
    const m = new Map();
    list.forEach((x) => { const k = String(fn(x) || "").trim(); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const selectHtml = (id, label, entries, current, fmt = (v) => v) => `
    <label class="fsel"><span>${label}</span><select id="${id}">
      <option value="">all</option>
      ${entries.map(([v, n]) => `<option value="${esc(v)}" ${current === v ? "selected" : ""}>${esc(fmt(v))} (${n})</option>`).join("")}
    </select></label>`;
  const MONTHS_S = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const ymLabel = (ym) => { const [y, m] = String(ym || "").split("-"); return m ? `${MONTHS_S[+m - 1]} ${y}` : ym; };
  const ROLE_LABEL = { superadmin: "Superadmin", board: "Board", finance: "Board (finance)", volunteer: "Volunteer", advisory: "Advisory board", alumnicoord: "Alumni coordinator" };


  const usersSubnav = (active) => `<div class="filter-chips" style="margin:-10px 0 18px">
    <button class="chip ${active === "esncard" ? "active" : ""}" onclick="go('/admin/users')">${mi("badge", "sm")} ESNcard</button>
    <button class="chip ${active === "users" ? "active" : ""}" onclick="go('/admin/accounts')">${mi("group", "sm")} Users</button>
  </div>`;

  $app.innerHTML = `
    <h2 class="section-title">Users</h2>
    ${adminTabs("users")}
    ${usersSubnav(tab)}
    ${tab === "esncard" ? `
    <p class="form-hint" style="margin:-8px 0 14px">The office-hours work queue: assign card numbers, tick pickups, reject what doesn't fit. Numbers &amp; charts live under <a href="/admin/members">Insights → Members</a>; prices, lists and the card-ready e-mail under Settings.</p>
    <div class="queue-sticky">
      <div class="filter-bar">
        <input id="apps-q" type="search" placeholder="Search name, e-mail, institution, card number…" autocomplete="off" />
        <div class="filter-chips" id="apps-chips"></div>
      </div>
      <details class="form-optional" id="apps-more-filters">
        <summary class="form-hint" style="cursor:pointer">More filters</summary>
        <div class="filter-selects" id="apps-selects" style="margin-top:8px"></div>
      </details>
    </div>
    <div class="form-actions" style="margin:0 0 10px">
      <button class="btn btn-dark btn-sm" id="btn-apps-csv">Export applications CSV</button>
      <span class="form-hint" id="apps-count"></span>
      <span class="form-hint" style="margin-left:auto">Archive: ${yearPickerHtml("apps-year", yearSel)}</span>
    </div>
    <div id="apps-box"></div>
    <p class="form-hint" style="margin-bottom:14px"><strong>To assign</strong> lists everyone who has paid (oldest payment first): type the number on the physical card, press Enter - the app checks it on esncard.org (typos, duplicates, blocked or already-active cards), links it and e-mails the student. <strong>Office - unpaid</strong> is for people paying at the desk${cashAllowed() ? "" : " (cash is switched off in Settings, so this stays small)"}: click <strong>Paid?</strong>, confirm you received the money (${fmtMoney(cardPricing.student)} student · ${fmtMoney(cardPricing.volunteer)} volunteer/alumni), and the card field appears - they can still pay online from their account in the meantime. <strong>To pick up</strong>: one click on <strong>Handed over</strong> when you give them the card. <strong>Reject…</strong> asks for a reason the student sees and can act on; online payments are refunded automatically. <em>Details</em> under a name shows the whole submission.</p>
    ` : `
    <p class="form-hint" style="margin:-8px 0 14px">Every account${allUsers ? "" : " that signed in since 1 July"}. Team members and alumni carry a flag; institutions are colour-coded. Open a name for the full profile, card history and previous submissions.</p>
    <div class="filter-bar">
      <input id="users-q" type="search" placeholder="Search name, e-mail, card code…" />
      <div class="filter-chips" id="users-chips"></div>
    </div>
    <div class="filter-selects" id="users-selects"></div>
    <div class="form-actions" style="margin:0 0 12px">
      <button class="btn btn-dark btn-sm" id="btn-users-csv">Export CSV</button>
      <span class="form-hint" id="users-count"></span>
      <span class="form-hint" style="margin-left:auto">${allUsers
        ? `Showing every account ever`
        : `Active since 1 July · <a href="#" id="users-all">load all accounts</a>`}</span>
    </div>
    <div id="users-box"></div>
    `}
  `;

  // ---------- applications ----------
  // Full submission (v1.1.0): every field the student filled in, on demand.
  // Since v1.4.0 it's a hidden row toggled from the Details button, so the
  // queue itself stays one line per student.
  const withOther = withOtherText;
  const appDetailsHtml = (x) => {
    const price = x.price ?? cardPricing.student;
    return `
      ${applicationFieldsHtml(x)}
      <div class="form-actions" style="margin-top:8px;gap:8px;flex-wrap:wrap">
        <a class="btn btn-sm btn-ghost btn-ink" href="/admin/user-${x.uid}">${mi("manage_accounts", "sm")} Account page</a>
        ${x.status === "active" && x.pickedUpAt ? `<button class="btn btn-sm btn-ghost btn-ink app-unpickup" data-uid="${x.uid}">Undo pickup</button>` : ""}
        ${x.status === "paid" && !x.paidOnline && price > 0 ? `<button class="btn btn-sm btn-ghost btn-danger app-unpaid" data-uid="${x.uid}" title="Marked paid by mistake - back to unpaid">Undo payment</button>` : ""}
        ${x.status !== "active" ? `<button class="btn btn-sm btn-ghost btn-danger app-del" data-uid="${x.uid}">Remove application</button>` : ""}
      </div>`;
  };
  const statusBadge = (x) => {
    const price = x.price ?? cardPricing.student;
    if (x.status === "active") return `<span class="badge badge-paid">active</span>${x.pickedUpAt ? ` <span class="badge badge-paid" title="Handed over ${fmtDate(x.pickedUpAt)}">picked up</span>` : ` <span class="badge badge-requested">to pick up</span>`}<br><small class="form-hint"><code>${esc(x.cardNumber || "")}</code>${x.expiresAt ? ` · until ${fmtDate(x.expiresAt)}` : ""}</small>`;
    if (x.status === "paid") return `<span class="badge badge-paid">paid ${x.paidOnline ? "online" : "cash"}</span>${x.paidAt ? `<br><small class="form-hint">${fmtDate(x.paidAt)} ${fmtTime(x.paidAt)}</small>` : ""}`;
    if (x.status === "rejected") return `<span class="badge badge-soldout">rejected${x.refunded ? " · refunded" : ""}</span>${x.declineReason ? `<br><small class="form-hint">${esc(x.declineReason)}</small>` : ""}`;
    return price === 0 ? `<span class="badge badge-esn">free · team</span>` : `<span class="badge badge-requested">unpaid</span>`;
  };
  const actionsHtml = (x) => {
    const price = x.price ?? cardPricing.student;
    const reject = `<button class="btn btn-sm btn-ghost btn-danger app-decline" data-uid="${x.uid}">Reject…</button>`;
    // Office moment, step 1 (v1.4.0): money first. The card number field only
    // appears once the board confirmed the payment - or when the card is free.
    if (x.status === "applied" && price > 0) {
      return `<div class="assign-row">
        <button class="btn btn-sm btn-green app-paid" data-uid="${x.uid}" title="Confirm you received ${fmtMoney(price)} in cash at the office">${mi("payments", "sm")} Paid ${fmtMoney(price)}?</button>
        ${reject}
      </div>`;
    }
    if (x.status === "applied" || x.status === "paid") {
      return `<div class="assign-row">
        <input class="inline-input app-cardnum" data-uid="${x.uid}" placeholder="card number" autocapitalize="characters" autocomplete="off" spellcheck="false" style="width:150px" />
        <button class="btn btn-sm btn-green app-assign" data-uid="${x.uid}" title="Verifies the number on esncard.org, links it to this student and sends the card-ready mail (Enter in the field does the same)">${mi("badge", "sm")} Assign</button>
        ${reject}
      </div>
      <span class="app-check-out form-hint" data-uid="${x.uid}"></span>`;
    }
    if (x.status === "active" && !x.pickedUpAt) {
      return `<button class="btn btn-sm btn-green app-pickup" data-uid="${x.uid}" title="One click when the card is handed over at the office">${mi("handshake", "sm")} Handed over</button>`;
    }
    return "";
  };
  const appRowHtml = (x) => `
    <tr class="${x.status === "paid" ? "row-hot" : ""}" data-uid="${x.uid}">
      <td class="card-main"><a href="/admin/user-${x.uid}"><strong>${esc(`${x.firstName || ""} ${x.lastName || ""}`.trim() || x.email || "-")}</strong></a><br><small class="form-hint">${esc(x.email || "")}</small>
        <button class="btn-link app-details" data-uid="${x.uid}" aria-expanded="false">${mi("expand_more", "sm")} Details</button></td>
      <td data-l="Applied" style="white-space:nowrap"><div class="td-stack">${x.createdAt ? `${fmtDate(x.createdAt)}<br><small class="form-hint">${fmtTime(x.createdAt)}${x.updatedAt && toDate(x.updatedAt)?.getTime() !== toDate(x.createdAt)?.getTime() ? ` · edited` : ""}</small>` : "-"}</div></td>
      <td data-l="Student"><div class="td-stack">${instChip(x.hostInstitution, x.hostInstitutionOther)}<br><small class="form-hint">${esc(x.nationality || "-")}${x.stayType ? ` · ${esc(x.stayType)}` : ""}</small></div></td>
      <td data-l="Proof">${x.proofImage
        ? `<details class="proof-details"><summary>view</summary><img src="${esc(x.proofImage)}" alt="proof" /></details>`
        : x.hasProof
          ? `<span class="proof-slot" data-uid="${x.uid}"><button class="btn btn-sm btn-ghost app-proof" data-uid="${x.uid}" style="color:var(--esn-dark)">View proof</button></span>`
          : `<span class="form-hint">none</span>`}</td>
      <td data-l="Status"><div class="td-stack">${statusBadge(x)}</div></td>
      <td class="card-actions queue-actions">${actionsHtml(x)}</td>
    </tr>
    <tr class="app-detail-row ${x.status === "paid" ? "row-hot" : ""}" data-uid="${x.uid}" hidden><td colspan="6">${appDetailsHtml(x)}</td></tr>`;

  const needsAction = (x) => x.status === "applied" || x.status === "paid" || (x.status === "active" && !x.pickedUpAt);
  const payKind = (x) => x.status === "applied" ? "unpaid" : x.status === "rejected" ? "rejected" : x.paidOnline ? "online" : (x.price ?? cardPricing.student) === 0 ? "free" : "cash";
  const appMatches = (x) => {
    if (x._keep) return true; // just acted on - keep in view until reload
    const c = appFilter.chip;
    if (c === "assign" && !(x.status === "paid" || (x.status === "applied" && (x.price ?? cardPricing.student) === 0))) return false;
    if (c === "office" && !(x.status === "applied" && (x.price ?? cardPricing.student) > 0)) return false;
    if (c === "pickup" && !(x.status === "active" && !x.pickedUpAt)) return false;
    if (c === "active" && x.status !== "active") return false;
    if (c === "rejected" && x.status !== "rejected") return false;
    if (appFilter.inst && (x.hostInstitution || "") !== appFilter.inst) return false;
    if (appFilter.nat && (x.nationality || "") !== appFilter.nat) return false;
    if (appFilter.stay && (x.stayType || "") !== appFilter.stay) return false;
    if (appFilter.pay && payKind(x) !== appFilter.pay) return false;
    if (appFilter.proof === "yes" && !(x.hasProof || x.proofImage)) return false;
    if (appFilter.proof === "no" && (x.hasProof || x.proofImage)) return false;
    if (appFilter.arrive && (x.stayFrom || "") !== appFilter.arrive) return false;
    const q = appFilter.q.trim().toLowerCase();
    if (!q) return true;
    return `${x.firstName || ""} ${x.lastName || ""} ${x.email || ""} ${x.nationality || ""} ${x.hostInstitution || ""} ${x.cardNumber || ""} ${x.homeUniversity || ""}`.toLowerCase().includes(q);
  };

  const renderApps = () => {
    const chipsEl = document.getElementById("apps-chips");
    if (!chipsEl) return;
    const n = (fn) => applications.filter(fn).length;
    const isAssignable = (x) => x.status === "paid" || (x.status === "applied" && (x.price ?? cardPricing.student) === 0);
    const isOffice = (x) => x.status === "applied" && (x.price ?? cardPricing.student) > 0;
    chipsEl.innerHTML = [
      ["assign", `${mi("badge", "sm")} To assign (${n(isAssignable)})`],
      ["office", `${mi("point_of_sale", "sm")} Office - unpaid (${n(isOffice)})`],
      ["pickup", `${mi("handshake", "sm")} To pick up (${n((x) => x.status === "active" && !x.pickedUpAt)})`],
      ["active", `Active (${n((x) => x.status === "active")})`],
      ["rejected", `Rejected (${n((x) => x.status === "rejected")})`],
      ["all", `All (${applications.length})`],
    ].map(([k, label]) => `<button class="chip ${appFilter.chip === k ? "active" : ""}" data-chip="${k}">${label}</button>`).join("");
    chipsEl.querySelectorAll(".chip").forEach((btn) => {
      btn.onclick = () => { appFilter.chip = btn.dataset.chip; appsShown = PAGE; renderApps(); };
    });
    const selEl = document.getElementById("apps-selects");
    if (selEl) {
      const PAY_LABEL = { online: "Paid online", cash: "Paid cash", free: "Free (team)", unpaid: "Unpaid", rejected: "Rejected" };
      selEl.innerHTML = [
        selectHtml("af-inst", "Institution", uniq(applications, (x) => x.hostInstitution), appFilter.inst),
        selectHtml("af-nat", "Nationality", uniq(applications, (x) => x.nationality), appFilter.nat),
        selectHtml("af-stay", "Type of stay", uniq(applications, (x) => x.stayType), appFilter.stay),
        selectHtml("af-pay", "Payment", uniq(applications, payKind), appFilter.pay, (v) => PAY_LABEL[v] || v),
        selectHtml("af-proof", "Proof", [["yes", n((x) => x.hasProof || x.proofImage)], ["no", n((x) => !(x.hasProof || x.proofImage))]], appFilter.proof, (v) => v === "yes" ? "attached" : "missing"),
        selectHtml("af-arrive", "Arriving", uniq(applications, (x) => x.stayFrom).sort((a, b) => a[0].localeCompare(b[0])), appFilter.arrive, ymLabel),
        (appFilter.inst || appFilter.nat || appFilter.stay || appFilter.pay || appFilter.proof || appFilter.arrive)
          ? `<button class="btn btn-sm btn-ghost btn-danger" id="af-clear">✕ clear filters</button>` : "",
      ].join("");
      const bind = (id, key) => selEl.querySelector(`#${id}`)?.addEventListener("change", (e) => { appFilter[key] = e.target.value; appsShown = PAGE; renderApps(); });
      bind("af-inst", "inst"); bind("af-nat", "nat"); bind("af-stay", "stay"); bind("af-pay", "pay"); bind("af-proof", "proof"); bind("af-arrive", "arrive");
      selEl.querySelector("#af-clear")?.addEventListener("click", () => { Object.assign(appFilter, { inst: "", nat: "", stay: "", pay: "", proof: "", arrive: "" }); renderApps(); });
      if (appFilter.inst || appFilter.nat || appFilter.stay || appFilter.pay || appFilter.proof || appFilter.arrive) document.getElementById("apps-more-filters")?.setAttribute("open", "");
    }

    const list = applications.filter(appMatches);
    // Queue order: who paid first is served first; everything else newest first.
    if (appFilter.chip === "assign") list.sort((a, b) => (toDate(a.paidAt || a.createdAt)?.getTime() || 0) - (toDate(b.paidAt || b.createdAt)?.getTime() || 0));
    const shown = list.slice(0, appsShown);
    const box = document.getElementById("apps-box");
    box.innerHTML = shown.length ? `
      <div class="table-wrap cards queue"><table>
        <thead><tr><th>Applicant</th><th>Applied</th><th>Student</th><th>Proof</th><th>Status</th><th></th></tr></thead>
        <tbody>${shown.map(appRowHtml).join("")}</tbody>
      </table></div>
      ${list.length > shown.length ? `<div class="form-actions"><button class="btn btn-ghost btn-ink" id="apps-more">Show more (${list.length - shown.length} left)</button></div>` : ""}`
    : `<div class="empty-state"><p>${applications.length ? (appFilter.chip === "assign" && !appFilter.q ? "Nothing to assign - every paid application has its card." : appFilter.chip === "office" && !appFilter.q ? "Nobody is waiting to pay at the office." : "No applications match.") : "No applications yet."}</p></div>`;
    document.getElementById("apps-count").textContent = `Showing ${shown.length} of ${list.length}`;
    document.getElementById("apps-more")?.addEventListener("click", () => { appsShown += 200; renderApps(); });

    // Row actions update the local list in place - no full reload, no lost scroll.
    box.querySelectorAll(".app-details").forEach((btn) => {
      btn.onclick = () => {
        const row = box.querySelector(`tr.app-detail-row[data-uid="${btn.dataset.uid}"]`);
        if (!row) return;
        row.hidden = !row.hidden;
        btn.setAttribute("aria-expanded", String(!row.hidden));
        btn.innerHTML = `${mi(row.hidden ? "expand_more" : "expand_less", "sm")} Details`;
      };
    });
    // Enter in the card field = Assign (desk speed: type, Enter, next).
    box.querySelectorAll(".app-cardnum").forEach((inp) => {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); box.querySelector(`.app-assign[data-uid="${inp.dataset.uid}"]`)?.click(); }
      });
    });
    box.querySelectorAll(".app-proof").forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = "Loading…";
        try {
          const snap = await getDoc(doc(db, "applicationProofs", btn.dataset.uid));
          const d2 = snap.exists() ? snap.data() : {};
          const slot = box.querySelector(`.proof-slot[data-uid="${btn.dataset.uid}"]`);
          if (slot) {
            slot.innerHTML = d2.file
              ? `<a class="btn btn-sm btn-dark" href="${esc(d2.file)}" target="_blank" rel="noopener">${mi("picture_as_pdf", "sm")} Open PDF</a>`
              : d2.image
              ? `<details class="proof-details" open><summary>hide</summary><img src="${esc(d2.image)}" alt="proof" /></details>`
              : `<span class="form-hint">No proof found (possibly auto-purged).</span>`;
          }
        } catch (err) {
          toast("Could not load proof: " + err.message, "error");
          btn.disabled = false; btn.textContent = "View proof";
        }
      };
    });
    box.querySelectorAll(".app-paid").forEach((btn) => {
      btn.onclick = async () => {
        const x = applications.find((a) => a.uid === btn.dataset.uid);
        const price = x?.price ?? cardPricing.student;
        const who = `${x?.firstName || ""} ${x?.lastName || ""}`.trim() || x?.email || "this student";
        const ok = await appConfirm(`Did you receive ${fmtMoney(price)} in cash from ${who}?\n\nThis marks the application as paid; the card number field appears next.`, { okLabel: `Yes, ${fmtMoney(price)} received`, cancelLabel: "No" });
        if (!ok) return;
        btn.disabled = true;
        try {
          await updateDoc(doc(db, "esncardApplications", btn.dataset.uid), { status: "paid", paidAt: serverTimestamp(), paidOnline: false });
          if (x) { x.status = "paid"; x.paidAt = Timestamp.now(); x.paidOnline = false; x._keep = true; }
          toast(`${fmtMoney(price)} registered - now type the card number.`, "success");
          renderApps();
          box.querySelector(`.app-cardnum[data-uid="${btn.dataset.uid}"]`)?.focus();
        } catch (err) { toast("Failed: " + err.message, "error"); btn.disabled = false; }
      };
    });
    box.querySelectorAll(".app-unpaid").forEach((btn) => {
      btn.onclick = async () => {
        if (!await appConfirm("Set this application back to unpaid?", { okLabel: "Yes, back to unpaid", cancelLabel: "No" })) return;
        btn.disabled = true;
        try {
          await updateDoc(doc(db, "esncardApplications", btn.dataset.uid), { status: "applied", paidAt: deleteField(), paidOnline: deleteField() });
          const x = applications.find((a) => a.uid === btn.dataset.uid);
          if (x) { x.status = "applied"; x.paidAt = null; x.paidOnline = false; x._keep = true; }
          toast("Back to unpaid.", "success");
          renderApps();
        } catch (err) { toast("Failed: " + err.message, "error"); btn.disabled = false; }
      };
    });
    box.querySelectorAll(".app-assign").forEach((btn) => {
      btn.onclick = async () => {
        const uid = btn.dataset.uid;
        const num = box.querySelector(`.app-cardnum[data-uid="${uid}"]`).value.trim().toUpperCase().replace(/\s+/g, "");
        if (num.length < 6) { toast("Type the card number printed on the physical card.", "error"); return; }
        // Sanity checks: plausible format + not already assigned to someone else.
        if (!/^[A-Z0-9]{6,20}$/.test(num)) { toast("That doesn't look like a card number - letters and digits only.", "error"); return; }
        // Anonymised applications = deleted accounts; their kept issue-record
        // doesn't reserve the number (matches ensureCardFree server-side).
        const dupApp = applications.find((a) => a.uid !== uid && a.anonymized !== true && (a.cardNumber || "").toUpperCase() === num);
        const dupUser = users.find((uu) => uu.id !== uid && (uu.esncardCode || "").toUpperCase() === num);
        if (dupApp || dupUser) {
          toast(`Card ${num} is already assigned to ${esc(dupApp ? `${dupApp.firstName || ""} ${dupApp.lastName || ""}`.trim() || dupApp.email || "someone else" : dupUser.displayName || dupUser.email || "someone else")} - double-check the number on the physical card.`, "error");
          return;
        }
        const x0 = applications.find((a) => a.uid === uid);
        const price0 = x0?.price ?? cardPricing.student;
        // Money first (v1.4.0): the field only shows for paid or free cards,
        // but never trust the DOM - refuse an unpaid one.
        if (x0?.status === "applied" && price0 > 0) { toast("Confirm the payment first (Paid? button).", "warn"); return; }
        btn.disabled = true;
        const out = box.querySelector(`.app-check-out[data-uid="${uid}"]`);
        if (out) out.innerHTML = `${mi("hourglass_top", "sm")} checking on esncard.org…`;
        try {
          if (x0?.status === "applied") {
            // free team card: no payment step, mark it as settled
            await updateDoc(doc(db, "esncardApplications", uid), { status: "paid", paidAt: serverTimestamp(), paidOnline: false });
            x0.status = "paid";
          }
          // The server verifies the number on esncard.org, refuses
          // blocked/expired/unknown AND already-active cards (an active card is
          // the student's to link themselves), guarantees one-card-one-person,
          // links it and flips the application so the pickup mail goes out.
          const r = (await httpsCallable(functions, "assignEsncard")({ uid, code: num })).data;
          if (out) out.innerHTML = "";
          const x = applications.find((a) => a.uid === uid);
          if (x) { x.status = "active"; x.cardNumber = num; x._keep = true; }
          const u = users.find((uu) => uu.id === uid);
          if (u) { u.esncardCode = num; u.esncardVerified = false; u.esncardStatus = r.status; }
          toast(`Card ${num} assigned - the student gets the e-mail with the number. Click "Handed over" when you give them the card.`, "success");
          renderApps(); renderUsers();
          // Desk flow: jump to the next card field so the next student is one Enter away.
          box.querySelector(".app-cardnum")?.focus();
        } catch (err) {
          if (out) out.innerHTML = `<span class="badge badge-soldout">${esc(err?.message || "assigning failed")}</span>`;
          toast(err?.message || "Assigning failed.", err?.code === "functions/failed-precondition" ? "warn" : "error");
          btn.disabled = false;
        }
      };
    });
    const setPickup = async (uid, picked, btn) => {
      const x = applications.find((a) => a.uid === uid);
      if (picked && (!x || x.status !== "active" || !x.cardNumber)) { toast("Assign a card number first - handing over is the last step.", "error"); return; }
      if (btn) btn.disabled = true;
      try {
        await updateDoc(doc(db, "esncardApplications", uid), picked ? { pickedUpAt: serverTimestamp() } : { pickedUpAt: deleteField() });
        if (x) { x.pickedUpAt = picked ? Timestamp.now() : null; x._keep = true; }
        toast(picked ? "Handed over ✓" : "Pickup undone.", "success");
        renderApps();
      } catch (err) { toast("Failed: " + err.message, "error"); if (btn) btn.disabled = false; }
    };
    box.querySelectorAll(".app-pickup").forEach((btn) => { btn.onclick = () => setPickup(btn.dataset.uid, true, btn); });
    box.querySelectorAll(".app-unpickup").forEach((btn) => { btn.onclick = () => setPickup(btn.dataset.uid, false, btn); });
    box.querySelectorAll(".app-decline").forEach((btn) => {
      btn.onclick = async () => {
        const x = applications.find((a) => a.uid === btn.dataset.uid);
        const wasPaid = x?.status === "paid";
        const reason = await appPrompt(`Why is this application rejected? The student sees this reason and can fix & resubmit.${wasPaid ? (x?.paidOnline ? "\n\nThe online payment is refunded automatically via Stripe." : "\n\nThis one was paid in cash - refund it at the office.") : ""}`, { multiline: true, placeholder: "e.g. The proof isn't readable - please attach your acceptance letter.", okLabel: "Reject application", cancelLabel: "Keep it", danger: true });
        if (reason === null) return;
        const label = btn.textContent;
        btn.disabled = true; btn.textContent = "Rejecting…";
        try {
          const fn = httpsCallable(functions, "declineEsncardApplication");
          const res = await fn({ uid: btn.dataset.uid, reason: reason.trim() });
          if (x) { x.status = "rejected"; x.declineReason = reason.trim(); x.refunded = !!res.data?.refunded; }
          toast(res.data?.refunded ? "Rejected - the online payment was refunded via Stripe."
            : res.data?.paidCash ? "Rejected - heads up: this one was paid in cash, refund it at the office."
            : "Application rejected - the student can fix & resubmit.", "success");
          renderApps();
        } catch (err) {
          toast("Reject failed: " + err.message, "error");
          btn.disabled = false; btn.textContent = label;
        }
      };
    });
    box.querySelectorAll(".app-del").forEach((btn) => {
      btn.onclick = async () => {
        if (!await appConfirm("Remove this application? Its submission history goes with it.", { danger: true, okLabel: "Remove", cancelLabel: "Keep" })) return;
        try {
          const hist = await getDocs(collection(db, "esncardApplications", btn.dataset.uid, "history")).catch(() => null);
          if (hist) await Promise.all(hist.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
          await deleteDoc(doc(db, "esncardApplications", btn.dataset.uid));
          deleteDoc(doc(db, "applicationProofs", btn.dataset.uid)).catch(() => {});
          const i = applications.findIndex((a) => a.uid === btn.dataset.uid);
          if (i >= 0) applications.splice(i, 1);
          toast("Application removed", "success");
          renderApps();
        } catch (err) { toast(err.message, "error"); }
      };
    });
  };

  // ---------- users ----------
  const roleBadge = (u) => {
    const parts = [];
    if (u._role) parts.push(`<span class="badge badge-esn" title="${esc(u._fn || ROLE_LABEL[u._role] || u._role)}">${esc(ROLE_LABEL[u._role] || u._role)}${u._fn ? ` · ${esc(u._fn)}` : ""}</span>`);
    if (u.alumni) parts.push(`<span class="badge badge-requested">alumni</span>`);
    return parts.length ? `<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${parts.join("")}</div>` : "";
  };
  const userRowHtml = (u) => `
    <tr class="${u._role ? "row-team" : ""}">
      <td class="card-main"><a href="/admin/user-${u.id}"><strong>${esc(u.displayName || "-")}</strong></a><br><small class="form-hint">${esc(u.email || "")}</small>${roleBadge(u)}</td>
      <td data-l="Institution">${instChip(u.hostInstitution)}</td>
      <td data-l="Nationality">${esc(u.nationality || "-")}</td>
      <td data-l="Last seen" style="white-space:nowrap">${u.lastLogin ? fmtDate(u.lastLogin) : "-"}</td>
      <td data-l="ESNcard">${u.esncardCode ? `<code style="font-size:.85rem">${esc(u.esncardCode)}</code>` : `<span class="form-hint">-</span>`}</td>
      <td data-l="Status">${userCardBadge(u)}</td>
      <td style="white-space:nowrap" class="card-actions">
        <a class="btn btn-sm btn-ghost" style="color:var(--esn-dark)" href="/admin/user-${u.id}">${mi("manage_accounts", "sm")} Details</a>
      </td>
    </tr>`;

  const userMatches = (u) => {
    if (natFilter && u.nationality !== natFilter) return false;
    const c = userFilter.chip;
    if (c === "team" && !u._role) return false;
    else if (c === "alumni" && !u.alumni) return false;
    else if (c !== "all" && c !== "team" && c !== "alumni" && userCardStatus(u).key !== c) return false;
    if (userFilter.inst && (u.hostInstitution || "") !== userFilter.inst) return false;
    if (userFilter.nat && (u.nationality || "") !== userFilter.nat) return false;
    if (userFilter.role && u._role !== userFilter.role) return false;
    const q = userFilter.q.trim().toLowerCase();
    if (!q) return true;
    return `${u.displayName || ""} ${u.email || ""} ${u.esncardCode || ""} ${u.university || ""}`.toLowerCase().includes(q);
  };

  const renderUsers = () => {
    const chipsEl = document.getElementById("users-chips");
    if (!chipsEl) return;
    // Live counts per ESNcard status - the board sees the whole spread at a glance.
    const by = { none: 0, active: 0, available: 0, expired: 0, linked: 0 };
    users.forEach((u) => { by[userCardStatus(u).key] = (by[userCardStatus(u).key] || 0) + 1; });
    const teamN = users.filter((u) => u._role).length;
    const alumniN = users.filter((u) => u.alumni).length;
    chipsEl.innerHTML = [
      ["all", `All (${users.length})`],
      ["active", `${mi("verified", "sm")} Active card (${by.active})`],
      ["available", `${mi("hourglass_top", "sm")} Available (${by.available})`],
      ["expired", `${mi("event_busy", "sm")} Expired (${by.expired})`],
      ...(by.linked ? [["linked", `Linked (${by.linked})`]] : []),
      ["none", `No card (${by.none})`],
      ["team", `${mi("group", "sm")} Team (${teamN})`],
      ...(alumniN ? [["alumni", `Alumni (${alumniN})`]] : []),
    ].map(([k, label]) => `<button class="chip ${userFilter.chip === k ? "active" : ""}" data-chip="${k}">${label}</button>`).join("");
    chipsEl.querySelectorAll(".chip").forEach((btn) => {
      btn.onclick = () => { userFilter.chip = btn.dataset.chip; usersShown = PAGE; renderUsers(); };
    });
    const selEl = document.getElementById("users-selects");
    if (selEl) {
      selEl.innerHTML = [
        selectHtml("uf-inst", "Institution", uniq(users, (u) => u.hostInstitution), userFilter.inst),
        selectHtml("uf-nat", "Nationality", uniq(users, (u) => u.nationality), userFilter.nat),
        selectHtml("uf-role", "Team role", uniq(users, (u) => u._role), userFilter.role, (v) => ROLE_LABEL[v] || v),
        (userFilter.inst || userFilter.nat || userFilter.role)
          ? `<button class="btn btn-sm btn-ghost btn-danger" id="uf-clear">✕ clear filters</button>` : "",
      ].join("");
      const bind = (id, key) => selEl.querySelector(`#${id}`)?.addEventListener("change", (e) => { userFilter[key] = e.target.value; usersShown = PAGE; renderUsers(); });
      bind("uf-inst", "inst"); bind("uf-nat", "nat"); bind("uf-role", "role");
      selEl.querySelector("#uf-clear")?.addEventListener("click", () => { Object.assign(userFilter, { inst: "", nat: "", role: "" }); renderUsers(); });
    }

    const list = users.filter(userMatches);
    const shown = list.slice(0, usersShown);
    const box = document.getElementById("users-box");
    box.innerHTML = shown.length ? `
      <div class="table-wrap cards"><table>
        <thead><tr><th>Name</th><th>Institution</th><th>Nationality</th><th>Last seen</th><th>ESNcard code</th><th>Card status</th><th></th></tr></thead>
        <tbody>${shown.map(userRowHtml).join("")}</tbody>
      </table></div>
      ${list.length > shown.length ? `<div class="form-actions"><button class="btn btn-ghost btn-ink" id="users-more">Show more (${list.length - shown.length} left)</button></div>` : ""}`
    : `<div class="empty-state"><p>No users match${natFilter ? ` from ${esc(natFilter)}` : ""}.</p></div>`;
    document.getElementById("users-count").innerHTML =
      `Showing ${shown.length} of ${list.length}` +
      (natFilter ? ` · from <strong>${esc(natFilter)}</strong> <button class="btn btn-sm btn-ghost btn-danger" id="btn-clear-nat">✕ clear</button>` : "");
    document.getElementById("users-more")?.addEventListener("click", () => { usersShown += 200; renderUsers(); });
    document.getElementById("btn-clear-nat")?.addEventListener("click", () => { natFilter = null; renderUsers(); });
  };

  renderApps();
  renderUsers();
  // Sticky filter bar sits right under the site header, whatever its height.
  try { document.documentElement.style.setProperty("--hdr", `${document.querySelector(".site-header")?.offsetHeight || 0}px`); } catch { /* cosmetic */ }
  // Desk flow: on a real keyboard the search box is ready to type into.
  if (matchMedia("(pointer:fine)").matches) document.getElementById("apps-q")?.focus();

  document.getElementById("apps-q")?.addEventListener("input", (e) => { appFilter.q = e.target.value; appsShown = PAGE; renderApps(); });
  document.getElementById("users-q")?.addEventListener("input", (e) => { userFilter.q = e.target.value; usersShown = PAGE; renderUsers(); });

  document.getElementById("apps-year")?.addEventListener("change", (e) => viewAdminUsers(parseInt(e.target.value, 10), allUsers, tab));
  document.getElementById("users-all")?.addEventListener("click", (e) => { e.preventDefault(); viewAdminUsers(yearSel, true, tab); });

  document.getElementById("btn-apps-csv")?.addEventListener("click", () => {
    const csvEsc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Timestamp", "First name", "Last name", "Birth date", "Nationality", "Institution in Ghent",
       "Type of stay", "Stay from", "Stay until", "Home university", "Home country", "Home city", "Field of studies", "Email", "Phone",
       "ESNcard number", "Status", "Price", "Picked up", "Activation date", "Expiration date",
       "How found ESN", "Ideas"].map(csvEsc).join(","),
      ...applications.map((x) => [
        toDate(x.createdAt)?.toISOString() || "", x.firstName, x.lastName, x.birthday, x.nationality,
        withOther(x.hostInstitution, x.hostInstitutionOther), withOther(x.stayType, x.stayTypeOther),
        x.stayFrom || "", x.stayUntilUnknown ? "unknown" : (x.stayUntil || ""),
        x.homeUniversity, x.homeCountry, x.homeCity, withOther(x.fieldOfStudies, x.fieldOfStudiesOther), x.email,
        x.phone, x.cardNumber, x.status, ((x.price ?? 1500) / 100).toFixed(2),
        toDate(x.pickedUpAt)?.toISOString() || "", toDate(x.activatedAt)?.toISOString() || "",
        toDate(x.expiresAt)?.toISOString() || "",
        (x.discovery || []).map((d) => /^other\b/i.test(d) && x.discoveryOther ? `Other (${x.discoveryOther})` : d).join("; "), x.ideas,
      ].map(csvEsc).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "esncard-applications.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById("btn-users-csv")?.addEventListener("click", () => {
    const csvEsc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Name", "Email", "Birthday", "Phone", "Nationality", "HomeCountry", "HomeCity", "University", "InstitutionInGhent", "Instagram", "LinkedIn", "ESNcardCode", "CardStatus", "TeamRole", "BoardFunction", "Alumni", "LastLogin"].map(csvEsc).join(","),
      ...users.filter(userMatches).map((u) => [
        u.displayName, u.email, u.birthday, u.phone, u.nationality,
        u.homeCountry, u.homeCity, u.university, u.hostInstitution, u.instagram, u.linkedin,
        u.esncardCode, userCardStatus(u).key, u._role, u._fn, u.alumni ? "yes" : "no", toDate(u.lastLogin)?.toISOString() || "",
      ].map(csvEsc).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "esn-users.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

async function viewAdminList(yearSel = ayStartYear()) {
  setLoading();
  const now = new Date();
  const yr = ayRange(yearSel);
  const current = yearSel === ayStartYear();
  const regsCol = collection(db, "registrations");
  let events, totals;
  try {
    // Server-side aggregation: the dashboard no longer downloads every
    // registration ever made - it asks Firestore for the sums/counts.
    // Events are scoped per academic year (July–June); the year picker
    // is the archive. The current year also shows FUTURE events.
    // Month-over-month (v0.131): this month SO FAR vs the same number of
    // days into last month - a fair comparison mid-month.
    const thisFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastTo = new Date(lastFrom.getTime() + (now.getTime() - thisFrom.getTime()));
    const [evSnap, revAgg, tickAgg, inAgg, pendCnt, userCnt, memberCnt, openApps,
      revThisAgg, revLastAgg, tickThisAgg, tickLastAgg] = await Promise.all([
      getDocs(current
        ? query(collection(db, "events"), where("start", ">=", yr.from), orderBy("start", "desc"))
        : query(collection(db, "events"), where("start", ">=", yr.from), where("start", "<", yr.to), orderBy("start", "desc"))),
      getAggregateFromServer(query(regsCol, where("status", "==", "paid")), { v: sum("amountTotal") }),
      getAggregateFromServer(query(regsCol, where("status", "in", ["paid", "free"])), { v: sum("quantity") }),
      getAggregateFromServer(query(regsCol, where("checkedInAt", ">", new Date(0))), { v: sum("quantity") }),
      getCountFromServer(query(regsCol, where("status", "==", "pending"))),
      getCountFromServer(collection(db, "users")),
      getCountFromServer(query(collection(db, "users"), where("esncardVerified", "==", true))).catch(() => null),
      getCountFromServer(query(collection(db, "esncardApplications"), where("status", "in", ["applied", "paid"]))).catch(() => null),
      getAggregateFromServer(query(regsCol, where("status", "==", "paid"), where("createdAt", ">=", thisFrom)), { v: sum("amountTotal") }).catch(() => null),
      getAggregateFromServer(query(regsCol, where("status", "==", "paid"), where("createdAt", ">=", lastFrom), where("createdAt", "<", lastTo)), { v: sum("amountTotal") }).catch(() => null),
      getAggregateFromServer(query(regsCol, where("status", "in", ["paid", "free"]), where("createdAt", ">=", thisFrom)), { v: sum("quantity") }).catch(() => null),
      getAggregateFromServer(query(regsCol, where("status", "in", ["paid", "free"]), where("createdAt", ">=", lastFrom), where("createdAt", "<", lastTo)), { v: sum("quantity") }).catch(() => null),
    ]);
    events = evSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    totals = {
      revenue: revAgg.data().v || 0,
      tickets: tickAgg.data().v || 0,
      checkedIn: inAgg.data().v || 0,
      pending: pendCnt.data().count,
      users: userCnt.data().count,
      members: memberCnt ? memberCnt.data().count : null,
      openApps: openApps ? openApps.data().count : null,
      revThis: revThisAgg ? (revThisAgg.data().v || 0) : null,
      revLast: revLastAgg ? (revLastAgg.data().v || 0) : null,
      tickThis: tickThisAgg ? (tickThisAgg.data().v || 0) : null,
      tickLast: tickLastAgg ? (tickLastAgg.data().v || 0) : null,
    };
  } catch (e) { $app.innerHTML = errorState(e.message); return; }
  totals.upcoming = events.filter((ev) => ev.published && toDate(ev.end || ev.start) >= now).length;

  const stats = {}; // eventId → { tickets, checkedIn }, filled in async below
  const filter = { q: "", chip: "upcoming", tag: null };
  const catOf = (ev) => (!ev.published ? "drafts" : (toDate(ev.end || ev.start) >= now ? "upcoming" : "past"));
  const counts = { upcoming: 0, past: 0, drafts: 0 };
  events.forEach((ev) => counts[catOf(ev)]++);

  const soldText = (ev) => {
    const st = stats[ev.id];
    return st ? `${st.tickets}${ev.capacity ? ` / ${ev.capacity}` : ""}` : "…";
  };
  const attText = (ev) => {
    const st = stats[ev.id];
    if (!st) return "…";
    const past = toDate(ev.end || ev.start) < now;
    if (past && st.tickets) return `${st.checkedIn}/${st.tickets} (${Math.round((st.checkedIn / st.tickets) * 100)}%)`;
    return past ? "-" : `${st.checkedIn}`;
  };

  const rowHtml = (ev) => `
    <tr>
      <td class="card-main"><a href="/admin/event-${ev.id}"><strong>${esc(ev.title)}</strong></a></td>
      <td data-l="Date">${fmtDate(ev.start)}</td>
      <td data-l="Price">${Array.isArray(ev.options) && ev.options.length
        ? `from ${fmtMoney(Math.min(...ev.options.map((o) => o.price)), ev.currency)}`
        : ev.price ? fmtMoney(ev.price, ev.currency) : "Free"}</td>
      <td data-l="Sold" data-sold="${ev.id}">${soldText(ev)}</td>
      <td data-l="Attendance" data-att="${ev.id}">${attText(ev)}</td>
      <td data-l="Status"><span class="badge badge-${ev.published ? "published" : "draft"}">${ev.published ? "published" : "draft"}</span></td>
      <td style="white-space:nowrap" class="card-actions">
        <a class="btn btn-sm btn-dark" href="/admin/event-${ev.id}">Registrations</a>
        <a class="btn btn-sm btn-orange" href="/admin/edit-${ev.id}">Edit</a>
        <a class="btn btn-sm btn-ghost" style="color:var(--esn-dark)" href="/admin/dup-${ev.id}" title="Create a copy">Duplicate</a>
      </td>
    </tr>`;

  $app.innerHTML = `
    <h2 class="section-title">Admin dashboard</h2>
    ${adminTabs("events")}
    <div class="admin-actions">
      <a href="/admin/new" class="admin-action primary">${mi("add_circle")}<span><strong>New event</strong><small>Party, trip, cantus, sport…</small></span></a>
      <a href="/admin/new-office" class="admin-action">${mi("meeting_room")}<span><strong>Office hours</strong><small>One session or a weekly series</small></span></a>
      <a href="/news" class="admin-action minor">${mi("campaign")}<span><strong>News post</strong></span></a>
      <a href="/admin/merch-new" class="admin-action minor">${mi("storefront")}<span><strong>Shop item</strong></span></a>
    </div>
    ${(() => {
      const delta = (a, b) => {
        if (a == null || b == null) return "";
        if (!b) return a ? `<span class="stat-delta up">new this month</span>` : "";
        const p = Math.round(((a - b) / b) * 100);
        return `<span class="stat-delta ${p >= 0 ? "up" : "down"}">${p >= 0 ? "▲" : "▼"} ${Math.abs(p)}% vs last month</span>`;
      };
      const attention = [
        totals.openApps ? `<a class="attn" href="/admin/users">${mi("badge", "sm")} <strong>${totals.openApps}</strong> ESNcard application${totals.openApps === 1 ? "" : "s"} to handle</a>` : "",
        totals.pending ? `<span class="attn muted">${mi("hourglass_top", "sm")} <strong>${totals.pending}</strong> unfinished checkout${totals.pending === 1 ? "" : "s"} (expire by themselves)</span>` : "",
        `<a class="attn" id="attn-inbox" href="/admin/inbox" hidden>${mi("forum", "sm")} <strong id="attn-inbox-n">0</strong> open student message</a>`,
      ].filter(Boolean).join("");
      return `
    <div class="stat-row">
      <div class="stat-card" style="--accent:#F47B20"><div class="num">${totals.upcoming}</div><div class="lbl">${mi("event_upcoming", "sm")} Upcoming events</div></div>
      <div class="stat-card" style="--accent:#00AEEF"><div class="num">${totals.tickThis != null ? totals.tickThis : totals.tickets}</div><div class="lbl">${mi("confirmation_number", "sm")} Tickets this month</div>${delta(totals.tickThis, totals.tickLast)}</div>
      <div class="stat-card" style="--accent:#EC008C"><div class="num">${totals.revThis != null ? fmtMoney(totals.revThis) : fmtMoney(totals.revenue)}</div><div class="lbl">${mi("payments", "sm")} Revenue this month</div>${delta(totals.revThis, totals.revLast)}</div>
      ${totals.members != null ? `<div class="stat-card" style="--accent:#7AC143"><div class="num">${totals.members}</div><div class="lbl">${mi("verified", "sm")} Active members</div></div>` : ""}
    </div>
    <div class="attn-row">${attention}</div>
    <details class="mini-chart-card" id="week-chart-card">
      <summary><strong style="font-size:.85rem">${mi("bar_chart", "sm")} Tickets per week</strong> <span class="form-hint">last 8 weeks · all-time totals live under Insights</span></summary>
      <div id="week-chart"><p class="form-hint" style="margin:8px 0">Loading…</p></div>
    </details>`;
    })()}
    <div class="filter-bar">
      <input id="ev-q" type="search" placeholder="Search events…" />
      <div class="filter-chips" id="ev-status-chips">
        <button class="chip active" data-chip="upcoming">Upcoming (${counts.upcoming})</button>
        <button class="chip" data-chip="past">Past (${counts.past})</button>
        <button class="chip" data-chip="drafts">Drafts (${counts.drafts})</button>
        <button class="chip" data-chip="all">All (${events.length})</button>
      </div>
    </div>
    <div class="filter-chips" id="ev-tag-chips" style="margin:-6px 0 14px"></div>
    <div id="admin-events"></div>
    <p class="form-hint" style="margin-top:10px">Academic year ${yearPickerHtml("ev-year", yearSel)} <span style="margin-left:6px">(July–June - pick an older year to browse the archive)</span></p>

    <details class="form-card" id="audit-log" style="margin-top:18px">
      <summary style="cursor:pointer;font-weight:800">${mi("history", "sm")} Creation log</summary>
      <p class="form-hint" style="margin:8px 0 0">Who created, deleted or cancelled events, office hours, board meetings, news posts and merch - recorded automatically, kept for a year, visible to the whole board.</p>
      <div id="audit-log-body" style="margin-top:10px"><p class="form-hint">Loading…</p></div>
    </details>
  `;

  // Creation log (v0.135) - loaded lazily the first time it's opened, so the
  // dashboard itself stays as fast as before.
  const auditBox = document.getElementById("audit-log");
  auditBox?.addEventListener("toggle", async () => {
    if (!auditBox.open || auditBox.dataset.loaded) return;
    auditBox.dataset.loaded = "1";
    const body = document.getElementById("audit-log-body");
    try {
      const snap = await getDocs(query(collection(db, "auditLog"), orderBy("at", "desc"), limit(60)));
      const rows = snap.docs.map((d) => d.data());
      body.innerHTML = rows.length ? `<ul class="event-info-list">${rows.map((r) => {
        const icon = r.action === "created" ? "add_circle" : r.action === "cancelled" ? "event_busy" : "delete";
        const link = r.refId && r.action === "created"
          ? (["event", "office hours"].includes(r.kind) ? `/admin/event-${r.refId}`
            : r.kind === "board meeting" ? `/board/meeting-${r.refId}` : null)
          : null;
        const what = `${esc(r.kind || "")}${r.title ? ` · ${esc(r.title)}` : ""}`;
        return `<li><span class="info-label">${r.at ? `${fmtDate(r.at)} ${fmtTime(r.at)}` : "-"}</span>
          <span>${mi(icon, "sm")} <strong>${esc(r.name || "?")}</strong> ${esc(r.action)} ${link ? `<a href="${link}">${what}</a>` : what}</span></li>`;
      }).join("")}</ul>` : `<p class="form-hint">Nothing recorded yet - entries appear from the next created event, office hours, meeting, news post or merch item.</p>`;
    } catch (err) { body.innerHTML = `<p class="form-hint">Couldn't load the log: ${esc(err.message)}</p>`; }
  });

  // Weekly tickets mini-chart (v0.131): 8 aggregate queries, one per week.
  // Single series; value labels on the peak + latest bar (the bar colour
  // alone is below 3:1 on the light card, so labels carry the numbers).
  const chartCard = document.getElementById("week-chart-card");
  const loadWeekChart = async () => {
    const box = document.getElementById("week-chart");
    if (!box || box.dataset.loaded) return;
    box.dataset.loaded = "1";
    try {
      const weeks = [];
      for (let i = 7; i >= 0; i--) {
        const from = new Date(now.getTime() - (i + 1) * 7 * 86400e3);
        const to = new Date(now.getTime() - i * 7 * 86400e3);
        weeks.push({ from, to });
      }
      const sums = await Promise.all(weeks.map((w) =>
        getAggregateFromServer(query(regsCol, where("status", "in", ["paid", "free"]),
          where("createdAt", ">=", w.from), where("createdAt", "<", w.to)), { v: sum("quantity") })
          .then((r) => r.data().v || 0)));
      const max = Math.max(...sums, 1);
      const W = 480, H = 96, PADB = 18, bw = 44, gap = (W - 8 * bw) / 9;
      const maxIdx = sums.indexOf(Math.max(...sums));
      const bars = sums.map((v, i) => {
        const h = Math.max(v ? 3 : 1, Math.round((v / max) * (H - PADB - 16)));
        const x = gap + i * (bw + gap), y = H - PADB - h;
        const lab = weeks[i].from.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ_BE });
        const showVal = v && (i === maxIdx || i === sums.length - 1);
        return `<g><rect class="bar" x="${x}" y="${y}" width="${bw}" height="${h}" rx="4"><title>${lab}: ${v} ticket${v === 1 ? "" : "s"}</title></rect>
          ${showVal ? `<text class="bar-label" x="${x + bw / 2}" y="${y - 4}" text-anchor="middle">${v}</text>` : ""}
          ${i % 2 === 0 ? `<text class="bar-label" x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${lab}</text>` : ""}</g>`;
      }).join("");
      box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tickets per week, last 8 weeks">${bars}</svg>`;
    } catch { box.closest(".mini-chart-card")?.remove(); }
  };
  // Lazy (v0.137): the 8 aggregate queries only run when the chart is opened.
  chartCard?.addEventListener("toggle", () => { if (chartCard.open) loadWeekChart(); });

  const EV_PAGE = 30;
  let evShown = EV_PAGE;
  const renderRows = () => {
    const q = filter.q.trim().toLowerCase();
    let list = events.filter((ev) =>
      (filter.chip === "all" || catOf(ev) === filter.chip)
      && (!filter.tag || eventTagNames(ev).includes(filter.tag))
      && (!q || `${ev.title} ${ev.location || ""}`.toLowerCase().includes(q)));
    if (filter.chip === "upcoming") list = [...list].sort((a, b) => toDate(a.start) - toDate(b.start));
    const shown = list.slice(0, evShown);
    document.getElementById("admin-events").innerHTML = shown.length ? `
      <div class="table-wrap cards"><table>
        <thead><tr><th>Event</th><th>Date</th><th>Price</th><th>Sold</th><th>Attendance</th><th>Status</th><th></th></tr></thead>
        <tbody>${shown.map(rowHtml).join("")}</tbody>
      </table></div>
      ${list.length > shown.length ? `<div class="form-actions"><button class="btn btn-ghost btn-ink" id="ev-more">Show more (${list.length - shown.length} left)</button></div>` : ""}`
    : `<div class="empty-state"><p>${events.length ? "No events match." : "No events yet - create your first one!"}</p></div>`;
    document.getElementById("ev-more")?.addEventListener("click", () => { evShown += 100; renderRows(); });
  };
  renderRows();

  document.getElementById("ev-q").addEventListener("input", (e) => { filter.q = e.target.value; evShown = EV_PAGE; renderRows(); });
  $app.querySelectorAll("#ev-status-chips .chip").forEach((btn) => {
    btn.onclick = () => {
      filter.chip = btn.dataset.chip;
      evShown = EV_PAGE;
      $app.querySelectorAll("#ev-status-chips .chip").forEach((b) => b.classList.toggle("active", b === btn));
      renderRows();
    };
  });
  // Tag / cause filter (v0.107) - chips from the tags actually in use this year.
  const allTagNames = [...new Set(events.flatMap((ev) => eventTagNames(ev)))].sort();
  const renderTagChips = () => {
    const el = document.getElementById("ev-tag-chips");
    if (!el || !allTagNames.length) return;
    el.innerHTML = [
      `<button class="chip ${!filter.tag ? "active" : ""}" data-tag="">${mi("label", "sm")} All tags</button>`,
      ...allTagNames.map((tn) => `<button class="chip ${filter.tag === tn ? "active" : ""}" data-tag="${esc(tn)}">${esc(tn)}</button>`),
    ].join("");
    el.querySelectorAll(".chip").forEach((b) => {
      b.onclick = () => { filter.tag = b.dataset.tag || null; evShown = EV_PAGE; renderTagChips(); renderRows(); };
    });
  };
  renderTagChips();
  document.getElementById("ev-year")?.addEventListener("change", (e) => viewAdminList(parseInt(e.target.value, 10)));

  // Fill the Sold / Attendance columns with real per-event numbers
  // (server-side sums - correct even where the ticketsSold counter isn't).
  let statIdx = 0;
  const statWorker = async () => {
    while (statIdx < events.length) {
      const ev = events[statIdx++];
      try {
        const [s, c] = await Promise.all([
          getAggregateFromServer(query(regsCol, where("eventId", "==", ev.id), where("status", "in", ["paid", "free"])), { v: sum("quantity") }),
          getAggregateFromServer(query(regsCol, where("eventId", "==", ev.id), where("checkedInAt", ">", new Date(0))), { v: sum("quantity") }),
        ]);
        stats[ev.id] = { tickets: s.data().v || 0, checkedIn: c.data().v || 0 };
      } catch { stats[ev.id] = { tickets: 0, checkedIn: 0 }; }
      const soldCell = document.querySelector(`[data-sold="${ev.id}"]`);
      if (soldCell) soldCell.textContent = soldText(ev);
      const attCell = document.querySelector(`[data-att="${ev.id}"]`);
      if (attCell) attCell.textContent = attText(ev);
    }
  };
  Promise.all(Array.from({ length: 6 }, statWorker));

}

// ------------------------------------------------------------
// Quick form for office-hours sessions: date + times, no price,
// no capacity - and it can create a whole weekly series at once.
// Each session gets the auto shiftlist (Office duty, 2 board).
// ------------------------------------------------------------
async function viewAdminOfficeForm() {
  setLoading();
  const OFFICE_LOC = orgInfo.officeAddress;

  $app.innerHTML = `
    <h2 class="section-title">New office hours</h2>
    <div class="form-actions" style="margin:0 0 14px">
      <a href="/admin" class="btn btn-ghost btn-sm btn-ink">← Admin</a>
      <a href="/office" class="btn btn-ghost btn-sm btn-ink">${mi("visibility", "sm")} Office page</a>
    </div>
    <form class="form-card" id="office-form" style="max-width:640px">
      <p class="form-hint" style="margin-top:0">A lighter form than the full event one: office hours never have a price or capacity. Each session lands on the <a href="/office">Office page</a> and the calendar, students see a drop-in note, and a shiftlist with <strong>2 board spots</strong> is created automatically.</p>
      <div class="form-grid">
        <div class="form-field">
          <label for="of-date">First date *</label>
          <input id="of-date" type="date" required />
        </div>
        <div class="form-field">
          <label for="of-repeat">How many weeks?</label>
          <input id="of-repeat" type="number" min="1" max="20" value="1" />
          <span class="form-hint">1 = just this session; e.g. 12 = every week on this day for the semester.</span>
        </div>
        <div class="form-field">
          <label for="of-from">From *</label>
          <input id="of-from" type="time" required value="19:00" />
        </div>
        <div class="form-field">
          <label for="of-to">Until *</label>
          <input id="of-to" type="time" required value="21:00" />
        </div>
        <div class="form-field full">
          <label for="of-loc">Location</label>
          <input id="of-loc" maxlength="120" value="${esc(OFFICE_LOC)}" ${EVENT_LOCATIONS.length ? `list="of-loc-suggest"` : ""} />
          ${EVENT_LOCATIONS.length ? `<datalist id="of-loc-suggest">${EVENT_LOCATIONS.map((l) => `<option value="${esc(l)}"></option>`).join("")}</datalist>` : ""}
          ${locationPickerHtml("of", null, null)}
        </div>
        <div class="form-field full">
          <label for="of-note">Note (optional)</label>
          <input id="of-note" maxlength="200" placeholder="e.g. Last office hours before the break!" />
        </div>
        <div class="form-field full">
          <div class="checkbox-row">
            <input id="of-published" type="checkbox" checked />
            <label for="of-published"><strong>Publish immediately</strong> - visible to students and on the Office page</label>
          </div>
          <div class="checkbox-row">
            <input id="of-dsa" type="checkbox" checked />
            <label for="of-dsa"><strong>Register on the UGent activities site (DSA)</strong> ${hintIcon("On by default - office hours count as association activities for UGent. Untick to keep these sessions off dsa.ugent.be. You can also change this later per session via Edit event → Advanced.")}</label>
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-cyan">Create office hours</button>
        <a href="/admin" class="btn btn-ghost btn-danger">Cancel</a>
      </div>
    </form>
  `;

  const officePin = wireLocationPicker("of", "of-loc", null);

  document.getElementById("office-form").onsubmit = async (e) => {
    e.preventDefault();
    const dateVal = document.getElementById("of-date").value;
    const fromVal = document.getElementById("of-from").value;
    const toVal = document.getElementById("of-to").value;
    const weeks = Math.min(20, Math.max(1, parseInt(document.getElementById("of-repeat").value, 10) || 1));
    const locVal = document.getElementById("of-loc").value.trim() || OFFICE_LOC;
    const noteVal = document.getElementById("of-note").value.trim();
    const publish = document.getElementById("of-published").checked;
    if (!dateVal || !fromVal || !toVal) { toast("Fill in the date and both times.", "error"); return; }
    if (toVal <= fromVal) { toast("The end time must be after the start time.", "error"); return; }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Creating…";

    // Auto-attach (and if needed create) the "Office hours" tag for colour-coding.
    let officeTag = null;
    try {
      const tags = await fetchEventTags();
      officeTag = tags.find((t) => (t.name || "").toLowerCase() === "office hours") || null;
      if (!officeTag) {
        const ref = await addDoc(collection(db, "eventTags"), { name: "Office hours", color: "#00AEEF", createdAt: serverTimestamp() });
        officeTag = { id: ref.id, name: "Office hours", color: "#00AEEF" };
      }
    } catch { /* tag is nice-to-have */ }

    let created = 0;
    try {
      for (let w = 0; w < weeks; w++) {
        const day = new Date(`${dateVal}T00:00`);
        day.setDate(day.getDate() + 7 * w);
        const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
        const start = new Date(`${iso}T${fromVal}`);
        const end = new Date(`${iso}T${toVal}`);
        const data = {
          title: "Office hours",
          description: noteVal || "Drop by the ESN office - ESNcard pickup & cash payments, shop-order pickup, questions or just a chat. No ticket needed.",
          location: locVal,
          lat: officePin.lat, lng: officePin.lng,
          start: Timestamp.fromDate(start),
          end: Timestamp.fromDate(end),
          capacity: null, price: 0, priceEsn: null, esnOnly: false, esnLimit: null,
          options: null, currency: "eur", image: null,
          noAlumniDiscount: false, officeHours: true,
          dsaSync: document.getElementById("of-dsa").checked, // UGent DSA (v0.112): office hours push by default
          dsaTerrain: "ugent", // office = Therminal, UGent-managed (changeable per session via Edit event)
          cancelHours: 0, refundFee: 0, nonRefundable: false,
          tagId: officeTag ? officeTag.id : null,
          tagName: officeTag ? officeTag.name : null,
          tagColor: officeTag ? (officeTag.color || null) : null,
          tags: officeTag ? [{ id: officeTag.id, name: officeTag.name, color: officeTag.color || null }] : null,
          tagIds: officeTag ? [officeTag.id] : null,
          published: publish,
          ticketsSold: 0, esnSold: 0,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        };
        const ref = await addDoc(collection(db, "events"), data);
        await addDoc(collection(db, "shifts"), {
          eventId: ref.id, eventTitle: data.title, eventStart: data.start,
          task: "Office duty", time: `${fromVal}–${toVal}`,
          note: "Minimum two board members present (ESNcard & merch pickup, cash payments).",
          needBoard: 2, needVol: 0, officeHours: true,
          order: 0, createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, "events", ref.id), { hasShifts: true });
        created++;
        // Google Calendar: synced automatically server-side (v1.22).
      }
      logAudit("created", "office hours", `${created} session${created === 1 ? "" : "s"} (first: ${dateVal})`);
      toast(`${created} office-hours session${created === 1 ? "" : "s"} created - each with an Office duty shiftlist (2 board spots).`, "success");
      // DSA 72-hour rule for the nearest session (only when pushing to DSA).
      if (publish && document.getElementById("of-dsa")?.checked && new Date(`${dateVal}T${fromVal}`) - Date.now() < 72 * 3600e3) {
        toast("Heads-up: the first session is under 72 h away - DSA needs ≥72 h notice for UGent insurance.", "warn");
      }
      navigate("/admin");
    } catch (err) {
      toast(`Failed after ${created} session${created === 1 ? "" : "s"}: ${err.message}`, "error");
      btn.disabled = false; btn.textContent = "Create office hours";
    }
  };
}

async function viewAdminEventForm(eventId, dupFromId) {
  setLoading();
  let ev = null;
  let prefill = null;
  if (eventId) {
    try { ev = await fetchEvent(eventId); } catch { /* fallthrough */ }
    if (!ev) { $app.innerHTML = `<div class="empty-state"><p>Event not found.</p></div>`; return; }
  } else if (dupFromId) {
    try { prefill = await fetchEvent(dupFromId); } catch { /* fallthrough */ }
    if (prefill) {
      prefill = { ...prefill, title: `${prefill.title || ""} (copy)`, published: false };
      delete prefill.id;
      delete prefill.googleEventId;
      delete prefill.ticketsSold;
      delete prefill.esnSold;
      delete prefill.optionSold;
      delete prefill.hasShifts;
      delete prefill.googleEventId;
      delete prefill.dsaActivityId; // copy must NOT inherit the original's DSA activity (a PUT would overwrite it)
      delete prefill.lastInMarked;
    }
  }
  const f = ev || prefill; // field prefill (edit or duplicate)
  const eventTags = await fetchEventTags().catch(() => []);
  // Venue profiles (v0.115) - saved locations with picture/tags defaults.
  const venues = await getDocs(query(collection(db, "venues"), orderBy("name")))
    .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);
  const locSuggest = [...new Set([...venues.map((v) => (v.address ? `${v.name}, ${v.address}` : v.name)), ...EVENT_LOCATIONS])];
  // Shiftlist templates (v0.123) - fill the form's shift rows in one click.
  const shiftTpls = await getDocs(query(collection(db, "shiftTemplates"), orderBy("name")))
    .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);
  const toLocal = (ts) => {
    const d = toDate(ts);
    if (!d) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Advanced settings start open only when the event actually uses them -
  // a fresh form shows just the essentials. (Member price 0 = the
  // "members go free" checkbox in the essentials, not an advanced setting.)
  const advOpen = !!(f && ((Array.isArray(f.options) && f.options.length)
    || (f.priceEsn != null && f.priceEsn !== 0)
    || f.esnLimit || f.esnOnly || f.noAlumniDiscount || (f.refundFee > 0) || f.nonRefundable
    || (Array.isArray(f.audience) && f.audience.length)
    || f.dsaSync === false
    || (typeof f.cancelHours === "number" && f.cancelHours !== eventDefaults.defaultCancelHours)));

  $app.innerHTML = `
    <h2 class="section-title">${ev ? "Edit event" : dupFromId ? "New event (copied)" : "New event"}</h2>
    <div class="form-actions" style="margin:0 0 14px">
      <a href="/admin" class="btn btn-ghost btn-sm btn-ink">← All events</a>
    </div>
    <form class="form-card" id="event-form">

      <div class="form-section first">
        <div class="form-section-head">
          <span class="form-step">1</span>
          <div><strong>The essentials</strong><p class="form-hint">Name it, plan it, price it - that's a complete event. Everything else is optional.</p></div>
        </div>
        <div class="form-grid">
          <div class="form-field full">
            <label for="f-title">Event title *</label>
            <input id="f-title" required maxlength="120" placeholder="Beach party" value="${esc(f?.title || "")}" autofocus />
          </div>
          <div class="form-field">
            <label for="f-start">${mi("event", "sm")} Starts *</label>
            <input id="f-start" type="datetime-local" required value="${toLocal(f?.start)}" />
          </div>
          <div class="form-field">
            <label for="f-end">Ends ${hintIcon("Optional. Left empty, we suggest 3 hours after the start.")}</label>
            <input id="f-end" type="datetime-local" value="${toLocal(f?.end)}" />
          </div>
          <div class="form-field full">
            <label for="f-location">${mi("location_on", "sm")} Location ${hintIcon("Type the venue, then hit Enter or 'Pin on map' to pin the exact spot - powers the map and location statistics.")}</label>
            ${venues.length ? `<select id="f-venue" style="margin-bottom:6px">
              <option value="">- pick a saved venue (fills location, pin, tags &amp; picture) -</option>
              ${venues.map((v) => `<option value="${v.id}" ${f?.venueId === v.id ? "selected" : ""}>${esc(v.name)}${v.address ? ` - ${esc(v.address)}` : ""}</option>`).join("")}
            </select>` : ""}
            <input id="f-location" maxlength="140" placeholder="'t Kofschip, Ter Platen 8, Gent" value="${esc(f?.location || "")}" ${locSuggest.length ? `list="loc-suggest"` : ""} />
            ${locSuggest.length ? `<datalist id="loc-suggest">${locSuggest.map((l) => `<option value="${esc(l)}"></option>`).join("")}</datalist>` : ""}
            ${locationPickerHtml("f", f?.lat, f?.lng)}
          </div>
          <div class="form-field full">
            <label for="f-regmode">${mi("app_registration", "sm")} How do students join? ${hintIcon("Most events sell tickets here in the app. 'Just show up' is for open events like venue parties - the price fields become door prices shown on the event page. 'External sign-up' sends students to a partner's own form.")}</label>
            <select id="f-regmode">
              <option value="app" ${!f?.regMode || f.regMode === "app" ? "selected" : ""}>Tickets in the app - register or buy here (default)</option>
              <option value="none" ${f?.regMode === "none" ? "selected" : ""}>Just show up - no registration, pay at the door if needed</option>
              <option value="external" ${f?.regMode === "external" ? "selected" : ""}>External sign-up - a partner's form handles it</option>
            </select>
            <input id="f-ext-url" type="url" maxlength="300" placeholder="https://… (the partner's sign-up link)" value="${esc(f?.externalUrl || "")}" style="margin-top:8px" class="${f?.regMode === "external" ? "" : "hidden"}" />
            <span class="form-hint" id="regmode-hint"></span>
          </div>
          <div class="form-field">
            <label for="f-price">${mi("sell", "sm")} Ticket price in €</label>
            <input id="f-price" type="number" min="0" step="0.01" value="${f ? ((f.price || 0) / 100).toFixed(2) : "0.00"}" />
            <span class="form-hint" id="price-mode"></span>
          </div>
          <div class="form-field">
            <label for="f-capacity">${mi("groups", "sm")} Capacity ${hintIcon("Total tickets available. Leave blank for unlimited.")}</label>
            <input id="f-capacity" type="number" min="1" placeholder="unlimited" value="${f?.capacity || ""}" />
          </div>
          <div class="form-field full">
            <div class="checkbox-row">
              <input id="f-esn-free" type="checkbox" ${f?.priceEsn === 0 ? "checked" : ""} />
              <label for="f-esn-free"><strong>Free for ESNcard members</strong> - non-members pay the ticket price ${hintIcon("Verified ESNcard holders register for free; everyone else pays. For a custom member price instead, use Advanced settings → member price.")}</label>
            </div>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-head">
          <span class="form-step">2</span>
          <div><strong>Make it look good</strong><p class="form-hint">A photo and a short description do most of the selling.</p></div>
        </div>
        <div class="form-grid">
          <div class="form-field full">
            <label for="f-image-file">${mi("image", "sm")} Event photo ${hintIcon("Any photo works - auto-cropped to 16:9 and compressed. Canva tip: design at 1600 × 900 px.")}</label>
            <div class="img-upload-row">
              <img id="f-image-preview" class="img-preview ${f?.image ? "" : "hidden"}" src="${esc(f?.image || "")}" alt="" />
              <input id="f-image-file" type="file" accept="image/*" />
              <button type="button" id="f-image-remove" class="btn btn-ghost btn-sm btn-danger ${f?.image ? "" : "hidden"}">Remove photo</button>
            </div>
          </div>
          <div class="form-field">
            <label for="f-album">${mi("photo_library", "sm")} Photo album link ${hintIcon("Paste the album link (Google Photos or similar) AFTER the event - a 'Photos from this event' line appears on the event page. Empty = nothing shown.")}</label>
            <input id="f-album" type="url" maxlength="300" placeholder="https://photos.app.goo.gl/…" value="${esc(f?.albumUrl || "")}" />
          </div>
          <div class="form-field full">
            <label for="f-desc">${mi("notes", "sm")} Description ${hintIcon("Formatting: **bold**, *italic*, [link](https://...), '- ' for bullets, '## ' for a subheading.")}</label>
            <textarea id="f-desc" rows="5" placeholder="What's the plan? What's included? What should people bring?">${esc(f?.description || "")}</textarea>
            ${aiConfig.enabled ? `<div class="form-actions" style="margin-top:6px"><button type="button" class="btn btn-sm btn-ghost btn-ink" id="btn-ai-desc">${jacobImg("jacob-sm")} Let Jacob draft this</button><span class="form-hint">Jacob uses the title, time, place &amp; price you filled in - always give his draft a read before publishing.</span></div>` : ""}
          </div>
          ${(() => {
            // Categories vs ESN causes (v0.107) - every event needs ≥1 of EACH
            // (office-hours sessions are exempt). Shared checkbox class so the
            // submit handler collects both groups in one go.
            const tagChip = (t) => {
              const on = Array.isArray(f?.tagIds) ? f.tagIds.includes(t.id) : f?.tagId === t.id;
              return `<label title="${esc(t.esnCause ? `ESN cause: ${t.esnCause}` : "")}" style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:20px;padding:6px 12px;cursor:pointer;font-size:.88rem">
                <input type="checkbox" class="f-tag-cb" value="${esc(t.id)}" ${on ? "checked" : ""} style="accent-color:${esc(t.color || "#2E3192")}" />
                <span class="badge" style="background:${esc(t.color || "#2E3192")}">${esc(t.name)}</span>
              </label>`;
            };
            // ONE tag list (v0.118): each tag carries its DSA type + ESN
            // cause as links - legacy cause tags are hidden from the picker.
            const pickTags = eventTags.filter((t) => t.cause !== true);
            return `
          <div class="form-field full">
            <label>${mi("label", "sm")} Tags * ${hintIcon("At least one - colour-codes cards & the calendar (the FIRST ticked gives the colour) and counts as a passport visa for attendees. Each tag automatically carries its ESN cause (Insights statistics) and DSA activity type - linked per tag in Admin → Settings → Event tags.")}</label>
            <div id="f-tags" style="display:flex;flex-wrap:wrap;gap:8px">
              ${pickTags.map(tagChip).join("") || `<span class="form-hint">No tags yet - the superadmin can load the ESN Gent starter set with one click in Admin → Settings → Event tags.</span>`}
            </div>
          </div>
          <div class="form-field full">
            <label>Event icon ${hintIcon("The pictogram on the passport stamp attendees earn. 'Auto' uses the first tag's icon (set per tag in Admin -> Settings -> Event tags); tap one here to override it for this event only.")}</label>
            <input type="hidden" id="f-icon" value="${esc(f?.icon || "")}" />
            <div class="icon-pick" id="f-icon-pick">
              <button type="button" class="icon-opt icon-auto ${!f?.icon ? "sel" : ""}" data-ic="">Auto</button>
              ${iconGridHtml(f?.icon || null)}
            </div>
          </div>`;
          })()}
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-head">
          <span class="form-step">3</span>
          <div><strong>Shiftlist</strong> <span class="form-hint">(optional)</span><p class="form-hint">Who works this event? Add the shifts now - the team signs up on the <a href="/shifts" target="_blank">Shiftlists page</a>.</p></div>
        </div>
        ${ev?.hasShifts ? `<p class="form-hint" style="margin:0 0 10px">${mi("schedule", "sm")} This event already has a shiftlist - <a href="/admin/shifts-${ev.id}">open the full editor</a> to change existing shifts. Rows added below are appended to it.</p>` : ""}
        <div id="shifts-list"></div>
        <div class="form-actions" style="align-self:flex-start;align-items:center">
          <button type="button" class="btn btn-ghost btn-sm btn-ink" id="btn-add-shift">+ Add shift</button>
          ${shiftTpls.length ? `
          <select id="f-shift-tpl" class="inline-input" style="width:auto" title="Board-managed shiftlist templates (Party, Therminal event, Cantus…) - managed on any event's full shiftlist editor">
            <option value="">Apply a template…</option>
            ${shiftTpls.map((t) => `<option value="${t.id}">${esc(t.name)} (${(t.shifts || []).length})</option>`).join("")}
          </select>` : ""}
        </div>
        <datalist id="shift-task-names">${SHIFT_TASKS.map((t) => `<option value="${esc(t)}"></option>`).join("")}</datalist>
      </div>

      <details class="adv-panel" id="f-advanced" ${advOpen ? "open" : ""}>
        <summary>
          <span class="form-step" style="background:var(--esn-orange)">${mi("tune", "sm")}</span>
          <span><strong>Advanced settings</strong><br>
          <span class="form-hint">Ticket types · member pricing · who can join · cancellation &amp; refunds${advOpen ? " - <b>in use for this event</b>" : ""}</span></span>
        </summary>
        <div class="adv-body">

          <p class="adv-heading">${mi("confirmation_number", "sm")} Ticket types <span class="form-hint">- multiple choices (e.g. with/without brewery visit); they replace the single price above</span></p>
          <div id="options-list"></div>
          <button type="button" class="btn btn-ghost btn-sm btn-ink" id="btn-add-option" style="align-self:flex-start">+ Add ticket type</button>

          <p class="adv-heading">${mi("badge", "sm")} ESNcard members</p>
          <div class="form-grid">
            <div class="form-field">
              <label for="f-price-esn">Member price in € ${hintIcon("Verified ESNcard holders pay this automatically. For 'members go free', use the checkbox in the essentials instead.")}</label>
              <input id="f-price-esn" type="number" min="0" step="0.01" placeholder="no discount" value="${f?.priceEsn != null && f.priceEsn !== 0 ? (f.priceEsn / 100).toFixed(2) : ""}" />
            </div>
            <div class="form-field">
              <label for="f-esn-limit">Max member spots ${hintIcon("Caps how many member-priced spots exist for this event.")}</label>
              <input id="f-esn-limit" type="number" min="1" placeholder="no limit" value="${f?.esnLimit || ""}" />
            </div>
            <div class="form-field full">
              <div class="checkbox-row">
                <input id="f-esn-only" type="checkbox" ${f?.esnOnly ? "checked" : ""} />
                <label for="f-esn-only">Members only ${hintIcon("A verified ESNcard (or alumni status) is required to register at all.")}</label>
              </div>
              <div class="checkbox-row">
                <input id="f-no-alumni" type="checkbox" ${f?.noAlumniDiscount ? "checked" : ""} />
                <label for="f-no-alumni">Trip - no alumni discount ${hintIcon("Statutes Art. 7 §3: alumni pay the full price on national/international trips but keep member-only access.")}</label>
              </div>
            </div>
          </div>

          <p class="adv-heading">${mi("group", "sm")} Who can join? <span class="form-hint">- leave everything unticked for a normal public event</span></p>
          <div class="form-field full">
            <div style="display:flex;flex-wrap:wrap;gap:8px 18px">
              ${AUDIENCE_OPTIONS.map(([key, label, sub]) => `
              <label class="checkbox-row" style="margin:0;white-space:nowrap">
                <input type="checkbox" class="f-aud-cb" value="${key}" ${Array.isArray(f?.audience) && f.audience.includes(key) ? "checked" : ""} />
                ${label}${sub ? ` <small class="form-hint">(${sub})</small>` : ""}
              </label>`).join("")}
            </div>
            <span class="form-hint" style="margin-top:6px">Tick one or more groups to make this a <strong>team event</strong>: invisible to regular students, never on the public Google Calendar, no "new event" push - and only the ticked groups can register (checked server-side). Example: an alumni quiz open to board &amp; volunteers too = tick all three.</span>
          </div>

          <p class="adv-heading">${mi("sync", "sm")} Sync switches <span class="form-hint">- Google Calendar &amp; the UGent activities site</span></p>
          <div class="form-field full">
            <div class="checkbox-row">
              <input id="f-cal" type="checkbox" ${!f || f.calSync !== false ? "checked" : ""} />
              <label for="f-cal"><strong>Sync to the public Google Calendar</strong> ${hintIcon("On by default: published events appear on the ESN Gent calendar that students subscribe to, and edits update them. Untick to keep this event off the calendar (it is removed there if it was already synced) - same idea as the DSA switch below.")}</label>
            </div>
            <div class="checkbox-row">
              <input id="f-dsa" type="checkbox" ${!f || f.dsaSync !== false ? "checked" : ""} />
              <label for="f-dsa"><strong>Publish on the UGent activities site (DSA)</strong> ${hintIcon("On by default: when the event is PUBLISHED it's pushed to dsa.ugent.be automatically, edits update it, and cancelling/unpublishing (or unticking this) removes it again. Office hours and team events (board meetings & co) are pushed too - team events are registered as PRIVATE activities (invitation-only: visible only to board/konvent/DSA, don't count toward the 10 required activities). Untick to keep this one off the DSA site. Requires the DSA API key + association setup in Admin → Settings.")}</label>
            </div>
          </div>
          <div class="form-field">
            <label for="f-dsa-terrain">Location type - for DSA ${hintIcon("Where the activity physically takes place, in DSA's categories. 'Buitenland' matters for UGent insurance on trips abroad; 'Openbaar domein' = streets/parks/squares run by the city; 'UGent-domein' = UGent buildings & TimeEdit rooms; 'Andere' = private venues like bars and clubs.")}</label>
            <select id="f-dsa-terrain">
              ${DSA_TERRAINS_UI.map(([v, l]) => `<option value="${v}" ${(f?.dsaTerrain || "other") === v ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>

          <p class="adv-heading">${mi("currency_exchange", "sm")} Cancellation &amp; refunds ${hintIcon("These appear in the ticket policy students agree to before booking.")}</p>
          <div class="form-grid">
            <div class="form-field">
              <label for="f-cancel-hours">Cancellation deadline (hours before start) ${hintIcon("Free cancellations & refund requests close this many hours before the event. 0 = until it starts. Standard: 24.")}</label>
              <input id="f-cancel-hours" type="number" min="0" step="1" value="${typeof f?.cancelHours === "number" ? f.cancelHours : eventDefaults.defaultCancelHours}" />
            </div>
            <div class="form-field">
              <label for="f-refund-fee">Refund fee in € ${hintIcon("Deducted from student-requested refunds (covers the Stripe cost). Never applied when ESN cancels the event. Standard: €0.50.")}</label>
              <input id="f-refund-fee" type="number" min="0" step="0.01" placeholder="0 = full refund" value="${f ? (typeof f.refundFee === "number" && f.refundFee > 0 ? (f.refundFee / 100).toFixed(2) : "") : (eventDefaults.defaultRefundFee / 100).toFixed(2)}" />
            </div>
            <div class="form-field full">
              <div class="checkbox-row">
                <input id="f-nonrefundable" type="checkbox" ${f?.nonRefundable ? "checked" : ""} />
                <label for="f-nonrefundable"><strong>Non-refundable</strong> ${hintIcon("Paid tickets can't be refunded at all - use for trips with upfront costs. Shown clearly in the ticket policy.")}</label>
              </div>
            </div>
          </div>
        </div>
      </details>

      <div class="publish-bar">
        <div class="form-actions" style="margin:0;align-items:flex-end">
          <div class="form-field" style="margin:0">
            <label for="f-status">Status ${hintIcon("Draft: only the team sees it (and can plan shifts). Published: visible & bookable for students, and it lands on the Google Calendar automatically.")}</label>
            <select id="f-status" style="width:auto">
              <option value="draft" ${f?.published ? "" : "selected"}>Draft - team only</option>
              <option value="published" ${f?.published ? "selected" : ""}>Published - live for students</option>
            </select>
          </div>
          <button type="submit" class="btn btn-green">${ev ? "Save changes" : "Create event"}</button>
          <a href="/admin" class="btn btn-ghost btn-danger">Cancel</a>
          ${ev ? `<button type="button" id="btn-delete" class="btn btn-ghost btn-danger" style="margin-left:auto;color:var(--esn-magenta);border-color:var(--esn-magenta)">Delete event</button>` : ""}
        </div>
      </div>
    </form>
  `;

  const geoPin = wireLocationPicker("f", "f-location", f);
  // Visual icon picker (v0.126): tap a tile, the hidden #f-icon holds it.
  document.getElementById("f-icon-pick")?.addEventListener("click", (e2) => {
    const b = e2.target.closest(".icon-opt");
    if (!b) return;
    document.getElementById("f-icon").value = b.dataset.ic || "";
    document.querySelectorAll("#f-icon-pick .icon-opt").forEach((x) => x.classList.toggle("sel", x === b));
  });
  // Venue preset (v0.115): picking one fills location + map pin, pre-ticks
  // its default tags (never unticks yours) - the default picture applies at
  // save time when no image is uploaded.
  document.getElementById("f-venue")?.addEventListener("change", (e2) => {
    const v = venues.find((x) => x.id === e2.target.value);
    if (!v) return;
    document.getElementById("f-location").value = v.address ? `${v.name}, ${v.address}` : v.name;
    if (v.lat != null && v.lng != null) { geoPin.lat = v.lat; geoPin.lng = v.lng; }
    (v.tagIds || []).forEach((tid) => {
      const cb = [...document.querySelectorAll(".f-tag-cb")].find((c) => c.value === tid);
      if (cb) cb.checked = true;
    });
    // Venue's DSA location type (v0.122) - e.g. sports hall → UGent-domein.
    if (v.dsaTerrain) {
      const ter = document.getElementById("f-dsa-terrain");
      if (ter) ter.value = v.dsaTerrain;
    }
    toast(`"${v.name}" applied - location${v.tagIds?.length ? " + default tags" : ""}${v.dsaTerrain ? ` + DSA location (${(DSA_TERRAINS_UI.find(([k]) => k === v.dsaTerrain) || [])[1]?.split(" - ")[0] || v.dsaTerrain})` : ""}${v.image ? "; its picture is used if you don't upload one" : ""}.`, "success");
  });

  // UX helpers: suggest an end time, live free/paid hint, gentle validation
  const priceMode = document.getElementById("price-mode");
  const regModeEl = document.getElementById("f-regmode");
  const updatePriceMode = () => {
    const v = parseFloat(document.getElementById("f-price").value);
    const mode = regModeEl.value;
    if (mode === "none") {
      priceMode.textContent = !v ? "Free entry at the door - shown on the event page."
        : `Door price - shown as "${fmtMoney(Math.round(v * 100))} at the door" (tick the ESNcard box for member entry).`;
    } else if (mode === "external") {
      priceMode.textContent = "Shown as info only - payment/sign-up happens on the partner's page.";
    } else {
      priceMode.textContent = !v ? "FREE event - students register in one tap."
        : `Paid event - checkout via Stripe (${fmtMoney(Math.round(v * 100))}).`;
    }
  };
  const updateRegMode = () => {
    document.getElementById("f-ext-url").classList.toggle("hidden", regModeEl.value !== "external");
    document.getElementById("regmode-hint").textContent =
      regModeEl.value === "none" ? "No tickets, no capacity - the event page says 'just show up' with the door prices."
      : regModeEl.value === "external" ? "The event page shows one button that opens this link." : "";
    updatePriceMode();
  };
  updateRegMode();
  regModeEl.addEventListener("change", updateRegMode);

  // AI: draft the description from what's already in the form (board tool)
  document.getElementById("btn-ai-desc")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const title = document.getElementById("f-title").value.trim();
    if (!title) { toast("Give the event a title first - Jacob needs something to work with.", "warn"); return; }
    const notes = await appPrompt("Anything Jacob should mention? (optional - themes, dress code, what's included…)", {
      multiline: true, rows: 4, maxlength: 600, placeholder: "e.g. 90s theme, first drink included, bring your student card", okLabel: "Ask Jacob",
    });
    if (notes === null) return;
    const startVal = document.getElementById("f-start").value;
    const priceEur = parseFloat(document.getElementById("f-price").value || "0");
    const esnFree = document.getElementById("f-esn-free").checked;
    const priceInfo = document.getElementById("f-regmode").value === "none"
      ? (priceEur ? `${fmtMoney(Math.round(priceEur * 100))} at the door${esnFree ? ", free with ESNcard" : ""}` : "free entry")
      : (priceEur ? `${fmtMoney(Math.round(priceEur * 100))}${esnFree ? ", free for ESNcard members" : ""}` : "free");
    btn.disabled = true;
    const oldLabel = btn.innerHTML;
    btn.innerHTML = `${mi("hourglass_top", "sm")} Jacob is writing…`;
    try {
      const fn = httpsCallable(functions, "aiAssist");
      const res = await fn({
        task: "eventDescription",
        title,
        when: startVal ? new Date(startVal).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "",
        location: document.getElementById("f-location").value.trim(),
        priceInfo,
        notes: notes.trim(),
      });
      const descEl = document.getElementById("f-desc");
      if (descEl.value.trim() && !await appConfirm("Replace the current description with Jacob's draft?", { okLabel: "Replace it", cancelLabel: "Keep mine" })) {
        btn.disabled = false; btn.innerHTML = oldLabel; return;
      }
      descEl.value = res.data.text;
      toast("Jacob's draft is ready - give it a read and tweak what feels off.", "success");
    } catch (err) { toast(err.message || "Jacob couldn't write a draft - try again.", "error"); }
    btn.disabled = false;
    btn.innerHTML = oldLabel;
  });
  document.getElementById("f-price").addEventListener("input", updatePriceMode);
  document.getElementById("f-start").addEventListener("change", (e) => {
    const endEl = document.getElementById("f-end");
    if (!endEl.value && e.target.value) {
      const d = new Date(e.target.value);
      d.setHours(d.getHours() + 3);
      const pad = (n) => String(n).padStart(2, "0");
      endEl.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  });
  const markError = (id, msg) => {
    const el = document.getElementById(id);
    el.classList.add("field-error");
    el.addEventListener("input", () => el.classList.remove("field-error"), { once: true });
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
    toast(msg, "error");
  };

  // --- ticket type rows ---
  const optionsState = (f?.options || []).map((o) => ({ ...o }));
  const collectOptions = () => {
    document.querySelectorAll("#options-list .option-row").forEach((row) => {
      const i = +row.dataset.i;
      const p = parseFloat(row.querySelector(".opt-price").value);
      const peVal = row.querySelector(".opt-price-esn").value;
      const pe = peVal === "" ? null : parseFloat(peVal);
      const cap = parseInt(row.querySelector(".opt-cap").value, 10);
      optionsState[i] = {
        id: optionsState[i]?.id || (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : String(Math.random()).slice(2, 10)),
        name: row.querySelector(".opt-name").value.trim(),
        price: Number.isFinite(p) && p >= 0 ? Math.round(p * 100) : 0,
        priceEsn: pe != null && Number.isFinite(pe) && pe >= 0 ? Math.round(pe * 100) : null,
        capacity: Number.isFinite(cap) && cap > 0 ? cap : null,
      };
    });
  };
  const renderOptionRows = () => {
    document.getElementById("options-list").innerHTML =
      (optionsState.length ? `<div class="option-head"><span>Name</span><span>Price €</span><span>ESNcard €</span><span>Max</span><span></span></div>` : "") +
      optionsState.map((o, i) => `
      <div class="option-row" data-i="${i}">
        <input class="opt-name" placeholder="Name (e.g. With brewery visit)" maxlength="80" value="${esc(o.name || "")}" />
        <input class="opt-price" type="number" min="0" step="0.01" placeholder="€" title="Price €" value="${o.price != null ? (o.price / 100).toFixed(2) : ""}" />
        <input class="opt-price-esn" type="number" min="0" step="0.01" placeholder="Member €" title="ESNcard price €" value="${o.priceEsn != null ? (o.priceEsn / 100).toFixed(2) : ""}" />
        <input class="opt-cap" type="number" min="1" placeholder="max" title="Capacity" value="${o.capacity || ""}" />
        <button type="button" class="btn btn-sm btn-ghost opt-del btn-danger" title="Remove">✕</button>
      </div>`).join("");
    document.querySelectorAll("#options-list .opt-del").forEach((b) => {
      b.onclick = () => {
        collectOptions();
        optionsState.splice(+b.closest(".option-row").dataset.i, 1);
        renderOptionRows();
      };
    });
  };
  renderOptionRows();
  document.getElementById("btn-add-option").onclick = () => {
    collectOptions();
    optionsState.push({ name: "", price: 0, priceEsn: null, capacity: null });
    renderOptionRows();
  };

  // --- shiftlist rows (v0.103) - created as shifts docs on save ---
  const shiftState = [];
  const collectShifts = () => {
    document.querySelectorAll("#shifts-list .option-row").forEach((row) => {
      const i = +row.dataset.i;
      const b = parseInt(row.querySelector(".sh-board").value, 10);
      const v = parseInt(row.querySelector(".sh-vol").value, 10);
      shiftState[i] = {
        task: row.querySelector(".sh-task").value.trim(),
        time: row.querySelector(".sh-time").value.trim(),
        board: Number.isFinite(b) && b > 0 ? b : 0,
        vol: Number.isFinite(v) && v > 0 ? v : 0,
      };
    });
  };
  const renderShiftRows = () => {
    document.getElementById("shifts-list").innerHTML =
      (shiftState.length ? `<div class="option-head"><span>Task</span><span>Time</span><span>Board</span><span>Volunteers</span><span></span></div>` : "") +
      shiftState.map((s, i) => `
      <div class="option-row" data-i="${i}">
        <input class="sh-task" list="shift-task-names" placeholder="Task (e.g. Bar shift)" maxlength="80" value="${esc(s.task || "")}" />
        <input class="sh-time" placeholder="21:00–23:00" maxlength="40" title="Time (free text)" value="${esc(s.time || "")}" />
        <input class="sh-board" type="number" min="0" placeholder="board" title="Board spots" value="${s.board || ""}" />
        <input class="sh-vol" type="number" min="0" placeholder="vol." title="Volunteer spots" value="${s.vol || ""}" />
        <button type="button" class="btn btn-sm btn-danger-solid sh-del" title="Remove">✕</button>
      </div>`).join("");
    document.querySelectorAll("#shifts-list .sh-del").forEach((b) => {
      b.onclick = () => {
        collectShifts();
        shiftState.splice(+b.closest(".option-row").dataset.i, 1);
        renderShiftRows();
      };
    });
  };
  renderShiftRows();
  document.getElementById("btn-add-shift").onclick = () => {
    collectShifts();
    shiftState.push({ task: "", time: "", board: 1, vol: 0 });
    renderShiftRows();
  };
  document.getElementById("f-shift-tpl")?.addEventListener("change", (e2) => {
    const tpl = shiftTpls.find((t) => t.id === e2.target.value);
    if (!tpl) return;
    collectShifts();
    (tpl.shifts || []).forEach((s) => shiftState.push({ task: s.task || "", time: s.time || "", board: s.needBoard || 0, vol: s.needVol || 0 }));
    renderShiftRows();
    e2.target.value = "";
    toast(`Template "${tpl.name}" added ${(tpl.shifts || []).length} shift row${(tpl.shifts || []).length === 1 ? "" : "s"} - they're created when you save the event.`, "success");
  });

  let imageData = f?.image || null;
  const preview = document.getElementById("f-image-preview");
  const removeBtn = document.getElementById("f-image-remove");
  document.getElementById("f-image-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      imageData = await compressCardImage(file);
      preview.src = imageData;
      preview.classList.remove("hidden");
      removeBtn.classList.remove("hidden");
    } catch (err) {
      toast(err?.message || "That image cannot be used - try a different photo (JPG or PNG).", "error");
      e.target.value = "";
    }
  });
  removeBtn.addEventListener("click", () => {
    imageData = null;
    preview.classList.add("hidden");
    removeBtn.classList.add("hidden");
    document.getElementById("f-image-file").value = "";
  });

  document.getElementById("event-form").onsubmit = async (e) => {
    e.preventDefault();
    // One save at a time (v0.140): a double-tap on Create must never make
    // two events. The busy state clears on every early return via saveDone().
    const saveBtn = e.target.querySelector('button[type="submit"]');
    if (saveBtn?.disabled) return;
    const saveDone = () => btnIdle(saveBtn);
    btnBusy(saveBtn, ev ? "Saving…" : "Creating event…");
    const startVal = document.getElementById("f-start").value;
    const endVal = document.getElementById("f-end").value;
    const priceEur = parseFloat(document.getElementById("f-price").value || "0");
    const capVal = parseInt(document.getElementById("f-capacity").value, 10);
    const regMode = document.getElementById("f-regmode").value;
    let externalUrl = document.getElementById("f-ext-url").value.trim();
    if (regMode === "external") {
      if (externalUrl && !/^https?:\/\//i.test(externalUrl)) externalUrl = "https://" + externalUrl;
      if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(externalUrl)) {
        markError("f-ext-url", "External sign-up needs a valid link (https://…).");
        saveDone();
        return;
      }
    } else {
      externalUrl = "";
    }
    const data = {
      regMode,
      externalUrl: externalUrl || null,
      title: document.getElementById("f-title").value.replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "").trim().slice(0, 120),
      description: document.getElementById("f-desc").value.trim(),
      location: document.getElementById("f-location").value.trim(),
      venueId: document.getElementById("f-venue")?.value || null, // venue profile (v0.115) - feeds per-venue stats
      albumUrl: document.getElementById("f-album").value.trim() || null,
      lat: geoPin.lat, lng: geoPin.lng,
      start: Timestamp.fromDate(new Date(startVal)),
      end: endVal ? Timestamp.fromDate(new Date(endVal)) : null,
      capacity: regMode === "app" && Number.isFinite(capVal) && capVal > 0 ? capVal : null,
      price: Math.max(0, Math.round((Number.isFinite(priceEur) ? priceEur : 0) * 100)),
      priceEsn: (() => {
        // "Free for ESNcard members" in the essentials wins; otherwise the
        // custom member price from Advanced settings (empty = no discount).
        if (document.getElementById("f-esn-free").checked) return 0;
        const v = document.getElementById("f-price-esn").value;
        if (v === "") return null;
        const n = parseFloat(v);
        return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
      })(),
      esnOnly: document.getElementById("f-esn-only").checked,
      noAlumniDiscount: document.getElementById("f-no-alumni").checked,
      // Office-hours sessions are created via the quick form only; the flag
      // is preserved when editing an existing session.
      officeHours: ev?.officeHours === true,
      cancelHours: (() => {
        const n = parseInt(document.getElementById("f-cancel-hours").value, 10);
        return Number.isFinite(n) && n >= 0 ? n : 24;
      })(),
      refundFee: (() => {
        const v = parseFloat(document.getElementById("f-refund-fee").value);
        return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
      })(),
      nonRefundable: document.getElementById("f-nonrefundable").checked,
      ...((() => {
        // Multi-tag (v0.103) + causes (v0.107): tags/tagIds arrays; the
        // legacy single-tag fields mirror the FIRST CATEGORY tag (colour).
        const ids = [...document.querySelectorAll(".f-tag-cb:checked")].map((c) => c.value);
        const sel = ids.map((tid) => eventTags.find((x) => x.id === tid)).filter(Boolean)
          .map((t) => ({ id: t.id, name: t.name, color: t.color || null, ...(t.cause === true ? { cause: true } : {}), ...(t.esnCause ? { esnCause: t.esnCause } : {}), ...(t.icon ? { icon: t.icon } : {}) }));
        const first = sel.find((t) => !t.cause) || sel[0] || null;
        return {
          tags: sel.length ? sel : null,
          tagIds: sel.length ? sel.map((t) => t.id) : null,
          tagId: first ? first.id : null,
          tagName: first ? first.name : null,
          tagColor: first ? first.color : null,
        };
      })()),
      audience: (() => {
        const a = [...document.querySelectorAll(".f-aud-cb:checked")].map((c) => c.value);
        return a.length ? a : null;
      })(),
      // UGent DSA sync (v0.110): on by default; false = keep off the DSA site
      // (and remove it there if it was already pushed).
      dsaSync: document.getElementById("f-dsa").checked,
      dsaTerrain: document.getElementById("f-dsa-terrain").value || "other", // DSA terrain token (v0.113)
      calSync: document.getElementById("f-cal").checked, // Google Calendar switch (v0.125)
      icon: document.getElementById("f-icon")?.value || null, // stamp pictogram (v0.125)
      esnLimit: (() => {
        const n = parseInt(document.getElementById("f-esn-limit").value, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
      })(),
      options: (() => {
        collectOptions();
        const opts = optionsState.filter((o) => o.name);
        return opts.length ? opts : null;
      })(),
      currency: "eur",
      image: null, // filled in below - uploaded to Cloud Storage at save time
      published: document.getElementById("f-status").value === "published",
      updatedAt: serverTimestamp(),
    };
    if (!data.title) { markError("f-title", "Give the event a title."); saveDone(); return; }
    if (!startVal) { markError("f-start", "Set a start date and time."); saveDone(); return; }
    if (endVal && new Date(endVal) < new Date(startVal)) { markError("f-end", "The end time is before the start time."); saveDone(); return; }
    // Past events happen (backfilling attendance) but usually mean a typo.
    if (!ev && new Date(startVal) < new Date(Date.now() - 3600e3)) {
      if (!await appConfirm(`This event starts in the PAST (${fmtDate(new Date(startVal))}). Create it anyway?`)) { saveDone(); return; }
    }
    // Every event carries ≥1 category tag AND ≥1 ESN cause (v0.107) -
    // office-hours sessions are exempt (they get the Office tag automatically).
    if (!data.officeHours) {
      // v0.118: ONE tag list - each tag carries its ESN cause + DSA type.
      if (!(data.tags || []).length) {
        toast("Pick at least one tag - it colours the event, counts as a passport visa and carries the ESN cause & DSA type.", "warn");
        document.getElementById("f-tags")?.scrollIntoView({ behavior: "smooth", block: "center" });
        saveDone();
        return;
      }
    }
    try {
      data.image = await storeImage(imageData, "events");
      // Venue default picture (v0.115): fills in when no image was uploaded.
      if (!data.image && data.venueId) {
        const vv = venues.find((x) => x.id === data.venueId);
        if (vv?.image) data.image = vv.image;
      }
      // Never delete a VENUE's shared image file - other events use it too.
      const venueImgs = new Set(venues.map((x) => x.image).filter(Boolean));
      if (ev?.image && ev.image !== data.image && !venueImgs.has(ev.image)) deleteStoredImage(ev.image);
      let eventId;
      if (ev) {
        await updateDoc(doc(db, "events", ev.id), data);
        eventId = ev.id;
        toast("Event updated", "success");
      } else {
        const ref = await addDoc(collection(db, "events"), { ...data, ticketsSold: 0, esnSold: 0, createdAt: serverTimestamp() });
        eventId = ref.id;
        logAudit("created", "event", data.title, ref.id);
        toast("Event created", "success");
      }
      // DSA 72-hour rule: activities must be announced ≥72h ahead to be
      // covered by UGent insurance (and known to security services).
      if (data.published && data.dsaSync !== false) {
        const lead = toDate(data.start) - Date.now();
        if (lead > 0 && lead < 72 * 3600e3) toast("Heads-up: DSA requires announcing activities ≥72 h in advance - this one is closer than that, so it may not be covered by UGent insurance.", "warn");
      }
      // Shiftlist rows from the form (v0.103) - appended as shifts docs.
      collectShifts();
      const newShifts = shiftState.filter((s) => s.task);
      if (newShifts.length) {
        try {
          for (let i = 0; i < newShifts.length; i++) {
            const s = newShifts[i];
            await addDoc(collection(db, "shifts"), {
              eventId, eventTitle: data.title, eventStart: data.start,
              task: s.task, time: s.time, note: "",
              needBoard: s.board, needVol: s.vol, officeHours: false,
              order: (ev?.hasShifts ? 100 : 0) + i, createdAt: serverTimestamp(),
            });
          }
          await updateDoc(doc(db, "events", eventId), { hasShifts: true });
          toast(`Shiftlist ${ev?.hasShifts ? "extended" : "created"} - ${newShifts.length} shift${newShifts.length === 1 ? "" : "s"}. The team signs up on the Shiftlists page.`, "success");
        } catch { /* non-fatal - the board can add shifts by hand */ }
      }
      // Office-hours sessions always need at least 2 board members present -
      // create the shiftlist automatically the first time the box is ticked.
      if (data.officeHours && !ev?.hasShifts) {
        try {
          const existingShifts = await getDocs(query(collection(db, "shifts"), where("eventId", "==", eventId)));
          if (existingShifts.empty) {
            await addDoc(collection(db, "shifts"), {
              eventId, eventTitle: data.title, eventStart: data.start,
              task: "Office duty",
              time: "",
              note: "Minimum two board members present (ESNcard & merch pickup, cash payments).",
              needBoard: 2, needVol: 0, officeHours: true,
              order: 0, createdAt: serverTimestamp(),
            });
            await updateDoc(doc(db, "events", eventId), { hasShifts: true });
            toast("Shiftlist created: Office duty - 2 board spots", "success");
          }
        } catch { /* non-fatal - the board can add shifts by hand */ }
      }
      // Google Calendar: synced automatically server-side (v1.22) - no popup.
      navigate("/admin");
    } catch (err) {
      toast("Save failed: " + err.message, "error");
      saveDone();
    }
  };

  document.getElementById("btn-delete")?.addEventListener("click", async () => {
    if (!await appConfirm(`Delete “${ev.title}”? Registrations are kept but the event disappears. This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "events", ev.id));
      logAudit("deleted", ev.officeHours ? "office hours" : "event", ev.title, ev.id);
      deleteStoredImage(ev.image);
      // Google Calendar entry is removed automatically server-side (v1.22).
      toast("Event deleted", "success");
      navigate("/admin");
    } catch (err) {
      toast("Delete failed: " + err.message, "error");
    }
  });
}

async function viewAdminEventDetail(eventId) {
  setLoading();
  let ev, regs, waitlist, eventFeedback = [];
  try {
    [ev, regs, waitlist, eventFeedback] = await Promise.all([
      fetchEvent(eventId),
      fetchRegistrationsForEvent(eventId),
      getDocs(query(collection(db, "waitlist"), where("eventId", "==", eventId), orderBy("createdAt", "asc")))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      getDocs(query(collection(db, "feedback"), where("eventId", "==", eventId)))
        .then((s) => s.docs.map((d) => d.data()))
        .catch(() => []),
    ]);
  } catch (e) { $app.innerHTML = errorState(e.message); return; }
  if (!ev) { $app.innerHTML = `<div class="empty-state"><p>Event not found.</p></div>`; return; }
  ev.id = ev.id || eventId;
  const isPastEvent = toDate(ev.end || ev.start) < new Date();
  const regFilter = { q: "", chip: "all" }; // all | in | out
  let edRegsShown = 100;

  $app.innerHTML = `
    <h2 class="section-title">${esc(ev.title)} - registrations</h2>
    ${ev.cancelled ? `<p style="margin:-6px 0 14px"><span class="badge badge-soldout">EVENT CANCELLED</span> <span class="form-hint">${esc(ev.cancelReason || "")}${ev.cancelledByName ? ` - by ${esc(ev.cancelledByName)}` : ""}</span></p>` : ""}
    <div class="form-actions" style="margin:0 0 18px">
      <a href="/admin" class="btn btn-ghost btn-sm" style="color:var(--esn-dark)">← All events</a>
      <a href="/admin/edit-${ev.id}" class="btn btn-orange btn-sm">Edit event</a>
      <a href="/admin/shifts-${ev.id}" class="btn btn-cyan btn-sm">${mi("schedule")} Shiftlist</a>
      <a href="/event/${ev.id}" class="btn btn-ghost btn-sm btn-ink">${mi("visibility")} View page</a>
      ${ev.dsaActivityId ? `<a href="https://dsa.ugent.be/activiteiten/${ev.dsaActivityId}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm btn-ink" title="This event's activity on the UGent DSA site">${mi("school", "sm")} Open in DSA ↗</a>` : ""}
      <button class="btn btn-dark btn-sm" id="btn-csv">Export CSV</button>
      ${!ev.cancelled && !isPastEvent ? `<button class="btn btn-ghost btn-sm btn-danger" id="btn-cancel-event" style="margin-left:auto">Cancel event…</button>` : ""}
    </div>
    <div id="ed-stats"></div>
    <div id="ed-cash"></div>
    ${eventFeedback.length ? `
      <div class="form-card" style="margin-bottom:20px">
        <strong>Feedback</strong>
        ${aiConfig.enabled ? `<button class="btn btn-sm btn-ghost btn-ink" id="btn-ai-digest" style="float:right">${jacobImg("jacob-sm")} Ask Jacob to summarize</button>` : ""}
        <div id="ai-digest-box"></div>
        ${eventFeedback.some((f) => f.comment) ? `
        <ul style="margin:8px 0 0 18px;font-size:.88rem">
          ${eventFeedback.filter((f) => f.comment).map((f) => `<li style="margin-bottom:5px">${"★".repeat(f.rating || 0)} - ${esc(f.comment)}</li>`).join("")}
        </ul>` : `<p class="form-hint" style="margin-top:6px">Ratings only, no written comments yet.</p>`}
      </div>` : ""}
    <div class="filter-bar">
      <input id="reg-q" type="search" placeholder="Search name, email or ticket type…" />
      <div class="filter-chips" id="reg-chips"></div>
    </div>
    <p class="form-hint" id="reg-count" style="margin:0 0 10px"></p>
    <div id="ed-regs"></div>
    <div id="ed-waitlist"></div>
  `;

  const renderStats = () => {
    const confirmed = regs.filter((r) => r.status === "paid" || r.status === "free");
    const revenue = confirmed.reduce((s, r) => s + (r.status === "paid" ? (r.amountTotal || 0) : 0), 0);
    const tickets = confirmed.reduce((s, r) => s + (r.quantity || 1), 0);
    const checkedIn = confirmed.filter((r) => r.checkedInAt).reduce((s, r) => s + (r.quantity || 1), 0);
    if (ev.regMode === "none" || ev.regMode === "external") {
      document.getElementById("ed-stats").innerHTML = `
        <p class="form-hint" style="margin:0 0 14px">${mi(ev.regMode === "none" ? "front_hand" : "open_in_new", "sm")}
        ${ev.regMode === "none"
          ? "This is a <strong>just show up</strong> event - no in-app tickets, the door handles entry (and payment, if any)."
          : `Sign-up runs through the <strong>partner's page</strong>${ev.externalUrl ? ` (<a href="${esc(ev.externalUrl)}" target="_blank" rel="noopener">open link</a>)` : ""} - no in-app tickets.`}
        Shiftlists and the calendar work as usual.</p>`;
      return;
    }
    document.getElementById("ed-stats").innerHTML = `
      <div class="stat-row">
        <div class="stat-card" style="--accent:#00AEEF"><div class="num">${tickets}</div><div class="lbl">Tickets</div></div>
        <div class="stat-card" style="--accent:#7AC143"><div class="num">${confirmed.length}</div><div class="lbl">Confirmed regs</div></div>
        <div class="stat-card" style="--accent:#EC008C"><div class="num">${fmtMoney(revenue, ev.currency)}</div><div class="lbl">Revenue</div></div>
        <div class="stat-card" style="--accent:#2E3192"><div class="num">${checkedIn}/${tickets}</div><div class="lbl">Checked in</div></div>
        <div class="stat-card" style="--accent:#F47B20"><div class="num">${ev.capacity ? `${Math.max(0, ev.capacity - tickets)}` : "∞"}</div><div class="lbl">Tickets left</div></div>
        ${isPastEvent && tickets ? `<div class="stat-card" style="--accent:#9a9cb5"><div class="num">${tickets - checkedIn}</div><div class="lbl">No-shows (${Math.round(((tickets - checkedIn) / tickets) * 100)}%)</div></div>` : ""}
        ${waitlist.length ? `<div class="stat-card" style="--accent:#00AEEF"><div class="num">${waitlist.length}</div><div class="lbl">On waitlist</div></div>` : ""}
        ${eventFeedback.length ? `<div class="stat-card" style="--accent:#F47B20"><div class="num">★ ${(eventFeedback.reduce((s, f) => s + (f.rating || 0), 0) / eventFeedback.length).toFixed(1)}</div><div class="lbl">Rating (${eventFeedback.length})</div></div>` : ""}
      </div>
      ${(ev.ticketsSold || 0) !== tickets ? `
      <p class="form-hint" style="margin:8px 0 14px">${mi("warning", "sm")} The event page's "tickets left" is off: the sold counter says <strong>${ev.ticketsSold || 0}</strong>, the registrations say <strong>${tickets}</strong> - usually left over from removed (test) registrations.
        <button class="btn btn-sm btn-dark" id="ed-fix-counter">Fix counter</button></p>` : ""}`;
    // One-click recount (v0.117): rebuild sold counters from the CONFIRMED
    // registrations (pending checkouts live in pendingHold, not here).
    document.getElementById("ed-fix-counter")?.addEventListener("click", async (e2) => {
      e2.target.disabled = true;
      try {
        const esnQty = confirmed.filter((r) => r.usedEsncard).reduce((s, r) => s + (r.quantity || 1), 0);
        const optMap = {};
        confirmed.forEach((r) => { if (r.optionId) optMap[r.optionId] = (optMap[r.optionId] || 0) + (r.quantity || 1); });
        await updateDoc(doc(db, "events", ev.id), {
          ticketsSold: tickets, esnSold: esnQty,
          ...(Array.isArray(ev.options) && ev.options.length ? { optionSold: optMap } : {}),
        });
        Object.assign(ev, { ticketsSold: tickets, esnSold: esnQty });
        toast("Counters fixed - the event page shows the right availability again.", "success");
        renderStats();
      } catch (err) { toast("Failed: " + err.message, "error"); e2.target.disabled = false; }
    });
  };

  const regMatches = (r) => {
    if (regFilter.chip === "in" && !r.checkedInAt) return false;
    if (regFilter.chip === "out" && r.checkedInAt) return false;
    const q = regFilter.q.trim().toLowerCase();
    if (!q) return true;
    return `${r.name || ""} ${r.email || ""} ${r.optionName || ""} ${r.status || ""}`.toLowerCase().includes(q);
  };

  const renderRegs = () => {
    const checkedIn = regs.filter((r) => r.checkedInAt).length;
    const chipsEl = document.getElementById("reg-chips");
    chipsEl.innerHTML = [
      ["all", `All (${regs.length})`], ["in", `Checked in (${checkedIn})`], ["out", `Not yet (${regs.length - checkedIn})`],
    ].map(([k, label]) => `<button class="chip ${regFilter.chip === k ? "active" : ""}" data-chip="${k}">${label}</button>`).join("");
    chipsEl.querySelectorAll(".chip").forEach((btn) => {
      btn.onclick = () => { regFilter.chip = btn.dataset.chip; edRegsShown = 100; renderRegs(); };
    });

    const list = regs.filter(regMatches);
    const shownRegs = list.slice(0, edRegsShown);
    document.getElementById("reg-count").textContent =
      (shownRegs.length === list.length && list.length === regs.length) ? "" : `Showing ${shownRegs.length} of ${list.length}`;
    const box = document.getElementById("ed-regs");
    box.innerHTML = list.length ? `
      <div class="table-wrap cards"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Qty</th><th>Amount</th><th>Status</th><th>In</th><th>When</th><th></th></tr></thead>
        <tbody>${shownRegs.map((r) => `
          <tr>
            <td class="card-main">${esc(r.name || "-")}${r.optionName ? `<br><small class="form-hint">${esc(r.optionName)}</small>` : ""}</td>
            <td data-l="Email">${esc(r.email || "-")}</td>
            <td data-l="Qty">${r.quantity || 1}</td>
            <td data-l="Amount">${r.status === "free" ? "-" : fmtMoney(r.amountTotal, r.currency)}</td>
            <td data-l="Status"><span class="badge badge-${r.status}">${r.status}</span></td>
            <td data-l="Checked in">${r.checkedInAt ? mi("check_circle", "sm") : "-"}</td>
            <td data-l="When">${r.createdAt ? `${fmtDate(r.createdAt)} ${fmtTime(r.createdAt)}` : "-"}</td>
            <td class="card-actions"><button class="btn btn-sm btn-ghost btn-reg-del btn-danger" data-rid="${r.id}" title="Remove registration">✕ Remove</button></td>
          </tr>`).join("")}</tbody>
      </table></div>
      ${list.length > shownRegs.length ? `<div class="form-actions"><button class="btn btn-ghost btn-ink" id="ed-regs-more">Show more (${list.length - shownRegs.length} left)</button></div>` : ""}`
    : `<div class="empty-state"><p>${regs.length ? "No registrations match." : "No registrations yet."}</p></div>`;
    document.getElementById("ed-regs-more")?.addEventListener("click", () => { edRegsShown += 200; renderRegs(); });

    box.querySelectorAll(".btn-reg-del").forEach((btn) => {
      btn.onclick = async () => {
        if (!await appConfirm("Remove this registration? This cannot be undone.")) return;
        try {
          const r = regs.find((x) => x.id === btn.dataset.rid);
          await deleteDoc(doc(db, "registrations", btn.dataset.rid));
          // Keep the SOLD counters honest (v0.117): the public "tickets left"
          // comes from events.ticketsSold - before this fix, removing a reg
          // left the counter inflated (34 vs 38 mismatch). Mirrors the
          // server's refund decrement. Only confirmed regs ever counted.
          if (r && (r.status === "paid" || r.status === "free")) {
            const q = r.quantity || 1;
            await updateDoc(doc(db, "events", ev.id), {
              ticketsSold: increment(-q),
              ...(r.usedEsncard ? { esnSold: increment(-q) } : {}),
              ...(r.optionId ? { [`optionSold.${r.optionId}`]: increment(-q) } : {}),
            }).catch(() => { /* drift warning below offers the repair */ });
            ev.ticketsSold = Math.max(0, (ev.ticketsSold || 0) - q);
            if (r.usedEsncard) ev.esnSold = Math.max(0, (ev.esnSold || 0) - q);
          }
          const i = regs.findIndex((r2) => r2.id === btn.dataset.rid);
          if (i >= 0) regs.splice(i, 1);
          toast("Registration removed", "success");
          renderRegs(); renderStats();
        } catch (err) { toast(err.message, "error"); }
      };
    });
  };

  const renderWaitlist = () => {
    const box = document.getElementById("ed-waitlist");
    box.innerHTML = waitlist.length ? `
      <h3 class="section-title sm">Waitlist (${waitlist.length})</h3>
      <div class="form-actions" style="margin:0 0 10px">
        <button class="btn btn-sm btn-dark" id="btn-wl-copy">Copy all emails</button>
      </div>
      <div class="table-wrap cards"><table>
        <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Joined</th><th></th></tr></thead>
        <tbody>${waitlist.map((w, i) => `
          <tr>
            <td data-l="#">${i + 1}</td>
            <td class="card-main"><strong>${esc(w.name || "-")}</strong></td>
            <td data-l="Email">${esc(w.email || "-")}</td>
            <td data-l="Joined">${w.createdAt ? `${fmtDate(w.createdAt)} ${fmtTime(w.createdAt)}` : "-"}</td>
            <td class="card-actions"><button class="btn btn-sm btn-ghost btn-wl-del btn-danger" data-wid="${w.id}" title="Remove from waitlist" aria-label="Remove from waitlist">✕</button></td>
          </tr>`).join("")}</tbody>
      </table></div>` : "";

    box.querySelectorAll(".btn-wl-del").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await deleteDoc(doc(db, "waitlist", btn.dataset.wid));
          const i = waitlist.findIndex((w) => w.id === btn.dataset.wid);
          if (i >= 0) waitlist.splice(i, 1);
          toast("Removed from waitlist", "success");
          renderWaitlist(); renderStats();
        } catch (err) { toast(err.message, "error"); }
      };
    });
    document.getElementById("btn-wl-copy")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(waitlist.map((w) => w.email).filter(Boolean).join(", "));
        toast("Emails copied", "success");
      } catch { toast("Could not copy - select them manually.", "error"); }
    });
  };

  renderStats();
  renderRegs();
  renderWaitlist();
  renderCashCard(document.getElementById("ed-cash"), ev);

  document.getElementById("btn-ai-digest")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `${mi("hourglass_top", "sm")} Jacob is reading…`;
    try {
      const fn = httpsCallable(functions, "aiAssist");
      const res = await fn({ task: "feedbackDigest", eventId: ev.id });
      document.getElementById("ai-digest-box").innerHTML =
        jacobCard(renderRich(res.data.text), "Jacob's summary - copy it into the meeting notes if it looks right.");
      btn.remove();
    } catch (err) {
      toast(err.message || "Jacob couldn't summarize - try again.", "error");
      btn.disabled = false;
      btn.innerHTML = `${jacobImg("jacob-sm")} Ask Jacob to summarize`;
    }
  });
  document.getElementById("reg-q").addEventListener("input", (e) => { regFilter.q = e.target.value; edRegsShown = 100; renderRegs(); });

  document.getElementById("btn-csv").onclick = () => {
    const csvEsc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Name", "Email", "TicketType", "Quantity", "Amount", "Currency", "Status", "CheckedIn", "Date"].map(csvEsc).join(","),
      ...regs.map((r) => [
        r.name, r.email, r.optionName || "", r.quantity || 1,
        r.status === "free" ? 0 : ((r.amountTotal || 0) / 100).toFixed(2),
        (r.currency || "eur").toUpperCase(), r.status,
        r.checkedInAt ? toDate(r.checkedInAt).toISOString() : "",
        toDate(r.createdAt)?.toISOString() || "",
      ].map(csvEsc).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `registrations-${ev.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  document.getElementById("btn-cancel-event")?.addEventListener("click", async (e) => {
    const paidCount = regs.filter((r) => r.status === "paid").length;
    const freeCount = regs.filter((r) => r.status === "free").length;
    const reason = await appPrompt(
      `Cancel "${ev.title}" and refund everyone?\n\n` +
      `• ${paidCount} paid ticket${paidCount === 1 ? "" : "s"} → refunded IN FULL via Stripe (no fee)\n` +
      `• ${freeCount} free registration${freeCount === 1 ? "" : "s"} → cancelled\n` +
      `• The event stays visible with a CANCELLED banner\n\n` +
      `This cannot be undone. Short reason (students see this):`);
    if (reason === null) return;
    if (!await appConfirm(`Really cancel "${ev.title}" now? All paid tickets are refunded immediately.`)) return;
    e.target.disabled = true; e.target.textContent = "Cancelling & refunding…";
    try {
      const fn = httpsCallable(functions, "cancelEventAndRefundAll");
      const res = await fn({ eventId: ev.id, reason: reason.trim() });
      logAudit("cancelled", "event", ev.title, ev.id);
      const { refunded, freeCancelled, failed } = res.data || {};
      if (failed?.length) {
        await appAlert(`Event cancelled. ${refunded} refunded, ${freeCancelled} free registrations cancelled - but ${failed.length} refund(s) FAILED and need a manual refund in the Stripe dashboard:\n\n${failed.map((f) => `• ${f.email || f.id}: ${f.error}`).join("\n")}`);
      } else {
        toast(`Event cancelled - ${refunded || 0} ticket${refunded === 1 ? "" : "s"} refunded in full, ${freeCancelled || 0} free registration${freeCancelled === 1 ? "" : "s"} cancelled.`, "success");
      }
      toast("Tip: re-save the event once (Edit → Save) to update the Google Calendar entry.", "success");
      viewAdminEventDetail(ev.id);
    } catch (err) {
      toast("Cancel failed: " + (err.message || ""), "error");
      e.target.disabled = false; e.target.textContent = "Cancel event…";
    }
  });
}

// ------------------------------------------------------------
// Board meetings & to-dos - internal space for board + advisory board.
// Structured like ESN Gent's real minutes: attendance, general round,
// function rounds, past & upcoming events with notes, varia, to-do list.
// Students can never reach any of this: every collection used here is
// locked to team roles in firestore.rules, not just hidden in the UI.
// ------------------------------------------------------------
function boardGateHtml() {
  if (!currentUser) {
    return signInState("lock", "Board area - please sign in.");
  }
  if (!canMeetings()) {
    return `<div class="empty-state"><div class="big">${mi("block")}</div><p>This space is reserved for board and advisory board members.</p></div>`;
  }
  return null;
}

const ATT_STATUSES = [
  ["present", '<span class="material-symbols-rounded mi-sm">check_circle</span> Present'],
  ["online", '<span class="material-symbols-rounded mi-sm">laptop_mac</span> Online'],
  ["late", '<span class="material-symbols-rounded mi-sm">schedule</span> Late'],
  ["absent", '<span class="material-symbols-rounded mi-sm">cancel</span> Absent'],
];

// ---- shared to-do list (standing list, like the TODO block in the
// minutes doc - carried over between meetings until done) ----
async function loadBoardTodos() {
  // Bounded: to-dos older than a year are no longer loaded (the nightly
  // cleanup removes 2-year-old finished ones entirely).
  const yearAgo = new Date(Date.now() - 365 * 86400e3);
  const s = await getDocs(query(collection(db, "boardTodos"), where("createdAt", ">=", yearAgo)));
  const todos = s.docs.map((d) => ({ id: d.id, ...d.data() }));
  todos.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
  return todos;
}

// Renders + wires the to-do section into `box`. `team` (admins docs) may be
// empty for advisory members - they read, board edits, assignees tick off.
function renderTodoSection(box, todos, team) {
  const open = todos.filter((t) => t.status !== "done");
  const doneAll = todos.filter((t) => t.status === "done")
    .sort((a, b) => (toDate(b.doneAt)?.getTime() || 0) - (toDate(a.doneAt)?.getTime() || 0));
  const cutoff = Date.now() - 14 * 86400e3; // done > 2 weeks ago → archive
  const done = doneAll.filter((t) => (toDate(t.doneAt)?.getTime() || 0) >= cutoff);
  const archived = doneAll.filter((t) => (toDate(t.doneAt)?.getTime() || 0) < cutoff);
  const canTick = (t) => isAdmin || t.assignedUid === currentUser?.uid;
  const shortD = (v) => { const d = toDate(v); return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""; };
  // Mine first (v0.137): the to-dos assigned to you float to the top with a
  // "you" pill - the board list can get long, yours shouldn't hide in it.
  const isMine = (t) => !!currentUser && t.assignedUid === currentUser.uid;
  open.sort((a, b) => (isMine(b) - isMine(a)) || ((toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)));
  const mineOpen = open.filter(isMine).length;
  const row = (t) => `
    <li class="todo-row ${t.status === "done" ? "done" : ""} ${isMine(t) && t.status !== "done" ? "mine" : ""}">
      <input type="checkbox" class="todo-tick" data-tid="${t.id}" ${t.status === "done" ? "checked" : ""} ${canTick(t) ? "" : "disabled"} aria-label="Done" />
      <span class="todo-text">${t.status === "done" ? "<s>" : ""}${esc(t.text)}${t.status === "done" ? "</s>" : ""}
        <small class="todo-when">${t.assignedName ? `<span class="todo-who ${isMine(t) ? "me" : ""}">${mi("person", "sm")} ${esc(isMine(t) ? "you" : t.assignedName.split(" ")[0])}</span>` : `<span class="todo-who">${mi("group", "sm")} anyone</span>`}${t.createdAt ? ` · added ${shortD(t.createdAt)}` : ""}${t.status === "done" && t.doneAt ? ` · done ${shortD(t.doneAt)}` : ""}</small></span>
      ${isAdmin ? `<button class="btn btn-sm btn-ghost todo-del btn-danger" data-tid="${t.id}" title="Remove to-do" aria-label="Remove to-do">✕</button>` : ""}
    </li>`;

  box.innerHTML = `
    ${isAdmin ? `
      <div class="todo-add-row">
        <input id="todo-new" class="inline-input" maxlength="200" placeholder="New to-do… (Enter to add)" />
        <select id="todo-who" class="inline-input">
          <option value="">- anyone -</option>
          ${team.map((t) => `<option value="${t.id}">${esc(t.name || t.email || t.id)}${t.boardFunction ? ` (${esc(t.boardFunction)})` : ""}</option>`).join("")}
        </select>
        <button class="btn btn-green btn-sm" id="todo-add">${mi("add", "sm")} Add</button>
      </div>` : ""}
    ${open.length ? `<p class="form-hint" style="margin:0 0 6px">${open.length} open${mineOpen ? ` · <strong>${mineOpen} for you</strong>` : ""}</p><ul class="todo-list">${open.map(row).join("")}</ul>` : `<p class="form-hint">Nothing open - nice work.</p>`}
    ${done.length ? `<p class="form-hint" style="margin-top:10px">Recently done</p><ul class="todo-list">${done.map(row).join("")}</ul>` : ""}
    ${archived.length ? `<details style="margin-top:10px"><summary class="form-hint" style="cursor:pointer">Archive - ${archived.length} older task${archived.length === 1 ? "" : "s"}</summary><ul class="todo-list">${archived.map(row).join("")}</ul></details>` : ""}
  `;
  wireSelectFilter(document.getElementById("todo-who"));

  document.getElementById("todo-new")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("todo-add")?.click(); } });
  document.getElementById("todo-add")?.addEventListener("click", async () => {
    const text = document.getElementById("todo-new").value.trim();
    if (!text) { toast("Type the to-do first.", "error"); return; }
    const who = document.getElementById("todo-who").value;
    const member = team.find((t) => t.id === who);
    try {
      const ref = await addDoc(collection(db, "boardTodos"), {
        text,
        assignedUid: who || "",
        assignedName: member ? (member.name || member.email || "") : "",
        status: "open",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      todos.unshift({ id: ref.id, text, assignedUid: who || "", assignedName: member ? (member.name || member.email || "") : "", status: "open" });
      renderTodoSection(box, todos, team);
    } catch (err) { toast("Could not add: " + err.message, "error"); }
  });
  box.querySelectorAll(".todo-tick").forEach((cb) => {
    cb.onchange = async () => {
      const t = todos.find((x) => x.id === cb.dataset.tid);
      if (!t) return;
      const newStatus = cb.checked ? "done" : "open";
      try {
        await updateDoc(doc(db, "boardTodos", t.id), { status: newStatus, doneAt: cb.checked ? serverTimestamp() : null });
        t.status = newStatus;
        renderTodoSection(box, todos, team);
      } catch (err) { toast("Failed: " + err.message, "error"); cb.checked = !cb.checked; }
    };
  });
  box.querySelectorAll(".todo-del").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await deleteDoc(doc(db, "boardTodos", btn.dataset.tid));
        const i = todos.findIndex((x) => x.id === btn.dataset.tid);
        if (i >= 0) todos.splice(i, 1);
        renderTodoSection(box, todos, team);
      } catch (err) { toast("Failed: " + err.message, "error"); }
    };
  });
}

async function fetchTeam() {
  // Board/superadmin only - advisory & volunteers can't list the team.
  try {
    const s = await getDocs(collection(db, "admins"));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch { return []; }
}

async function viewBoard(sub) {
  const gate = boardGateHtml();
  if (gate) {
    $app.innerHTML = gate;
    document.getElementById("es-login")?.addEventListener("click", signIn);
    return;
  }
  if (sub && sub.startsWith("meeting-")) return viewBoardMeeting(sub.slice(8));
  if (sub === "rooms") return viewBoardRooms();

  setLoading();
  let meetings, todos, team;
  try {
    [meetings, todos, team] = await Promise.all([
      getDocs(query(collection(db, "boardMeetings"), orderBy("start", "desc")))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      loadBoardTodos().catch(() => []),
      isAdmin ? fetchTeam() : Promise.resolve([]),
    ]);
  } catch (e) { $app.innerHTML = errorState(e.message); return; }

  const now = new Date();
  const upcoming = meetings.filter((m) => toDate(m.start) >= now).sort((a, b) => toDate(a.start) - toDate(b.start));
  const past = meetings.filter((m) => toDate(m.start) < now);
  const last = meetings.length ? meetings.reduce((a, b) => (toDate(a.start) > toDate(b.start) ? a : b)) : null;

  const relDay = (m) => {
    const d = Math.round((toDate(m.start).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400e3);
    return d === 0 ? "Today" : d === 1 ? "Tomorrow" : d > 1 && d < 14 ? `in ${d} days` : "";
  };
  const item = (m) => `
    <a class="agenda-item" href="/board/meeting-${m.id}" style="--accent:${toDate(m.start) >= now ? "var(--esn-cyan)" : "#9a9cb5"}">
      <span class="agenda-time">${fmtDate(m.start)} · ${fmtTime(m.start)}${relDay(m) ? ` <span class="badge ${relDay(m) === "Today" ? "badge-live" : "badge-esn"}" style="margin-left:4px">${relDay(m)}</span>` : ""}</span>
      <span class="agenda-title">${esc(m.title || "Board meeting")}${m.location ? ` <small class="form-hint">· ${esc(m.location)}</small>` : ""}</span>
      <span class="agenda-price">${m.approvedAt ? mi("check_circle", "sm") : ""}${(m.minutes || (m.rounds && Object.values(m.rounds).some(Boolean))) ? mi("edit_note", "sm") : ""}${m.googleEventId ? mi("event_available", "sm") : ""}</span>
    </a>`;

  const nextMeeting = upcoming[0] || null;
  const todosOpen = todos.filter((t) => t.status !== "done").length;
  $app.innerHTML = `
    <h2 class="section-title">${mi("event_note")} Board space</h2>
    <p class="form-hint" style="margin:-6px 0 16px">Meetings, minutes, to-dos and room reservations in one place. ${myRole === "advisory" ? "You have advisory access - read everything, tick off your own to-dos." : ""}</p>

    <div class="stat-row" style="margin-bottom:18px">
      <a class="stat-card" style="--accent:#00AEEF;text-decoration:none" href="${nextMeeting ? `/board/meeting-${nextMeeting.id}` : "#plan-meeting"}">
        <div class="num" style="font-size:1.1rem">${nextMeeting ? `${fmtDate(nextMeeting.start)}` : "None planned"}</div>
        <div class="lbl">${mi("event_upcoming", "sm")} Next meeting${nextMeeting ? ` · ${fmtTime(nextMeeting.start)}` : ""}</div>
      </a>
      <a class="stat-card" style="--accent:#F47B20;text-decoration:none" href="#board-todos">
        <div class="num">${todosOpen}</div>
        <div class="lbl">${mi("task_alt", "sm")} Open to-dos</div>
      </a>
      <a class="stat-card" style="--accent:#7AC143;text-decoration:none" href="/board/rooms">
        <div class="num" style="font-size:1.1rem">Rooms</div>
        <div class="lbl">${mi("meeting_room", "sm")} UGent reservations ›</div>
      </a>
      ${isAdmin ? `
      <a class="stat-card" style="--accent:#EC008C;text-decoration:none" href="/admin/inbox">
        <div class="num" style="font-size:1.1rem">Inbox</div>
        <div class="lbl">${mi("forum", "sm")} Student messages ›</div>
      </a>` : ""}
    </div>

    ${isAdmin ? `
    <details class="form-card" style="margin-bottom:22px" id="plan-meeting" ${meetings.length ? "" : "open"}>
      <summary style="font-weight:800">${mi("add", "sm")} Plan a meeting</summary>
      <div style="margin-top:4px">
      <div class="form-grid" style="margin-top:10px">
        <div class="form-field"><label for="bm-title">Title</label><input id="bm-title" value="Board meeting" maxlength="80" /></div>
        <div class="form-field"><label for="bm-date">Date *</label><input id="bm-date" type="date" /></div>
        <div class="form-field"><label for="bm-time">Time</label><input id="bm-time" type="time" value="20:00" /></div>
        <div class="form-field"><label for="bm-loc">Location</label><input id="bm-loc" maxlength="120" placeholder="Meeting Room 1, Therminal" /></div>
      </div>
      <div class="checkbox-row" style="margin-top:10px">
        <input id="bm-dsa" type="checkbox" checked />
        <label for="bm-dsa">Register on dsa.ugent.be ${hintIcon("On by default: board meetings are announced to DSA as a private 'Vergadering' - only visible to your board, the konvent board and DSA (they don't count toward the 10 required public activities). DSA asks for ≥72 h notice. Toggle per meeting later via the DSA button on the meeting page.")}</label>
      </div>
      <div class="form-actions">
        <button class="btn btn-green" id="bm-create">Create meeting</button>
        ${last ? `<button class="btn btn-ghost btn-ink" id="bm-next">Prefill: 2 weeks after the last one</button>` : ""}
        <span class="form-hint">Also added to the internal board calendar.</span>
      </div>
      </div>
    </details>` : ""}

    ${upcoming.length ? `<h3 class="section-title sm">${mi("event_upcoming", "sm")} Upcoming meetings</h3><div class="cal-agenda">${upcoming.map(item).join("")}</div>` : ""}

    <h3 class="section-title sm">${mi("task_alt", "sm")} To-do list</h3>
    <div class="form-card" id="board-todos" style="margin-bottom:22px"></div>

    ${isAdmin ? `
    <h3 class="section-title sm">${mi("cake", "sm")} Team birthdays</h3>
    <div class="form-card" id="team-bdays" style="margin-bottom:22px"><p class="form-hint">Loading birthdays…</p></div>` : ""}

    ${past.length ? `<h3 class="section-title sm">${mi("history", "sm")} Past meetings</h3><div class="cal-agenda">${past.slice(0, 8).map(item).join("")}</div>
      ${past.length > 8 ? `<details style="margin-top:8px"><summary class="form-hint" style="cursor:pointer">Older meetings (${past.length - 8})</summary><div class="cal-agenda" style="margin-top:8px">${past.slice(8).map(item).join("")}</div></details>` : ""}` : ""}
    ${meetings.length ? "" : `<div class="empty-state"><div class="big">${mi("event_note")}</div><p>No meetings yet${isAdmin ? " - plan the first one above" : ""}.</p></div>`}
  `;

  renderTodoSection(document.getElementById("board-todos"), todos, team);

  // Team birthday calendar (v0.135): everyone with a team role + the alumni
  // network, joined with the birthday on their profile. Loads after the page
  // renders so /board never waits on it; hides itself if the data won't load.
  if (isAdmin) (async () => {
    const box = document.getElementById("team-bdays");
    if (!box) return;
    try {
      const roleTag = { superadmin: "board", finance: "board", board: "board", volunteer: "volunteer", advisory: "AB", alumnicoord: "alumni coordinator" };
      const people = new Map(); // uid -> {name, tag}
      team.forEach((t) => people.set(t.id, { name: t.name || "", tag: t.boardFunction || roleTag[t.role] || t.role || "team" }));
      const alumniSnap = await getDocs(query(collection(db, "users"), where("alumni", "==", true)));
      const bdays = {};
      alumniSnap.docs.forEach((d) => {
        bdays[d.id] = d.data().birthday || "";
        if (!people.has(d.id)) people.set(d.id, { name: d.data().displayName || "", tag: "alumni" });
        else if (!people.get(d.id).name) people.get(d.id).name = d.data().displayName || "";
      });
      // Team members who aren't alumni: birthday lives on their user doc.
      await Promise.all([...people.keys()].filter((uid) => !(uid in bdays)).map(async (uid) => {
        try {
          const s = await getDoc(doc(db, "users", uid));
          if (s.exists()) {
            bdays[uid] = s.data().birthday || "";
            if (!people.get(uid).name) people.get(uid).name = s.data().displayName || "";
          }
        } catch { /* skip */ }
      }));
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const entries = [];
      let missing = 0;
      for (const [uid, p] of people) {
        const b = String(bdays[uid] || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) { missing++; continue; }
        const [by, bm2, bd2] = b.split("-").map(Number);
        let next = new Date(today.getFullYear(), bm2 - 1, bd2);
        if (next < today) next = new Date(today.getFullYear() + 1, bm2 - 1, bd2);
        const days = Math.round((next - today) / 86400e3);
        // Display copy at noon: fmtDate renders in Belgian time, and noon
        // keeps the calendar day stable whatever timezone the device is in.
        const disp = new Date(next.getFullYear(), next.getMonth(), next.getDate(), 12);
        entries.push({ name: p.name || "?", tag: p.tag, disp, days, turns: next.getFullYear() - by });
      }
      entries.sort((a, b) => a.days - b.days);
      const row = (e2) => `<li>
        <span class="info-label">${e2.days === 0 ? "Today 🎉" : e2.days === 1 ? "Tomorrow" : `in ${e2.days} days`}</span>
        <span><strong>${esc(e2.name)}</strong> <span class="form-hint">· ${esc(e2.tag)}</span> · ${fmtDate(e2.disp)} (turns ${e2.turns})</span>
      </li>`;
      box.innerHTML = entries.length ? `
        <ul class="event-info-list">${entries.slice(0, 8).map(row).join("")}</ul>
        ${entries.length > 8 ? `<details style="margin-top:8px"><summary class="form-hint" style="cursor:pointer">Later in the year (${entries.length - 8})</summary><ul class="event-info-list" style="margin-top:8px">${entries.slice(8).map(row).join("")}</ul></details>` : ""}
        ${missing ? `<p class="form-hint" style="margin:10px 0 0">${missing} team member${missing === 1 ? " has" : "s have"} no birthday on their profile - ask them to add it on their account page.</p>` : ""}`
      : `<p class="form-hint">No birthdays known yet - they come from the birthday on each profile.</p>`;
    } catch { box.previousElementSibling?.remove(); box.remove(); }
  })();

  document.getElementById("bm-next")?.addEventListener("click", () => {
    const d = new Date(toDate(last.start).getTime() + 14 * 24 * 3600 * 1000);
    document.getElementById("bm-date").value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    document.getElementById("bm-time").value = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    document.getElementById("bm-loc").value = last.location || "";
    toast("Prefilled from the last meeting - check the date and create.", "success");
  });

  document.getElementById("bm-create")?.addEventListener("click", async (e) => {
    const date = document.getElementById("bm-date").value;
    if (!date) { toast("Pick a date for the meeting.", "error"); return; }
    const time = document.getElementById("bm-time").value || "20:00";
    const start = new Date(`${date}T${time}`);
    const title = document.getElementById("bm-title").value.trim() || "Board meeting";
    const loc = document.getElementById("bm-loc").value.trim();
    e.target.disabled = true;
    try {
      const ref = await addDoc(collection(db, "boardMeetings"), {
        title,
        start: Timestamp.fromDate(start),
        location: loc,
        attendance: [],
        rounds: {},
        eventNotes: {},
        minutes: "",
        dsaSync: document.getElementById("bm-dsa")?.checked !== false, // DSA private Vergadering (v0.113)
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      logAudit("created", "board meeting", `${title} (${date})`, ref.id);
      toast("Meeting created - it appears on the board calendar automatically.", "success");
      // DSA 72-hour rule: announced later than that = NOT insured by UGent.
      if (document.getElementById("bm-dsa")?.checked !== false && start - Date.now() < 72 * 3600e3) {
        toast("Heads-up: DSA needs ≥72 h notice - this meeting is closer than that, so it won't be insured by UGent.", "warn");
      }
      navigate(`/board/meeting-${ref.id}`);
    } catch (err) {
      toast("Could not create the meeting: " + err.message, "error");
      e.target.disabled = false;
    }
  });
}

// ---- UGent room reservations (v0.113): own sub-page /board/rooms ----
// Month-calendar view fed by the dsaReservations callable (key stays
// server-side). One fetch per visit, cached for the session (Refresh
// refetches) - so /board itself no longer waits on the DSA API. DSA
// returns UPCOMING reservations only, so past months show empty here.
let roomsCursor = null; // first day of the shown month
let roomsCache = null;  // entries from the last fetch
async function viewBoardRooms() {
  setLoading();
  const today = new Date();
  if (!roomsCursor) roomsCursor = new Date(today.getFullYear(), today.getMonth(), 1);
  if (!roomsCache) {
    try {
      const res = await httpsCallable(functions, "dsaReservations")({});
      roomsCache = (res.data?.entries || []).slice()
        .sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || "")));
    } catch (err) {
      $app.innerHTML = errorState(`${err.message || "Couldn't load reservations"} - check that the DSA_API_KEY secret is set and the latest functions are deployed.`);
      return;
    }
  }
  const y = roomsCursor.getFullYear(), m = roomsCursor.getMonth();
  const monthName = roomsCursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const parseT = (s) => new Date(String(s || "").replace(" ", "T"));
  const statusKind = (r) => {
    const k = String(r.request_status || "").toLowerCase();
    return k.includes("approv") ? "ok" : (k.includes("den") || k.includes("reject") || k.includes("refus")) ? "no" : "wait";
  };
  const ACC = { ok: "#7AC143", wait: "#F47B20", no: "var(--esn-magenta)" };
  const stBadge = (r) => statusKind(r) === "ok" ? `<span class="badge badge-paid">approved</span>`
    : statusKind(r) === "no" ? `<span class="badge badge-soldout">${esc(r.request_status)}</span>`
    : `<span class="badge badge-requested">${esc(r.request_status || "pending")}</span>`;

  const byDay = {};
  for (const r of roomsCache) {
    const d = parseT(r.start_time);
    if (d.getFullYear() === y && d.getMonth() === m) (byDay[d.getDate()] ??= []).push(r);
  }

  let cells = "";
  for (const dow of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) cells += `<div class="cal-dow">${dow}</div>`;
  for (let i = 0; i < firstDow; i++) cells += `<div class="cal-cell other-month"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const tp = beParts(today);
    const isToday = day === tp.day && m === tp.month - 1 && y === tp.year;
    const rs = byDay[day] || [];
    const chips = rs.map((r) => `<span class="cal-event" style="--accent:${ACC[statusKind(r)]};cursor:default" title="${esc(r.title || "Reservation")} · ${fmtTime(parseT(r.start_time))}–${fmtTime(parseT(r.end_time))}${r.location ? ` · ${esc(r.location)}` : ""} · ${esc(r.request_status || "pending")}">${fmtTime(parseT(r.start_time))} ${esc(r.title || r.location || "Reservation")}</span>`).join("");
    const dots = rs.length ? `<span class="cal-dots">${rs.slice(0, 3).map((r) => `<i style="background:${ACC[statusKind(r)]}"></i>`).join("")}</span>` : "";
    cells += `<div class="cal-cell ${isToday ? "today" : ""} ${rs.length ? "has-ev" : ""}" ${rs.length ? `data-day="${day}"` : ""}><span class="cal-daynum">${day}</span>${chips}${dots}</div>`;
  }
  for (let i = firstDow + daysInMonth; i % 7 !== 0; i++) cells += `<div class="cal-cell other-month"></div>`;

  const okCount = roomsCache.filter((r) => statusKind(r) === "ok").length;
  $app.innerHTML = `
    <div class="calendar-header">
      <h2>${mi("meeting_room", "sm")} Rooms · ${monthName}</h2>
      <div class="cal-nav-buttons">
        <button class="btn btn-dark btn-sm" id="rm-prev">‹ Prev</button>
        <button class="btn btn-ghost btn-sm" id="rm-today" style="color:var(--esn-dark)">Today</button>
        <button class="btn btn-dark btn-sm" id="rm-next">Next ›</button>
        <button class="btn btn-ghost btn-sm btn-ink" id="rm-refresh" title="Fetch the latest reservations from dsa.ugent.be">${mi("sync", "sm")}</button>
      </div>
    </div>
    <p class="form-hint" style="margin:0 0 12px"><a href="/board">← Board</a> · <strong>${roomsCache.length}</strong> upcoming reservation${roomsCache.length === 1 ? "" : "s"} · <strong>${okCount}</strong> approved${roomsCache.length - okCount ? ` · <strong>${roomsCache.length - okCount}</strong> pending/other` : ""} - <span style="color:#7AC143">●</span> approved · <span style="color:#F47B20">●</span> pending · <span style="color:var(--esn-magenta)">●</span> denied. Live from dsa.ugent.be (upcoming only, so past months are empty here); rooms are still requested on the DSA site itself.</p>
    <div class="calendar-grid">${cells}</div>
    <div class="m-only cal-agenda">
      ${Object.keys(byDay).map(Number).sort((a, b) => a - b).map((day) => `
        <div class="agenda-day" id="agenda-rd${day}">
          <div class="agenda-date">${new Date(y, m, day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
          ${byDay[day].map((r) => `
            <div class="agenda-item" style="--accent:${ACC[statusKind(r)]};cursor:default">
              <span class="agenda-time">${fmtTime(parseT(r.start_time))}–${fmtTime(parseT(r.end_time))}</span>
              <span class="agenda-title">${esc(r.title || "Reservation")}${r.location ? ` <small class="form-hint">· ${esc(r.location)}</small>` : ""}</span>
              <span class="agenda-price">${stBadge(r)}</span>
            </div>`).join("")}
        </div>`).join("")}
    </div>
    ${Object.keys(byDay).length ? "" : `<p class="form-hint" style="text-align:center;margin-top:14px">No reservations in ${monthName}.</p>`}
  `;
  document.getElementById("rm-prev")?.addEventListener("click", () => { roomsCursor = new Date(y, m - 1, 1); viewBoardRooms(); });
  document.getElementById("rm-next")?.addEventListener("click", () => { roomsCursor = new Date(y, m + 1, 1); viewBoardRooms(); });
  document.getElementById("rm-today")?.addEventListener("click", () => { roomsCursor = null; viewBoardRooms(); });
  document.getElementById("rm-refresh")?.addEventListener("click", () => { roomsCache = null; viewBoardRooms(); });
  document.querySelectorAll(".cal-cell[data-day]").forEach((cell) => {
    cell.addEventListener("click", () => {
      document.getElementById(`agenda-rd${cell.dataset.day}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

async function viewBoardMeeting(id) {
  const gate = boardGateHtml();
  if (gate) {
    $app.innerHTML = gate;
    document.getElementById("es-login")?.addEventListener("click", signIn);
    return;
  }
  setLoading();
  let m, pastEvents, nextEvents, todos, team;
  // Previous meeting - its minutes are approved at the start of this one,
  // and it also anchors the event report: "past activities" covers
  // everything since that meeting (fallback: two weeks) - v0.125.
  let prevMeeting = null;
  try {
    const snap = await getDoc(doc(db, "boardMeetings", id));
    if (!snap.exists()) { $app.innerHTML = `<div class="empty-state"><p>Meeting not found.</p></div>`; return; }
    m = { id: snap.id, ...snap.data() };
    try {
      const ps = await getDocs(query(collection(db, "boardMeetings"),
        where("start", "<", m.start), orderBy("start", "desc"), limit(1)));
      if (!ps.empty) prevMeeting = { id: ps.docs[0].id, ...ps.docs[0].data() };
    } catch { /* optional */ }
    const startD = toDate(m.start);
    const from = prevMeeting ? toDate(prevMeeting.start) : new Date(startD.getTime() - 14 * 24 * 3600 * 1000);
    const to = new Date(startD.getTime() + 28 * 24 * 3600 * 1000);
    [pastEvents, nextEvents, todos, team] = await Promise.all([
      fetchPublishedEvents(from, startD),
      fetchPublishedEvents(startD, to),
      loadBoardTodos().catch(() => []),
      isAdmin ? fetchTeam() : Promise.resolve([]),
    ]);
  } catch (e) { $app.innerHTML = errorState(e.message); return; }

  // Approved minutes are locked (Art. 15: approved at the next meeting,
  // then they are THE record). Superadmin can reopen if needed.
  const locked = !!m.approvedAt;
  const canEdit = isAdmin && !locked;
  const reportFrom = prevMeeting ? toDate(prevMeeting.start) : new Date(toDate(m.start).getTime() - 14 * 24 * 3600 * 1000);

  // ---- attendance roster: board/superadmin/advisory members, merged with
  // what was saved before (advisory readers just see the saved snapshot) ----
  const attendance = Array.isArray(m.attendance) ? [...m.attendance] : [];
  if (canEdit) {
    team.filter((t) => ["superadmin", "board", "finance", "advisory", "alumnicoord"].includes(t.role || "superadmin"))
      .forEach((t) => {
        if (!attendance.some((a) => a.uid === t.id)) {
          attendance.push({ uid: t.id, name: t.name || t.email || "-", fn: t.boardFunction || "", status: "present" });
        }
      });
  }

  // ---- function rounds: General + every function held in the team (in
  // statutes order), plus whatever was already written on this meeting ----
  const teamFns = team.map((t) => t.boardFunction).filter(Boolean);
  const savedFns = Object.keys(m.rounds || {}).filter((k) => k !== "General");
  const fnOrder = ["General",
    ...BOARD_FUNCTIONS.filter((f) => teamFns.includes(f) || savedFns.includes(f)),
    ...savedFns.filter((f) => !BOARD_FUNCTIONS.includes(f)),
    ...teamFns.filter((f) => !BOARD_FUNCTIONS.includes(f)),
  ].filter((f, i, arr) => arr.indexOf(f) === i);
  const rounds = { ...(m.rounds || {}) };
  const eventNotes = { ...(m.eventNotes || {}) };

  const regsCol = collection(db, "registrations");
  const stats = {};
  const fbByEvent = {}; // eventId -> feedback docs (for the ★ column & .md export)
  let statsDenied = false;

  const statCells = (ev) => {
    const st = stats[ev.id];
    if (st === undefined) return { sold: "…", att: "…", rev: "…" };
    if (st === null) {
      return { sold: `${ev.ticketsSold || 0}${ev.capacity ? ` / ${ev.capacity}` : ""}`, att: "-", rev: "-" };
    }
    return {
      sold: `${st.tickets}${ev.capacity ? ` / ${ev.capacity}` : ""}`,
      att: st.tickets ? `${st.checkedIn} (${Math.round((st.checkedIn / st.tickets) * 100)}%)` : "-",
      rev: fmtMoney(st.revenue, ev.currency),
    };
  };

  const evRows = (ev, upcomingRow) => {
    const c = statCells(ev);
    const note = eventNotes[ev.id] || "";
    const noteRow = canEdit
      ? `<tr class="ev-note-row"><td colspan="${upcomingRow ? 4 : 6}"><input class="inline-input ev-note" data-eid="${ev.id}" style="width:100%" maxlength="500" placeholder="Notes for the minutes (how did it go / discussion points)…" value="${esc(note)}" /></td></tr>`
      : note ? `<tr class="ev-note-row"><td colspan="${upcomingRow ? 4 : 6}" class="form-hint">${mi("edit_note", "sm")} ${esc(note)}</td></tr>` : "";
    return `
    <tr>
      <td class="card-main"><a href="/event/${ev.id}"><strong>${esc(ev.title)}</strong></a></td>
      <td data-l="Date">${fmtDate(ev.start)}</td>
      <td data-l="Tickets" data-ms="${ev.id}">${c.sold}</td>
      ${upcomingRow ? "" : `<td data-l="Attended" data-ma="${ev.id}">${c.att}</td>`}
      ${upcomingRow ? "" : `<td data-l="Rating" data-mf="${ev.id}">…</td>`}
      <td data-l="Revenue" data-mr="${ev.id}">${c.rev}</td>
    </tr>${noteRow}`;
  };

  const attChipRow = (a, i) => `
    <li class="att-row">
      <span class="att-name"><strong>${esc(a.name)}</strong>${a.fn ? ` <small class="form-hint">${esc(a.fn)}</small>` : ""}</span>
      ${canEdit
        ? `<span class="att-chips">${ATT_STATUSES.map(([k, label]) => `<button class="chip att-chip ${a.status === k ? "active" : ""}" data-i="${i}" data-s="${k}">${label}</button>`).join("")}</span>`
        : `<span>${(ATT_STATUSES.find(([k]) => k === a.status) || [])[1] || "-"}</span>`}
    </li>`;

  const startD = toDate(m.start);
  $app.innerHTML = `
    <h2 class="section-title">${esc(m.title || "Board meeting")}</h2>
    <div class="form-actions" style="margin:0 0 16px">
      <a href="/board" class="btn btn-ghost btn-sm btn-ink">← All meetings</a>
      <button class="btn btn-ghost btn-sm btn-ink" id="mtg-export">${mi("download")} Export (.md)</button>
      ${aiConfig.enabled && isAdmin ? `<button class="btn btn-ghost btn-sm btn-ink" id="mtg-ai-recap">${jacobImg("jacob-sm")} Jacob's recap</button>` : ""}
      ${isAdmin ? `
        <button class="btn btn-ghost btn-sm btn-ink" id="mtg-sync">${mi("event_available")} ${m.googleEventId ? "Re-sync" : "Add to"} calendar</button>
        <button class="btn btn-ghost btn-sm btn-ink" id="mtg-dsa" title="Board meetings are registered on dsa.ugent.be automatically as a private 'Vergadering' (only visible to board, konvent & DSA). Click to switch this meeting's DSA registration on/off.">${mi("school")} DSA: ${m.dsaSync !== false ? "on" : "off"}</button>
        ${m.dsaActivityId ? `<a href="https://dsa.ugent.be/activiteiten/${m.dsaActivityId}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm btn-ink" title="This meeting's activity on the UGent DSA site">Open in DSA ↗</a>` : ""}
        <button class="btn btn-ghost btn-sm btn-ink" id="mtg-edit">Edit details</button>
        <button class="btn btn-ghost btn-danger btn-sm" id="mtg-del">Delete</button>` : ""}
      ${isAdmin && !m.approvedAt && toDate(m.start) < new Date() ? `<button class="btn btn-green btn-sm" id="mtg-approve">${mi("check_circle")} Mark minutes approved</button>` : ""}
      ${locked && myRole === "superadmin" ? `<button class="btn btn-ghost btn-sm btn-ink" id="mtg-reopen">Reopen minutes</button>` : ""}
    </div>
    <div id="ai-recap-box" style="margin:0 0 16px"></div>
    ${prevMeeting && !prevMeeting.approvedAt && isAdmin && toDate(m.start) >= new Date(Date.now() - 24 * 3600 * 1000) ? `
    <div class="form-card" style="margin-bottom:16px;border-left:4px solid var(--esn-orange)">
      <strong>Start of meeting (Art. 15):</strong> approve the minutes of the previous meeting -
      <a href="/board/meeting-${prevMeeting.id}">${esc(prevMeeting.title || "Board meeting")} · ${fmtDate(prevMeeting.start)}</a>.
      <div class="form-actions" style="margin-top:8px"><button class="btn btn-green btn-sm" id="prev-approve">${mi("check_circle")} Approve previous minutes</button></div>
    </div>` : ""}
    <div class="form-card" style="margin-bottom:18px">
      <ul class="event-info-list">
        <li><span class="info-label">When</span><span>${fmtDate(m.start)} · ${fmtTime(m.start)}</span></li>
        <li><span class="info-label">Where</span><span>${esc(m.location || "-")}</span></li>
        <li><span class="info-label">Calendar</span><span>${m.googleEventId ? `${mi("event_available", "sm")} On the board calendar` : "Not on the board calendar yet"}</span></li>
        <li><span class="info-label">Minutes</span><span>${m.approvedAt
          ? `${mi("check_circle", "sm")} Approved ${fmtDate(m.approvedAt)}${m.approvedByName ? ` · recorded by ${esc(m.approvedByName.split(" ")[0])}` : ""}`
          : "Draft - approved at the start of the next meeting (Art. 15)"}</span></li>
      </ul>
      <div id="mtg-edit-form" class="hidden" style="margin-top:14px">
        <div class="form-grid">
          <div class="form-field"><label for="me-title">Title</label><input id="me-title" value="${esc(m.title || "Board meeting")}" maxlength="80" /></div>
          <div class="form-field"><label for="me-date">Date</label><input id="me-date" type="date" value="${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, "0")}-${String(startD.getDate()).padStart(2, "0")}" /></div>
          <div class="form-field"><label for="me-time">Time</label><input id="me-time" type="time" value="${String(startD.getHours()).padStart(2, "0")}:${String(startD.getMinutes()).padStart(2, "0")}" /></div>
          <div class="form-field"><label for="me-loc">Location</label><input id="me-loc" value="${esc(m.location || "")}" maxlength="120" /></div>
        </div>
        <div class="form-actions"><button class="btn btn-green btn-sm" id="me-save">Save details</button></div>
      </div>
    </div>

    <h3 class="section-title sm">Attendance</h3>
    <div class="form-card" style="margin-bottom:18px">
      ${attendance.length
        ? `<ul class="att-list">${attendance.map(attChipRow).join("")}</ul>
           ${isAdmin ? `<p class="form-hint" style="margin-top:8px">Tap a status per person - saved automatically.</p>` : ""}`
        : `<p class="form-hint">No attendance recorded${isAdmin ? " - add board members in Admin → Team first" : ""}.</p>`}
    </div>

    <h3 class="section-title sm">Function round</h3>
    <div class="form-card" style="margin-bottom:18px">
      ${fnOrder.map((fn) => canEdit ? `
        <div class="form-field" style="margin-bottom:12px">
          <label>${esc(fn)}${fn !== "General" ? ` <small class="form-hint">${esc(team.filter((t) => t.boardFunction === fn).map((t) => (t.name || "").split(" ")[0]).join(", "))}</small>` : ""}</label>
          <textarea class="round-input" data-fn="${esc(fn)}" rows="2" placeholder="${fn === "General" ? "General round - announcements, international updates…" : "Updates from this function…"}" style="width:100%;font-family:inherit;font-size:.88rem;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--ink)">${esc(rounds[fn] || "")}</textarea>
        </div>`
      : rounds[fn] ? `<p style="margin-bottom:10px"><strong>${esc(fn)}</strong><br>${renderRich(rounds[fn])}</p>` : "").join("")}
      ${!canEdit && !fnOrder.some((fn) => rounds[fn]) ? `<p class="form-hint">Nothing written yet.</p>` : ""}
    </div>

    <h3 class="section-title sm">${mi("history")} Past activities - ${prevMeeting ? `since the previous meeting (${fmtDate(reportFrom)})` : "two weeks before this meeting"}</h3>
    ${pastEvents.length ? `
      <div class="table-wrap cards"><table>
        <thead><tr><th>Event</th><th>Date</th><th>Tickets</th><th>Attended</th><th>Rating</th><th>Revenue</th></tr></thead>
        <tbody>${pastEvents.map((ev) => evRows(ev, false)).join("")}</tbody>
      </table></div>
      <p class="form-hint" id="mtg-stats-note" style="margin:6px 0 18px"></p>`
    : `<div class="empty-state"><p>No events ${prevMeeting ? `between the previous meeting (${fmtDate(reportFrom)}) and this one` : "in the two weeks before this meeting"}.</p></div>`}

    <h3 class="section-title sm">${mi("upcoming")} Upcoming activities - four weeks after this meeting</h3>
    ${nextEvents.length ? `
      <div class="table-wrap cards"><table>
        <thead><tr><th>Event</th><th>Date</th><th>Tickets</th><th>Revenue so far</th></tr></thead>
        <tbody>${nextEvents.map((ev) => evRows(ev, true)).join("")}</tbody>
      </table></div>`
    : `<div class="empty-state"><p>No published events in the four weeks after this meeting yet.</p></div>`}

    <h3 class="section-title sm">${mi("star")} Varia &amp; other notes</h3>
    ${canEdit ? `
      <div class="form-card" style="margin-bottom:18px">
        <textarea id="mtg-minutes" rows="5" placeholder="Anything else discussed…" style="width:100%;font-family:inherit;font-size:.9rem;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--ink)">${esc(m.minutes || "")}</textarea>
      </div>`
    : m.minutes
      ? `<div class="form-card rich" style="margin-bottom:18px">${renderRich(m.minutes)}</div>`
      : `<p class="form-hint" style="margin-bottom:18px">Nothing noted.</p>`}

    ${canEdit ? `
    <div class="form-actions" style="margin:0 0 22px">
      <button class="btn btn-green" id="mtg-save">Save meeting notes</button>
      <span class="form-hint" id="mtg-save-state">Rounds, event notes and varia save together. Attendance saves on tap.</span>
    </div>` : ""}

    <h3 class="section-title sm">${mi("checklist")} To-do list</h3>
    <div class="form-card" id="board-todos" style="margin-bottom:22px"></div>
  `;

  renderTodoSection(document.getElementById("board-todos"), todos, team);

  // ---- attendance (auto-save on tap) ----
  const saveAttendance = async () => {
    try {
      await updateDoc(doc(db, "boardMeetings", m.id), { attendance, updatedAt: serverTimestamp() });
    } catch (err) { toast("Attendance not saved: " + err.message, "error"); }
  };
  if (canEdit && attendance.length !== (m.attendance || []).length) {
    saveAttendance(); // persist the freshly-built roster snapshot
  }
  $app.querySelectorAll(".att-chip").forEach((btn) => {
    btn.onclick = () => {
      const a = attendance[Number(btn.dataset.i)];
      if (!a) return;
      a.status = btn.dataset.s;
      const row = btn.closest(".att-row");
      row.querySelectorAll(".att-chip").forEach((b) => b.classList.toggle("active", b === btn));
      saveAttendance();
    };
  });

  // ---- save rounds + event notes + varia together ----
  document.getElementById("mtg-save")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      $app.querySelectorAll(".round-input").forEach((ta) => { rounds[ta.dataset.fn] = ta.value; });
      $app.querySelectorAll(".ev-note").forEach((inp) => {
        if (inp.value.trim()) eventNotes[inp.dataset.eid] = inp.value.trim();
        else delete eventNotes[inp.dataset.eid];
      });
      m.minutes = document.getElementById("mtg-minutes").value;
      m.rounds = rounds; m.eventNotes = eventNotes;
      await updateDoc(doc(db, "boardMeetings", m.id), {
        rounds, eventNotes, minutes: m.minutes, updatedAt: serverTimestamp(),
      });
      document.getElementById("mtg-save-state").textContent = `Saved at ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
      toast("Meeting notes saved", "success");
    } catch (err) { toast("Could not save: " + err.message, "error"); }
    e.target.disabled = false;
  });

  // ---- Jacob's recap of the minutes (board tool) ----
  document.getElementById("mtg-ai-recap")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const oldLabel = btn.innerHTML;
    btn.innerHTML = `${mi("hourglass_top", "sm")} Jacob is reading…`;
    try {
      if (canEdit) { // save what's on screen first, so Jacob reads the latest notes
        $app.querySelectorAll(".round-input").forEach((ta) => { rounds[ta.dataset.fn] = ta.value; });
        $app.querySelectorAll(".ev-note").forEach((inp) => {
          if (inp.value.trim()) eventNotes[inp.dataset.eid] = inp.value.trim();
          else delete eventNotes[inp.dataset.eid];
        });
        m.minutes = document.getElementById("mtg-minutes").value;
        m.rounds = rounds; m.eventNotes = eventNotes;
        await updateDoc(doc(db, "boardMeetings", m.id), {
          rounds, eventNotes, minutes: m.minutes, updatedAt: serverTimestamp(),
        });
      }
      const fn = httpsCallable(functions, "aiAssist");
      const res = await fn({ task: "minutesRecap", meetingId: m.id });
      document.getElementById("ai-recap-box").innerHTML =
        jacobCard(renderRich(res.data.text), "Jacob's recap of these minutes - check it against the notes before sharing it.");
    } catch (err) { toast(err.message || "Jacob couldn't write the recap - try again.", "error"); }
    btn.disabled = false;
    btn.innerHTML = oldLabel;
  });

  // ---- export ----
  document.getElementById("mtg-export").onclick = () => {
    if (canEdit) { // capture unsaved edits into the export
      $app.querySelectorAll(".round-input").forEach((ta) => { rounds[ta.dataset.fn] = ta.value; });
      $app.querySelectorAll(".ev-note").forEach((inp) => {
        if (inp.value.trim()) eventNotes[inp.dataset.eid] = inp.value.trim();
      });
    }
    const varia = (canEdit ? document.getElementById("mtg-minutes")?.value : null) ?? m.minutes;
    const byStatus = (s) => attendance.filter((a) => a.status === s).map((a) => a.name.split(" ")[0]).join(", ");
    const lines = [];
    lines.push(`# ${m.title || "Board meeting"} ESN Gent`);
    lines.push("");
    lines.push(`**Date:** ${fmtDate(m.start)} ${fmtTime(m.start)}${m.location ? ` - ${m.location}` : ""}`);
    lines.push("");
    if (attendance.length) {
      lines.push(`**Present:** ${byStatus("present") || "-"}`);
      lines.push(`**Online:** ${byStatus("online") || "-"}`);
      lines.push(`**Late/didn't join full meeting:** ${byStatus("late") || "-"}`);
      lines.push(`**Absent:** ${byStatus("absent") || "-"}`);
      lines.push("");
    }
    lines.push("## 🗒️ Function round");
    fnOrder.forEach((fn) => {
      if (!rounds[fn]) return;
      lines.push("");
      lines.push(`### ${fn}`);
      lines.push(rounds[fn]);
    });
    if (!fnOrder.some((fn) => rounds[fn])) lines.push("_Nothing recorded._");
    lines.push("");
    lines.push(`## Past activities${prevMeeting ? ` (since ${fmtDate(reportFrom)})` : ""}`);
    if (pastEvents.length) {
      pastEvents.forEach((ev) => {
        const c = statCells(ev);
        lines.push("");
        lines.push(`### ${ev.title} (${fmtDate(ev.start)})`);
        const fb = fbByEvent[ev.id] || [];
        const avg = fb.length ? (fb.reduce((a, f) => a + f.rating, 0) / fb.length).toFixed(1) : null;
        lines.push(`Tickets ${c.sold} · attended ${c.att} · revenue ${c.rev}${avg ? ` · rating ★ ${avg} (${fb.length})` : ""}`);
        fb.filter((f) => (f.comment || "").trim()).forEach((f) => {
          lines.push(`> ${"★".repeat(f.rating || 0)} ${f.comment.trim()}`);
        });
        if (eventNotes[ev.id]) lines.push(eventNotes[ev.id]);
      });
    } else lines.push("_No events in this window._");
    lines.push("");
    lines.push("## Upcoming activities");
    if (nextEvents.length) {
      nextEvents.forEach((ev) => {
        const c = statCells(ev);
        lines.push("");
        lines.push(`### ${ev.title} (${fmtDate(ev.start)})`);
        lines.push(`Tickets ${c.sold} · revenue so far ${c.rev}`);
        if (eventNotes[ev.id]) lines.push(eventNotes[ev.id]);
      });
    } else lines.push("_No published events yet._");
    lines.push("");
    lines.push("## Varia");
    lines.push(varia || "_Nothing noted._");
    lines.push("");
    lines.push("## ✅ To-do");
    const openTodos = todos.filter((t) => t.status !== "done");
    if (openTodos.length) openTodos.forEach((t) => lines.push(`- [ ] ${t.assignedName ? `${t.assignedName}: ` : ""}${t.text}`));
    else lines.push("_Nothing open._");
    todos.filter((t) => t.status === "done").slice(0, 10).forEach((t) => lines.push(`- [x] ~~${t.assignedName ? `${t.assignedName}: ` : ""}${t.text}~~`));
    lines.push("");
    if (m.approvedAt) {
      lines.push("");
      lines.push(`**Minutes approved on ${fmtDate(m.approvedAt)}${m.approvedByName ? ` (recorded by ${m.approvedByName})` : ""}.**`);
    }
    lines.push(`_Exported from ESN Gent App v${APP_VERSION} on ${new Date().toLocaleDateString("en-GB")}_`);
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `board-meeting-${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, "0")}-${String(startD.getDate()).padStart(2, "0")}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---- details / calendar / delete ----
  document.getElementById("mtg-edit")?.addEventListener("click", () => {
    document.getElementById("mtg-edit-form").classList.toggle("hidden");
  });
  document.getElementById("me-save")?.addEventListener("click", async (e) => {
    const date = document.getElementById("me-date").value;
    if (!date) { toast("Pick a date.", "error"); return; }
    const time = document.getElementById("me-time").value || "20:00";
    e.target.disabled = true;
    try {
      m.title = document.getElementById("me-title").value.trim() || "Board meeting";
      m.start = Timestamp.fromDate(new Date(`${date}T${time}`));
      m.location = document.getElementById("me-loc").value.trim();
      await updateDoc(doc(db, "boardMeetings", m.id), {
        title: m.title, start: m.start, location: m.location, updatedAt: serverTimestamp(),
      });
      toast("Meeting updated - the board calendar follows automatically.", "success");
      viewBoardMeeting(m.id);
    } catch (err) { toast("Could not save: " + err.message, "error"); e.target.disabled = false; }
  });
  document.getElementById("mtg-sync")?.addEventListener("click", async (e) => {
    // v1.22: server-side - nudge the sync trigger with a timestamp field
    e.target.disabled = true;
    try {
      await updateDoc(doc(db, "boardMeetings", m.id), { calResyncAt: serverTimestamp() });
      toast("Board calendar re-sync requested - it updates within seconds.", "success");
    } catch (err) { toast("Calendar sync failed: " + err.message, "error"); }
    e.target.disabled = false;
  });
  document.getElementById("mtg-dsa")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget; // capture BEFORE await - currentTarget is null after dispatch
    const next = !(m.dsaSync !== false); // toggle: undefined/true → false, false → true
    try {
      await updateDoc(doc(db, "boardMeetings", m.id), { dsaSync: next });
      m.dsaSync = next;
      btn.innerHTML = `${mi("school")} DSA: ${next ? "on" : "off"}`;
      toast(next ? "Meeting will be registered on dsa.ugent.be (private Vergadering)." : "Meeting removed from dsa.ugent.be.", "success");
    } catch (err) { toast("Could not update: " + err.message, "error"); }
  });
  document.getElementById("mtg-del")?.addEventListener("click", async () => {
    if (!await appConfirm("Delete this meeting (attendance, rounds and minutes included)? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "boardMeetings", m.id));
      logAudit("deleted", "board meeting", m.title || "Board meeting", m.id);
      // The board-calendar entry is removed automatically server-side.
      toast("Meeting deleted", "success");
      navigate("/board");
    } catch (err) { toast("Could not delete: " + err.message, "error"); }
  });
  const approveMeeting = async (targetId) => {
    await updateDoc(doc(db, "boardMeetings", targetId), {
      approvedAt: serverTimestamp(),
      approvedBy: currentUser.uid,
      approvedByName: currentUser.displayName || currentUser.email || "",
    });
  };
  document.getElementById("mtg-approve")?.addEventListener("click", async (e) => {
    if (!await appConfirm("Mark these minutes as approved by the board? They become read-only (superadmin can reopen).")) return;
    e.target.disabled = true;
    try { await approveMeeting(m.id); toast("Minutes approved", "success"); viewBoardMeeting(m.id); }
    catch (err) { toast("Failed: " + err.message, "error"); e.target.disabled = false; }
  });
  document.getElementById("prev-approve")?.addEventListener("click", async (e) => {
    if (!await appConfirm(`Approve the minutes of ${prevMeeting.title || "the previous meeting"} (${fmtDate(prevMeeting.start)})?`)) return;
    e.target.disabled = true;
    try { await approveMeeting(prevMeeting.id); toast("Previous minutes approved", "success"); viewBoardMeeting(m.id); }
    catch (err) { toast("Failed: " + err.message, "error"); e.target.disabled = false; }
  });
  document.getElementById("mtg-reopen")?.addEventListener("click", async () => {
    if (!await appConfirm("Reopen these approved minutes for editing?")) return;
    try {
      await updateDoc(doc(db, "boardMeetings", m.id), { approvedAt: null, approvedBy: null, approvedByName: null });
      toast("Minutes reopened for editing.", "success");
      viewBoardMeeting(m.id);
    } catch (err) { toast("Failed: " + err.message, "error"); }
  });

  // ---- fill event stats (board sees real numbers; advisory falls back) ----
  // v0.125: past events also pull the students' feedback (★ ratings +
  // comments) - the average shows in the table, details open in a popup.
  const allEvents = [...pastEvents, ...nextEvents];
  const isPast = new Set(pastEvents.map((ev) => ev.id));
  let idx = 0;
  const worker = async () => {
    while (idx < allEvents.length) {
      const ev = allEvents[idx++];
      try {
        const [s, c, r] = await Promise.all([
          getAggregateFromServer(query(regsCol, where("eventId", "==", ev.id), where("status", "in", ["paid", "free"])), { v: sum("quantity") }),
          getAggregateFromServer(query(regsCol, where("eventId", "==", ev.id), where("checkedInAt", ">", new Date(0))), { v: sum("quantity") }),
          getAggregateFromServer(query(regsCol, where("eventId", "==", ev.id), where("status", "==", "paid")), { v: sum("amountTotal") }),
        ]);
        stats[ev.id] = { tickets: s.data().v || 0, checkedIn: c.data().v || 0, revenue: r.data().v || 0 };
      } catch { stats[ev.id] = null; statsDenied = true; }
      const cells = statCells(ev);
      const sEl = document.querySelector(`[data-ms="${ev.id}"]`); if (sEl) sEl.textContent = cells.sold;
      const aEl = document.querySelector(`[data-ma="${ev.id}"]`); if (aEl) aEl.textContent = cells.att;
      const rEl = document.querySelector(`[data-mr="${ev.id}"]`); if (rEl) rEl.textContent = cells.rev;
      if (isPast.has(ev.id)) {
        const fEl = document.querySelector(`[data-mf="${ev.id}"]`);
        try {
          const fs = await getDocs(query(collection(db, "feedback"), where("eventId", "==", ev.id)));
          const list = fs.docs.map((d) => d.data()).filter((f) => Number.isFinite(f.rating));
          fbByEvent[ev.id] = list;
          if (!fEl) continue;
          if (!list.length) { fEl.textContent = "-"; continue; }
          const avg = list.reduce((a, f) => a + f.rating, 0) / list.length;
          fEl.innerHTML = `<button class="btn btn-sm btn-ghost btn-ink mtg-fb" data-eid="${ev.id}" title="Show the students' comments">★ ${avg.toFixed(1)} <span style="opacity:.7">(${list.length})</span></button>`;
          fEl.querySelector(".mtg-fb").onclick = () => {
            // appAlert renders plain text (newlines become line breaks).
            const comments = list.filter((f) => (f.comment || "").trim());
            const stars = (n) => "★".repeat(n || 0) + "☆".repeat(Math.max(0, 5 - (n || 0)));
            appAlert(
              `${ev.title} - ★ ${avg.toFixed(1)} average from ${list.length} rating${list.length === 1 ? "" : "s"}\n\n` +
              (comments.length
                ? comments.map((f) => `${stars(f.rating)}  ${f.comment.trim()}`).join("\n\n")
                : "Ratings only - no written comments."));
          };
        } catch { if (fEl) fEl.textContent = "-"; }
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const note = document.getElementById("mtg-stats-note");
  if (note) {
    if (statsDenied) {
      note.textContent = "Ticket numbers use the public counters - detailed attendance and revenue are visible to board members.";
    } else if (pastEvents.length) {
      const tot = pastEvents.reduce((acc, ev) => {
        const st = stats[ev.id];
        if (st) { acc.t += st.tickets; acc.c += st.checkedIn; acc.r += st.revenue; }
        return acc;
      }, { t: 0, c: 0, r: 0 });
      note.textContent = `Totals: ${tot.t} tickets · ${tot.c} checked in${tot.t ? ` (${Math.round((tot.c / tot.t) * 100)}%)` : ""} · ${fmtMoney(tot.r)} revenue.`;
    }
  }
}

// My tasks - for every team member incl. volunteers (who don't see the
// board space). Assignees may tick their own tasks off.
async function viewMyTasks() {
  if (!currentUser || !myRole) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("task_alt")}</div><p>Tasks are for ESN team members.${currentUser ? "" : " Please sign in."}</p>${currentUser ? "" : googleBtn()}</div>`;
    document.getElementById("es-login")?.addEventListener("click", signIn);
    return;
  }
  setLoading();
  let mine;
  try {
    mine = await getDocs(query(collection(db, "boardTodos"), where("assignedUid", "==", currentUser.uid)))
      .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (e) { $app.innerHTML = errorState(e.message); return; }
  mine.sort((a, b) => (a.status === b.status ? (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0) : a.status === "open" ? -1 : 1));

  $app.innerHTML = `
    <h2 class="section-title">My ESN tasks</h2>
    <p class="form-hint" style="margin:-6px 0 16px">Tasks the board assigned to you. Tick them off when done${canMeetings() ? ` - the full list lives in <a href="/board">Board</a>` : ""}.</p>
    ${(() => {
      if (!mine.length) return `<div class="empty-state"><div class="big">${mi("celebration")}</div><p>No tasks assigned to you right now.</p></div>`;
      const shortD = (v) => { const d = toDate(v); return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""; };
      const cutoff = Date.now() - 14 * 86400e3;
      const current = mine.filter((t) => t.status !== "done" || (toDate(t.doneAt)?.getTime() || 0) >= cutoff);
      const archived = mine.filter((t) => t.status === "done" && (toDate(t.doneAt)?.getTime() || 0) < cutoff);
      const row = (t) => `
        <li class="todo-row ${t.status === "done" ? "done" : ""}">
          <input type="checkbox" class="todo-tick" data-tid="${t.id}" ${t.status === "done" ? "checked" : ""} />
          <span class="todo-text">${t.status === "done" ? `<s>${esc(t.text)}</s>` : esc(t.text)}
            <small class="todo-when">${t.createdAt ? `added ${shortD(t.createdAt)}` : ""}${t.status === "done" && t.doneAt ? ` · done ${shortD(t.doneAt)}` : ""}</small></span>
        </li>`;
      return `<div class="form-card"><ul class="todo-list">${current.map(row).join("")}</ul>
        ${archived.length ? `<details style="margin-top:8px"><summary class="form-hint" style="cursor:pointer">Archive - ${archived.length} older task${archived.length === 1 ? "" : "s"}</summary><ul class="todo-list">${archived.map(row).join("")}</ul></details>` : ""}</div>`;
    })()}
  `;
  $app.querySelectorAll(".todo-tick").forEach((cb) => {
    cb.onchange = async () => {
      try {
        await updateDoc(doc(db, "boardTodos", cb.dataset.tid), {
          status: cb.checked ? "done" : "open",
          doneAt: cb.checked ? serverTimestamp() : null,
        });
        toast(cb.checked ? "Nice - task done" : "Task reopened", "success");
        viewMyTasks();
      } catch (err) { toast("Failed: " + err.message, "error"); cb.checked = !cb.checked; }
    };
  });
}

// ------------------------------------------------------------
// ------------------------------------------------------------
// Shiftlists - replaces the party/events/sports/trips shift
// spreadsheets. Board builds a shiftlist per event (drafts allowed);
// the whole team sees them and signs themselves up; shifts done are
// counted per person. Students can never read any of this (rules).
// ------------------------------------------------------------
let SHIFT_TASKS = [
  "SET-UP", "ENTRANCE", "BAR", "DURING", "CLEAN-UP", "SECURITY",
  "Overseeing", "Registration", "Guide - group 1", "Guide - group 2",
  "Guide - group 3", "Guide - group 4", "Floor -1", "Floor 0", "Floor 1",
];

const semesterStart = () => {
  const now = new Date();
  const y = now.getFullYear();
  // Semesters flip on 1 Aug and 1 Feb
  if (now.getMonth() >= 7) return new Date(y, 7, 1);
  if (now.getMonth() >= 1) return new Date(y, 1, 1);
  return new Date(y - 1, 7, 1);
};

// Spreadsheet-style shift grid - rows are shifts, columns are BOARD /
// VOLUNTEER 1..n slots, exactly like the old party shiftlist sheet.
// mode: 'team' (tap open cells to join) | 'editor' (assign/manage).
function shiftGrid(eventShifts, signups, mode) {
  const boardOf = (sh) => signups.filter((s) => s.shiftId === sh.id && s.role === "board");
  const volsOf = (sh) => signups.filter((s) => s.shiftId === sh.id && s.role === "volunteer");
  const maxB = Math.max(0, ...eventShifts.map((sh) => Math.max(sh.needBoard || 0, boardOf(sh).length)));
  const maxV = Math.max(0, ...eventShifts.map((sh) => Math.max(sh.needVol || 0, volsOf(sh).length)));

  const chip = (s) => {
    const me = s.uid === currentUser?.uid;
    const x = mode === "editor"
      ? `<button class="chip-x sh-unassign" data-id="${s.id}" title="Remove from shift" aria-label="Remove from shift">✕</button>`
      : me
        ? `<button class="chip-x shift-leave" data-sid="${s.shiftId}" title="Leave this shift" aria-label="Leave this shift">✕</button>`
        : "";
    return `<span class="slot-chip ${s.role}${me ? " me" : ""}">${esc((s.name || "").split(" ")[0])}${me ? " (you)" : ""}${x}</span>`;
  };

  const rowCells = (sh) => {
    const b = boardOf(sh);
    const v = volsOf(sh);
    const iAmOn = !!currentUser && [...b, ...v].some((s) => s.uid === currentUser.uid);
    const cell = (role, i, list, need) => {
      if (i < list.length) return `<td class="cell-filled">${chip(list[i])}</td>`;
      if (i < need) {
        if (mode === "editor") {
          return `<td class="cell-open"><button class="cell-join cell-assign" data-sid="${sh.id}" data-role="${role}">+ assign</button></td>`;
        }
        const canJoin = !iAmOn && (role === "volunteer" || isAdmin);
        return canJoin
          ? `<td class="cell-open"><button class="cell-join slot-join" data-sid="${sh.id}" data-role="${role}">+ join</button></td>`
          : `<td class="cell-open"><span class="cell-hint">open</span></td>`;
      }
      return `<td class="cell-na"></td>`;
    };
    let html = "";
    for (let i = 0; i < maxB; i++) html += cell("board", i, b, sh.needBoard || 0);
    for (let i = 0; i < maxV; i++) html += cell("volunteer", i, v, sh.needVol || 0);
    return html;
  };

  // Team view (v0.137): one card per shift instead of a wide grid - readable
  // on a phone, no sideways scrolling. The editor keeps the table.
  if (mode !== "editor") {
    const group = (label, role, list, need, sid) => {
      if (!need && !list.length) return "";
      const iAmOn = !!currentUser && list.some((s) => s.uid === currentUser.uid);
      const slots = [];
      list.forEach((s) => slots.push(chip(s)));
      for (let i = list.length; i < need; i++) {
        const canJoin = !iAmOn && (role === "volunteer" || isAdmin);
        slots.push(canJoin
          ? `<button class="slot-join slot-open" data-sid="${sid}" data-role="${role}">${mi("add", "sm")} join</button>`
          : `<span class="slot-open muted">open</span>`);
      }
      return `<div class="slot-group"><small>${label} <b>${list.length}/${need || list.length}</b></small><div class="slot-row">${slots.join("")}</div></div>`;
    };
    return `<div class="shift-cards">${eventShifts.map((sh) => {
      const b = boardOf(sh), v = volsOf(sh);
      const iAmOn = !!currentUser && [...b, ...v].some((s) => s.uid === currentUser.uid);
      const need = (sh.needBoard || 0) + (sh.needVol || 0);
      const filled = b.length + v.length;
      const full = need > 0 && filled >= need;
      return `
      <div class="shift-card ${iAmOn ? "mine" : ""} ${full ? "full" : ""}">
        <div class="shift-card-head">
          <strong>${esc(sh.task)}</strong>
          ${sh.time ? `<span class="shift-time">${mi("schedule", "sm")} ${esc(sh.time)}</span>` : ""}
          <span class="shift-fill ${full ? "ok" : ""}">${full ? mi("check_circle", "sm") : mi("group", "sm")} ${filled}/${need}</span>
        </div>
        ${sh.note ? `<p class="cell-note">${esc(sh.note)}</p>` : ""}
        <div class="shift-slots">
          ${group("Board", "board", b, sh.needBoard || 0, sh.id)}
          ${group("Volunteers", "volunteer", v, sh.needVol || 0, sh.id)}
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  const head = `<tr>
    <th class="col-task">Shift</th><th class="col-time">Time</th>
    ${Array.from({ length: maxB }, (_, i) => `<th class="col-board">Board${maxB > 1 ? ` ${i + 1}` : ""}</th>`).join("")}
    ${Array.from({ length: maxV }, (_, i) => `<th>Volunteer${maxV > 1 ? ` ${i + 1}` : ""}</th>`).join("")}
    ${mode === "editor" ? `<th class="col-act"></th>` : ""}
  </tr>`;

  const rows = eventShifts.map((sh) => `
    <tr>
      <td class="col-task"><strong>${esc(sh.task)}</strong>${sh.note ? `<div class="cell-note">${esc(sh.note)}</div>` : ""}</td>
      <td class="col-time">${esc(sh.time || "")}</td>
      ${rowCells(sh)}
      ${mode === "editor" ? `<td class="col-act"><span class="grid-actions">
        <button class="grid-ib sh-up" data-sid="${sh.id}" title="Move up" aria-label="Move up">${mi("arrow_upward", "sm")}</button>
        <button class="grid-ib sh-down" data-sid="${sh.id}" title="Move down" aria-label="Move down">${mi("arrow_downward", "sm")}</button>
        <button class="grid-ib sh-edit" data-sid="${sh.id}" title="Edit shift" aria-label="Edit shift">${mi("edit", "sm")}</button>
        <button class="grid-ib danger sh-del" data-sid="${sh.id}" title="Delete shift" aria-label="Delete shift">${mi("delete", "sm")}</button>
      </span></td>` : ""}
    </tr>`).join("");

  return `<div class="table-wrap shift-grid-wrap"><table class="shift-grid"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

async function viewShifts() {
  if (!currentUser || !myRole) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("schedule")}</div><p>Shiftlists are for ESN team members.${currentUser ? "" : " Please sign in."}</p>${currentUser ? "" : googleBtn()}</div>`;
    document.getElementById("es-login")?.addEventListener("click", signIn);
    return;
  }
  setLoading();
  const cutoff = new Date(Date.now() - 12 * 3600 * 1000);
  let shifts, signups, mineAll;
  try {
    [shifts, signups, mineAll] = await Promise.all([
      getDocs(query(collection(db, "shifts"), where("eventStart", ">=", cutoff)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      getDocs(query(collection(db, "shiftSignups"), where("eventStart", ">=", cutoff)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      getDocs(query(collection(db, "shiftSignups"), where("uid", "==", currentUser.uid)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    ]);
  } catch (e) { $app.innerHTML = errorState(e.message); return; }

  const now = new Date();
  let leaderboardHtml = ""; // filled once for the board, kept across re-renders

  const render = (preserveScroll = false) => {
    const y = window.scrollY;

    const doneCount = mineAll.filter((s) => toDate(s.eventStart) < now).length;
    const doneSem = mineAll.filter((s) => { const d = toDate(s.eventStart); return d < now && d >= semesterStart(); }).length;
    const officeDone = mineAll.filter((s) => s.officeHours && toDate(s.eventStart) < now).length;
    const myUpcoming = mineAll.filter((s) => toDate(s.eventStart) >= cutoff)
      .sort((a, b) => toDate(a.eventStart) - toDate(b.eventStart));

    const byEvent = {};
    shifts.forEach((sh) => {
      (byEvent[sh.eventId] ??= { title: sh.eventTitle, start: sh.eventStart, shifts: [] }).shifts.push(sh);
    });
    const eventBlocks = Object.entries(byEvent)
      .map(([eid, e]) => ({ eid, ...e }))
      .sort((a, b) => toDate(a.start) - toDate(b.start));
    eventBlocks.forEach((e) => e.shifts.sort((a, b) => (a.order || 0) - (b.order || 0) || (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0)));

    $app.innerHTML = `
      <h2 class="section-title">Shiftlists</h2>
      <p class="form-hint" style="margin:-6px 0 16px">Tap an open spot to take a shift - thanks for helping out!</p>
      ${pushOfferHtml("Get a push <strong>the day before</strong> each of your shifts?")}
      <div class="stat-row">
        <div class="stat-card" style="--accent:#7AC143"><div class="num">${doneCount}</div><div class="lbl">Shifts done (total)</div></div>
        <div class="stat-card" style="--accent:#00AEEF"><div class="num">${doneSem}</div><div class="lbl">This semester</div></div>
        <div class="stat-card" style="--accent:#2E3192"><div class="num">${officeDone}</div><div class="lbl">Office shifts</div></div>
        <div class="stat-card" style="--accent:#F47B20"><div class="num">${myUpcoming.length}</div><div class="lbl">Coming up for you</div></div>
      </div>
      ${myUpcoming.length ? `
        <h3 class="section-title sm">My shifts</h3>
        <div class="cal-agenda" style="margin-bottom:20px">
          ${myUpcoming.map((s) => `
            <a class="agenda-item" href="/event/${s.eventId}" style="--accent:var(--esn-green)">
              <span class="agenda-time">${fmtDate(s.eventStart)}</span>
              <span class="agenda-title">${esc(s.eventTitle || "")} - <strong>${esc(s.task)}</strong>${s.time ? ` <small class="form-hint">${esc(s.time)}</small>` : ""}</span>
            </a>`).join("")}
        </div>` : ""}

      ${eventBlocks.length ? eventBlocks.map((e) => `
        <div class="form-card shift-event" style="margin-bottom:18px">
          <div class="shift-event-head">
            <div><a href="/event/${e.eid}"><strong>${esc(e.title || "Event")}</strong></a><br><small class="form-hint">${fmtDate(e.start)} · ${fmtTime(e.start)}</small></div>
            ${isAdmin ? `<a class="btn btn-sm btn-ghost btn-ink" href="/admin/shifts-${e.eid}">${mi("edit", "sm")} Edit shiftlist</a>` : ""}
          </div>
          ${shiftGrid(e.shifts, signups, "team")}
        </div>`).join("")
      : `<div class="empty-state"><div class="big">${mi("schedule")}</div><p>No shiftlists for upcoming events yet${isAdmin ? ` - open an event in Admin and tap <strong>Shiftlist</strong>` : " - check back soon"}.</p></div>`}

      <div id="shift-leaderboard">${leaderboardHtml}</div>
    `;

    $app.querySelectorAll(".slot-join").forEach((btn) => {
      btn.onclick = async () => {
        const sh = shifts.find((x) => x.id === btn.dataset.sid);
        if (!sh) return;
        btn.disabled = true;
        const rec = {
          id: `${sh.id}_${currentUser.uid}`,
          shiftId: sh.id,
          eventId: sh.eventId,
          eventTitle: sh.eventTitle || "",
          eventStart: sh.eventStart,
          task: sh.task || "",
          time: sh.time || "",
          uid: currentUser.uid,
          name: currentUser.displayName || currentUser.email || "",
          role: btn.dataset.role,
          officeHours: sh.officeHours === true,
        };
        try {
          const { id: _docId, ...payload } = rec;
          await setDoc(doc(db, "shiftSignups", rec.id), { ...payload, createdAt: serverTimestamp() });
          signups.push(rec);
          mineAll.push(rec);
          toast(`You're on ${sh.task} - thanks!`, "success");
          render(true);
        } catch (err) { toast("Could not sign up: " + err.message, "error"); btn.disabled = false; }
      };
    });
    $app.querySelectorAll(".shift-leave").forEach((btn) => {
      btn.onclick = async () => {
        const sh = shifts.find((x) => x.id === btn.dataset.sid);
        if (!await appConfirm(`Leave the ${sh?.task || ""} shift? Make sure someone can replace you if it's soon.`)) return;
        try {
          const sid = `${btn.dataset.sid}_${currentUser.uid}`;
          await deleteDoc(doc(db, "shiftSignups", sid));
          for (const arr of [signups, mineAll]) {
            const i = arr.findIndex((s) => s.id === sid);
            if (i >= 0) arr.splice(i, 1);
          }
          toast("You're off the shift.", "success");
          render(true);
        } catch (err) { toast("Failed: " + err.message, "error"); }
      };
    });
    wirePushOffer(render);

    if (preserveScroll) window.scrollTo(0, y);
  };
  render();

  // Board: the "Shiftlist count" from the old spreadsheet, computed live.
  if (isAdmin) {
    (async () => {
      try {
        // Academic year only - the leaderboard resets each July with the
        // new board, and the query stays fast forever.
        const all = await getDocs(query(collection(db, "shiftSignups"),
          where("eventStart", ">=", academicYearStart())))
          .then((s) => s.docs.map((d) => d.data()))
          .then((list) => list.filter((s) => toDate(s.eventStart) < now));
        const sem = semesterStart();
        const counts = {};
        all.forEach((s) => {
          const k = s.uid || s.name;
          (counts[k] ??= { name: s.name || "-", total: 0, sem: 0, office: 0 });
          counts[k].total++;
          if (toDate(s.eventStart) >= sem) counts[k].sem++;
          if (s.officeHours) counts[k].office++;
        });
        const rows = Object.values(counts).sort((a, b) => b.sem - a.sem || b.total - a.total);
        if (!rows.length) return;
        const lbRow = (r) => `<tr><td><strong>${esc(r.name)}</strong></td><td>${r.sem}</td><td>${r.total}</td><td>${r.office}</td></tr>`;
        leaderboardHtml = `
          <h3 class="section-title sm">Shiftlist count <small class="form-hint">(board view)</small></h3>
          <div class="table-wrap"><table>
            <thead><tr><th>Who</th><th>This semester</th><th>All time</th><th>Office shifts</th></tr></thead>
            <tbody>${rows.slice(0, 12).map(lbRow).join("")}</tbody>
          </table></div>
          ${rows.length > 12 ? `
          <details style="margin-top:6px"><summary class="form-hint" style="cursor:pointer">Show the other ${rows.length - 12}</summary>
            <div class="table-wrap" style="margin-top:6px"><table><tbody>${rows.slice(12).map(lbRow).join("")}</tbody></table></div>
          </details>` : ""}`;
        const box = document.getElementById("shift-leaderboard");
        if (box) box.innerHTML = leaderboardHtml;
      } catch { /* leaderboard is best-effort */ }
    })();
  }
}

async function viewAdminShifts(eventId) {
  if (!isAdmin) { $app.innerHTML = `<div class="empty-state"><div class="big">${mi("block")}</div><p>Shiftlist editing is for board members.</p></div>`; return; }
  setLoading();
  let ev, shifts, signups, team, templates;
  try {
    [ev, shifts, signups, team, templates] = await Promise.all([
      fetchEvent(eventId),
      getDocs(query(collection(db, "shifts"), where("eventId", "==", eventId)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      getDocs(query(collection(db, "shiftSignups"), where("eventId", "==", eventId)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      fetchTeam(),
      // Shiftlist TEMPLATES (v0.123) - board-managed, replaces the old
      // "copy shifts from another event" (deploy the rules for this one).
      getDocs(query(collection(db, "shiftTemplates"), orderBy("name")))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []),
    ]);
  } catch (e) { $app.innerHTML = errorState(e.message); return; }
  if (!ev) { $app.innerHTML = `<div class="empty-state"><p>Event not found.</p></div>`; return; }

  shifts.sort((a, b) => (a.order || 0) - (b.order || 0) || (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0));
  shifts.forEach((s, i) => { s.order = i; }); // normalize for reordering
  let editingId = null;
  let assignWho = ""; // selected team member for click-to-assign

  const setHasShifts = async (val) => {
    if (!!ev.hasShifts !== val) {
      try { await updateDoc(doc(db, "events", eventId), { hasShifts: val }); ev.hasShifts = val; } catch { /* non-fatal */ }
    }
  };

  const render = (preserveScroll = false) => {
    const y = window.scrollY;
    const editing = editingId ? shifts.find((s) => s.id === editingId) : null;
    $app.innerHTML = `
      <h2 class="section-title">Shiftlist - ${esc(ev.title)}</h2>
      <div class="form-actions" style="margin:0 0 16px">
        <a href="/admin/event-${eventId}" class="btn btn-ghost btn-sm btn-ink">← Registrations</a>
        <a href="/shifts" class="btn btn-ghost btn-sm btn-ink">${mi("visibility", "sm")} Team view</a>
        <span class="form-hint">${ev.published ? "Published event." : "Draft - the team can already see this shiftlist and sign up. Students can't."}</span>
      </div>

      <div class="form-card shift-form-card ${editing ? "editing" : ""}" style="margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">
          <strong>${editing ? `Editing: ${esc(editing.task)}` : "Add a shift"}</strong>
          ${editing ? `<button class="btn btn-ghost btn-sm btn-danger" id="sh-cancel">Cancel editing</button>` : ""}
        </div>
        <div class="shift-form">
          <div class="form-field"><label for="sh-task">Task *</label><input id="sh-task" list="shift-tasks" maxlength="60" placeholder="e.g. BAR" value="${esc(editing?.task || "")}" /></div>
          <div class="form-field"><label for="sh-time">Time</label><input id="sh-time" maxlength="40" placeholder="e.g. 23H-00H" value="${esc(editing?.time || "")}" /></div>
          <div class="form-field"><label for="sh-board">Board</label><input id="sh-board" type="number" min="0" max="10" value="${editing ? (editing.needBoard || 0) : 1}" /></div>
          <div class="form-field"><label for="sh-vol">Volunteers</label><input id="sh-vol" type="number" min="0" max="10" value="${editing ? (editing.needVol || 0) : 2}" /></div>
          <div class="form-field shift-form-note"><label for="sh-note">Note</label><input id="sh-note" maxlength="200" placeholder="e.g. strict ESNcard control · be there 15 min early" value="${esc(editing?.note || "")}" /></div>
          <div class="form-field shift-form-btn"><button class="btn ${editing ? "btn-orange" : "btn-green"}" id="sh-save">${editing ? "Save changes" : "+ Add shift"}</button></div>
        </div>
        <datalist id="shift-tasks">${SHIFT_TASKS.map((t) => `<option value="${esc(t)}"></option>`).join("")}</datalist>
        ${!editing ? `
          <div class="form-actions" style="margin-top:10px;flex-wrap:wrap;align-items:center">
            <select id="sh-tpl" class="inline-input" style="width:auto">
              <option value="">${templates.length ? "Apply a template…" : "No templates yet"}</option>
              ${templates.map((t) => `<option value="${t.id}">${esc(t.name)} (${(t.shifts || []).length})</option>`).join("")}
            </select>
            <button class="btn btn-ghost btn-sm btn-ink" id="sh-tpl-apply">Apply</button>
            <button class="btn btn-ghost btn-danger btn-sm" id="sh-tpl-del" title="Delete the selected template">✕</button>
            ${shifts.length ? `<button class="btn btn-ghost btn-sm btn-ink" id="sh-tpl-save">${mi("bookmark_add", "sm")} Save this list as a template…</button>` : ""}
            <span class="form-hint">Board-managed templates (Party, Therminal event, Cantus, …) - applying adds tasks, times &amp; spots, never the names.</span>
          </div>` : ""}
      </div>

      ${shifts.length ? `
        <div class="form-card" style="margin-bottom:18px">
          <div class="form-actions" style="margin:0 0 10px">
            <label for="assign-who" style="font-weight:700;font-size:.85rem">Assign:</label>
            <select id="assign-who" class="inline-input" style="width:auto">
              <option value="">- pick a team member -</option>
              ${team.map((t) => `<option value="${t.id}" ${assignWho === t.id ? "selected" : ""}>${esc(t.name || t.email || t.id)}${t.role && t.role !== "board" ? ` (${esc(t.role)})` : ""}</option>`).join("")}
            </select>
            <span class="form-hint">…then click a <strong>+ assign</strong> spot in the grid. ✕ on a name removes them.</span>
          </div>
          ${shiftGrid(shifts, signups, "editor")}
        </div>`
      : `<div class="empty-state"><p>No shifts yet - add the first one above${templates.length ? " or apply a template" : ""}.</p></div>`}
    `;

    // ---- form ----
    document.getElementById("sh-save").onclick = async (e2) => {
      const task = document.getElementById("sh-task").value.trim();
      if (!task) { toast("Give the shift a task name (e.g. BAR).", "warn"); return; }
      const data = {
        eventId,
        eventTitle: ev.title || "",
        eventStart: ev.start,
        task,
        time: document.getElementById("sh-time").value.trim(),
        needBoard: Math.max(0, parseInt(document.getElementById("sh-board").value, 10) || 0),
        needVol: Math.max(0, parseInt(document.getElementById("sh-vol").value, 10) || 0),
        note: document.getElementById("sh-note").value.trim(),
        officeHours: ev.officeHours === true, // feeds the office-shift counters
      };
      e2.target.disabled = true;
      try {
        if (editingId) {
          await updateDoc(doc(db, "shifts", editingId), data);
          Object.assign(shifts.find((s) => s.id === editingId), data);
          editingId = null;
          toast("Shift updated", "success");
        } else {
          data.order = shifts.length;
          data.createdAt = serverTimestamp();
          const ref = await addDoc(collection(db, "shifts"), data);
          shifts.push({ id: ref.id, ...data, createdAt: Timestamp.now() });
          await setHasShifts(true);
          toast("Shift added", "success");
        }
        render(true);
      } catch (err) { toast("Failed: " + err.message, "error"); e2.target.disabled = false; }
    };
    document.getElementById("sh-cancel")?.addEventListener("click", () => { editingId = null; render(true); });

    // ---- shift templates (v0.123): apply / save-as / delete ----
    document.getElementById("sh-tpl-apply")?.addEventListener("click", async () => {
      const tpl = templates.find((t) => t.id === document.getElementById("sh-tpl").value);
      if (!tpl) { toast("Pick a template first.", "warn"); return; }
      try {
        for (const s of (tpl.shifts || [])) {
          const data = {
            eventId, eventTitle: ev.title || "", eventStart: ev.start,
            task: s.task || "", time: s.time || "", note: s.note || "",
            needBoard: s.needBoard || 0, needVol: s.needVol || 0,
            officeHours: ev.officeHours === true,
            order: shifts.length, createdAt: serverTimestamp(),
          };
          const ref = await addDoc(collection(db, "shifts"), data);
          shifts.push({ id: ref.id, ...data, createdAt: Timestamp.now() });
        }
        await setHasShifts(true);
        toast(`Template "${tpl.name}" applied - ${(tpl.shifts || []).length} shift${(tpl.shifts || []).length === 1 ? "" : "s"} added.`, "success");
        render(true);
      } catch (err) { toast("Apply failed: " + err.message, "error"); }
    });
    document.getElementById("sh-tpl-save")?.addEventListener("click", async () => {
      const name = await appPrompt("Template name (e.g. Party, Therminal event, Cantus):", { maxlength: 60 });
      if (!name || !name.trim()) return;
      const clean = name.trim();
      const rows = shifts.map((s) => ({ task: s.task || "", time: s.time || "", note: s.note || "", needBoard: s.needBoard || 0, needVol: s.needVol || 0 }));
      try {
        const existing = templates.find((t) => (t.name || "").toLowerCase() === clean.toLowerCase());
        if (existing) {
          if (!await appConfirm(`A template called "${esc(existing.name)}" already exists - overwrite it with this list?`)) return;
          await updateDoc(doc(db, "shiftTemplates", existing.id), { name: clean, shifts: rows, updatedAt: serverTimestamp(), updatedBy: currentUser.uid });
          Object.assign(existing, { name: clean, shifts: rows });
        } else {
          const ref = await addDoc(collection(db, "shiftTemplates"), { name: clean, shifts: rows, createdAt: serverTimestamp(), updatedBy: currentUser.uid });
          templates.push({ id: ref.id, name: clean, shifts: rows });
          templates.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        }
        toast(`Template "${clean}" saved (${rows.length} shift${rows.length === 1 ? "" : "s"}) - reusable on every event.`, "success");
        render(true);
      } catch (err) { toast("Save failed: " + err.message, "error"); }
    });
    document.getElementById("sh-tpl-del")?.addEventListener("click", async () => {
      const tpl = templates.find((t) => t.id === document.getElementById("sh-tpl").value);
      if (!tpl) { toast("Pick a template to delete.", "warn"); return; }
      if (!await appConfirm(`Delete the template "${esc(tpl.name)}"? Events keep the shiftlists already applied.`)) return;
      try {
        await deleteDoc(doc(db, "shiftTemplates", tpl.id));
        templates = templates.filter((t) => t.id !== tpl.id);
        toast("Template deleted.", "success");
        render(true);
      } catch (err) { toast("Failed: " + err.message, "error"); }
    });

    // ---- grid: assign / remove / reorder / edit / delete ----
    document.getElementById("assign-who")?.addEventListener("change", (e2) => { assignWho = e2.target.value; });
    wireSelectFilter(document.getElementById("assign-who"));

    $app.querySelectorAll(".cell-assign").forEach((btn) => {
      btn.onclick = async () => {
        if (!assignWho) { toast("Pick a team member in the Assign box first.", "warn"); return; }
        const member = team.find((t) => t.id === assignWho);
        const sh = shifts.find((s) => s.id === btn.dataset.sid);
        if (!member || !sh) return;
        if (signups.some((s) => s.shiftId === sh.id && s.uid === assignWho)) {
          toast(`${(member.name || "They").split(" ")[0]} is already on this shift.`, "warn");
          return;
        }
        // Board slots are for board members (v0.140): assigning a volunteer
        // there is usually a mis-click - ask before doing it anyway.
        if (btn.dataset.role === "board" && !["board", "finance", "superadmin"].includes(member.role || "")) {
          if (!await appConfirm(`${(member.name || "This person").split(" ")[0]} is a ${member.role || "volunteer"}, not board - put them on a BOARD spot anyway?`)) return;
        }
        btn.disabled = true;
        try {
          const sid = `${sh.id}_${assignWho}`;
          await setDoc(doc(db, "shiftSignups", sid), {
            shiftId: sh.id, eventId, eventTitle: ev.title || "", eventStart: ev.start,
            task: sh.task || "", time: sh.time || "",
            uid: assignWho, name: member.name || member.email || "",
            role: btn.dataset.role,
            officeHours: ev.officeHours === true,
            createdAt: serverTimestamp(),
          });
          signups.push({ id: sid, shiftId: sh.id, eventId, eventTitle: ev.title, eventStart: ev.start, task: sh.task, time: sh.time, uid: assignWho, name: member.name || member.email || "", role: btn.dataset.role });
          render(true);
        } catch (err) { toast("Failed: " + err.message, "error"); btn.disabled = false; }
      };
    });
    $app.querySelectorAll(".sh-unassign").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await deleteDoc(doc(db, "shiftSignups", btn.dataset.id));
          const i = signups.findIndex((s) => s.id === btn.dataset.id);
          if (i >= 0) signups.splice(i, 1);
          render(true);
        } catch (err) { toast("Failed: " + err.message, "error"); }
      };
    });

    const moveShift = async (sid, dir) => {
      const i = shifts.findIndex((s) => s.id === sid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= shifts.length) return;
      [shifts[i], shifts[j]] = [shifts[j], shifts[i]];
      shifts.forEach((s, k) => { s.order = k; });
      render(true);
      try {
        await Promise.all([
          updateDoc(doc(db, "shifts", shifts[i].id), { order: i }),
          updateDoc(doc(db, "shifts", shifts[j].id), { order: j }),
        ]);
      } catch (err) { toast("Order not saved: " + err.message, "error"); }
    };
    $app.querySelectorAll(".sh-up").forEach((btn) => { btn.onclick = () => moveShift(btn.dataset.sid, -1); });
    $app.querySelectorAll(".sh-down").forEach((btn) => { btn.onclick = () => moveShift(btn.dataset.sid, 1); });
    $app.querySelectorAll(".sh-edit").forEach((btn) => {
      btn.onclick = () => { editingId = btn.dataset.sid; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
    });
    $app.querySelectorAll(".sh-del").forEach((btn) => {
      btn.onclick = async () => {
        const sh = shifts.find((s) => s.id === btn.dataset.sid);
        if (!await appConfirm(`Delete the ${sh?.task || ""} shift${signups.some((s) => s.shiftId === btn.dataset.sid) ? " (people are signed up!)" : ""}?`)) return;
        try {
          for (const s of signups.filter((x) => x.shiftId === btn.dataset.sid)) {
            await deleteDoc(doc(db, "shiftSignups", s.id));
          }
          await deleteDoc(doc(db, "shifts", btn.dataset.sid));
          const i = shifts.findIndex((s) => s.id === btn.dataset.sid);
          if (i >= 0) shifts.splice(i, 1);
          for (let j = signups.length - 1; j >= 0; j--) if (signups[j].shiftId === btn.dataset.sid) signups.splice(j, 1);
          shifts.forEach((s, k) => { s.order = k; });
          if (!shifts.length) await setHasShifts(false);
          toast("Shift deleted", "success");
          render(true);
        } catch (err) { toast("Failed: " + err.message, "error"); }
      };
    });

    if (preserveScroll) window.scrollTo(0, y);
  };
  render();
}
// ------------------------------------------------------------
// Reimbursements - replaces the Tally form. Any team member
// (board, volunteers, advisory, alumni coordinator) can request a
// reimbursement, linked to an event or not, with receipt photos.
// Treasurer & President follow up in Admin → Finance.
// Students can never read or write any of this (rules).
// ------------------------------------------------------------
const REIMB_STATUS = {
  submitted: ["badge-requested", "submitted"],
  approved: ["badge-free", "approved"],
  paid: ["badge-paid", "paid"],
  rejected: ["badge-soldout", "rejected"],
};
function reimbBadge(st) {
  const [cls, label] = REIMB_STATUS[st] || ["badge-pending", st];
  return `<span class="badge ${cls}">${label}</span>`;
}

async function viewReimburse() {
  if (!currentUser || !myRole) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("receipt_long")}</div><p>Reimbursements are for ESN team members.${currentUser ? "" : " Please sign in."}</p>${currentUser ? "" : googleBtn()}</div>`;
    document.getElementById("es-login")?.addEventListener("click", signIn);
    return;
  }
  setLoading();
  let mine, events;
  try {
    const from = new Date(Date.now() - 120 * 24 * 3600 * 1000);
    [mine, events] = await Promise.all([
      getDocs(query(collection(db, "reimbursements"), where("uid", "==", currentUser.uid)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      fetchPublishedEvents(from).catch(() => []),
    ]);
  } catch (e) { $app.innerHTML = errorState(e.message); return; }
  mine.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
  const p = myProfile || {};
  let receipts = []; // compressed data URLs, max 4

  const render = () => {
    $app.innerHTML = `
      <h2 class="section-title">Reimbursements</h2>
      <p class="form-hint" style="margin:-6px 0 16px">Paid something for ESN Gent? Request it back here - the treasurer &amp; president follow up. You'll see the status below.</p>

      <form class="form-card" id="reimb-form" style="max-width:760px;margin-bottom:22px">
        <div class="form-section first">
          <div class="form-section-head">
            <span class="form-step">1</span>
            <div><strong>Personal information</strong><p class="form-hint">Where the money should go.</p></div>
          </div>
          <div class="form-grid">
            <div class="form-field"><label for="rb-name">Full name *</label><input id="rb-name" required maxlength="80" value="${esc(p.displayName || currentUser.displayName || "")}" /></div>
            <div class="form-field"><label for="rb-iban">IBAN *</label><input id="rb-iban" required maxlength="34" placeholder="BE68 5390 0754 7034" value="${esc(mine[0]?.iban || "")}" /></div>
            <div class="form-field"><label for="rb-email">Email *</label><input id="rb-email" type="email" required maxlength="120" value="${esc(currentUser.email || "")}" /></div>
            <div class="form-field"><label for="rb-phone">Phone *</label><input id="rb-phone" type="tel" required maxlength="30" placeholder="+32 ..." value="${esc(p.phone || "")}" /></div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-head">
            <span class="form-step">2</span>
            <div><strong>Expense details</strong><p class="form-hint">What you paid, when, and for what.</p></div>
          </div>
          <div class="form-grid">
            <div class="form-field"><label for="rb-date">Date of expense *</label><input id="rb-date" type="date" required /></div>
            <div class="form-field"><label for="rb-amount">Total amount (€) *</label><input id="rb-amount" type="number" min="0.01" step="0.01" required placeholder="12.50" /></div>
            <div class="form-field"><label for="rb-event">Linked event (optional)</label>
              <select id="rb-event"><option value="">- not linked to an event -</option>
                ${events.map((ev) => `<option value="${ev.id}">${esc(ev.title)} (${fmtDate(ev.start)})</option>`).join("")}
              </select>
            </div>
            <div class="form-field"><label for="rb-reason">Reason *</label><input id="rb-reason" required maxlength="120" placeholder="e.g. drinks for the WOW party" /></div>
            <div class="form-field full"><label for="rb-desc">Detailed description of each expense (what and why) *</label>
              <textarea id="rb-desc" rows="3" required maxlength="1000" placeholder="e.g. 3 crates of beer €45 (bar), tape €4 (setup)…"></textarea>
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-head">
            <span class="form-step">3</span>
            <div><strong>Receipts *</strong><p class="form-hint">Photos or screenshots of the proof of payment (up to 4). Got a PDF? Screenshot it.</p></div>
          </div>
          <div class="img-upload-row" style="flex-wrap:wrap" id="rb-receipt-previews"></div>
          <input id="rb-receipt-file" type="file" accept="image/*" multiple />
        </div>

        <div class="form-section">
          <div class="form-section-head">
            <span class="form-step">4</span>
            <div><strong>Submit</strong><p class="form-hint">The treasurer reviews it, then it's paid to your IBAN.</p></div>
          </div>
          <div class="form-actions"><button type="submit" class="btn btn-magenta">Submit request</button></div>
        </div>
      </form>

      <h3 class="section-title sm">My requests</h3>
      ${mine.length ? `
        <div class="table-wrap cards"><table>
          <thead><tr><th>Reason</th><th>Expense date</th><th>Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>${mine.map((r) => `
            <tr>
              <td class="card-main"><strong>${esc(r.reason || "-")}</strong>${r.eventTitle ? `<br><small class="form-hint">${esc(r.eventTitle)}</small>` : ""}${r.status === "rejected" && r.reviewNote ? `<br><small class="form-hint" style="color:var(--esn-magenta)">${esc(r.reviewNote)}</small>` : ""}</td>
              <td data-l="Date">${esc(r.expenseDate || "-")}</td>
              <td data-l="Amount">${fmtMoney(r.amount)}</td>
              <td data-l="Status">${reimbBadge(r.status)}${r.status === "paid" && r.paidAt ? `<br><small class="form-hint">${fmtDate(r.paidAt)}</small>` : ""}</td>
              <td class="card-actions">${r.status === "submitted" ? `<button class="btn btn-sm btn-ghost rb-withdraw btn-danger" data-rid="${r.id}">Withdraw</button>` : ""}</td>
            </tr>`).join("")}</tbody>
        </table></div>`
      : `<div class="empty-state"><p>No requests yet.</p></div>`}
    `;

    const renderPreviews = () => {
      document.getElementById("rb-receipt-previews").innerHTML = receipts.map((img, i) => `
        <span style="position:relative;display:inline-block">
          <img class="img-preview" src="${esc(img)}" alt="receipt ${i + 1}" style="max-width:110px" />
          <button type="button" class="chip-x rb-rm" data-i="${i}" title="Remove receipt" aria-label="Remove receipt" style="position:absolute;top:2px;right:2px;background:var(--card);border-radius:50%;padding:2px 6px">✕</button>
        </span>`).join("");
      document.querySelectorAll(".rb-rm").forEach((b) => {
        b.onclick = () => { receipts.splice(Number(b.dataset.i), 1); renderPreviews(); };
      });
    };
    renderPreviews();

    document.getElementById("rb-receipt-file").addEventListener("change", async (e) => {
      for (const file of Array.from(e.target.files || [])) {
        if (receipts.length >= 4) { toast("Maximum 4 receipts per request - submit a second request if needed.", "error"); break; }
        try { receipts.push(await compressImage(file)); }
        catch (err) { toast(err.message, "error"); }
      }
      e.target.value = "";
      renderPreviews();
    });

    document.getElementById("reimb-form").onsubmit = async (e) => {
      e.preventDefault();
      const val = (id) => document.getElementById(id).value.trim();
      const amount = Math.round(parseFloat(document.getElementById("rb-amount").value) * 100);
      if (!(amount > 0)) { toast("Enter the total amount you paid.", "error"); return; }
      if (!receipts.length) { toast("Add at least one receipt photo.", "error"); return; }
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true; submitBtn.textContent = "Submitting…";
      try {
        const evId = val("rb-event");
        const ev = events.find((x) => x.id === evId);
        const ref = await addDoc(collection(db, "reimbursements"), {
          uid: currentUser.uid,
          name: val("rb-name"),
          iban: val("rb-iban").replace(/\s+/g, "").toUpperCase(),
          email: val("rb-email"),
          phone: val("rb-phone"),
          expenseDate: val("rb-date"),
          eventId: evId || "",
          eventTitle: ev ? ev.title : "",
          reason: val("rb-reason"),
          amount,
          description: val("rb-desc"),
          receiptCount: receipts.length,
          status: "submitted",
          createdAt: serverTimestamp(),
        });
        for (const img of receipts) {
          await addDoc(collection(db, "reimbursementReceipts"), {
            reqId: ref.id, uid: currentUser.uid, image: img, createdAt: serverTimestamp(),
          });
        }
        // Remember phone for next time. The IBAN deliberately does NOT go
        // on the profile doc (every board member can read users; only
        // finance may see IBANs) - next time it prefills from this request.
        setDoc(doc(db, "users", currentUser.uid), { phone: val("rb-phone") }, { merge: true }).catch(() => {});
        mine.unshift({ id: ref.id, reason: val("rb-reason"), eventTitle: ev ? ev.title : "", expenseDate: val("rb-date"), amount, iban: val("rb-iban").replace(/\s+/g, "").toUpperCase(), status: "submitted" });
        receipts = [];
        toast("Request submitted - the treasurer will follow up.", "success");
        render();
        window.scrollTo(0, 0);
      } catch (err) {
        toast("Could not submit: " + err.message, "error");
        submitBtn.disabled = false; submitBtn.textContent = "Submit request";
      }
    };

    $app.querySelectorAll(".rb-withdraw").forEach((btn) => {
      btn.onclick = async () => {
        if (!await appConfirm("Withdraw this request?")) return;
        try {
          await deleteDoc(doc(db, "reimbursements", btn.dataset.rid));
          const i = mine.findIndex((r) => r.id === btn.dataset.rid);
          if (i >= 0) mine.splice(i, 1);
          toast("Request withdrawn.", "success");
          render();
        } catch (err) { toast("Failed: " + err.message, "error"); }
      };
    });
  };
  render();
}

async function viewAdminReimbursements(yearSel = ayStartYear()) {
  if (!isFinance()) {
    $app.innerHTML = `<div class="empty-state"><div class="big">${mi("lock")}</div><p>Reimbursements are handled by the <strong>finance</strong> role (treasurer &amp; president) and the superadmin.</p><p class="form-hint">The superadmin assigns the finance role in Admin → Team.</p></div>`;
    return;
  }
  setLoading();
  const yr = ayRange(yearSel);
  const dedupe = (lists) => {
    const seen = new Set();
    return lists.flat().filter((d) => !seen.has(d.id) && seen.add(d.id));
  };
  let reqs;
  let ticketReqs = [];
  try {
    // Selected academic year + EVERY still-open item regardless of year
    // (so nothing submitted in June disappears from the July view).
    reqs = dedupe(await Promise.all([
      getDocs(query(collection(db, "reimbursements"),
        where("createdAt", ">=", yr.from), where("createdAt", "<", yr.to)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      getDocs(query(collection(db, "reimbursements"), where("status", "in", ["submitted", "approved"])))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    ]));
  } catch (e) { $app.innerHTML = errorState(e.message); return; }
  try {
    ticketReqs = dedupe(await Promise.all([
      getDocs(query(collection(db, "refundRequests"),
        where("createdAt", ">=", yr.from), where("createdAt", "<", yr.to)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      getDocs(query(collection(db, "refundRequests"), where("status", "==", "requested")))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    ]));
  } catch { /* collection may not exist yet */ }
  reqs.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
  ticketReqs.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
  const filter = { q: "", chip: "open" }; // open | paid | rejected | all
  let rbShown = 50;

  const render = (preserveScroll = false) => {
    const y = window.scrollY;
    const open = reqs.filter((r) => r.status === "submitted" || r.status === "approved");
    const openSum = open.reduce((s, r) => s + (r.amount || 0), 0);
    const paidSem = reqs.filter((r) => r.status === "paid" && toDate(r.paidAt || r.createdAt) >= semesterStart())
      .reduce((s, r) => s + (r.amount || 0), 0);

    const matches = (r) => {
      if (filter.chip === "open" && !(r.status === "submitted" || r.status === "approved")) return false;
      if (filter.chip === "paid" && r.status !== "paid") return false;
      if (filter.chip === "rejected" && r.status !== "rejected") return false;
      const q = filter.q.trim().toLowerCase();
      if (!q) return true;
      return `${r.name || ""} ${r.reason || ""} ${r.eventTitle || ""} ${r.email || ""}`.toLowerCase().includes(q);
    };
    const listAll = reqs.filter(matches);
    const list = listAll.slice(0, rbShown);

    const openTickets = ticketReqs.filter((t) => t.status === "requested");
    const openTicketSum = openTickets.reduce((s, t) => s + (t.refundAmount || 0), 0);
    const settledTickets = ticketReqs.filter((t) => t.status !== "requested");

    $app.innerHTML = `
      <h2 class="section-title">Finance - refunds &amp; reimbursements</h2>
      ${adminTabs("finance")}
      <div class="stat-row">
        <div class="stat-card" style="--accent:#F47B20"><div class="num">${open.length}</div><div class="lbl">Open reimbursements</div></div>
        <div class="stat-card" style="--accent:#EC008C"><div class="num">${fmtMoney(openSum)}</div><div class="lbl">Open amount</div></div>
        <div class="stat-card" style="--accent:#00AEEF"><div class="num">${openTickets.length}</div><div class="lbl">Ticket refunds waiting</div></div>
        <div class="stat-card" style="--accent:#7AC143"><div class="num">${fmtMoney(paidSem)}</div><div class="lbl">Paid out this semester</div></div>
      </div>

      <h3 class="section-title sm">Ticket refund requests</h3>
      <p class="form-hint" style="margin:-4px 0 10px">Students request these from My tickets (within the event's deadline, refundable events only - any refund fee is already deducted). <strong>Approve</strong> refunds via Stripe instantly and puts the spot back on sale; <strong>Reject</strong> keeps the ticket valid. When an event is cancelled outright, its refunds happen automatically and never appear here.</p>
      ${openTickets.length ? `
        <div class="table-wrap cards"><table>
          <thead><tr><th>Who</th><th>Event</th><th>Paid</th><th>Fee</th><th>Refund</th><th>Requested</th><th></th></tr></thead>
          <tbody>${openTickets.map((t) => `
            <tr>
              <td class="card-main"><strong>${esc(t.name || "-")}</strong><br><small class="form-hint">${esc(t.email || "")}</small></td>
              <td data-l="Event"><a href="/admin/event-${t.eventId}">${esc(t.eventTitle || "-")}</a></td>
              <td data-l="Paid">${fmtMoney(t.amountTotal, t.currency)}</td>
              <td data-l="Fee">${t.fee ? fmtMoney(t.fee, t.currency) : "-"}</td>
              <td data-l="Refund"><strong>${fmtMoney(t.refundAmount, t.currency)}</strong></td>
              <td data-l="Requested">${t.createdAt ? fmtDate(t.createdAt) : "-"}</td>
              <td class="card-actions">
                <button class="btn btn-sm btn-green tr-approve" data-tid="${t.id}">Approve &amp; refund</button>
                <button class="btn btn-sm btn-ghost btn-ink tr-partial" data-tid="${t.id}">Partial…</button>
                <button class="btn btn-sm btn-ghost tr-reject btn-danger" data-tid="${t.id}">Reject</button>
              </td>
            </tr>`).join("")}</tbody>
        </table></div>`
      : `<p class="form-hint" style="margin:0 0 8px">No open ticket refund requests.</p>`}
      ${settledTickets.length ? `
        <details style="margin:8px 0 0"><summary class="form-hint" style="cursor:pointer">Settled ticket refunds (${settledTickets.length})</summary>
          <div class="table-wrap cards" style="margin-top:8px"><table>
            <thead><tr><th>Who</th><th>Event</th><th>Refund</th><th>Status</th><th>By</th></tr></thead>
            <tbody>${settledTickets.slice(0, 50).map((t) => `
              <tr><td class="card-main">${esc(t.name || "-")}</td><td data-l="Event">${esc(t.eventTitle || "-")}</td><td data-l="Refund">${fmtMoney(t.refundAmount, t.currency)}</td>
              <td data-l="Status"><span class="badge badge-${t.status === "refunded" ? "paid" : "soldout"}">${esc(t.status)}</span>${t.reviewNote ? `<br><small class="form-hint">${esc(t.reviewNote)}</small>` : ""}</td>
              <td data-l="By">${esc(t.reviewedByName || "-")}</td></tr>`).join("")}</tbody>
          </table></div>
        </details>` : ""}

      <div id="cash-overview-box"></div>

      <h3 class="section-title sm" style="margin-top:22px">Reimbursements</h3>
      <p class="form-hint" style="margin:-4px 0 14px">Follow-up for the <strong>treasurer &amp; president</strong>: approve → pay to the IBAN → mark paid. Rejections ask for a short reason the requester sees.</p>
      <div class="filter-bar">
        <input id="rb-q" type="search" placeholder="Search name, reason or event…" value="${esc(filter.q)}" />
        ${yearPickerHtml("rb-year", yearSel)}
        <button class="btn btn-sm btn-ghost btn-ink" id="btn-cash-overview" style="margin-left:auto">${mi("point_of_sale", "sm")} Cash registers</button>
        <div class="filter-chips">
          ${[["open", `Open (${open.length})`], ["paid", "Paid"], ["rejected", "Rejected"], ["all", `All (${reqs.length})`]]
            .map(([k, label]) => `<button class="chip ${filter.chip === k ? "active" : ""}" data-chip="${k}">${label}</button>`).join("")}
        </div>
      </div>
      <div class="form-actions" style="margin:0 0 12px">
        <button class="btn btn-ghost btn-sm btn-ink" id="rb-csv">${mi("download", "sm")} Export CSV</button>
      </div>
      ${list.length ? `
        <div class="table-wrap cards"><table>
          <thead><tr><th>Who</th><th>Expense</th><th>Amount</th><th>IBAN</th><th>Receipts</th><th>Status</th><th></th></tr></thead>
          <tbody>${list.map((r) => `
            <tr>
              <td class="card-main"><strong>${esc(r.name || "-")}</strong><br><small class="form-hint">${esc(r.email || "")}${r.phone ? ` · ${esc(r.phone)}` : ""}</small></td>
              <td data-l="Expense">${esc(r.reason || "-")}${r.eventTitle ? `<br><small class="form-hint">${esc(r.eventTitle)}</small>` : ""}<br><small class="form-hint">${esc(r.expenseDate || "")} - ${esc(r.description || "")}</small></td>
              <td data-l="Amount"><strong>${fmtMoney(r.amount)}</strong></td>
              <td data-l="IBAN" style="font-size:.78rem">${esc(r.iban || "-")}</td>
              <td data-l="Receipts"><span class="rb-proof-slot" data-rid="${r.id}"><button class="btn btn-sm btn-ghost btn-ink rb-proof" data-rid="${r.id}">View (${r.receiptCount || 0})</button></span></td>
              <td data-l="Status">${reimbBadge(r.status)}${r.reviewNote ? `<br><small class="form-hint">${esc(r.reviewNote)}</small>` : ""}</td>
              <td class="card-actions">
                ${r.status === "submitted" ? `<button class="btn btn-sm btn-cyan rb-approve" data-rid="${r.id}">Approve</button>` : ""}
                ${r.status === "approved" ? `<button class="btn btn-sm btn-green rb-paid" data-rid="${r.id}">Mark paid</button>` : ""}
                ${(r.status === "submitted" || r.status === "approved") ? `<button class="btn btn-sm btn-ghost rb-reject btn-danger" data-rid="${r.id}">Reject</button>` : ""}
                ${(r.status === "paid" || r.status === "rejected") ? `<button class="btn btn-sm btn-ghost rb-del btn-danger" data-rid="${r.id}" title="Remove request" aria-label="Remove request">✕</button>` : ""}
              </td>
            </tr>`).join("")}</tbody>
        </table></div>
        ${listAll.length > list.length ? `<div class="form-actions"><button class="btn btn-ghost btn-ink" id="rb-more">Show more (${listAll.length - list.length} left)</button></div>` : ""}`
      : `<div class="empty-state"><div class="big">${mi("receipt_long")}</div><p>${reqs.length ? "No requests match." : "No reimbursement requests yet. The team submits them via their account menu → Reimbursements."}</p></div>`}
    `;

    document.getElementById("rb-more")?.addEventListener("click", () => { rbShown += 100; render(true); });
    document.getElementById("rb-q").addEventListener("input", (e) => { filter.q = e.target.value; rbShown = 50; render(true); });
    document.getElementById("rb-year")?.addEventListener("change", (e) => viewAdminReimbursements(parseInt(e.target.value, 10)));
    document.getElementById("btn-cash-overview")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        const cc = await getDocs(query(collection(db, "cashCounts"),
          where("eventStart", ">=", yr.from), where("eventStart", "<", yr.to)))
          .then((s) => s.docs.map((d) => d.data()));
        const byEvent = {};
        cc.forEach((c) => {
          (byEvent[c.eventId] ??= { title: c.eventTitle, start: c.eventStart, id: c.eventId, regs: {} });
          (byEvent[c.eventId].regs[c.register] ??= {})[c.phase] = c;
        });
        const events2 = Object.values(byEvent).sort((a, b) => (toDate(b.start)?.getTime() || 0) - (toDate(a.start)?.getTime() || 0));
        const rows = events2.flatMap((ev2) => Object.entries(ev2.regs).map(([rname, ph], i) => {
          const b = ph.before, a = ph.after;
          const diff = b && a ? a.total - b.total : null;
          return `<tr>
            ${i === 0 ? `<td class="card-main" rowspan="${Object.keys(ev2.regs).length}"><a href="/admin/event-${ev2.id}"><strong>${esc(ev2.title || "-")}</strong></a><br><small class="form-hint">${ev2.start ? fmtDate(ev2.start) : ""}</small></td>` : ""}
            <td data-l="Register">${esc(rname)}${(b?.note || a?.note) ? ` <small class="form-hint">${esc(b?.note || "")} ${esc(a?.note || "")}</small>` : ""}</td>
            <td data-l="Before">${b ? `${fmtMoney(b.total)} <small class="form-hint">${esc((b.countedByName || "").split(" ")[0])}</small>` : "-"}</td>
            <td data-l="After">${a ? `${fmtMoney(a.total)} <small class="form-hint">${esc((a.countedByName || "").split(" ")[0])}</small>` : "-"}</td>
            <td data-l="Difference">${diff === null ? "-" : `<strong style="color:${diff >= 0 ? "var(--esn-green)" : "var(--esn-magenta)"}">${diff >= 0 ? "+" : "−"}${fmtMoney(Math.abs(diff))}</strong>`}</td>
          </tr>`;
        })).join("");
        const box = document.getElementById("cash-overview-box");
        box.innerHTML = events2.length ? `
          <div class="form-card" style="margin:0 0 18px">
            <strong>${mi("point_of_sale", "sm")} Cash registers - ${ayLabel(yearSel)}</strong> <span class="form-hint">(most recent first · counting happens on each event's admin page)</span>
            <div class="table-wrap cards" style="margin-top:10px"><table>
              <thead><tr><th>Event</th><th>Register</th><th>Before</th><th>After</th><th>Difference</th></tr></thead>
              <tbody>${rows}</tbody>
            </table></div>
          </div>` : `<p class="form-hint" style="margin:0 0 14px">No cash counts in ${ayLabel(yearSel)} yet - board members count registers on each event's admin page.</p>`;
        box.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) { toast("Could not load cash counts: " + err.message, "error"); }
      e.target.disabled = false;
    });
    $app.querySelectorAll(".filter-chips .chip").forEach((btn) => {
      btn.onclick = () => { filter.chip = btn.dataset.chip; rbShown = 50; render(true); };
    });

    $app.querySelectorAll(".rb-proof").forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = "Loading…";
        try {
          const snap = await getDocs(query(collection(db, "reimbursementReceipts"), where("reqId", "==", btn.dataset.rid)));
          const imgs = snap.docs.map((d) => d.data().image).filter(Boolean);
          const slot = $app.querySelector(`.rb-proof-slot[data-rid="${btn.dataset.rid}"]`);
          if (slot) {
            slot.innerHTML = imgs.length
              ? imgs.map((img) => `<details class="proof-details" open><summary>receipt</summary><img src="${esc(img)}" alt="receipt" /></details>`).join("")
              : `<span class="form-hint">No receipts found.</span>`;
          }
        } catch (err) { toast("Could not load receipts: " + err.message, "error"); btn.disabled = false; btn.textContent = "View"; }
      };
    });

    // ---- ticket refund requests ----
    $app.querySelectorAll(".tr-approve").forEach((btn) => {
      btn.onclick = async () => {
        const t = ticketReqs.find((x) => x.id === btn.dataset.tid);
        if (!t) return;
        if (!await appConfirm(`Refund ${fmtMoney(t.refundAmount, t.currency)} to ${t.name || t.email}?\n\nThe money goes back via Stripe immediately and the spot goes back on sale.`)) return;
        btn.disabled = true; btn.textContent = "Refunding…";
        try {
          const fn = httpsCallable(functions, "decideTicketRefund");
          await fn({ requestId: t.id, approve: true });
          t.status = "refunded"; t.reviewedByName = currentUser.displayName || "";
          toast(`Refunded ${fmtMoney(t.refundAmount, t.currency)} via Stripe.`, "success");
          render(true);
        } catch (err) { toast("Refund failed: " + err.message, "error"); btn.disabled = false; btn.innerHTML = "Approve &amp; refund"; }
      };
    });
    $app.querySelectorAll(".tr-partial").forEach((btn) => {
      btn.onclick = async () => {
        const t = ticketReqs.find((x) => x.id === btn.dataset.tid);
        if (!t) return;
        const paid = t.amountTotal ?? (t.refundAmount + (t.fee || 0));
        const raw = await appPrompt(`Partial refund for ${t.name || t.email}.\n\nPaid: ${fmtMoney(paid, t.currency)} · requested refund: ${fmtMoney(t.refundAmount, t.currency)}.\n\nAmount to refund in €:`, { type: "number", placeholder: "5.00", okLabel: "Refund this amount" });
        if (raw === null) return;
        const cents = Math.round(parseFloat(raw.replace(",", ".")) * 100);
        if (!Number.isFinite(cents) || cents <= 0 || cents > paid) { toast("Enter an amount between €0.01 and what was paid.", "error"); return; }
        btn.disabled = true; btn.textContent = "Refunding…";
        try {
          const fn = httpsCallable(functions, "decideTicketRefund");
          await fn({ requestId: t.id, approve: true, amount: cents });
          t.status = "refunded"; t.refundAmount = cents; t.reviewedByName = currentUser.displayName || "";
          toast(`Refunded ${fmtMoney(cents, t.currency)} via Stripe (partial).`, "success");
          render(true);
        } catch (err) { toast("Refund failed: " + err.message, "error"); btn.disabled = false; btn.textContent = "Partial…"; }
      };
    });
    $app.querySelectorAll(".tr-reject").forEach((btn) => {
      btn.onclick = async () => {
        const t = ticketReqs.find((x) => x.id === btn.dataset.tid);
        if (!t) return;
        const note = await appPrompt(`Reject ${t.name || t.email}'s refund request for ${fmtMoney(t.refundAmount, t.currency)}?\n\nShort reason (they keep their valid ticket):`, { multiline: true, placeholder: "Reason the student sees…", okLabel: "Reject request" });
        if (note === null) return;
        btn.disabled = true;
        try {
          const fn = httpsCallable(functions, "decideTicketRefund");
          await fn({ requestId: t.id, approve: false, note: note.trim() });
          t.status = "rejected"; t.reviewNote = note.trim(); t.reviewedByName = currentUser.displayName || "";
          toast("Rejected - the ticket stays valid.", "success");
          render(true);
        } catch (err) { toast("Failed: " + err.message, "error"); btn.disabled = false; }
      };
    });

    const act = (sel, fn) => $app.querySelectorAll(sel).forEach((btn) => {
      btn.onclick = async () => {
        const r = reqs.find((x) => x.id === btn.dataset.rid);
        if (!r) return;
        btn.disabled = true;
        try { await fn(r); render(true); }
        catch (err) { toast("Failed: " + err.message, "error"); btn.disabled = false; }
      };
    });
    act(".rb-approve", async (r) => {
      await updateDoc(doc(db, "reimbursements", r.id), {
        status: "approved", reviewedBy: currentUser.uid,
        reviewedByName: currentUser.displayName || "", reviewedAt: serverTimestamp(),
      });
      r.status = "approved";
      toast("Approved - pay it out, then mark paid.", "success");
    });
    act(".rb-paid", async (r) => {
      await updateDoc(doc(db, "reimbursements", r.id), { status: "paid", paidAt: serverTimestamp() });
      r.status = "paid"; r.paidAt = Timestamp.now();
      toast(`Marked paid: ${fmtMoney(r.amount)} to ${r.name}.`, "success");
    });
    act(".rb-reject", async (r) => {
      const note = await appPrompt(`Reject ${r.name}'s request for ${fmtMoney(r.amount)}?\n\nShort reason (they will see this):`, { multiline: true, placeholder: "Reason they see…", okLabel: "Reject request" });
      if (note === null) throw new Error("cancelled");
      await updateDoc(doc(db, "reimbursements", r.id), {
        status: "rejected", reviewNote: note.trim(),
        reviewedBy: currentUser.uid, reviewedByName: currentUser.displayName || "", reviewedAt: serverTimestamp(),
      });
      r.status = "rejected"; r.reviewNote = note.trim();
      toast("Rejected - the requester sees the reason.", "success");
    });
    act(".rb-del", async (r) => {
      if (!await appConfirm("Remove this settled request from the list? (Keep your bookkeeping export first.)")) throw new Error("cancelled");
      const snap = await getDocs(query(collection(db, "reimbursementReceipts"), where("reqId", "==", r.id)));
      for (const d of snap.docs) await deleteDoc(d.ref);
      await deleteDoc(doc(db, "reimbursements", r.id));
      const i = reqs.findIndex((x) => x.id === r.id);
      if (i >= 0) reqs.splice(i, 1);
      toast("Request removed.", "success");
    });

    document.getElementById("rb-csv").onclick = () => {
      const csvEsc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [
        ["Requested", "Name", "Email", "Phone", "IBAN", "Expense date", "Event", "Reason", "Description", "Amount EUR", "Status", "Reviewed by", "Paid at", "Note"].map(csvEsc).join(","),
        ...reqs.map((r) => [
          toDate(r.createdAt)?.toISOString() || "", r.name, r.email, r.phone, r.iban,
          r.expenseDate, r.eventTitle, r.reason, r.description,
          ((r.amount || 0) / 100).toFixed(2), r.status, r.reviewedByName || "",
          toDate(r.paidAt)?.toISOString() || "", r.reviewNote || "",
        ].map(csvEsc).join(",")),
      ];
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "esn-gent-reimbursements.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    };

    if (preserveScroll) window.scrollTo(0, y);
  };
  render();
}

// ------------------------------------------------------------
// Router
// ------------------------------------------------------------
const PAGE_TITLES = {
  home: "Home", calendar: "Calendar", "my-tickets": "My tickets",
  profile: "Profile", admin: "Admin", scan: "Scan tickets",
  ticket: "Your ticket", checkin: "Check-in", event: "Event", success: "Payment",
  privacy: "Privacy", claim: "Claim ticket", account: "Profile", faq: "Help & FAQ",
  shop: "Shop", product: "Shop", changelog: "What's new",
  order: "Your order", pickup: "Pickup", kiosk: "Kiosk", rate: "Rate event",
  "esncard-apply": "ESNcard application",
  board: "Board", tasks: "My tasks", shifts: "Shiftlists",
  reimburse: "Reimbursements", office: "Office hours", links: "ESN Gent links",
  codex: "Cantus Codex", news: "News", passport: "ESN Passport",
  guide: "Ghent guide", deals: "ESNcard deals",
  notifications: "Notifications",
};

let lastSection = "";
let lastPath = "";
function route() {
  stopScanner(); // release the camera whenever we navigate away
  if (ticketUnsub) { ticketUnsub(); ticketUnsub = null; } // stop the live ticket listener

  // Legacy hash links (old e-mails, calendar entries, bookmarks, QR
  // screenshots): #/x silently becomes /x - they keep working forever.
  if (location.hash.startsWith("#/")) {
    history.replaceState({}, "", location.hash.slice(1) + location.search);
  }
  const path = location.pathname || "/";
  const parts = path.split("/").filter(Boolean);

  // GA4 page view per SPA navigation (only when analytics is configured).
  try { if (analytics) logEvent(analytics, "page_view", { page_path: path }); } catch { /* never break navigation */ }

  const titleEl = document.getElementById("mobile-title");
  if (titleEl) titleEl.textContent = PAGE_TITLES[parts[0] || "home"] || "ESN Gent";

  // Native-style page transition (mobile) - but not when moving between
  // sub-pages of the same section (e.g. admin tabs), where the slide-in
  // animation made every tab switch feel like a page reload.
  const section = parts[0] || "home";
  if (section !== lastSection) {
    $app.classList.remove("page-anim");
    void $app.offsetWidth; // restart the animation
    $app.classList.add("page-anim");
  }
  lastSection = section;

  // Start each NEW page at the top (browsers keep the old scroll position
  // on hash navigation, which felt broken when opening a long page).
  if (path !== lastPath) window.scrollTo(0, 0);
  lastPath = path;

  document.querySelectorAll(".main-nav a, .bottom-nav a").forEach((a) => a.classList.remove("active"));
  const mark = (k) => document.querySelectorAll(`[data-nav="${k}"]`).forEach((a) => a.classList.add("active"));

  document.getElementById("main-nav").classList.remove("open");

  if (parts.length === 0) { mark("home"); return viewHome(); }
  switch (parts[0]) {
    case "calendar": mark("calendar"); return viewCalendar();
    case "shop": mark("shop"); return viewShop();
    case "product": mark("shop"); return viewProduct(parts[1]);
    case "event": return viewEvent(parts[1]);
    case "my-tickets": mark("my-tickets"); return viewMyTickets();
    case "account": mark("profile"); return viewAccount();
    case "esncard": // used by perk gates & shop tiles - same form
    case "esncard-apply": mark("profile"); return viewEsncardApply();
    case "profile": mark("profile"); return viewProfile();
    case "ticket": mark("my-tickets"); return viewTicket(parts[1]);
    case "claim": return viewClaim(parts[1], parts[2]);
    case "checkin": mark("scan"); return viewCheckin(parts[1]);
    case "scan": mark("scan"); return viewScan();
    case "kiosk": mark("scan"); return viewKiosk();
    case "order": mark("my-tickets"); return viewOrder(parts[1]);
    case "pickup": mark("scan"); return viewPickup(parts[1]);
    case "rate": mark("my-tickets"); return viewRate(parts[1]);
    case "success": mark("my-tickets"); return viewSuccess();
    case "privacy": return viewPrivacy();
    case "links": mark("home"); return viewLinks();
    case "codex": mark("profile"); return viewCodex();
    case "news": mark("home"); return viewNews();
    case "passport": mark("profile"); return viewPassport();
    case "guide": mark("profile"); return viewGuide();
    case "deals": mark("profile"); return viewDeals();
    case "friends": mark("profile"); return viewFriends();
    case "office": mark("profile"); return viewOffice();
    case "notifications": mark("profile"); return viewNotifications();
    case "install": mark("profile"); return viewInstall();
    case "alumni": mark("profile"); return viewAlumni();
    case "contact": mark("profile"); return viewContact();
    case "faq": mark("profile"); return viewFaq();
    case "changelog": return viewChangelog();
    case "board": mark("board"); return viewBoard(parts[1]);
    case "shifts": mark("shifts"); return viewShifts();
    case "reimburse": mark("profile"); return viewReimburse();
    case "tasks": mark("profile"); return viewMyTasks();
    case "admin": mark("admin"); return viewAdmin(parts[1]);
    default: return viewHome();
  }
}

// Clean-URL navigation (v0.99.10): pushState + one delegated click handler.
function navigate(path) {
  if (typeof path === "string" && path.startsWith("#")) path = path.slice(1) || "/";
  if (location.pathname + location.search !== path) history.pushState({}, "", path);
  route();
}
window.go = navigate; // the admin tab bars use inline onclick="go('/…')"
window.addEventListener("popstate", route);

// Whole-card navigation (v0.136): any element with data-evlink navigates on
// click, unless the click landed on a real control inside it (link, button…) -
// those keep their own behaviour. One delegated listener survives re-renders.
document.addEventListener("click", (e) => {
  const card = e.target.closest("[data-evlink]");
  if (!card || e.target.closest("a, button, input, select, textarea, label, summary")) return;
  navigate(card.dataset.evlink);
});
// Connectivity (v0.126): losing signal points people at their saved
// tickets; the home page re-renders so its offline strip appears/clears.
window.addEventListener("offline", () => {
  if (currentUser) toast("You're offline. Your saved tickets still work under My tickets.", "warn");
  if (location.pathname === "/" || location.pathname === "") route();
});
window.addEventListener("online", () => {
  if (location.pathname === "/" || location.pathname === "") route();
});
document.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a) return;
  const href = a.getAttribute("href") || "";
  if (!href.startsWith("/")) return; // external, mailto:, plain "#" anchors
  if (a.target === "_blank" || a.hasAttribute("download")) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  navigate(href);
});
const footerVersion = document.getElementById("footer-version");
if (footerVersion) footerVersion.textContent = `v${APP_VERSION}`;

// Foreground pushes → in-app toasts (if this device already opted in).
if ("Notification" in window && Notification.permission === "granted" && pushEnabledHere()) {
  pushApiSupported().then((ok) => { if (ok) wireForegroundPush(); }).catch(() => {});
}

// Site banner (v0.131, legacy fallback removed at v1.0.0): configured by
// the board in Admin -> Settings -> Site banner (settings/announcement).
// No config (or switched off) = no banner. Dismissals are keyed on the
// banner's last edit, so a CHANGED message reappears for everyone.
const betaBanner = document.getElementById("beta-banner");
(async () => {
  if (!betaBanner) return;
  let cfg = null;
  try {
    const s = await getDoc(doc(db, "settings", "announcement"));
    if (s.exists()) cfg = s.data();
  } catch { /* fall back to the legacy strip */ }
  const show = (dismissKey, dismissible) => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(dismissKey) === "1"; } catch { /* ok */ }
    if (dismissed) return;
    betaBanner.classList.remove("hidden");
    const closeBtn = document.getElementById("beta-banner-close");
    if (!dismissible) { closeBtn.classList.add("hidden"); return; }
    closeBtn.classList.remove("hidden");
    closeBtn.onclick = () => {
      betaBanner.classList.add("hidden");
      try { localStorage.setItem(dismissKey, "1"); } catch { /* ok */ }
    };
  };
  if (!cfg) return;                              // nothing configured - no banner
  if (cfg.enabled !== true || !cfg.text) return; // configured OFF
  betaBanner.querySelector("span").textContent = cfg.text;
  betaBanner.classList.remove("beta-banner-warn", "beta-banner-info");
  betaBanner.classList.add(cfg.kind === "info" ? "beta-banner-info" : "beta-banner-warn");
  const stamp = cfg.updatedAt?.toMillis ? cfg.updatedAt.toMillis() : "x";
  show(`banner-dismissed-${stamp}`, cfg.dismissible !== false);
})();
const footerYear = document.getElementById("footer-year");
if (footerYear) footerYear.textContent = new Date().getFullYear();
document.getElementById("btn-signin").onclick = signIn;
document.getElementById("btn-signout").onclick = () => signOut(auth);
document.getElementById("nav-toggle").onclick = () =>
  document.getElementById("main-nav").classList.toggle("open");
