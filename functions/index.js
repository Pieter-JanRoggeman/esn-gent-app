// ============================================================
// ESN Gent Events - Cloud Functions (2nd gen)
//
// createCheckoutSession : creates a Stripe Checkout session for a paid event
// registerFree          : registers a signed-in user for a free event
// stripeWebhook         : Stripe calls this to confirm/expire payments
//
// Secrets (set with `firebase functions:secrets:set NAME`):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, GEMINI_API_KEY,
//   SMTP_PASSWORD (the app@esngent.org mailbox password)
// ============================================================

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getStorage: getAdminStorage } = require("firebase-admin/storage");
const { getAuth: getAdminAuth } = require("firebase-admin/auth");
const { GoogleAuth } = require("google-auth-library");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");

initializeApp();
const db = getFirestore();

const APP_URL = "https://app.esngent.org"; // canonical since v0.99.6 (events.esngent.org redirects)

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const dsaApiKey = defineSecret("DSA_API_KEY"); // UGent DSA activity sync (v0.110)
const geminiApiKey = defineSecret("GEMINI_API_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const smtpPassword = defineSecret("SMTP_PASSWORD");
// ESN International gave us a Cloudflare-bypass header so our server can
// read the ESNcard verification API (v0.132). Header: x-bypass-cf-api.
const esncardBypass = defineSecret("ESNCARD_BYPASS_KEY");

const MAX_QTY = 10;

// v0.85: server-side errors also land in the in-app error log
// (Settings → Error log), next to Cloud Logging.
async function logServerError(where, err) {
  console.error(where, err);
  try {
    await db.collection("errorLog").add({
      ts: FieldValue.serverTimestamp(),
      where: `fn:${where}`,
      message: String(err?.message || err).slice(0, 500),
      version: "server",
    });
  } catch { /* logging must never break the caller */ }
}



// ------------------------------------------------------------
// Membership per the statutes: a verified ESNcard OR the alumni
// flag makes you a member. Alumni get member PRICES everywhere
// except events marked noAlumniDiscount (national/int'l trips,
// Art. 7 §3) - but they keep member-only ACCESS even there.
// ------------------------------------------------------------
// Superadmin fallback switch (v0.137): settings/esncard.acceptAvailable.
// Normally only a card that is ACTIVE on esncard.org counts. When ON, a
// linked card that is still "available" (bought, not yet registered) counts
// as a member card too - for when students can't register on esncard.org
// or its API is down. Cached for a minute; the app applies the same rule.
let acceptAvailableCache = { v: false, at: 0 };
async function acceptAvailableCards() {
  if (Date.now() - acceptAvailableCache.at < 60e3) return acceptAvailableCache.v;
  try {
    const s = await db.collection("settings").doc("esncard").get();
    acceptAvailableCache = { v: s.exists && s.data().acceptAvailable === true, at: Date.now() };
  } catch { acceptAvailableCache = { v: false, at: Date.now() }; }
  return acceptAvailableCache.v;
}
// An expired card is no card: member prices stop the day it runs out.
function profileHasCard(p, acceptAvailable) {
  if (!p) return false;
  if (p.esncardVerified === true) return !p.esncardExpiresAt || p.esncardExpiresAt.toDate() > new Date();
  return acceptAvailable === true && !!p.esncardCode && p.esncardStatus === "available";
}
async function getMembership(uid) {
  const [profSnap, adminSnap, acceptAvailable] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("admins").doc(uid).get(),
    acceptAvailableCards(),
  ]);
  const p = profSnap.exists ? profSnap.data() : {};
  return {
    hasCard: profileHasCard(p, acceptAvailable),
    isAlumni: p.alumni === true,
    role: adminSnap.exists ? (adminSnap.data().role || "superadmin") : null,
  };
}
const memberAccess = (m) => m.hasCard || m.isAlumni;
const memberPrice = (m, ev) => m.hasCard || (m.isAlumni && ev.noAlumniDiscount !== true);

// ------------------------------------------------------------
// AI assistant (board-only) - Gemini via the existing Google billing.
// In the app this fronts as "Jacob", the ESN Gent mascot. Three tasks:
// draft an event description, digest event feedback, recap board-meeting
// minutes. Master switch + model live in settings/ai (Admin → Settings),
// the API key in the GEMINI_API_KEY secret. Student data never enters
// prompts (board members' names in meeting notes are the only names).
// ------------------------------------------------------------
exports.aiAssist = onCall({ secrets: [geminiApiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
  const role = adminSnap.exists ? (adminSnap.data().role || "superadmin") : null;
  if (!["board", "finance", "superadmin"].includes(role)) {
    throw new HttpsError("permission-denied", "AI tools are for board members.");
  }
  const aiSnap = await db.collection("settings").doc("ai").get();
  const ai = aiSnap.exists ? aiSnap.data() : {};
  if (ai.enabled !== true) {
    throw new HttpsError("failed-precondition", "AI features are switched off - enable them in Admin → Settings.");
  }
  // Models Google has retired for new users → their replacement, so a stale
  // saved settings/ai keeps working without anyone touching the admin panel.
  const RETIRED_MODELS = { "gemini-2.5-flash": "gemini-3.6-flash" };
  let model = typeof ai.model === "string" && ai.model.trim() ? ai.model.trim() : "gemini-3.6-flash";
  model = RETIRED_MODELS[model] || model;

  const { task } = request.data || {};
  let prompt;
  let maxTokens = 800;

  if (task === "eventDescription") {
    const d = request.data || {};
    const clean = (v, n = 200) => String(v || "").slice(0, n);
    prompt = [
      "You write event descriptions for the ESN Gent app (Erasmus Student Network Ghent, Belgium).",
      "Audience: international exchange students. Tone: warm, energetic, clear - never cringe, at most 1 emoji.",
      "Length: 60–120 words. Formatting: plain text; you may use **bold**, *italic* and lines starting with '- ' as bullets. No headings, no links you were not given.",
      "STRICT: only use the facts below. Never invent times, prices, locations or promises. If a detail is missing, leave it out.",
      "",
      `Event title: ${clean(d.title)}`,
      d.when ? `When: ${clean(d.when)}` : "",
      d.location ? `Where: ${clean(d.location)}` : "",
      d.priceInfo ? `Price: ${clean(d.priceInfo)}` : "",
      d.notes ? `Board's notes on what to mention: ${clean(d.notes, 600)}` : "",
      "",
      "Write only the description text, nothing else.",
    ].filter(Boolean).join("\n");
  } else if (task === "feedbackDigest") {
    const eventId = String(request.data?.eventId || "");
    if (!eventId) throw new HttpsError("invalid-argument", "Missing event.");
    const fb = await db.collection("feedback").where("eventId", "==", eventId).get();
    if (fb.empty) throw new HttpsError("failed-precondition", "No feedback yet for this event.");
    const items = fb.docs.map((x) => x.data());
    const avg = (items.reduce((s, f) => s + (f.rating || 0), 0) / items.length).toFixed(1);
    const comments = items.filter((f) => (f.comment || "").trim())
      .slice(0, 60)
      .map((f) => `- (${f.rating || "?"}★) ${String(f.comment).slice(0, 300)}`);
    prompt = [
      "You summarise student feedback about one ESN Gent event for the board meeting.",
      "Output EXACTLY three lines, each starting with '- ':",
      "- line 1: overall sentiment + what people loved",
      "- line 2: complaints or friction points (be concrete; 'none reported' if none)",
      "- line 3: ONE actionable suggestion for next time",
      "Base everything strictly on the feedback below; do not invent.",
      "",
      `Ratings: ${items.length} total, average ${avg}/5.`,
      comments.length ? `Comments:\n${comments.join("\n")}` : "No written comments - ratings only.",
    ].join("\n");
  } else if (task === "minutesRecap") {
    const meetingId = String(request.data?.meetingId || "");
    if (!meetingId) throw new HttpsError("invalid-argument", "Missing meeting.");
    const ms = await db.collection("boardMeetings").doc(meetingId).get();
    if (!ms.exists) throw new HttpsError("not-found", "Meeting not found.");
    const mt = ms.data();
    const rounds = mt.rounds || {};
    const roundBlocks = Object.entries(rounds)
      .filter(([, v]) => String(v || "").trim())
      .map(([fn, v]) => `## ${String(fn).slice(0, 60)}\n${String(v).slice(0, 1500)}`);
    const eventNotes = mt.eventNotes || {};
    const noteIds = Object.keys(eventNotes)
      .filter((k) => String(eventNotes[k] || "").trim())
      .slice(0, 25);
    let noteLines = [];
    if (noteIds.length) {
      const evSnaps = await db.getAll(...noteIds.map((eid) => db.collection("events").doc(eid)));
      noteLines = evSnaps.map((s, i) =>
        `- ${s.exists ? String(s.data().title || "Event").slice(0, 80) : "Event"}: ${String(eventNotes[noteIds[i]]).slice(0, 300)}`);
    }
    const varia = String(mt.minutes || "").trim();
    if (!roundBlocks.length && !noteLines.length && !varia) {
      throw new HttpsError("failed-precondition", "No meeting notes written yet - there is nothing to recap.");
    }
    const att = Array.isArray(mt.attendance) ? mt.attendance : [];
    const attLine = att.length
      ? `Attendance: ${att.filter((a) => a.status === "present").length} present, ${att.filter((a) => a.status === "online").length} online, ${att.filter((a) => !["present", "online"].includes(a.status)).length} excused/absent.`
      : "";
    const when = mt.start && typeof mt.start.toDate === "function" ? mt.start.toDate().toISOString().slice(0, 10) : "";
    maxTokens = 1000;
    prompt = [
      "You write a short recap of an ESN Gent board meeting (Erasmus Student Network Ghent) for the board itself.",
      "Structure - exactly these three bold headings, each followed by lines starting with '- ':",
      "**Decisions** - what was decided or approved ('- none recorded' if nothing).",
      "**Action points** - concrete follow-ups; name the function or person only when the notes do.",
      "**Per function** - one short line per function with something worth repeating; skip quiet ones.",
      "Max 180 words. STRICT: base everything on the notes below - never invent names, dates, numbers or decisions. Thin notes mean a short recap, not padding.",
      "",
      `Meeting: ${String(mt.title || "Board meeting").slice(0, 100)}${when ? ` - ${when}` : ""}${mt.location ? ` - ${String(mt.location).slice(0, 80)}` : ""}`,
      attLine,
      roundBlocks.length ? `\nFunction rounds:\n${roundBlocks.join("\n\n")}` : "",
      noteLines.length ? `\nNotes on recent events:\n${noteLines.join("\n")}` : "",
      varia ? `\nVaria / other notes:\n${varia.slice(0, 2000)}` : "",
    ].filter(Boolean).join("\n");
  } else {
    throw new HttpsError("invalid-argument", "Unknown AI task.");
  }

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${geminiApiKey.value()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
        }),
      }
    );
  } catch (err) {
    await logServerError("aiAssist fetch", err);
    throw new HttpsError("internal", "Could not reach the AI service - try again in a minute.");
  }
  if (!res.ok) {
    const bodyText = await res.text();
    await logServerError("aiAssist", new Error(`${res.status} ${bodyText.slice(0, 200)}`));
    // Surface Google's own explanation (e.g. "model X retired, use Y") so a
    // future model deprecation tells the board exactly what to type in Settings.
    let apiMsg = "";
    try { apiMsg = JSON.parse(bodyText)?.error?.message || ""; } catch { /* not JSON */ }
    throw new HttpsError("internal",
      `AI request failed (${res.status}).${apiMsg ? ` Google says: ${apiMsg.slice(0, 220)}` : ""} - check the model name in Settings and the GEMINI_API_KEY secret.`);
  }
  const j = await res.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p2) => p2.text || "").join("").trim();
  if (!text) throw new HttpsError("internal", "The AI returned an empty answer - try again.");
  return { text };
});

// ------------------------------------------------------------
// Confirmation e-mails (v0.99.4) - sent from the section's own
// mailbox over the esngent.org hosting SMTP. Everything except the
// password lives in settings/email (Admin → Settings → System), so the
// provider can be swapped later (e.g. to Brevo) by editing settings +
// one secret, without code changes. Every mail is written to mailQueue
// first, then sent immediately; a 15-minute sweep retries failures,
// which also drains big on-sale bursts past the host's sending caps.
// ------------------------------------------------------------
async function getMailConfig(requireEnabled = true) {
  const snap = await db.collection("settings").doc("email").get();
  const c = snap.exists ? snap.data() : {};
  if (requireEnabled && c.enabled !== true) return null;
  if (!c.host || !c.user || !c.fromAddress) return null;
  const port = Number(c.port) || 465;
  return {
    host: String(c.host),
    port,
    secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
    user: String(c.user),
    fromName: String(c.fromName || "ESN Gent"),
    fromAddress: String(c.fromAddress),
    replyTo: String(c.replyTo || ""),
  };
}

async function smtpSend(cfg, msg) {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: smtpPassword.value() },
  });
  await transport.sendMail({
    from: `"${cfg.fromName.replace(/"/g, "'")}" <${cfg.fromAddress}>`,
    to: msg.to,
    subject: msg.subject,
    text: msg.text || "",
    html: msg.html || undefined,
    ...(cfg.replyTo ? { replyTo: cfg.replyTo } : {}),
  });
}

const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtEUR = (cents, cur = "eur") =>
  new Intl.NumberFormat("en-BE", { style: "currency", currency: (cur || "eur").toUpperCase() }).format((cents || 0) / 100);
const fmtWhenBE = (ts) => {
  const d = ts && typeof ts.toDate === "function" ? ts.toDate() : null;
  if (!d) return "";
  return d.toLocaleString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels",
  });
};

// Ticket confirmation - bulletproof table HTML, brand colours inline.
function confirmationEmail(reg, ev) {
  const title = reg.eventTitle || ev.title || "Your event";
  const when = fmtWhenBE(reg.eventStart || ev.start);
  const where = ev.location || "";
  const qty = reg.quantity || 1;
  const price = reg.status === "paid"
    ? fmtEUR(reg.amountTotal, reg.currency)
    : (reg.usedEsncard ? "Free (ESNcard)" : "Free");
  const row = (label, value) => value ? `
    <tr><td style="padding:4px 12px 4px 0;color:#6b6e85;font-size:13px;white-space:nowrap">${label}</td>
    <td style="padding:4px 0;color:#1d1f31;font-size:14px;font-weight:600">${escHtml(value)}</td></tr>` : "";
  const html = `
  <div style="margin:0;padding:24px 12px;background:#f2f3f8;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="background:#2E3192;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold">ESN Gent</td></tr>
      <tr><td style="padding:24px">
        <p style="margin:0 0 6px;font-size:13px;color:#00AEEF;font-weight:bold;text-transform:uppercase;letter-spacing:.5px">Ticket confirmed</p>
        <h1 style="margin:0 0 16px;font-size:20px;color:#1d1f31">${escHtml(title)}</h1>
        <table role="presentation" cellpadding="0" cellspacing="0">
          ${row("When", when)}
          ${row("Where", where)}
          ${row("Ticket", reg.optionName || "")}
          ${row("Quantity", qty > 1 ? String(qty) : "")}
          ${row("Paid", price)}
        </table>
        <p style="margin:20px 0 0">
          <a href="${APP_URL}/my-tickets" style="display:inline-block;background:#EC008C;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 22px;border-radius:999px">Open my ticket</a>
        </p>
        <p style="margin:16px 0 0;font-size:13px;color:#6b6e85">Show the QR code in the app at the door. Your ticket also works offline once you have opened it.</p>
      </td></tr>
      <tr><td style="padding:14px 24px;background:#f7f8fc;font-size:12px;color:#9a9cb5">
        You get this e-mail because you registered via the ESN Gent app.
      </td></tr>
    </table>
  </div>`;
  const text = [
    `Ticket confirmed - ${title}`,
    when ? `When: ${when}` : "",
    where ? `Where: ${where}` : "",
    reg.optionName ? `Ticket: ${reg.optionName}` : "",
    qty > 1 ? `Quantity: ${qty}` : "",
    `Paid: ${price}`,
    "",
    `Your ticket (QR at the door): ${APP_URL}/my-tickets`,
  ].filter(Boolean).join("\n");
  return { subject: `Ticket confirmed - ${title}`, html, text };
}

// ---- Board-editable e-mail templates (settings/emailTemplates) ----
// The board edits subject + body text (with {placeholders}) in the app;
// the branded HTML shell around it stays fixed in code. Empty/missing
// fields fall back to these built-in defaults.
const DEFAULT_TEMPLATES = {
  esncardReady: {
    subject: "Your ESNcard number is ready",
    body: "Hi {firstName},\n\nGood news - your ESNcard number is {cardNumber}.\n\n{activationNote}\n\nYou can pick up the physical card at the ESN office during our office hours (never at events). The current times are always here: {officeUrl}\n\nYour card and barcode are already in the app under your profile.\n\nSee you soon!\nThe ESN Gent team",
  },
};
async function getEmailTemplate(key) {
  let t = null;
  try {
    const s = await db.collection("settings").doc("emailTemplates").get();
    if (s.exists && s.data()[key]) t = s.data()[key];
  } catch { /* fall back to defaults */ }
  const d = DEFAULT_TEMPLATES[key];
  return {
    subject: (t && String(t.subject || "").trim()) || d.subject,
    body: (t && String(t.body || "").trim()) || d.body,
  };
}
const fillTemplate = (str, vars) =>
  String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null && vars[k] !== "" ? String(vars[k]) : m));
const fmtDateBE = (ts) =>
  ts && typeof ts.toDate === "function"
    ? ts.toDate().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" })
    : "";

// Branded shell around a plain-text template body (paragraphs + optional CTA).
function templateEmailHtml(bodyText, ctaLabel, ctaUrl) {
  // Turn bare links in the body into clickable anchors (esc runs first, so the
  // URL only ever contains safe characters). Stops at "<" so a trailing <br>
  // is never swallowed into the href.
  const linkify = (s) => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2E3192">$1</a>');
  const paras = escHtml(bodyText)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;font-size:14px;color:#1d1f31;line-height:1.55">${linkify(p.replace(/\n/g, "<br>"))}</p>`)
    .join("");
  return `
  <div style="margin:0;padding:24px 12px;background:#f2f3f8;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="background:#2E3192;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold">ESN Gent</td></tr>
      <tr><td style="padding:24px">
        ${paras}
        ${ctaUrl ? `<p style="margin:16px 0 0">
          <a href="${ctaUrl}" style="display:inline-block;background:#EC008C;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 22px;border-radius:999px">${escHtml(ctaLabel || "Open the app")}</a>
        </p>` : ""}
      </td></tr>
      <tr><td style="padding:14px 24px;background:#f7f8fc;font-size:12px;color:#9a9cb5">
        You get this e-mail from the ESN Gent app.
      </td></tr>
    </table>
  </div>`;
}

// Enqueue-only (no immediate send): for BULK mails (event cancellations) the
// 15-minute sweep drains the queue at ≤40/run, staying under the mail host's
// sending caps instead of blasting hundreds of mails in one function run.
async function queueMail(m) {
  await db.collection("mailQueue").add({
    to: m.to, subject: m.subject, text: m.text || "", html: m.html || "",
    kind: m.kind || "", refId: m.refId || "",
    status: "pending", attempts: 0, createdAt: FieldValue.serverTimestamp(),
  });
}

// Queue a mail + send it immediately; failures stay pending for the sweep.
async function queueAndSend(cfg, m) {
  const ref = await db.collection("mailQueue").add({
    to: m.to, subject: m.subject, text: m.text || "", html: m.html || "",
    kind: m.kind || "", refId: m.refId || "",
    status: "pending", attempts: 0, createdAt: FieldValue.serverTimestamp(),
  });
  try {
    await smtpSend(cfg, m);
    await ref.update({ status: "sent", sentAt: FieldValue.serverTimestamp() });
  } catch (err) {
    await ref.update({ attempts: 1, lastError: String(err?.message || err).slice(0, 300) });
  }
}

// Fires on every registration write; sends ONE confirmation when a
// registration first reaches status paid/free (webhook flip or free reg).
exports.registrationMail = onDocumentWritten(
  { document: "registrations/{regId}", secrets: [smtpPassword] },
  async (event) => {
    const after = event.data?.after;
    if (!after || !after.exists) return;
    const reg = after.data();
    if (!["paid", "free"].includes(reg.status)) return;

    // ---- Ticket claimed by a new owner (v0.99.12)? Mail THEM their ticket.
    // Detected as a CHANGE of transferredAt; transferMailFor stores which
    // claim was already mailed, so repeated transfers each mail once.
    const beforeData = event.data?.before && event.data.before.exists ? event.data.before.data() : null;
    const tAfter = reg.transferredAt && reg.transferredAt.toMillis ? reg.transferredAt.toMillis() : null;
    const tBefore = beforeData && beforeData.transferredAt && beforeData.transferredAt.toMillis ? beforeData.transferredAt.toMillis() : null;
    if (tAfter && tAfter !== tBefore && reg.email) {
      try {
        const won = await db.runTransaction(async (tx) => {
          const s = await tx.get(after.ref);
          if (!s.exists) return false;
          const cur = s.data();
          const curT = cur.transferredAt && cur.transferredAt.toMillis ? cur.transferredAt.toMillis() : null;
          if (!curT || cur.transferMailFor === curT) return false;
          tx.update(after.ref, { transferMailFor: curT });
          return true;
        });
        if (won) {
          const cfg = await getMailConfig();
          if (cfg) {
            const title = reg.eventTitle || "your event";
            const when = fmtWhenBE(reg.eventStart);
            const body = `Hi ${(reg.name || "").split(" ")[0] || "there"},\n\nA ticket for ${title}${when ? ` (${when})` : ""} was just transferred to your account - it's yours now, and the sender's copy stopped working.\n\nShow the QR code in the app at the door. See you there!`;
            await queueAndSend(cfg, {
              to: reg.email,
              subject: `A ticket was transferred to you - ${title}`,
              text: `${body}\n\nYour ticket: ${APP_URL}/my-tickets`,
              html: templateEmailHtml(body, "Open my ticket", `${APP_URL}/my-tickets`),
              kind: "transferClaimed", refId: event.params.regId,
            });
          }
        }
      } catch (err) { await logServerError("transferMail", err); }
    }

    if (reg.confirmationQueuedAt) return; // already handled (also fast-exits our own update)
    if (!reg.email) return;
    // Claim the send in a transaction - two rapid writes can fire two trigger
    // runs, and only one may send. Marked even when e-mail is off, so enabling
    // it later never blasts historic registrations.
    const won = await db.runTransaction(async (tx) => {
      const s = await tx.get(after.ref);
      if (!s.exists) return false;
      const cur = s.data();
      if (cur.confirmationQueuedAt || !["paid", "free"].includes(cur.status)) return false;
      tx.update(after.ref, { confirmationQueuedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!won) return;
    try {
      const cfg = await getMailConfig();
      if (!cfg) return; // switched off - push notifications still cover it
      const evSnap = reg.eventId ? await db.collection("events").doc(reg.eventId).get() : null;
      const ev = evSnap && evSnap.exists ? evSnap.data() : {};
      const msg = confirmationEmail(reg, ev);
      await queueAndSend(cfg, { to: reg.email, ...msg, kind: "registration", refId: event.params.regId });
    } catch (err) { await logServerError("registrationMail", err); }
  }
);

// ESNcard ready for pickup - fires when the board assigns & activates a
// card number on an application (status → active + cardNumber set). The
// text comes from the board-editable template (settings/emailTemplates).
exports.esncardReadyMail = onDocumentWritten(
  { document: "esncardApplications/{uid}", secrets: [smtpPassword] },
  async (event) => {
    const after = event.data?.after;
    if (!after || !after.exists) return;
    const a = after.data();
    if (a.status !== "active" || !a.cardNumber) return;
    if (a.readyMailAt) return; // already handled (also fast-exits our own update)
    // Claim the send in a transaction (same race-safety as registrationMail).
    const won = await db.runTransaction(async (tx) => {
      const s = await tx.get(after.ref);
      if (!s.exists) return false;
      const cur = s.data();
      if (cur.readyMailAt || cur.status !== "active" || !cur.cardNumber) return false;
      tx.update(after.ref, { readyMailAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!won) return;
    try {
      const cfg = await getMailConfig();
      if (!cfg) return; // e-mail switched off
      let email = a.email || "";
      let firstName = a.firstName || "";
      if (!email || !firstName) {
        const us = await db.collection("users").doc(event.params.uid).get();
        if (us.exists) {
          email = email || us.data().email || "";
          firstName = firstName || us.data().firstName || (us.data().displayName || "").split(" ")[0] || "";
        }
      }
      if (!email) return;
      let officeHours = "";
      try {
        const org = await db.collection("settings").doc("org").get();
        if (org.exists) officeHours = org.data().officeHoursText || "";
      } catch { /* placeholder stays generic */ }
      const t = await getEmailTemplate("esncardReady");
      // Available card (not yet activated on esncard.org) vs already active.
      const active = a.esncardStatus === "active" || (a.expiresAt && a.status === "active" && a.esncardStatus !== "available");
      const activationNote = active
        ? `It is valid until ${fmtDateBE(a.expiresAt)} and your member discounts already work in the app.`
        : `To start using it, register the card at esncard.org with this number - once it is registered your membership is active and member prices apply automatically in the app.`;
      const vars = {
        firstName: firstName || "there",
        name: `${a.firstName || ""} ${a.lastName || ""}`.trim() || firstName || "there",
        cardNumber: a.cardNumber,
        expires: fmtDateBE(a.expiresAt),
        activationNote,
        officeHours: officeHours || "see the app for times & location",
        officeUrl: `${APP_URL}/office`,
      };
      const subject = fillTemplate(t.subject, vars);
      const body = fillTemplate(t.body, vars);
      await queueAndSend(cfg, {
        to: email,
        subject,
        text: `${body}\n\nYour card in the app: ${APP_URL}/account`,
        html: templateEmailHtml(body, "Open my card", `${APP_URL}/account`),
        kind: "esncardReady",
        refId: event.params.uid,
      });
    } catch (err) { await logServerError("esncardReadyMail", err); }
  }
);

// Retry sweep: ≤40 mails per run (≈160/hour) stays safely under typical
// shared-hosting sending caps while draining any backlog.
exports.mailQueueSweep = onSchedule(
  { schedule: "every 15 minutes", secrets: [smtpPassword] },
  async () => {
    try {
      const cfg = await getMailConfig();
      if (!cfg) return;
      const pending = await db.collection("mailQueue")
        .where("status", "==", "pending").limit(40).get();
      for (const d of pending.docs) {
        const m = d.data();
        if ((m.attempts || 0) >= 6) {
          await d.ref.update({ status: "failed" });
          await logServerError("mailQueue", new Error(`gave up on mail to ${m.to} (${m.subject})`));
          continue;
        }
        try {
          await smtpSend(cfg, m);
          await d.ref.update({ status: "sent", sentAt: FieldValue.serverTimestamp() });
        } catch (err) {
          await d.ref.update({
            attempts: FieldValue.increment(1),
            lastError: String(err?.message || err).slice(0, 300),
          });
        }
      }
    } catch (err) { await logServerError("mailQueueSweep", err); }
  }
);

// Board tests the SMTP settings from Admin → Settings ("Send me a test").
// Works while the switch is OFF on purpose: verify first, then enable.
exports.sendTestEmail = onCall({ secrets: [smtpPassword] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
  const role = adminSnap.exists ? (adminSnap.data().role || "superadmin") : null;
  if (!["board", "finance", "superadmin"].includes(role)) {
    throw new HttpsError("permission-denied", "Board only.");
  }
  const cfg = await getMailConfig(false);
  if (!cfg) throw new HttpsError("failed-precondition", "Fill in and save the SMTP server, mailbox and from-address first.");
  const to = request.auth.token.email;
  if (!to) throw new HttpsError("failed-precondition", "Your account has no e-mail address.");
  let msg;
  if (request.data?.template === "esncardReady") {
    // Preview of the board-editable "card ready" mail with sample data.
    let officeHours = "";
    try {
      const org = await db.collection("settings").doc("org").get();
      if (org.exists) officeHours = org.data().officeHoursText || "";
    } catch { /* generic */ }
    const t = await getEmailTemplate("esncardReady");
    const sampleExp = new Date();
    sampleExp.setMonth(sampleExp.getMonth() + 12);
    const vars = {
      firstName: "Alex", name: "Alex Example", cardNumber: "GHE123456",
      expires: sampleExp.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" }),
      activationNote: "To start using it, register the card at esncard.org with this number - once it is registered your membership is active and member prices apply automatically in the app.",
      officeHours: officeHours || "see the app for times & location",
      officeUrl: `${APP_URL}/office`,
    };
    const body = fillTemplate(t.body, vars);
    msg = {
      to,
      subject: `[PREVIEW] ${fillTemplate(t.subject, vars)}`,
      text: `${body}\n\nYour card in the app: ${APP_URL}/account`,
      html: templateEmailHtml(body, "Open my card", `${APP_URL}/account`),
    };
  } else {
    msg = {
      to,
      subject: "ESN Gent app - test e-mail",
      text: `It works! This mail was sent through ${cfg.host} as ${cfg.user}.\nIf it landed in spam, set up DKIM in the hosting panel and add a DMARC record.`,
    };
  }
  try {
    await smtpSend(cfg, msg);
  } catch (err) {
    throw new HttpsError("internal", `SMTP error: ${String(err?.message || err).slice(0, 250)}`);
  }
  return { ok: true, to };
});

// ------------------------------------------------------------
// Per-event link previews (v0.99.11). Hosting rewrites /event/** to this
// function: it injects the event's own og: tags into the app shell, so
// WhatsApp / Instagram / Telegram show the event image + title instead of
// the generic card. Browsers receive the identical shell and boot the SPA
// as always. The shell is fetched from hosting and cached in memory.
// ------------------------------------------------------------
let _shellCache = null;
let _shellAt = 0;
async function getShell() {
  if (_shellCache && Date.now() - _shellAt < 5 * 60e3) return _shellCache;
  const urls = [`${APP_URL}/index.html`, `https://${process.env.GCLOUD_PROJECT}.web.app/index.html`];
  for (const u of urls) {
    try {
      const res = await fetch(u);
      if (res.ok) {
        _shellCache = await res.text();
        _shellAt = Date.now();
        return _shellCache;
      }
    } catch { /* try the next url */ }
  }
  throw new Error("could not fetch app shell");
}
exports.eventPage = onRequest(async (req, res) => {
  try {
    const m = (req.path || "").match(/^\/event\/([A-Za-z0-9_-]+)/);
    let html = await getShell();
    if (m) {
      const snap = await db.collection("events").doc(m[1]).get();
      if (snap.exists && snap.data().published === true) {
        const ev = snap.data();
        const e = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
        const title = `${ev.title || "Event"} - ESN Gent`;
        const rawDesc = String(ev.description || "").replace(/<[^>]+>/g, " ").replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();
        const when = ev.start && typeof ev.start.toDate === "function"
          ? ev.start.toDate().toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" })
          : "";
        const desc = [when, ev.location, rawDesc].filter(Boolean).join(" · ").slice(0, 200);
        const img = typeof ev.image === "string" && ev.image.startsWith("https://") ? ev.image : `${APP_URL}/icon-512.png`;
        html = html
          .replace(/<title>[^<]*<\/title>/, `<title>${e(title)}</title>`)
          .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${e(desc)}"`)
          .replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${e(title)}"`)
          .replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${e(desc)}"`)
          .replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${APP_URL}/event/${m[1]}"`)
          .replace(/<meta property="og:image" content="[^"]*"/, `<meta property="og:image" content="${e(img)}"`)
          .replace(/<meta name="twitter:card" content="[^"]*"/, `<meta name="twitter:card" content="${ev.image ? "summary_large_image" : "summary"}"`);
      }
    }
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.status(200).send(html);
  } catch (err) {
    await logServerError("eventPage", err);
    // Never lose the visitor over preview tags: bounce via the legacy hash
    // route - the static shell loads and the app restores the clean URL.
    res.set("Cache-Control", "no-store");
    res.redirect(302, `/#${req.path || "/"}`);
  }
});

// ------------------------------------------------------------
// Link an existing ESNcard to the signed-in account. Server-side so the
// SAME card number can never end up on two accounts (client rules forbid
// users writing esncardCode themselves).
// ------------------------------------------------------------
// linkEsncard moved to the ESNcard verification section (v0.133) - it now
// checks esncard.org and links by real status. See bottom of the file.

// ------------------------------------------------------------
// Org-wide event defaults (settings/events): standard cancellation
// deadline + standard refund fee, editable in Admin -> Settings.
// Per-event values always win; these fill the gaps.
// ------------------------------------------------------------
let _eventDefaultsCache = null;
let _eventDefaultsAt = 0;
async function getEventDefaults() {
  if (_eventDefaultsCache && Date.now() - _eventDefaultsAt < 60e3) return _eventDefaultsCache;
  let d = { defaultCancelHours: 24, defaultRefundFee: 100 }; // 24h, EUR 1
  try {
    const snap = await db.collection("settings").doc("events").get();
    if (snap.exists) {
      const s = snap.data();
      if (typeof s.defaultCancelHours === "number" && s.defaultCancelHours >= 0) d.defaultCancelHours = s.defaultCancelHours;
      if (typeof s.defaultRefundFee === "number" && s.defaultRefundFee >= 0) d.defaultRefundFee = s.defaultRefundFee;
    }
  } catch { /* defaults stand */ }
  _eventDefaultsCache = d;
  _eventDefaultsAt = Date.now();
  return d;
}

// ------------------------------------------------------------
// Waitlist offers: when a spot frees on a full event, the FIRST person
// in line gets a personal 24h hold; the spot is blocked for everyone
// else until the hold is used or expires (pushReminders sweeps expiry
// and passes the hold on).
// ------------------------------------------------------------
async function activeHoldCount(eventId, excludeUid) {
  // Needs the (eventId, offerExpiresAt) composite index. If that index is
  // ever missing again (a deploy once deleted it and broke ALL registrations
  // on capacity events with "INTERNAL"), degrade gracefully: log loudly and
  // count 0 holds rather than blocking every registration.
  try {
    const snap = await db.collection("waitlist")
      .where("eventId", "==", eventId)
      .where("offerExpiresAt", ">", Timestamp.now())
      .get();
    return snap.docs.filter((d) => d.data().uid !== excludeUid).length;
  } catch (err) {
    await logServerError("activeHoldCount (index missing? deploy firestore:indexes)", err);
    return 0;
  }
}
async function clearWaitlistFor(eventId, uid) {
  try {
    const snap = await db.collection("waitlist")
      .where("eventId", "==", eventId).where("uid", "==", uid).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  } catch { /* best effort */ }
}
async function promoteWaitlist(eventId) {
  try {
    const evSnap = await db.collection("events").doc(eventId).get();
    if (!evSnap.exists) return;
    const event = evSnap.data();
    if (event.cancelled || !event.published || !event.capacity) return;
    if (event.start && event.start.toDate() < new Date()) return;
    const wl = await db.collection("waitlist").where("eventId", "==", eventId).get();
    if (wl.empty) return;
    const now = Date.now();
    const entries = wl.docs.map((d) => ({ ref: d.ref, ...d.data() }));
    const holds = entries.filter((w) => w.offerExpiresAt && w.offerExpiresAt.toMillis() > now).length;
    const freeSpots = event.capacity - (event.ticketsSold || 0) - (event.pendingHold || 0) - holds;
    if (freeSpots <= 0) return;
    const waiting = entries
      .filter((w) => !w.offerExpiresAt)
      .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
    // Personal claim window (v0.125): default 12 h, board-adjustable in
    // Admin → Settings → Events (settings/events.waitlistHours, 1–168).
    let holdH = 12;
    try {
      const s = await db.collection("settings").doc("events").get();
      const v = s.exists ? s.data().waitlistHours : null;
      if (Number.isFinite(v) && v >= 1 && v <= 168) holdH = v;
    } catch { /* default stands */ }
    for (const w of waiting.slice(0, freeSpots)) {
      await w.ref.update({
        offeredAt: FieldValue.serverTimestamp(),
        offerExpiresAt: Timestamp.fromMillis(now + holdH * 3600e3),
      });
      await sendPushToUids([w.uid], "waitlist", `Your spot is ready: ${event.title || ""}`,
        `You're first in line and the spot is held for YOU for ${holdH} hours - open the event to grab it.`,
        `/event/${eventId}`);
      // E-mail too (v0.99.12) - push isn't enabled on every phone, and a
      // 24h personal hold is too important to miss.
      if (w.email) {
        try {
          const cfg = await getMailConfig();
          if (cfg) {
            const body = `Hi ${(w.name || "").split(" ")[0] || "there"},\n\nA spot opened up for ${event.title || "the event"} and you're first in line - it is held for YOU for the next ${holdH} hours.\n\nOpen the event and grab it before the hold expires; after that it goes to the next person on the list.`;
            await queueAndSend(cfg, {
              to: w.email,
              subject: `Your spot is ready - ${event.title || "ESN Gent event"}`,
              text: `${body}\n\nClaim it: ${APP_URL}/event/${eventId}`,
              html: templateEmailHtml(body, "Claim my spot", `${APP_URL}/event/${eventId}`),
              kind: "waitlistOffer", refId: eventId,
            });
          }
        } catch (err) { await logServerError("waitlistOfferMail", err); }
      }
    }
  } catch (err) { await logServerError("promoteWaitlist", err); }
}

// ---- Team-audience events (v0.103) ----
// events.audience = subset of ["board","volunteer","alumni","advisory"]
// (absent/empty = everyone). The app hides these events client-side, but
// joining is enforced HERE. Superadmin/finance count as board; the alumni
// coordinator counts as alumni.
const AUDIENCE_LABELS = { board: "board members", volunteer: "volunteers", alumni: "alumni", advisory: "the advisory board" };
async function assertAudienceAllowed(event, uid) {
  const aud = Array.isArray(event.audience) ? event.audience.filter((a) => AUDIENCE_LABELS[a]) : [];
  if (!aud.length) return;
  const [adminSnap, userSnap] = await Promise.all([
    db.collection("admins").doc(uid).get(),
    db.collection("users").doc(uid).get(),
  ]);
  const role = adminSnap.exists ? (adminSnap.data().role || "superadmin") : null;
  const alumni = userSnap.exists && userSnap.data().alumni === true;
  const ok = (aud.includes("board") && ["board", "finance", "superadmin"].includes(role))
    || (aud.includes("volunteer") && role === "volunteer")
    || (aud.includes("advisory") && role === "advisory")
    || (aud.includes("alumni") && (alumni || role === "alumnicoord"));
  if (!ok) {
    throw new HttpsError("permission-denied", `This is a team event - reserved for ${aud.map((a) => AUDIENCE_LABELS[a]).join(", ")}.`);
  }
}

// ------------------------------------------------------------
// Create a Stripe Checkout session for a paid event
// ------------------------------------------------------------
exports.createCheckoutSession = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    try { // unexpected crashes must NEVER surface as a bare "INTERNAL"
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to buy tickets.");
    }
    const { eventId } = request.data || {};
    // One ticket per person per event - quantity is always 1.
    const quantity = 1;
    if (!eventId || typeof eventId !== "string") {
      throw new HttpsError("invalid-argument", "Invalid event.");
    }

    const eventSnap = await db.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      throw new HttpsError("not-found", "Event not found.");
    }
    const event = eventSnap.data();
    if (!event.published) {
      throw new HttpsError("failed-precondition", "This event is not open for registration.");
    }
    if (event.cancelled) {
      throw new HttpsError("failed-precondition", "This event has been cancelled.");
    }
    if (event.regMode === "none" || event.regMode === "external") {
      throw new HttpsError("failed-precondition", "This event has no in-app tickets - check the event page for how to join.");
    }
    await assertAudienceAllowed(event, request.auth.uid);

    // One ticket per person per event (any active registration counts).
    const mine = await db
      .collection("registrations")
      .where("eventId", "==", eventId)
      .where("uid", "==", request.auth.uid)
      .get();
    if (mine.docs.some((d) => ["paid", "free", "pending"].includes(d.data().status))) {
      throw new HttpsError("already-exists", "You already have a ticket for this event (one per person). A pending checkout expires after about 30 minutes.");
    }

    // ESNcard/alumni: server-side truth about membership
    const m = await getMembership(request.auth.uid);
    if (event.esnOnly && !memberAccess(m)) {
      throw new HttpsError("failed-precondition", "This event is only for ESN members.");
    }
    const isMember = memberPrice(m, event);

    // Ticket types (options) override the base price
    let option = null;
    if (Array.isArray(event.options) && event.options.length) {
      option = event.options.find((o) => o.id === request.data?.optionId);
      if (!option) throw new HttpsError("invalid-argument", "Please choose a ticket type.");
    }
    const unitPrice = option
      ? (isMember && typeof option.priceEsn === "number" ? option.priceEsn : option.price)
      : (isMember && typeof event.priceEsn === "number" ? event.priceEsn : event.price);
    if (!unitPrice || unitPrice <= 0) {
      throw new HttpsError("failed-precondition", "This ticket is free for you - use free registration.");
    }
    // ---- capacity: claimed TRANSACTIONALLY (v0.99.11) ----
    // A pending checkout now HOLDS its tickets via pendingHold counters on
    // the event, so a launch-day rush of simultaneous buyers can never
    // oversell. Holds are released when the payment confirms (webhook paid),
    // the checkout expires (webhook expired), or by the nightly sweep.
    const wlHolds = event.capacity ? await activeHoldCount(eventId, request.auth.uid) : 0;
    const eventRef2 = db.collection("events").doc(eventId);
    await db.runTransaction(async (tx) => {
      const s = await tx.get(eventRef2);
      if (!s.exists) throw new HttpsError("not-found", "Event not found.");
      const ev2 = s.data();
      const pend = ev2.pendingHold || 0;
      if (ev2.capacity && (ev2.ticketsSold || 0) + pend + quantity > ev2.capacity) {
        throw new HttpsError("resource-exhausted", "Not enough tickets left.");
      }
      if (ev2.capacity && (ev2.ticketsSold || 0) + pend + quantity + wlHolds > ev2.capacity) {
        throw new HttpsError("resource-exhausted", "The remaining spot is currently held for someone on the waitlist.");
      }
      if (option && option.capacity) {
        const optSold = (ev2.optionSold && ev2.optionSold[option.id]) || 0;
        const optPend = (ev2.pendingOptionHold && ev2.pendingOptionHold[option.id]) || 0;
        if (optSold + optPend + quantity > option.capacity) {
          throw new HttpsError("resource-exhausted", `No "${option.name}" tickets left.`);
        }
      }
      if (isMember && ev2.esnLimit && (ev2.esnSold || 0) + (ev2.pendingEsnHold || 0) + quantity > ev2.esnLimit) {
        throw new HttpsError("resource-exhausted", "No ESNcard-member spots left for this event.");
      }
      tx.update(eventRef2, {
        pendingHold: FieldValue.increment(quantity),
        ...(isMember && ev2.esnLimit ? { pendingEsnHold: FieldValue.increment(quantity) } : {}),
        ...(option && option.capacity ? { [`pendingOptionHold.${option.id}`]: FieldValue.increment(quantity) } : {}),
      });
    });
    const heldEsn = !!(isMember && event.esnLimit);
    const heldOptionId = option && option.capacity ? option.id : null;

    // Where to send the user afterwards (the site that called us).
    const projectId = process.env.GCLOUD_PROJECT;
    const origin =
      request.rawRequest?.headers?.origin || `https://${projectId}.web.app`;

    const stripe = new Stripe(stripeSecretKey.value());

    // Create a pending registration first so the webhook can confirm it.
    const regRef = db.collection("registrations").doc();
    await regRef.set({
      eventId,
      eventTitle: event.title || "",
      eventStart: event.start || null,
      uid: request.auth.uid,
      name: request.auth.token.name || "",
      email: request.auth.token.email || "",
      quantity,
      amountTotal: unitPrice * quantity,
      currency: event.currency || "eur",
      status: "pending",
      usedEsncard: isMember,
      optionId: option ? option.id : null,
      optionName: option ? option.name : null,
      policyAccepted: request.data?.policyAgreed === true,
      holdsClaimed: true, heldEsn, heldOptionId, // which pendingHold counters this reserves
      createdAt: FieldValue.serverTimestamp(),
    });

    let session;
    try {
      session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: event.currency || "eur",
            unit_amount: unitPrice,
            product_data: {
              name: `${event.title} - ${option ? option.name : "ticket"}${isMember && (option ? option.priceEsn != null : event.priceEsn != null) ? " (ESNcard price)" : ""}`,
              description: event.location ? `📍 ${event.location}` : undefined,
            },
          },
          quantity,
        },
      ],
      customer_email: request.auth.token.email || undefined,
      metadata: {
        type: "event",
        registrationId: regRef.id,
        eventId,
        uid: request.auth.uid,
      },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/event/${eventId}`,
      // Auto-expire unfinished checkouts after ~30 minutes - Stripe's minimum
      // (30 min – 24 h), +1 min buffer so clock skew can't dip under the
      // limit. The event page also offers Resume / Cancel while it's open.
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    });

      // Session URL stored too, so the buyer can RESUME an unfinished
      // checkout from the event page (readable only by owner + board).
      await regRef.update({ stripeSessionId: session.id, stripeSessionUrl: session.url });
    } catch (err) {
      // Stripe refused or the network died AFTER capacity was claimed -
      // give the hold back immediately instead of waiting for the sweep.
      await releasePendingRegistration(regRef).catch(() => {});
      await logServerError("createCheckoutSession stripe", err);
      throw new HttpsError("internal", "Could not start the payment - please try again.");
    }
    return { url: session.url };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      await logServerError("createCheckoutSession", err);
      throw new HttpsError("internal", `Checkout hit a server error (${String(err?.message || err).slice(0, 120)}) - the board can see details in the error log.`);
    }
  }
);

// Release one pending registration: give its held capacity back and delete
// the doc. Transactional + status-checked, so the webhook-expired path and
// the nightly sweep can never double-release the same hold.
async function releasePendingRegistration(regRef) {
  await db.runTransaction(async (tx) => {
    const s = await tx.get(regRef);
    if (!s.exists || s.data().status !== "pending") return;
    const r = s.data();
    if (r.holdsClaimed && r.eventId) {
      const q = -(r.quantity || 1);
      tx.update(db.collection("events").doc(r.eventId), {
        pendingHold: FieldValue.increment(q),
        ...(r.heldEsn ? { pendingEsnHold: FieldValue.increment(q) } : {}),
        ...(r.heldOptionId ? { [`pendingOptionHold.${r.heldOptionId}`]: FieldValue.increment(q) } : {}),
      });
    }
    tx.delete(regRef);
  });
}

// ------------------------------------------------------------
// Cancel an unfinished checkout (v0.101.2). A buyer who clicks "back" on
// the Stripe page would otherwise be stuck ("payment in progress") until
// the session expires - this expires the Stripe session immediately and
// releases the held spot, so they can register again right away.
// ------------------------------------------------------------
exports.cancelPendingCheckout = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    try { // unexpected crashes must NEVER surface as a bare "INTERNAL"
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const { registrationId } = request.data || {};
    if (!registrationId || typeof registrationId !== "string") {
      throw new HttpsError("invalid-argument", "Invalid registration.");
    }
    const regRef = db.collection("registrations").doc(registrationId);
    const snap = await regRef.get();
    if (!snap.exists) return { ok: true }; // expired-webhook already cleaned it up
    const reg = snap.data();
    if (reg.uid !== request.auth.uid) {
      throw new HttpsError("permission-denied", "That's not your registration.");
    }
    if (reg.status !== "pending") {
      throw new HttpsError("failed-precondition", "This ticket is already confirmed - to cancel it, request a refund from My tickets instead.");
    }
    // Kill the Stripe session too, so a payment page still open in another
    // tab can't complete AFTER the spot has been given back to the pool.
    if (reg.stripeSessionId) {
      const stripe = new Stripe(stripeSecretKey.value());
      let session = null;
      try {
        session = await stripe.checkout.sessions.retrieve(reg.stripeSessionId);
      } catch { /* unknown/gone at Stripe - releasing below is still safe */ }
      if (session && session.status === "open") {
        try {
          await stripe.checkout.sessions.expire(reg.stripeSessionId);
        } catch {
          // Maybe it completed in the last second - re-check before releasing.
          try {
            session = await stripe.checkout.sessions.retrieve(reg.stripeSessionId);
          } catch { session = null; }
        }
      }
      if (session && session.status === "complete") {
        throw new HttpsError("failed-precondition", "This payment already went through - your ticket is being confirmed right now.");
      }
    }
    // Transactional + status-checked (idempotent), so racing the
    // checkout.session.expired webhook can never double-release the hold.
    await releasePendingRegistration(regRef);
    return { ok: true };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      await logServerError("cancelPendingCheckout", err);
      throw new HttpsError("internal", `Cancelling hit a server error (${String(err?.message || err).slice(0, 120)}) - the board can see details in the error log.`);
    }
  }
);

// ------------------------------------------------------------
// Free-event registration (server-side so capacity is enforced)
// ------------------------------------------------------------
exports.registerFree = onCall(async (request) => {
  try { // unexpected crashes must NEVER surface as a bare "INTERNAL"
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to register.");
  }
  const { eventId, optionId } = request.data || {};
  if (!eventId || typeof eventId !== "string") {
    throw new HttpsError("invalid-argument", "Invalid event.");
  }

  const eventRef = db.collection("events").doc(eventId);

  // One ticket per person per event (any active registration counts).
  const existing = await db
    .collection("registrations")
    .where("eventId", "==", eventId)
    .where("uid", "==", request.auth.uid)
    .get();
  if (existing.docs.some((d) => ["paid", "free", "pending"].includes(d.data().status))) {
    throw new HttpsError("already-exists", "You already have a ticket for this event (one per person).");
  }

  const m = await getMembership(request.auth.uid);

  // Team-audience events: who-can-join is enforced server-side.
  {
    const evAud = await eventRef.get();
    if (!evAud.exists) throw new HttpsError("not-found", "Event not found.");
    await assertAudienceAllowed(evAud.data(), request.auth.uid);
  }

  // Waitlist holds block the last spots for the people they were offered to.
  {
    const evPeek = await eventRef.get();
    if (evPeek.exists && evPeek.data().capacity) {
      const holds = await activeHoldCount(eventId, request.auth.uid);
      const ev = evPeek.data();
      if ((ev.ticketsSold || 0) + (ev.pendingHold || 0) + 1 + holds > ev.capacity) {
        throw new HttpsError("resource-exhausted", "The remaining spot is currently held for someone on the waitlist.");
      }
    }
  }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) throw new HttpsError("not-found", "Event not found.");
    const event = snap.data();
    if (!event.published) {
      throw new HttpsError("failed-precondition", "This event is not open for registration.");
    }
    if (event.cancelled) {
      throw new HttpsError("failed-precondition", "This event has been cancelled.");
    }
    if (event.regMode === "none" || event.regMode === "external") {
      throw new HttpsError("failed-precondition", "This event has no in-app tickets - check the event page for how to join.");
    }
    if (event.esnOnly && !memberAccess(m)) {
      throw new HttpsError("failed-precondition", "This event is only for ESN members.");
    }
    const isMember = memberPrice(m, event);
    // Ticket types (options) override the base price
    let option = null;
    if (Array.isArray(event.options) && event.options.length) {
      option = event.options.find((o) => o.id === optionId);
      if (!option) throw new HttpsError("invalid-argument", "Please choose a ticket type.");
    }
    // Free for everyone, or free for members via a €0 ESNcard price
    const unitPrice = option
      ? (isMember && typeof option.priceEsn === "number" ? option.priceEsn : option.price)
      : (isMember && typeof event.priceEsn === "number" ? event.priceEsn : event.price);
    if (unitPrice && unitPrice > 0) {
      throw new HttpsError("failed-precondition", "This ticket requires payment.");
    }
    if (event.capacity && (event.ticketsSold || 0) + (event.pendingHold || 0) + 1 > event.capacity) {
      throw new HttpsError("resource-exhausted", "This event is full.");
    }
    if (option && option.capacity) {
      const optSold = (event.optionSold && event.optionSold[option.id]) || 0;
      const optPend = (event.pendingOptionHold && event.pendingOptionHold[option.id]) || 0;
      if (optSold + optPend + 1 > option.capacity) {
        throw new HttpsError("resource-exhausted", `No "${option.name}" tickets left.`);
      }
    }
    if (isMember && event.esnLimit && (event.esnSold || 0) + (event.pendingEsnHold || 0) + 1 > event.esnLimit) {
      throw new HttpsError("resource-exhausted", "No ESNcard-member spots left for this event.");
    }
    const regRef = db.collection("registrations").doc();
    tx.set(regRef, {
      eventId,
      eventTitle: event.title || "",
      eventStart: event.start || null,
      uid: request.auth.uid,
      name: request.auth.token.name || "",
      email: request.auth.token.email || "",
      quantity: 1,
      amountTotal: 0,
      currency: event.currency || "eur",
      status: "free",
      usedEsncard: isMember,
      optionId: option ? option.id : null,
      optionName: option ? option.name : null,
      policyAccepted: request.data?.policyAgreed === true,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(eventRef, {
      ticketsSold: FieldValue.increment(1),
      ...(isMember ? { esnSold: FieldValue.increment(1) } : {}),
      ...(option ? { [`optionSold.${option.id}`]: FieldValue.increment(1) } : {}),
    });
  });

  await clearWaitlistFor(eventId, request.auth.uid); // hold used (if any)
  return { ok: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError("registerFree", err);
    throw new HttpsError("internal", `Registration hit a server error (${String(err?.message || err).slice(0, 120)}) - the board can see details in the error log.`);
  }
});

// The per-event cancellation deadline, in hours before start.
// Editable in the event form; default 2h (0 = until the event starts).
const cancelDeadlineHours = (event, defaults) =>
  typeof event.cancelHours === "number" && event.cancelHours >= 0
    ? event.cancelHours
    : (defaults ? defaults.defaultCancelHours : 24);
const beforeDeadline = (event, defaults) => {
  const start = event.start && event.start.toDate();
  if (!start) return true;
  return start.getTime() - Date.now() >= cancelDeadlineHours(event, defaults) * 60 * 60 * 1000;
};

// ------------------------------------------------------------
// Self-cancel a FREE registration (until the event's deadline)
// ------------------------------------------------------------
exports.cancelRegistration = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const { registrationId } = request.data || {};
  if (!registrationId || typeof registrationId !== "string") {
    throw new HttpsError("invalid-argument", "Invalid registration.");
  }

  const defaults = await getEventDefaults();
  await db.runTransaction(async (tx) => {
    const regRef = db.collection("registrations").doc(registrationId);
    const regSnap = await tx.get(regRef);
    if (!regSnap.exists) throw new HttpsError("not-found", "Registration not found.");
    const reg = regSnap.data();
    if (reg.uid !== request.auth.uid) {
      throw new HttpsError("permission-denied", "This is not your registration.");
    }
    if (reg.status !== "free") {
      throw new HttpsError("failed-precondition", "Paid tickets can't be cancelled here - request a refund from My tickets instead.");
    }
    const evRef = db.collection("events").doc(reg.eventId);
    const evSnap = await tx.get(evRef);
    if (evSnap.exists) {
      const event = evSnap.data();
      if (!event.cancelled && !beforeDeadline(event, defaults)) {
        throw new HttpsError("failed-precondition", `Cancellations for this event close ${cancelDeadlineHours(event, defaults)} hour(s) before it starts.`);
      }
      tx.update(evRef, {
        ticketsSold: FieldValue.increment(-(reg.quantity || 1)),
        ...(reg.usedEsncard ? { esnSold: FieldValue.increment(-(reg.quantity || 1)) } : {}),
        ...(reg.optionId ? { [`optionSold.${reg.optionId}`]: FieldValue.increment(-(reg.quantity || 1)) } : {}),
      });
    }
    tx.delete(regRef);
  });

  return { ok: true };
});

// ------------------------------------------------------------
// Ticket refunds - student side.
// A PAID ticket becomes a refund REQUEST (refundRequests/{regId})
// that the finance role approves or rejects; nothing is refunded
// automatically. Deadline + refundability + fee come from the event.
// ------------------------------------------------------------
exports.requestTicketRefund = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const { registrationId } = request.data || {};
  if (!registrationId || typeof registrationId !== "string") {
    throw new HttpsError("invalid-argument", "Invalid registration.");
  }

  const regRef = db.collection("registrations").doc(registrationId);
  const regSnap = await regRef.get();
  if (!regSnap.exists) throw new HttpsError("not-found", "Registration not found.");
  const reg = regSnap.data();
  if (reg.uid !== request.auth.uid) {
    throw new HttpsError("permission-denied", "This is not your ticket.");
  }
  if (reg.status !== "paid") {
    throw new HttpsError("failed-precondition", "Only paid tickets can be refunded. Free registrations use Cancel.");
  }
  if (reg.checkedInAt) {
    throw new HttpsError("failed-precondition", "This ticket has already been used at the door.");
  }
  if (reg.transferCode) {
    throw new HttpsError("failed-precondition", "A ticket transfer is pending - cancel the transfer first.");
  }

  const evSnap = await db.collection("events").doc(reg.eventId).get();
  const event = evSnap.exists ? evSnap.data() : {};
  if (event.cancelled) {
    throw new HttpsError("failed-precondition", "This event was cancelled - your refund is handled automatically.");
  }
  if (event.nonRefundable) {
    throw new HttpsError("failed-precondition", "This event is non-refundable (that was part of the ticket policy).");
  }
  const rqDefaults = await getEventDefaults();
  if (!beforeDeadline(event, rqDefaults)) {
    throw new HttpsError("failed-precondition", `Refund requests for this event close ${cancelDeadlineHours(event, rqDefaults)} hour(s) before it starts.`);
  }

  const fee = Math.min(
    typeof event.refundFee === "number" && event.refundFee >= 0
      ? Math.round(event.refundFee)
      : rqDefaults.defaultRefundFee,
    reg.amountTotal || 0
  );
  const refundAmount = Math.max(0, (reg.amountTotal || 0) - fee);

  // One request per registration (doc id = registration id).
  const reqRef = db.collection("refundRequests").doc(registrationId);
  const reqSnap = await reqRef.get();
  if (reqSnap.exists && reqSnap.data().status === "requested") {
    throw new HttpsError("already-exists", "You already requested a refund for this ticket - the treasurer is on it.");
  }

  await reqRef.set({
    registrationId,
    eventId: reg.eventId,
    eventTitle: reg.eventTitle || "",
    uid: reg.uid,
    name: reg.name || "",
    email: reg.email || "",
    quantity: reg.quantity || 1,
    amountTotal: reg.amountTotal || 0,
    fee,
    refundAmount,
    currency: reg.currency || "eur",
    status: "requested",
    createdAt: FieldValue.serverTimestamp(),
  });
  await regRef.update({ refundRequested: true });

  return { ok: true, refundAmount, fee };
});

// ------------------------------------------------------------
// Ticket refunds - finance side (approve = Stripe refund + free
// the spot; reject = ticket stays valid). finance/superadmin only.
// ------------------------------------------------------------
exports.decideTicketRefund = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
    const role = adminSnap.exists ? (adminSnap.data().role || "superadmin") : null;
    if (!["finance", "superadmin"].includes(role)) {
      throw new HttpsError("permission-denied", "Ticket refunds are decided by the finance role.");
    }
    const { requestId, approve, note, amount } = request.data || {};
    if (!requestId || typeof requestId !== "string") {
      throw new HttpsError("invalid-argument", "Missing request.");
    }

    const reqRef = db.collection("refundRequests").doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) throw new HttpsError("not-found", "Refund request not found.");
    const rq = reqSnap.data();
    if (rq.status !== "requested") {
      throw new HttpsError("failed-precondition", "This request is already settled.");
    }
    const regRef = db.collection("registrations").doc(rq.registrationId);

    if (!approve) {
      await reqRef.update({
        status: "rejected",
        reviewNote: (note || "").slice(0, 300),
        reviewedBy: request.auth.uid,
        reviewedByName: request.auth.token.name || "",
        reviewedAt: FieldValue.serverTimestamp(),
      });
      await regRef.update({ refundRequested: FieldValue.delete() }).catch(() => {});
      sendPushToUids([rq.uid], "tickets", "Refund request declined",
        `${rq.eventTitle || "Your event"}: your ticket stays valid.${note ? " Reason: " + String(note).slice(0, 80) : ""}`,
        "/my-tickets").catch(() => {});
      if (rq.email) {
        try {
          const cfg = await getMailConfig();
          if (cfg) {
            const body = `Hi,\n\nYour refund request for ${rq.eventTitle || "your event"} was reviewed and declined${note ? ` with this note from the treasurer:\n\n"${String(note).slice(0, 300)}"` : "."}\n\nYour ticket stays valid - see you at the event!`;
            await queueAndSend(cfg, {
              to: rq.email,
              subject: `Refund request declined - ${rq.eventTitle || "ESN Gent"}`,
              text: `${body}\n\nYour tickets: ${APP_URL}/my-tickets`,
              html: templateEmailHtml(body, "My tickets", `${APP_URL}/my-tickets`),
              kind: "refundDeclined", refId: requestId,
            });
          }
        } catch (err) { await logServerError("refundDeclinedMail", err); }
      }
      return { ok: true, refunded: false };
    }

    // Approve: refund via Stripe first (outside the transaction), then settle.
    const regSnap = await regRef.get();
    if (!regSnap.exists) throw new HttpsError("not-found", "The registration no longer exists.");
    const reg = regSnap.data();
    if (reg.status !== "paid") {
      throw new HttpsError("failed-precondition", "This ticket is no longer 'paid' - nothing to refund.");
    }

    // Optional PARTIAL refund: the treasurer can override the amount
    // (0 < amount <= what was paid). Default = requested amount minus fee.
    let payout = rq.refundAmount;
    if (amount != null) {
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > (reg.amountTotal || 0)) {
        throw new HttpsError("invalid-argument", "Partial amount must be between €0.01 and what was paid.");
      }
      payout = amount;
    }

    if (payout > 0) {
      const stripe = new Stripe(stripeSecretKey.value());
      let paymentIntent = reg.stripePaymentIntent || null;
      if (!paymentIntent && reg.stripeSessionId) {
        const session = await stripe.checkout.sessions.retrieve(reg.stripeSessionId);
        paymentIntent = session.payment_intent || null;
      }
      if (!paymentIntent) {
        throw new HttpsError("failed-precondition", "No Stripe payment found for this ticket - refund it manually in the Stripe dashboard, then reject this request with a note.");
      }
      await stripe.refunds.create({ payment_intent: paymentIntent, amount: payout });
    }

    await db.runTransaction(async (tx) => {
      const rSnap = await tx.get(regRef);
      if (!rSnap.exists || rSnap.data().status !== "paid") return;
      const r = rSnap.data();
      tx.update(regRef, {
        status: "refunded",
        refundRequested: FieldValue.delete(),
        refundedAt: FieldValue.serverTimestamp(),
        refundAmount: payout,
        refundFeeKept: Math.max(0, (r.amountTotal || 0) - payout),
      });
      // The cancelled ticket releases its spot again.
      tx.update(db.collection("events").doc(r.eventId), {
        ticketsSold: FieldValue.increment(-(r.quantity || 1)),
        ...(r.usedEsncard ? { esnSold: FieldValue.increment(-(r.quantity || 1)) } : {}),
        ...(r.optionId ? { [`optionSold.${r.optionId}`]: FieldValue.increment(-(r.quantity || 1)) } : {}),
      });
      tx.update(reqRef, {
        status: "refunded",
        refundAmount: payout,
        reviewedBy: request.auth.uid,
        reviewedByName: request.auth.token.name || "",
        reviewedAt: FieldValue.serverTimestamp(),
        ...(note ? { reviewNote: String(note).slice(0, 300) } : {}),
      });
    });

    sendPushToUids([rq.uid], "tickets", "Refund approved 💸",
      `${fmtEur(payout)} for ${rq.eventTitle || "your event"} is on its way back to your card (a few business days).`,
      "/my-tickets").catch(() => {});
    if (rq.email) {
      try {
        const cfg = await getMailConfig();
        if (cfg) {
          const body = `Hi,\n\nGood news - your refund for ${rq.eventTitle || "your event"} was approved: ${fmtEur(payout)} is on its way back to your card. Banks usually take a few business days to show it.\n\nThe ticket itself is no longer valid.`;
          await queueAndSend(cfg, {
            to: rq.email,
            subject: `Refund approved - ${fmtEur(payout)} for ${rq.eventTitle || "your event"}`,
            text: body,
            html: templateEmailHtml(body, "My tickets", `${APP_URL}/my-tickets`),
            kind: "refundApproved", refId: requestId,
          });
        }
      } catch (err) { await logServerError("refundApprovedMail", err); }
    }
    return { ok: true, refunded: true, refundAmount: payout };
  }
);

// ------------------------------------------------------------
// Cancel a WHOLE event: mark it cancelled, refund every paid
// ticket IN FULL (no fee - ESN cancelled), cancel free ones.
// The event stays visible with a CANCELLED banner.
// board/finance/superadmin only.
// ------------------------------------------------------------
exports.cancelEventAndRefundAll = onCall(
  { secrets: [stripeSecretKey], timeoutSeconds: 540 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
    const role = adminSnap.exists ? (adminSnap.data().role || "superadmin") : null;
    if (!["board", "finance", "superadmin"].includes(role)) {
      throw new HttpsError("permission-denied", "Only board members can cancel an event.");
    }
    const { eventId, reason } = request.data || {};
    if (!eventId || typeof eventId !== "string") {
      throw new HttpsError("invalid-argument", "Missing event.");
    }
    const evRef = db.collection("events").doc(eventId);
    const evSnap = await evRef.get();
    if (!evSnap.exists) throw new HttpsError("not-found", "Event not found.");
    if (evSnap.data().cancelled) {
      throw new HttpsError("failed-precondition", "This event is already cancelled.");
    }

    // Mark cancelled FIRST so no new tickets can be bought while we refund.
    await evRef.update({
      cancelled: true,
      cancelReason: (reason || "").slice(0, 300),
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledBy: request.auth.uid,
      cancelledByName: request.auth.token.name || "",
    });

    const stripe = new Stripe(stripeSecretKey.value());
    const regsSnap = await db.collection("registrations").where("eventId", "==", eventId).get();

    let refunded = 0;
    let freeCancelled = 0;
    const failed = [];
    for (const d of regsSnap.docs) {
      const reg = d.data();
      try {
        if (reg.status === "paid") {
          if ((reg.amountTotal || 0) > 0) {
            let paymentIntent = reg.stripePaymentIntent || null;
            if (!paymentIntent && reg.stripeSessionId) {
              const session = await stripe.checkout.sessions.retrieve(reg.stripeSessionId);
              paymentIntent = session.payment_intent || null;
            }
            if (!paymentIntent) throw new Error("no Stripe payment found");
            // Full refund - the event was cancelled by ESN, so no fee.
            await stripe.refunds.create({ payment_intent: paymentIntent });
          }
          await d.ref.update({
            status: "refunded",
            refundRequested: FieldValue.delete(),
            refundedAt: FieldValue.serverTimestamp(),
            refundAmount: reg.amountTotal || 0,
            refundReason: "event cancelled",
          });
          refunded++;
        } else if (reg.status === "free") {
          await d.ref.update({ status: "cancelled", cancelledAt: FieldValue.serverTimestamp(), refundReason: "event cancelled" });
          freeCancelled++;
        }
        // 'pending' checkouts expire by themselves via the webhook.
      } catch (err) {
        await logServerError(`event-cancel refund reg ${d.id}`, err);
        failed.push({ id: d.id, email: reg.email || "", error: err.message });
      }
    }

    // Close any open refund requests for this event.
    const openReqs = await db.collection("refundRequests")
      .where("eventId", "==", eventId).get();
    for (const d of openReqs.docs) {
      if (d.data().status === "requested") {
        await d.ref.update({ status: "refunded", reviewNote: "event cancelled - refunded in full", reviewedAt: FieldValue.serverTimestamp() });
      }
    }

    // Tell everyone who had a ticket (paid or free).
    const affectedRegs = regsSnap.docs.map((d) => d.data())
      .filter((r) => ["paid", "free"].includes(r.status));
    sendPushToUids(affectedRegs.map((r) => r.uid), "tickets", `Cancelled: ${evSnap.data().title || "event"}`,
      `${reason ? String(reason).slice(0, 90) + " - " : ""}Paid tickets are refunded in full automatically.`,
      `/event/${eventId}`).catch(() => {});

    // E-mail everyone too (v0.99.12) - ENQUEUED ONLY: the 15-minute sweep
    // sends them in batches, so cancelling a 300-person event can't blow
    // through the mail host's hourly cap or this function's runtime.
    try {
      const cfg = await getMailConfig();
      if (cfg) {
        const title = evSnap.data().title || "your event";
        const when = fmtWhenBE(evSnap.data().start);
        let queued = 0;
        for (const r of affectedRegs) {
          if (!r.email) continue;
          const paid = r.status === "paid" && (r.amountTotal || 0) > 0;
          const body = `Hi ${(r.name || "").split(" ")[0] || "there"},\n\nWe're sorry - ${title}${when ? ` (${when})` : ""} has been cancelled.${reason ? `\n\nMessage from the board: "${String(reason).slice(0, 300)}"` : ""}\n\n${paid
            ? `Your payment of ${fmtEur(r.amountTotal)} is refunded in full automatically - no fee, nothing to do. Banks usually take a few business days to show it.`
            : "Your registration was cancelled automatically - nothing to do."}\n\nHope to see you at the next one!`;
          await queueMail({
            to: r.email,
            subject: `Cancelled: ${title}`,
            text: body,
            html: templateEmailHtml(body, "See what's coming up", `${APP_URL}/`),
            kind: "eventCancelled", refId: eventId,
          });
          queued++;
        }
        console.log(`event-cancel: queued ${queued} mails for ${eventId}`);
      }
    } catch (err) { await logServerError("eventCancelledMail", err); }

    return { refunded, freeCancelled, failed };
  }
);

// ------------------------------------------------------------
// ESNcard payment via Stripe Checkout - pays for an EXISTING
// application (esncardApplications/{uid}, status 'applied').
// Price follows the statutes: €15 student · €7.50 volunteer or
// alumni · free for board/AB/alumni coordinator (no checkout).
// ------------------------------------------------------------
exports.createEsncardCheckout = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to pay for your ESNcard.");
    }
    const uid = request.auth.uid;
    const m = await getMembership(uid);
    if (m.hasCard) {
      throw new HttpsError("already-exists", "You already have a verified ESNcard.");
    }
    const appRef = db.collection("esncardApplications").doc(uid);
    const appSnap = await appRef.get();
    if (!appSnap.exists) {
      throw new HttpsError("failed-precondition", "Apply for your ESNcard first - the form takes two minutes.");
    }
    const application = appSnap.data();
    if (application.status !== "applied") {
      throw new HttpsError("failed-precondition", "This application is already paid or processed.");
    }

    // Price: statutory defaults, overridable by finance/superadmin via
    // settings/esncard (server-side truth; ignore whatever the client sent).
    const cfgSnap = await db.collection("settings").doc("esncard").get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};
    const priceStudent = Number.isFinite(cfg.priceStudent) && cfg.priceStudent >= 0 ? cfg.priceStudent : 1500;
    const priceVolunteer = Number.isFinite(cfg.priceVolunteer) && cfg.priceVolunteer >= 0 ? cfg.priceVolunteer : 750;
    let amount = priceStudent;
    if (["superadmin", "board", "finance", "advisory", "alumnicoord"].includes(m.role)) amount = 0;
    else if (m.role === "volunteer" || m.isAlumni) amount = priceVolunteer;
    if (amount === 0) {
      throw new HttpsError("failed-precondition", "Your card is free as a team member - just pick it up at the ESN desk.");
    }

    const projectId = process.env.GCLOUD_PROJECT;
    const origin =
      request.rawRequest?.headers?.origin || `https://${projectId}.web.app`;
    const stripe = new Stripe(stripeSecretKey.value());

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: amount,
            product_data: {
              name: "ESNcard - membership card (12 months)",
              description: "Pick up your card during office hours at the ESN office.",
            },
          },
          quantity: 1,
        },
      ],
      customer_email: request.auth.token.email || undefined,
      metadata: { type: "esncard", appUid: uid },
      success_url: `${origin}/account`,
      cancel_url: `${origin}/account`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    });

    return { url: session.url };
  }
);

// ------------------------------------------------------------
// Decline an ESNcard application (board/finance/superadmin only).
// If it was paid ONLINE, the Stripe payment is refunded in full.
// Cash payments must be refunded by hand at the office.
// ------------------------------------------------------------
exports.declineEsncardApplication = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }
    // Server-side role check - the client is not trusted here.
    const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
    const role = adminSnap.exists ? (adminSnap.data().role || "superadmin") : null;
    if (!["board", "superadmin", "finance"].includes(role)) {
      throw new HttpsError("permission-denied", "Only board members can decline applications.");
    }
    const { uid, reason } = request.data || {};
    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "Missing application.");
    }
    const appRef = db.collection("esncardApplications").doc(uid);
    const appSnap = await appRef.get();
    if (!appSnap.exists) throw new HttpsError("not-found", "Application not found.");
    const a = appSnap.data();
    if (!["applied", "paid"].includes(a.status)) {
      throw new HttpsError("failed-precondition", "This application is already processed.");
    }

    let refunded = false;
    if (a.status === "paid" && a.paidOnline && a.stripePaymentIntent) {
      const stripe = new Stripe(stripeSecretKey.value());
      await stripe.refunds.create({ payment_intent: a.stripePaymentIntent });
      refunded = true;
    }

    await appRef.update({
      status: "rejected",
      declineReason: (reason || "").slice(0, 300),
      declinedBy: request.auth.uid,
      declinedByName: request.auth.token.name || "",
      declinedAt: FieldValue.serverTimestamp(),
      refunded,
    });
    return { refunded, paidCash: a.status === "paid" && !a.paidOnline };
  }
);

// ------------------------------------------------------------
// Merch purchase via Stripe Checkout (pickup only)
// ------------------------------------------------------------
// Reserve & pay at pickup (v0.140) - the cash-friendly path the product page
// always promised. Creates a "requested" order (no Stripe): the student shows
// the order QR at office hours, pays cash there, staff taps "Mark paid".
// Reservations don't hard-hold stock (they can no-show) - but a sold-out
// item can't be reserved, and it's one open reservation per product per person.
exports.reserveMerchOrder = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const { productId, variantId, quantity: qRaw } = request.data || {};
  const quantity = Math.max(1, Math.min(10, parseInt(qRaw, 10) || 1));
  if (!productId) throw new HttpsError("invalid-argument", "Missing product.");
  const pSnap = await db.collection("products").doc(String(productId)).get();
  if (!pSnap.exists) throw new HttpsError("not-found", "Product not found.");
  const product = pSnap.data();
  if (!product.published) throw new HttpsError("failed-precondition", "This product is not for sale.");
  let variant = null;
  if (Array.isArray(product.variants) && product.variants.length) {
    variant = product.variants.find((v) => v.id === variantId);
    if (!variant) throw new HttpsError("invalid-argument", "Please choose an option.");
  }
  if (variant && variant.stock) {
    const sold = (product.variantSold && product.variantSold[variant.id]) || 0;
    if (sold + quantity > variant.stock) throw new HttpsError("resource-exhausted", `"${variant.name}" is sold out.`);
  } else if (!variant && product.stock) {
    if ((product.sold || 0) + quantity > product.stock) throw new HttpsError("resource-exhausted", "This item is sold out.");
  }
  const open = await db.collection("merchOrders")
    .where("uid", "==", request.auth.uid).where("productId", "==", String(productId)).get();
  if (open.docs.some((d) => d.data().status === "requested")) {
    throw new HttpsError("already-exists", "You already have an open reservation for this item - it's in My tickets.");
  }
  const profSnap = await db.collection("users").doc(request.auth.uid).get();
  const isMember = profSnap.exists && profileHasCard(profSnap.data(), await acceptAvailableCards());
  const base = variant && variant.price != null ? variant.price : product.price;
  const member = variant && variant.price != null ? variant.priceEsn : product.priceEsn;
  const unit = isMember && typeof member === "number" ? member : base;
  if (!unit || unit <= 0) throw new HttpsError("failed-precondition", "This item can't be reserved.");
  const orderRef = db.collection("merchOrders").doc();
  await orderRef.set({
    uid: request.auth.uid,
    name: request.auth.token.name || "",
    email: request.auth.token.email || "",
    productId: String(productId),
    productName: product.name || "",
    variantId: variant ? variant.id : null,
    variantName: variant ? variant.name : null,
    quantity,
    amountTotal: unit * quantity,
    currency: product.currency || "eur",
    status: "requested",
    usedEsncard: isMember,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { orderId: orderRef.id, amount: unit * quantity };
});

exports.createMerchCheckout = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to order.");
    }
    const { productId, variantId } = request.data || {};
    const quantity = Math.floor(Number(request.data?.quantity)) || 1;
    if (!productId || typeof productId !== "string" || quantity < 1 || quantity > MAX_QTY) {
      throw new HttpsError("invalid-argument", "Invalid product or quantity.");
    }

    const snap = await db.collection("products").doc(productId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Product not found.");
    const product = snap.data();
    if (!product.published) {
      throw new HttpsError("failed-precondition", "This product is not for sale.");
    }

    let variant = null;
    if (Array.isArray(product.variants) && product.variants.length) {
      variant = product.variants.find((v) => v.id === variantId);
      if (!variant) throw new HttpsError("invalid-argument", "Please choose an option.");
    }

    const profSnap = await db.collection("users").doc(request.auth.uid).get();
    const isMember = profSnap.exists && profileHasCard(profSnap.data(), await acceptAvailableCards());
    const base = variant && variant.price != null ? variant.price : product.price;
    const member = variant && variant.price != null ? variant.priceEsn : product.priceEsn;
    const unit = isMember && typeof member === "number" ? member : base;
    if (!unit || unit <= 0) {
      throw new HttpsError("failed-precondition", "This item can't be bought online.");
    }

    // Stock (per variant or per product), counted from confirmed sales
    if (variant && variant.stock) {
      const sold = (product.variantSold && product.variantSold[variant.id]) || 0;
      if (sold + quantity > variant.stock) {
        throw new HttpsError("resource-exhausted", `"${variant.name}" is sold out.`);
      }
    } else if (!variant && product.stock) {
      if ((product.sold || 0) + quantity > product.stock) {
        throw new HttpsError("resource-exhausted", "This item is sold out.");
      }
    }

    const projectId = process.env.GCLOUD_PROJECT;
    const origin =
      request.rawRequest?.headers?.origin || `https://${projectId}.web.app`;
    const stripe = new Stripe(stripeSecretKey.value());

    const orderRef = db.collection("merchOrders").doc();
    await orderRef.set({
      uid: request.auth.uid,
      name: request.auth.token.name || "",
      email: request.auth.token.email || "",
      productId,
      productName: product.name || "",
      variantId: variant ? variant.id : null,
      variantName: variant ? variant.name : null,
      quantity,
      amountTotal: unit * quantity,
      currency: product.currency || "eur",
      status: "pending",
      usedEsncard: isMember,
      createdAt: FieldValue.serverTimestamp(),
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: product.currency || "eur",
            unit_amount: unit,
            product_data: {
              name: `${product.name}${variant ? ` - ${variant.name}` : ""}`,
              description: "Pickup during office hours at the ESN office.",
            },
          },
          quantity,
        },
      ],
      customer_email: request.auth.token.email || undefined,
      metadata: { type: "merch", orderId: orderRef.id, uid: request.auth.uid },
      success_url: `${origin}/my-tickets`,
      cancel_url: `${origin}/product/${productId}`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    });

    // Store the session URL too (v0.130) so My tickets can offer a
    // real "Pay" button on an unfinished merch checkout, like tickets do.
    await orderRef.update({ stripeSessionId: session.id, stripeSessionUrl: session.url });
    return { url: session.url };
  }
);

// ------------------------------------------------------------
// Stripe webhook - confirms payments, cleans up expired checkouts
// ------------------------------------------------------------
exports.stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    const stripe = new Stripe(stripeSecretKey.value());

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers["stripe-signature"],
        stripeWebhookSecret.value()
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      if (stripeEvent.type === "checkout.session.completed") {
        const session = stripeEvent.data.object;
        const meta = session.metadata || {};
        if (meta.type === "esncard" && meta.appUid) {
          // Mark the application as paid (idempotent) - the board then
          // assigns the physical card number, which activates membership.
          const appRef = db.collection("esncardApplications").doc(meta.appUid);
          await db.runTransaction(async (tx) => {
            const aSnap = await tx.get(appRef);
            if (!aSnap.exists || aSnap.data().status !== "applied") return;
            tx.update(appRef, {
              status: "paid",
              paidAt: FieldValue.serverTimestamp(),
              paidOnline: true,
              amountPaid: session.amount_total ?? null,
              stripePaymentIntent: session.payment_intent || null,
            });
          });
        } else if (meta.type === "merch" && meta.orderId) {
          const orderRef = db.collection("merchOrders").doc(meta.orderId);
          let paidOrder = null;
          await db.runTransaction(async (tx) => {
            const oSnap = await tx.get(orderRef);
            if (!oSnap.exists || oSnap.data().status === "paid") return;
            const o = oSnap.data();
            paidOrder = o;
            tx.update(orderRef, { status: "paid", paidAt: FieldValue.serverTimestamp() });
            tx.update(db.collection("products").doc(o.productId), {
              sold: FieldValue.increment(o.quantity || 1),
              ...(o.variantId ? { [`variantSold.${o.variantId}`]: FieldValue.increment(o.quantity || 1) } : {}),
            });
          });
          if (paidOrder) {
            sendPushToUids([paidOrder.uid], "tickets", "Order paid ✅",
              `${paidOrder.productName || "Your order"} - pick it up during office hours (order QR in the app).`,
              "/my-tickets").catch(() => {});
          }
        } else if (meta.registrationId) {
          const regRef = db.collection("registrations").doc(meta.registrationId);
          let confirmedReg = null;
          await db.runTransaction(async (tx) => {
            const regSnap = await tx.get(regRef);
            if (!regSnap.exists) return;
            const reg = regSnap.data();
            if (reg.status === "paid") return; // idempotent
            confirmedReg = reg;
            tx.update(regRef, {
              status: "paid",
              amountTotal: session.amount_total ?? reg.amountTotal,
              paidAt: FieldValue.serverTimestamp(),
              stripePaymentIntent: session.payment_intent || null,
            });
            tx.update(db.collection("events").doc(reg.eventId), {
              ticketsSold: FieldValue.increment(reg.quantity || 1),
              ...(reg.usedEsncard ? { esnSold: FieldValue.increment(reg.quantity || 1) } : {}),
              ...(reg.optionId ? { [`optionSold.${reg.optionId}`]: FieldValue.increment(reg.quantity || 1) } : {}),
              // The pending hold becomes a real sale - release it.
              ...(reg.holdsClaimed ? { pendingHold: FieldValue.increment(-(reg.quantity || 1)) } : {}),
              ...(reg.holdsClaimed && reg.heldEsn ? { pendingEsnHold: FieldValue.increment(-(reg.quantity || 1)) } : {}),
              ...(reg.holdsClaimed && reg.heldOptionId ? { [`pendingOptionHold.${reg.heldOptionId}`]: FieldValue.increment(-(reg.quantity || 1)) } : {}),
            });
          });
          if (confirmedReg) {
            if (confirmedReg.eventId) await clearWaitlistFor(confirmedReg.eventId, confirmedReg.uid);
            sendPushToUids([confirmedReg.uid], "tickets", "Ticket confirmed 🎉",
              `${confirmedReg.eventTitle || "Your event"} - your ticket is in the app. See you there!`,
              "/my-tickets").catch(() => {});
          }
        }
      } else if (stripeEvent.type === "checkout.session.expired") {
        const session = stripeEvent.data.object;
        const meta = session.metadata || {};
        if (meta.type === "esncard") {
          // nothing to clean up - the application simply stays 'applied'
        } else if (meta.type === "merch" && meta.orderId) {
          const orderRef = db.collection("merchOrders").doc(meta.orderId);
          const snap = await orderRef.get();
          if (snap.exists && snap.data().status === "pending") await orderRef.delete();
        } else if (meta.registrationId) {
          // Expired checkout: delete the pending registration AND give its
          // held capacity back (transactional, double-release-safe).
          await releasePendingRegistration(db.collection("registrations").doc(meta.registrationId));
        }
      }
    } catch (err) {
      await logServerError("stripe webhook", err);
      res.status(500).send("Internal error");
      return;
    }

    res.status(200).send("ok");
  }
);

// ============================================================
// Google Calendar sync - SERVER-SIDE (v1.22).
// No more sign-in popups: the functions' own service account
// writes to the calendars. One-time setup:
//   1. Enable the "Google Calendar API" in the GCP project.
//   2. Share BOTH calendars (public + board) with the functions'
//      service account e-mail, permission "Make changes to events".
//   3. Click "Sync calendar" once in the admin dashboard - that
//      stores the calendar IDs in settings/calendar and resyncs.
// From then on every event/meeting create, edit, publish,
// cancel or delete syncs automatically via Firestore triggers.
// ============================================================
const calAuth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/calendar"] });

async function calFetch(method, calId, path, body) {
  const client = await calAuth.getClient();
  const { token } = await client.getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}${path}`,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  if (res.status === 404 || res.status === 410) return null; // gone/deleted by hand
  if (!res.ok) throw new Error(`Calendar API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? {} : await res.json();
}

async function calendarIds() {
  const snap = await db.collection("settings").doc("calendar").get();
  return snap.exists ? snap.data() : {};
}

// crude markdown → plain text for calendar descriptions
const mdPlain = (s) => String(s || "")
  .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1 ($2)")
  .replace(/[*_#`]/g, "");

// ------------------------------------------------------------
// UGent DSA activity sync (v0.110) - dsa.ugent.be/api/spec.
// Published events are pushed automatically (create → POST, edit → PUT,
// unpublish/cancel/delete/toggle-off → DELETE). Per-event opt-out via
// events.dsaSync === false; global switch + association abbreviation in
// settings/dsa. The DSA activity id is stored on OUR event doc
// (dsaActivityId) - the API's sync_data field isn't writable on create.
// Auth: raw API key in the Authorization header (per the spec).
// ------------------------------------------------------------
async function getDsaConfig() {
  try {
    const s = await db.collection("settings").doc("dsa").get();
    if (!s.exists) return null;
    const d = s.data();
    if (d.enabled === false || !d.association) return null;
    return { association: String(d.association).trim() };
  } catch { return null; }
}
// DSA's examples use naive Belgian local time ("2025-03-30 15:30:00") -
// sv-SE locale prints exactly yyyy-MM-dd HH:mm:ss.
const dsaTime = (ms) => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
}).format(new Date(ms)).replace("T", " ");
async function dsaFetch(method, path, body) {
  const res = await fetch(`https://dsa.ugent.be${path}`, {
    method,
    headers: { "Authorization": dsaApiKey.value(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`DSA ${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json().catch(() => null);
}
// Which events belong on DSA: published, not cancelled, and not opted out.
// Office hours and team events (board meetings & co) are INCLUDED by default
// since v0.112 - the university wants those registered too. The per-event
// "Publish on DSA" checkbox (dsaSync:false) is the only opt-out.
const dsaWanted = (ev) => !!ev && ev.published === true && !ev.cancelled && ev.dsaSync !== false;
// DSA "terrain" enum - API tokens per the spec ("public, ugent, augent,
// home, online, abroad or other"); the Dutch names (Openbaar domein…) are
// only the UI labels. Default "other" (= Andere: private venues like bars);
// per-event override via the form's dsaTerrain select.
const DSA_TERRAINS = ["public", "ugent", "augent", "home", "online", "abroad", "other"];
// DSA "Type activiteit" dropdown (dsa.ugent.be panel, confirmed 25/08).
const DSA_TYPES = ["BBQ", "Horeca", "Cantus", "Doop", "Vergadering", "Lezing", "Cultuur", "Sport", "Feest", "Onderwijs", "Permanentie", "Andere"];
// Type comes from the event's TAGS: the first tag with a dsaType link
// (Settings → Event tags) wins. Fallbacks: office hours → Permanentie
// (= staffed walk-in hours), everything else → Andere.
async function dsaTypeForEvent(ev) {
  try {
    const ids = Array.isArray(ev.tagIds) ? ev.tagIds.slice(0, 10) : [];
    if (ids.length) {
      const snaps = await db.getAll(...ids.map((id) => db.collection("eventTags").doc(id)));
      for (const id of ids) { // event's tag ORDER decides, not getAll's
        const s = snaps.find((x) => x.id === id);
        const t = s && s.exists ? s.data().dsaType : null;
        if (t && DSA_TYPES.includes(t)) return t;
      }
    }
  } catch { /* mapping is best-effort - fall through */ }
  return ev.officeHours ? "Permanentie" : "Andere";
}
function dsaBody(eventId, ev, association, dsaType) {
  const startMs = ev.start.toMillis();
  const endMs = ev.end?.toMillis ? ev.end.toMillis() : startMs + 3 * 3600 * 1000;
  const desc = mdPlain(ev.description).slice(0, 2000) || ev.title || "ESN Gent activity";
  return {
    association,
    // NOTE: the API's Activity schema has NO english_title/english_description
    // fields (they were silently ignored) - the panel's "Engelse" fields can't
    // be filled via this API. Our (English) text lands in title/description.
    title: ev.title || "ESN Gent event",
    description: desc,
    location: ev.location || "Ghent",
    address: ev.location || null,
    start_time: dsaTime(startMs),
    end_time: dsaTime(Math.max(endMs, startMs + 15 * 60 * 1000)),
    // Team-audience events (board meeting, alumni quiz…) are registered as
    // NON-public activities - they're members-only, not open to any student.
    // Public per DSA's definition: announced publicly, access may be limited
    // to members/registrations. Team events (board meeting, teambuilding…)
    // are invitation-only → private (only visible to board/konvent/DSA,
    // don't count toward the 10 required activities, not subsidisable).
    public: !(Array.isArray(ev.audience) && ev.audience.length),
    terrain: DSA_TERRAINS.includes(ev.dsaTerrain) ? ev.dsaTerrain : "other",
    type: DSA_TYPES.includes(dsaType) ? dsaType : "Andere",
    infolink: `${APP_URL}/event/${eventId}`,
  };
}
// Bring ONE event in line with DSA (create / update / remove). docRef may be
// null for deleted events (then only before.dsaActivityId matters).
async function syncEventToDsa(eventId, docRef, before, after) {
  const cfg = await getDsaConfig();
  if (!cfg) return null;
  if (!dsaWanted(after)) {
    const gone = after?.dsaActivityId || (!after ? before?.dsaActivityId : null);
    if (gone) {
      await dsaFetch("DELETE", `/api/activiteiten/${gone}`).catch(() => { /* already gone */ });
      if (docRef && after?.dsaActivityId) await docRef.update({ dsaActivityId: FieldValue.delete() });
      return "removed";
    }
    return null;
  }
  // DSA rejects create/update once the activity has started - 422
  // "start_time: Too late" (seen 25/08 editing a running event). Skip and
  // leave the DSA entry as last pushed; nothing to log, it's by design.
  if (after.start?.toMillis && after.start.toMillis() <= Date.now()) return null;
  const body = dsaBody(eventId, after, cfg.association, await dsaTypeForEvent(after));
  if (after.dsaActivityId) {
    await dsaFetch("PUT", `/api/activiteiten/${after.dsaActivityId}`, body);
    return "updated";
  }
  const created = await dsaFetch("POST", "/api/activiteiten", body);
  if (created?.id && docRef) await docRef.update({ dsaActivityId: created.id });
  return "created";
}
// Only re-sync when DSA-relevant content changed (also stops the trigger
// from looping on its own dsaActivityId write-back - id is NOT included).
const dsaFingerprint = (d) => d && JSON.stringify({
  t: d.title, de: d.description, l: d.location,
  s: d.start?.toMillis ? d.start.toMillis() : null,
  e: d.end?.toMillis ? d.end.toMillis() : null,
  p: !!d.published, c: !!d.cancelled, ds: d.dsaSync !== false,
  tr: d.dsaTerrain || "",
  // Tags decide the DSA TYPE since v0.114 - without this key a tag change
  // never re-synced (the "update didn't come through" bug, 25/08).
  tg: Array.isArray(d.tagIds) ? d.tagIds.join(",") : "",
  au: Array.isArray(d.audience) ? d.audience.join(",") : "",
});

// Board view of the association's UGent room reservations (v0.111) -
// GET /api/zaalreservaties, proxied server-side so the API key never
// reaches the browser. Rooms are requested on the DSA site itself; this
// only READS the current state (approved / pending) for the board page.
exports.dsaReservations = onCall({ secrets: [dsaApiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
  const role = adminSnap.exists ? (adminSnap.data().role || "superadmin") : null;
  if (!["board", "superadmin", "finance", "advisory"].includes(role)) {
    throw new HttpsError("permission-denied", "Board only.");
  }
  // Association from settings/dsa - works even while the event sync is off.
  let assoc = "esn";
  try {
    const s = await db.collection("settings").doc("dsa").get();
    if (s.exists && s.data().association) assoc = String(s.data().association).trim();
  } catch { /* default stands */ }
  const res = await dsaFetch("GET", `/api/zaalreservaties?association=${encodeURIComponent(assoc)}&page_size=100`);
  return { entries: res?.page?.entries || [], total: res?.page?.total_entries || 0, association: assoc };
});

// Manual backfill / repair (admin Settings button) - board only.
exports.dsaResyncAll = onCall({ secrets: [dsaApiKey], timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
  const role = adminSnap.exists ? (adminSnap.data().role || "superadmin") : null;
  if (!["board", "superadmin", "finance"].includes(role)) {
    throw new HttpsError("permission-denied", "Board only.");
  }
  const cfg = await getDsaConfig();
  if (!cfg) {
    throw new HttpsError("failed-precondition", "DSA sync is switched off or the association abbreviation isn't saved yet (Admin → Settings → DSA).");
  }
  const snap = await db.collection("events")
    .where("published", "==", true)
    .where("start", ">=", new Date(Date.now() - 24 * 3600 * 1000))
    .get();
  let synced = 0, removed = 0;
  const failed = [];
  for (const d of snap.docs) {
    try {
      const r = await syncEventToDsa(d.id, d.ref, null, d.data());
      if (r === "removed") removed++;
      else if (r) synced++;
    } catch (err) { failed.push({ id: d.id, title: d.data().title || "", error: err.message }); }
  }
  return { synced, removed, failed };
});

// ---- Board meetings → DSA (v0.113) ----
// The board-meeting planner lives OUTSIDE the events collection, so the event
// sync never saw it. DSA wants meetings announced too (≥72 h, insurance):
// pushed as a PRIVATE "Vergadering" - visible only to board/konvent/DSA,
// not counted toward the 10 required activities. Standard on; the plan-form
// checkbox / meeting-page DSA button set dsaSync:false to keep one off.
const dsaMeetingFingerprint = (d) => d && JSON.stringify({
  t: d.title || "", s: d.start?.toMillis ? d.start.toMillis() : null,
  l: d.location || "", ds: d.dsaSync !== false,
});
// (Separate function from onBoardMeetingWrite - that one does the board
// Google Calendar and early-returns when no calendar is configured.)
exports.onBoardMeetingDsa = onDocumentWritten({ document: "boardMeetings/{meetingId}", secrets: [dsaApiKey] }, async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  // Fingerprint excludes dsaActivityId → our own id write-back can't loop.
  if (before && after && dsaMeetingFingerprint(before) === dsaMeetingFingerprint(after)) return;
  try {
    const cfg = await getDsaConfig();
    if (!cfg) return;
    const ref = event.data.after.exists ? event.data.after.ref : null;
    const wanted = !!after && after.dsaSync !== false && !!(after.start && after.start.toMillis);
    if (!wanted) {
      const gone = after?.dsaActivityId || (!after ? before?.dsaActivityId : null);
      if (gone) {
        await dsaFetch("DELETE", `/api/activiteiten/${gone}`).catch(() => { /* already gone */ });
        if (ref && after?.dsaActivityId) await ref.update({ dsaActivityId: FieldValue.delete() });
      }
      return;
    }
    const startMs = after.start.toMillis();
    // Same "Too late" rule as events: DSA locks activities once started.
    if (startMs <= Date.now()) return;
    const body = {
      association: cfg.association,
      title: after.title || "Board meeting",
      description: "Internal board meeting of ESN Gent.",
      location: after.location || "Ghent",
      address: after.location || null,
      start_time: dsaTime(startMs),
      end_time: dsaTime(startMs + 3 * 3600 * 1000),
      public: false, // invitation-only → private activity
      terrain: /therminal/i.test(after.location || "") ? "ugent" : "other",
      type: "Vergadering",
      infolink: `${APP_URL}/board`,
    };
    if (after.dsaActivityId) {
      await dsaFetch("PUT", `/api/activiteiten/${after.dsaActivityId}`, body);
    } else {
      const created = await dsaFetch("POST", "/api/activiteiten", body);
      if (created?.id && ref) await ref.update({ dsaActivityId: created.id });
    }
  } catch (err) { await logServerError(`dsa meeting ${event.params.meetingId}`, err); }
});

function gcalBodyForEvent(id, ev) {
  const soldOut = !!(ev.capacity && (ev.ticketsSold || 0) >= ev.capacity) && !ev.cancelled;
  const start = ev.start.toDate();
  const end = ev.end ? ev.end.toDate() : new Date(start.getTime() + 2 * 3600 * 1000);
  return {
    summary: (ev.cancelled ? "[CANCELLED] " : soldOut ? "[SOLD OUT] " : "") + (ev.title || "ESN Gent event"),
    location: ev.location || "",
    description:
      (ev.cancelled ? `❌ This event has been CANCELLED.${ev.cancelReason ? " " + ev.cancelReason : ""}\n\n` : soldOut ? "⚠️ This event is SOLD OUT.\n\n" : "") +
      (ev.description ? mdPlain(ev.description) + "\n\n" : "") +
      `🎟️ Info & registration: ${APP_URL}/event/${id}`,
    start: { dateTime: start.toISOString(), timeZone: "Europe/Brussels" },
    end: { dateTime: end.toISOString(), timeZone: "Europe/Brussels" },
  };
}

// Upsert; returns the google event id (recreates if deleted by hand).
async function calUpsert(calId, docRef, currentGid, body) {
  if (currentGid) {
    const patched = await calFetch("PATCH", calId, `/events/${currentGid}`, body);
    if (patched) return currentGid;
  }
  const created = await calFetch("POST", calId, "/events", body);
  const gid = created?.id || null;
  if (gid && gid !== currentGid) await docRef.update({ googleEventId: gid });
  return gid;
}

// Only re-sync when calendar-RELEVANT content changed - this also stops
// the trigger from looping on its own googleEventId write-back.
const eventCalFingerprint = (d) => d && JSON.stringify({
  t: d.title, de: d.description, l: d.location,
  s: d.start?.toMillis ? d.start.toMillis() : null,
  e: d.end?.toMillis ? d.end.toMillis() : null,
  p: !!d.published, c: !!d.cancelled,
  cs: d.calSync !== false, // per-event calendar switch (v0.125)
  so: !!(d.capacity && (d.ticketsSold || 0) >= d.capacity),
  au: Array.isArray(d.audience) ? d.audience.join(",") : "", // team events (un)restricted → resync
});

exports.onEventWrite = onDocumentWritten(
  { document: "events/{eventId}", secrets: [dsaApiKey] },
  async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;

  // ---- push notifications (independent of the calendar setup) ----
  if (after) {
    try {
      // Freshly published (and not an office-hours session) → tell everyone.
      const becamePublished = (!before || !before.published) && after.published && !after.cancelled;
      const teamAudience = Array.isArray(after.audience) && after.audience.length > 0;
      if (becamePublished && !after.officeHours && !teamAudience && after.start && after.start.toMillis() > Date.now()) {
        const when = new Date(after.start.toMillis()).toLocaleDateString("en-GB",
          { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Brussels" });
        await broadcastPush("newEvents", `New event: ${after.title || ""}`,
          `${when}${after.location ? " · " + after.location : ""} - registration is open!`,
          `/event/${event.params.eventId}`);
      }
      // Sold-out → spot freed: offer it to the FIRST waitlist person (24h hold).
      const wasFull = before && before.capacity && (before.ticketsSold || 0) >= before.capacity;
      const nowFree = after.capacity && (after.ticketsSold || 0) < after.capacity;
      if (wasFull && nowFree && after.published && !after.cancelled) {
        await promoteWaitlist(event.params.eventId);
      }
    } catch (err) { await logServerError("event push", err); }
  }

  // ---- UGent DSA sync (v0.110) - before the calendar block, which can
  // early-return when no calendar is configured ----
  try {
    if (!after) {
      await syncEventToDsa(event.params.eventId, null, before, null); // deleted → remove from DSA
    } else if (!before || dsaFingerprint(before) !== dsaFingerprint(after)) {
      await syncEventToDsa(event.params.eventId, event.data.after.ref, before, after);
    }
  } catch (err) { await logServerError(`dsa sync ${event.params.eventId}`, err); }

  // ---- Google Calendar sync ----
  const { publicCalendarId } = await calendarIds();
  if (!publicCalendarId) return; // not set up yet - click "Sync calendar" once
  try {
    if (!after) { // event deleted
      if (before?.googleEventId) await calFetch("DELETE", publicCalendarId, `/events/${before.googleEventId}`).catch(() => {});
      return;
    }
    if (before && eventCalFingerprint(before) === eventCalFingerprint(after)) return;
    // Drafts, team-audience events AND per-event opt-outs (calSync:false,
    // v0.125) stay off the public Google Calendar.
    if (!after.published || after.calSync === false || (Array.isArray(after.audience) && after.audience.length)) {
      if (after.googleEventId) {
        await calFetch("DELETE", publicCalendarId, `/events/${after.googleEventId}`).catch(() => {});
        await event.data.after.ref.update({ googleEventId: FieldValue.delete() });
      }
      return;
    }
    await calUpsert(publicCalendarId, event.data.after.ref, after.googleEventId || null,
      gcalBodyForEvent(event.params.eventId, after));
  } catch (err) {
    await logServerError(`calendar event ${event.params.eventId}`, err);
  }
});

const meetingCalFingerprint = (d) => d && JSON.stringify({
  t: d.title, l: d.location,
  s: d.start?.toMillis ? d.start.toMillis() : null,
  r: d.calResyncAt?.toMillis ? d.calResyncAt.toMillis() : 0, // manual re-sync nudge
});

exports.onBoardMeetingWrite = onDocumentWritten("boardMeetings/{meetingId}", async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const { boardCalendarId } = await calendarIds();
  if (!boardCalendarId) return;
  try {
    if (!after) {
      if (before?.googleEventId) await calFetch("DELETE", boardCalendarId, `/events/${before.googleEventId}`).catch(() => {});
      return;
    }
    if (before && meetingCalFingerprint(before) === meetingCalFingerprint(after)) return;
    const start = after.start.toDate();
    const end = new Date(start.getTime() + 2 * 3600 * 1000);
    await calUpsert(boardCalendarId, event.data.after.ref, after.googleEventId || null, {
      summary: after.title || "Board meeting",
      location: after.location || "",
      description: `Board meeting - minutes & agenda in the ESN Gent App: ${APP_URL}/board`,
      start: { dateTime: start.toISOString(), timeZone: "Europe/Brussels" },
      end: { dateTime: end.toISOString(), timeZone: "Europe/Brussels" },
    });
  } catch (err) {
    await logServerError(`calendar meeting ${event.params.meetingId}`, err);
  }
});

// Manual full resync (the admin "Sync calendar" button) - board only.
exports.syncCalendarAll = onCall({ timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
  const role = adminSnap.exists ? (adminSnap.data().role || "superadmin") : null;
  if (!["board", "superadmin", "finance"].includes(role)) {
    throw new HttpsError("permission-denied", "Board only.");
  }
  const { publicCalendarId } = await calendarIds();
  if (!publicCalendarId) {
    throw new HttpsError("failed-precondition", "Calendar IDs not stored yet - the app saves them when you click Sync.");
  }
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const snap = await db.collection("events")
    .where("published", "==", true).where("start", ">=", cutoff).get();
  let synced = 0;
  const failed = [];
  for (const d of snap.docs) {
    try {
      const ed = d.data();
      if (ed.calSync === false || (Array.isArray(ed.audience) && ed.audience.length)) { // opted-out & team events never sync
        if (ed.googleEventId) {
          await calFetch("DELETE", publicCalendarId, `/events/${ed.googleEventId}`).catch(() => {});
          await d.ref.update({ googleEventId: FieldValue.delete() });
        }
        continue;
      }
      await calUpsert(publicCalendarId, d.ref, ed.googleEventId || null, gcalBodyForEvent(d.id, ed));
      synced++;
    } catch (err) { failed.push({ id: d.id, title: d.data().title || "", error: err.message }); }
  }
  return { synced, failed };
});

// ============================================================
// BETA ONLY - wipe all test data for a fresh testing round.
// Superadmin only. Keeps: accounts (users), team roles (admins),
// settings, event tags and shop products. Clears the ESNcard
// status on user profiles (applications are wiped).
// >>> REMOVE this function before the real launch. <<<
// ============================================================
exports.betaResetData = onCall({ timeoutSeconds: 540 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
  const role = adminSnap.exists ? (adminSnap.data().role || "superadmin") : null;
  if (role !== "superadmin") {
    throw new HttpsError("permission-denied", "Only the superadmin can reset beta data.");
  }
  if (request.data?.confirm !== "RESET") {
    throw new HttpsError("failed-precondition", "Missing confirmation.");
  }

  // Everything TRANSACTIONAL from the beta is wiped (v0.139 - kept current
  // with every collection added since v0.9x). Deliberately KEPT: users &
  // logins, admins (roles), settings, eventTags, venues, partners, products,
  // news, codexSongs, shiftTemplates, friendships, pushTokens - accounts,
  // configuration and content survive; transactions don't.
  const wipe = [
    "events", "registrations", "waitlist", "feedback",
    "shifts", "shiftSignups", "refundRequests",
    "merchOrders", "esncardApplications", "applicationProofs",
    "boardMeetings", "boardTodos", "reimbursements", "reimbursementReceipts",
    "userHistory", "esncardOrders", "cashCounts", "auditLog",
    "mailQueue", "errorLog", "adminNotes",
  ];
  // Storage: proof-of-exchange files + images of (deleted) events. Product,
  // news, partner and venue images stay - those collections stay.
  try { await getAdminStorage().bucket().deleteFiles({ prefix: "proofs/" }); } catch { /* none */ }
  try { await getAdminStorage().bucket().deleteFiles({ prefix: "images/events/" }); } catch { /* none */ }
  const counts = {};
  // Contact messages carry a "replies" SUBCOLLECTION - deleting the parent
  // doc alone would strand those, so they go doc by doc.
  {
    let n = 0;
    for (;;) {
      const snap = await db.collection("contactMessages").limit(100).get();
      if (snap.empty) break;
      for (const d of snap.docs) {
        const replies = await d.ref.collection("replies").get();
        const batch = db.batch();
        replies.docs.forEach((r) => batch.delete(r.ref));
        batch.delete(d.ref);
        await batch.commit();
        n++;
      }
    }
    counts.contactMessages = n;
  }
  for (const col of wipe) {
    let n = 0;
    // Batched deletes, 400 at a time, until the collection is empty.
    for (;;) {
      const snap = await db.collection(col).limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      n += snap.size;
    }
    counts[col] = n;
  }

  // Profiles stay, but everything DERIVED from wiped data is cleared:
  // card link & status, passport XP/level, this-year birthday marker.
  // Roles, notification prefs, bucketlist ticks and profile details stay.
  let usersReset = 0;
  const usersSnap = await db.collection("users").get();
  for (const d of usersSnap.docs) {
    const u = d.data();
    if (u.esncardVerified !== undefined || u.esncardCode || u.esncardStatus || u.esncardExpiresAt
      || u.passportXp || u.passportLevel || u.birthdayWishedYear) {
      await d.ref.update({
        esncardVerified: FieldValue.delete(), esncardCode: FieldValue.delete(),
        esncardExpiresAt: FieldValue.delete(), esncardActivatedAt: FieldValue.delete(),
        esncardStatus: FieldValue.delete(), esncardSection: FieldValue.delete(),
        esncardTid: FieldValue.delete(),
        passportXp: FieldValue.delete(), passportLevel: FieldValue.delete(),
        birthdayWishedYear: FieldValue.delete(),
      });
      usersReset++;
    }
  }

  console.log(`BETA RESET by ${request.auth.uid}:`, counts, `users reset: ${usersReset}`);
  return { counts, usersReset };
});

// ============================================================
// Push notifications (v0.81) - FCM web push, data-only messages
// (our service worker renders them). Tokens live in pushTokens/
// {token} → {uid}; per-user category preferences in
// users/{uid}.notifyPrefs - a category is ON unless explicitly
// set to false. All sends are fire-and-forget: a push failure
// must never break a payment or admin action.
// Categories: tickets · reminders · newEvents · waitlist ·
//             esncard · shifts
// ============================================================
async function pushDeliver(tokens, { title, body, link, category }) {
  if (!tokens.length) return;
  const base = {
    data: {
      title: String(title || "ESN Gent"),
      body: String(body || ""),
      link: String(link || "/"),
      category: String(category || ""),
    },
    webpush: { headers: { Urgency: "high", TTL: "86400" } },
  };
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    try {
      const res = await getMessaging().sendEachForMulticast({ tokens: chunk, ...base });
      res.responses.forEach((r, j) => {
        const code = r.error?.code || "";
        if (!r.success && (code.includes("registration-token-not-registered") || code.includes("invalid"))) {
          db.collection("pushTokens").doc(chunk[j]).delete().catch(() => {});
        }
      });
    } catch (err) { await logServerError("push deliver", err); }
  }
}

async function prefsAllow(uid, category) {
  try {
    const u = await db.collection("users").doc(uid).get();
    const prefs = u.exists ? (u.data().notifyPrefs || {}) : {};
    return prefs[category] !== false;
  } catch { return true; }
}

// Push to specific users (respecting their preferences).
async function sendPushToUids(uids, category, title, body, link) {
  try {
    const unique = [...new Set(uids)].filter(Boolean);
    if (!unique.length) return;
    const allowed = [];
    await Promise.all(unique.map(async (uid) => { if (await prefsAllow(uid, category)) allowed.push(uid); }));
    if (!allowed.length) return;
    const tokens = [];
    for (let i = 0; i < allowed.length; i += 10) {
      const snap = await db.collection("pushTokens").where("uid", "in", allowed.slice(i, i + 10)).get();
      snap.docs.forEach((d) => tokens.push(d.id));
    }
    await pushDeliver(tokens, { title, body, link, category });
  } catch (err) { console.error("sendPushToUids failed:", err.message); }
}

// Push to every device (respecting preferences) - e.g. new event published.
async function broadcastPush(category, title, body, link) {
  try {
    const snap = await db.collection("pushTokens").get();
    const byUid = {};
    snap.docs.forEach((d) => { (byUid[d.data().uid || "?"] ??= []).push(d.id); });
    const tokens = [];
    await Promise.all(Object.entries(byUid).map(async ([uid, toks]) => {
      if (await prefsAllow(uid, category)) tokens.push(...toks);
    }));
    await pushDeliver(tokens, { title, body, link, category });
  } catch (err) { console.error("broadcastPush failed:", err.message); }
}

const fmtEur = (c) => `€${(c / 100).toFixed(2).replace(".00", "")}`;

// ---- News post published → broadcast push (v0.100) ----
// Fires on CREATE only, so editing a post never re-notifies everyone.
exports.onNewsCreate = onDocumentCreated("news/{id}", async (event) => {
  try {
    const n = event.data ? event.data.data() : null;
    if (!n || !n.title) return;
    const body = String(n.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    await broadcastPush("news", `📣 ${String(n.title).slice(0, 80)}`, body || "Tap to read the news from ESN Gent.", "/news");
  } catch (err) { await logServerError("onNewsCreate", err); }
});

// ---- Check-in → passport-stamp push (v0.107) ----
// The scanner sets checkedInAt on the registration; the student instantly
// hears that a new stamp landed in their ESN Passport. (The open ticket
// page also live-updates client-side via a snapshot listener.)
exports.onCheckinPush = onDocumentWritten("registrations/{regId}", async (event) => {
  try {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after || !after.uid) return;
    if ((before && before.checkedInAt) || !after.checkedInAt) return; // only the first check-in
    if (!["paid", "free"].includes(after.status)) return;
    // Secret badge data (v0.109): was this the FIRST scan of the event?
    // (The client can't know - students only read their own registrations.)
    try {
      const cnt = await db.collection("registrations")
        .where("eventId", "==", after.eventId)
        .where("checkedInAt", ">", new Date(0))
        .count().get();
      if (cnt.data().count === 1) await event.data.after.ref.update({ firstIn: true });
    } catch { /* badge data is a nice-to-have */ }
    await sendPushToUids([after.uid], "tickets", "New stamp in your ESN Passport 🛂",
      `Checked in at ${after.eventTitle || "the event"} - have fun! Your passport just earned a stamp and XP.`,
      "/passport");
  } catch (err) { await logServerError("onCheckinPush", err); }
});

// ---- ESNcard application lifecycle → push to the applicant ----
exports.onEsncardAppWrite = onDocumentWritten("esncardApplications/{uid}", async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after || !before) return; // creation/deletion: no push
  const uid = event.params.uid;
  if (before.status !== after.status) {
    if (after.status === "paid") {
      await sendPushToUids([uid], "esncard", "ESNcard payment received ✅",
        "The board now prepares your card - you'll hear when it's ready for pickup.", "/account");
    } else if (after.status === "active") {
      await sendPushToUids([uid], "esncard", "Your ESNcard is ready 🎉",
        `Card ${after.cardNumber || ""} is verified - pick it up during office hours at the ESN office.`, "/account");
    } else if (after.status === "rejected") {
      await sendPushToUids([uid], "esncard", "About your ESNcard application",
        "The board couldn't approve it - open the app to see why and resubmit.", "/account");
    }
  }
});

// ---- Scheduled reminders: events (3h before) & shifts (24h before) ----
// ------------------------------------------------------------
// Nightly housekeeping - keeps the always-growing collections lean so
// the app stays fast (and cheap) over the years:
//   errorLog   > 90 days   → deleted (it's a debugging tool, not an archive)
//   waitlist   entries for events > 60 days past → deleted
//   boardTodos finished > 2 years ago → deleted (UI archives after 14 days)
// ------------------------------------------------------------
exports.nightlyMaintenance = onSchedule("every 24 hours", async () => {
  const purge = async (label, q) => {
    try {
      let total = 0;
      for (let round = 0; round < 5; round++) { // max ~2000 docs/night per target
        const snap = await q.limit(400).get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        total += snap.size;
        if (snap.size < 400) break;
      }
      if (total) console.log(`maintenance: ${label} - deleted ${total}`);
    } catch (err) { await logServerError(`maintenance ${label}`, err); }
  };
  const days = (n) => Timestamp.fromMillis(Date.now() - n * 86400e3);
  await purge("errorLog>90d", db.collection("errorLog").where("ts", "<", days(90)));
  // eventStart (not createdAt!) - someone may join a waitlist months before
  // a big trip; only entries whose EVENT is 60+ days past are stale.
  await purge("waitlist-past-event", db.collection("waitlist").where("eventStart", "<", days(60)));
  await purge("todos-done>2y", db.collection("boardTodos").where("doneAt", "<", days(730)));
  await purge("auditLog>1y", db.collection("auditLog").where("at", "<", days(365)));
  // Mail queue hygiene: delivered mails after 30 days, anything stuck after 90.
  await purge("mail-sent>30d", db.collection("mailQueue").where("sentAt", "<", days(30)));
  await purge("mail-stale>90d", db.collection("mailQueue").where("createdAt", "<", days(90)));
  // S1 cleanup: IBANs cached on profile docs by pre-v0.99.11 app versions -
  // scrub them. IBANs live only on reimbursement docs (finance-only read).
  try {
    const dirty = await db.collection("users").where("iban", ">", "").limit(400).get();
    if (!dirty.empty) {
      const batch = db.batch();
      dirty.docs.forEach((d) => batch.update(d.ref, { iban: FieldValue.delete() }));
      await batch.commit();
      console.log(`maintenance: scrubbed iban from ${dirty.size} user docs`);
    }
  } catch (err) { await logServerError("maintenance iban-scrub", err); }
  // Stale pending registrations (checkout abandoned AND the Stripe expiry
  // webhook never arrived): release their capacity holds after 2 hours.
  // releasePendingRegistration is transactional, so racing the webhook is safe.
  try {
    const stale = await db.collection("registrations").where("status", "==", "pending").limit(300).get();
    let released = 0;
    for (const d of stale.docs) {
      const created = d.data().createdAt && d.data().createdAt.toDate ? d.data().createdAt.toDate() : null;
      if (!created || Date.now() - created.getTime() < 2 * 3600e3) continue;
      await releasePendingRegistration(d.ref);
      released++;
    }
    if (released) console.log(`maintenance: released ${released} stale pending registrations`);
  } catch (err) { await logServerError("maintenance stale-pending", err); }

  // ---- Proof-of-exchange retention (v0.105) ----
  // Proofs are only needed while the board reviews the application, so they
  // are removed automatically: ~90 days after the card was activated, and in
  // any case once the application belongs to a PREVIOUS academic year (the
  // application record itself stays - it documents the issued card).
  try {
    const now = new Date();
    const cutoffActivated = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
    const ayStart = new Date(now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1, 6, 1);
    // select() keeps the (large) inline images out of memory - we only need
    // to know WHICH docs exist and whether they point at a Storage PDF.
    const proofs = await db.collection("applicationProofs").select("file").get();
    let purged = 0;
    for (const p of proofs.docs) {
      let kill = false;
      const appSnap = await db.collection("esncardApplications").doc(p.id).get();
      if (!appSnap.exists) kill = true; // orphan - application already gone
      else {
        const a = appSnap.data();
        const created = a.createdAt?.toDate?.() || null;
        const activated = a.activatedAt?.toDate?.() || null;
        if (created && created < ayStart) kill = true;
        else if (a.status === "active" && activated && activated < cutoffActivated) kill = true;
      }
      if (!kill) continue;
      if (p.get("file")) {
        try { await getAdminStorage().bucket().file(`proofs/${p.id}/proof.pdf`).delete(); } catch { /* already gone */ }
      }
      await p.ref.delete();
      if (appSnap.exists && appSnap.data().hasProof) {
        await appSnap.ref.update({ hasProof: false, proofPurgedAt: FieldValue.serverTimestamp() }).catch(() => {});
      }
      purged++;
    }
    if (purged) console.log(`maintenance: purged ${purged} old proof-of-exchange files`);
  } catch (err) { await logServerError("maintenance proof retention", err); }
  // Secret badge data (v0.109): mark the LAST check-in of freshly finished
  // events ("closed the party") - only knowable once the event is over, and
  // only meaningful with a real crowd (≥5 scans). Skips office hours.
  try {
    const evSnap = await db.collection("events")
      .where("start", ">=", new Date(Date.now() - 3 * 24 * 3600 * 1000))
      .where("start", "<", new Date(Date.now() - 6 * 3600 * 1000))
      .get();
    for (const d of evSnap.docs) {
      const ev = d.data();
      if (ev.officeHours || ev.cancelled || ev.lastInMarked) continue;
      const regs2 = await db.collection("registrations")
        .where("eventId", "==", d.id).where("checkedInAt", ">", new Date(0)).get();
      if (regs2.size >= 5) {
        const last = regs2.docs.reduce((a, b) =>
          (a.data().checkedInAt.toMillis() > b.data().checkedInAt.toMillis() ? a : b));
        await last.ref.update({ lastIn: true });
      }
      await d.ref.update({ lastInMarked: true });
    }
  } catch (err) { await logServerError("maintenance last-in", err); }
  // ESN Passport country league: check-ins per nationality, current academic
  // year (July–June). Aggregates only - no names, so no opt-in needed.
  try {
    const now = new Date();
    const ayYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const regs = await db.collection("registrations")
      .where("eventStart", ">=", Timestamp.fromDate(new Date(ayYear, 6, 1))).get();
    const perUid = {};
    regs.docs.forEach((d) => {
      const r = d.data();
      if (!r.checkedInAt || !r.uid) return;
      const u = (perUid[r.uid] ??= { checkins: 0, delaySum: 0, delayN: 0 });
      u.checkins += 1;
      // Punctuality (v0.109): minutes between event start and the door scan,
      // clamped to [-120, +300] so test scans and next-day scans don't skew it.
      if (r.eventStart?.toMillis && r.checkedInAt?.toMillis) {
        const delay = (r.checkedInAt.toMillis() - r.eventStart.toMillis()) / 60000;
        if (delay >= -120 && delay <= 300) { u.delaySum += delay; u.delayN += 1; }
      }
    });
    const uids = Object.keys(perUid);
    const byCountry = {};
    for (let i = 0; i < uids.length; i += 200) {
      const chunk = uids.slice(i, i + 200);
      const snaps = await db.getAll(...chunk.map((u) => db.collection("users").doc(u)));
      snaps.forEach((s, j) => {
        const nat = s.exists ? (s.data().nationality || "") : "";
        if (!nat || nat === "Other") return;
        const p = perUid[chunk[j]];
        (byCountry[nat] ??= { checkins: 0, people: 0, delaySum: 0, delayN: 0 });
        byCountry[nat].checkins += p.checkins;
        byCountry[nat].people += 1;
        byCountry[nat].delaySum += p.delaySum;
        byCountry[nat].delayN += p.delayN;
      });
    }
    const rows = Object.entries(byCountry)
      .map(([country, v]) => ({
        country, checkins: v.checkins, people: v.people,
        // avg minutes after the official start - needs ≥5 data points to show
        lateMin: v.delayN >= 5 ? Math.round(v.delaySum / v.delayN) : null,
      }))
      .sort((a, b) => b.checkins - a.checkins)
      .slice(0, 25);
    await db.collection("stats").doc("countryLeague").set({
      ay: ayYear, rows, updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) { await logServerError("maintenance country-league", err); }
});

exports.pushReminders = onSchedule("every 30 minutes", async () => {
  // Waitlist offers that ran out: remove the entry + pass the hold on.
  try {
    const expired = await db.collection("waitlist").where("offerExpiresAt", "<", Timestamp.now()).get();
    for (const d of expired.docs) {
      const w = d.data();
      await d.ref.delete();
      await sendPushToUids([w.uid], "waitlist", "Waitlist window expired",
        `${w.eventTitle || "The event"}: your 24h hold ran out, so the spot moves to the next in line. Still keen? Rejoin the waitlist.`,
        `/event/${w.eventId}`);
      await promoteWaitlist(w.eventId);
    }
  } catch (err) { await logServerError("waitlist sweep", err); }

  try {
  const now = Date.now();
  const snap = await db.collection("events")
    .where("published", "==", true)
    .where("start", ">=", new Date(now))
    .where("start", "<", new Date(now + 25 * 3600 * 1000))
    .get();
  for (const d of snap.docs) {
    const ev = d.data();
    if (ev.cancelled) continue;
    const startMs = ev.start.toMillis();
    const t = new Date(startMs).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });

    // 3h event reminder for attendees
    if (!ev.reminderSent && startMs - now >= 3 * 3600e3 && startMs - now < 3.5 * 3600e3 && !ev.officeHours) {
      const regs = await db.collection("registrations").where("eventId", "==", d.id).get();
      const uids = regs.docs.map((r) => r.data()).filter((r) => ["paid", "free"].includes(r.status)).map((r) => r.uid);
      await sendPushToUids(uids, "reminders", `Starts in 3 hours: ${ev.title}`,
        `${t}${ev.location ? " · " + ev.location : ""} - your ticket is in the app.`, `/event/${d.id}`);
      await d.ref.update({ reminderSent: true });
    }

    // 24h shift reminder for the team
    if (!ev.shiftReminderSent && ev.hasShifts && startMs - now >= 24 * 3600e3 && startMs - now < 24.5 * 3600e3) {
      const signups = await db.collection("shiftSignups").where("eventId", "==", d.id).get();
      const uids = signups.docs.map((s) => s.data().uid);
      await sendPushToUids(uids, "shifts", `Shift tomorrow: ${ev.title}`,
        `Starts ${t} - check your task and time in the app. Thanks for helping out!`, "/shifts");
      await d.ref.update({ shiftReminderSent: true });
    }
  }
  } catch (err) { await logServerError("pushReminders", err); }

  // Stale pending registrations (v0.140): ALSO swept here every 30 minutes -
  // the nightly-only sweep meant an abandoned checkout whose expiry webhook
  // got lost could sit on its capacity hold for up to a day.
  try {
    const stale = await db.collection("registrations").where("status", "==", "pending").limit(300).get();
    let released = 0;
    for (const d of stale.docs) {
      const created = d.data().createdAt && d.data().createdAt.toDate ? d.data().createdAt.toDate() : null;
      if (!created || Date.now() - created.getTime() < 2 * 3600e3) continue;
      await releasePendingRegistration(d.ref);
      released++;
    }
    if (released) console.log(`pushReminders sweep: released ${released} stale pending registrations`);
  } catch (err) { await logServerError("stale-pending sweep", err); }
});

// ------------------------------------------------------------
// Birthday wishes (v0.135) - a push at 09:00 Belgian time to everyone
// whose birthday it is. Push only, no e-mail (by design). The
// birthdayWishedYear marker on the profile guarantees at most one wish
// per person per year even if the schedule ever double-fires; users can
// opt out via the "birthday" notification category. Feb-29 birthdays
// are wished on Feb 28 in non-leap years.
// ------------------------------------------------------------
exports.birthdayWishes = onSchedule(
  { schedule: "every day 09:00", timeZone: "Europe/Brussels" },
  async () => {
    try {
      const be = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date()); // YYYY-MM-DD in Belgian time
      const [y, mm, dd] = be.split("-");
      const year = Number(y);
      const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      const wanted = new Set([`${mm}-${dd}`]);
      if (mm === "02" && dd === "28" && !leap) wanted.add("02-29");
      const snap = await db.collection("users")
        .select("birthday", "firstName", "displayName", "birthdayWishedYear").get();
      let wished = 0;
      for (const d of snap.docs) {
        const u = d.data();
        const b = String(u.birthday || "");
        if (b.length < 10 || !wanted.has(b.slice(5))) continue;
        if (u.birthdayWishedYear === year) continue; // already wished this year
        // Claim BEFORE sending - a retried run must never double-push.
        await d.ref.update({ birthdayWishedYear: year }).catch(() => {});
        const first = u.firstName || (u.displayName || "").split(" ")[0] || "";
        await sendPushToUids([d.id], "birthday",
          `Happy birthday${first ? `, ${first}` : ""}! 🎂`,
          "The whole ESN Gent team wishes you a fantastic day. Come celebrate with us at the next event!",
          "/calendar");
        wished++;
      }
      if (wished) console.log(`birthdayWishes: wished ${wished} member${wished === 1 ? "" : "s"} a happy birthday`);
    } catch (err) { await logServerError("birthdayWishes", err); }
  }
);

// ------------------------------------------------------------
// Account deletion (v0.138) - ONE server-side sweep with the admin SDK, so
// nothing depends on client rules or a half-finished loop. What happens:
//   removed   : profile, board notes, card/role history, waitlist entries,
//               push tokens, open reimbursements + receipts, proof-of-exchange,
//               contact messages (+ replies), friendship links, upcoming
//               shift sign-ups, the team role, the login itself
//   anonymised: past registrations, merch orders, past shift sign-ups,
//               ratings, to-dos assigned to them (records stay for
//               attendance, accounting and the shift leaderboard)
//   kept      : an ACTIVE ESNcard application (documents the issued card -
//               PII stripped except the name), the creation log (name only)
// Card numbers stay "taken" on purpose: a card is registered to a person on
// esncard.org and must never move to another account.
// ------------------------------------------------------------
exports.deleteMyAccount = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const problems = [];
  const step = async (label, fn) => { try { await fn(); } catch (err) { problems.push(label); console.error("deleteMyAccount", label, err?.message); } };
  const wipeQuery = async (q, mode = "delete", patch = null) => {
    const snap = await q.get();
    const batch = db.batch();
    snap.docs.forEach((d) => (mode === "delete" ? batch.delete(d.ref) : batch.update(d.ref, patch)));
    if (snap.size) await batch.commit();
    return snap.size;
  };
  const now = new Date();

  await step("registrations", () => wipeQuery(db.collection("registrations").where("uid", "==", uid), "update", { name: "", email: "", phone: FieldValue.delete(), anonymized: true }));
  await step("waitlist", () => wipeQuery(db.collection("waitlist").where("uid", "==", uid)));
  await step("esncardOrders", () => wipeQuery(db.collection("esncardOrders").where("uid", "==", uid)));
  await step("merchOrders", () => wipeQuery(db.collection("merchOrders").where("uid", "==", uid), "update", { name: "", email: "", anonymized: true }));
  await step("refundRequests", () => wipeQuery(db.collection("refundRequests").where("uid", "==", uid), "update", { name: "", email: "", anonymized: true }));
  await step("reimbursements", () => wipeQuery(db.collection("reimbursements").where("uid", "==", uid).where("status", "==", "submitted")));
  await step("reimbursementReceipts", () => wipeQuery(db.collection("reimbursementReceipts").where("uid", "==", uid)));
  await step("pushTokens", () => wipeQuery(db.collection("pushTokens").where("uid", "==", uid)));
  await step("feedback", () => wipeQuery(db.collection("feedback").where("uid", "==", uid), "update", { uid: "", anonymized: true }));
  await step("friendships", async () => {
    await wipeQuery(db.collection("friendships").where("a", "==", uid));
    await wipeQuery(db.collection("friendships").where("b", "==", uid));
  });
  await step("shiftSignups", async () => {
    const snap = await db.collection("shiftSignups").where("uid", "==", uid).get();
    const batch = db.batch();
    snap.docs.forEach((d) => {
      const st = d.data().eventStart?.toDate?.() || null;
      if (st && st < now) batch.update(d.ref, { name: "Former team member", anonymized: true });
      else batch.delete(d.ref); // frees the slot so the board sees it's open again
    });
    if (snap.size) await batch.commit();
  });
  await step("boardTodos", () => wipeQuery(db.collection("boardTodos").where("assignedUid", "==", uid), "update", { assignedUid: "", assignedName: "Former member" }));
  await step("contactMessages", async () => {
    const snap = await db.collection("contactMessages").where("uid", "==", uid).get();
    for (const d of snap.docs) {
      const replies = await d.ref.collection("replies").get();
      const batch = db.batch();
      replies.docs.forEach((r) => batch.delete(r.ref));
      batch.delete(d.ref);
      await batch.commit();
    }
  });
  await step("esncardApplication", async () => {
    const ref = db.collection("esncardApplications").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return;
    const a = snap.data();
    if (a.status === "active" && a.cardNumber) {
      // Issued card: keep the record, strip everything but name + card facts.
      await ref.update({
        email: "", phone: "", birthday: "", idNumber: "", homeCity: "", homeUniversity: "",
        fieldOfStudies: "", ideas: "", howFound: "", hostInstitution: "", stayType: "",
        anonymized: true, anonymizedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await ref.delete();
    }
  });
  await step("applicationProof", async () => {
    await db.collection("applicationProofs").doc(uid).delete().catch(() => {});
    await getAdminStorage().bucket().file(`proofs/${uid}/proof.pdf`).delete().catch(() => {});
  });
  await step("adminNotes", () => db.collection("adminNotes").doc(uid).delete());
  await step("userHistory", () => db.collection("userHistory").doc(uid).delete());
  await step("teamRole", () => db.collection("admins").doc(uid).delete());
  await step("profile", () => db.collection("users").doc(uid).delete());
  // The login last - once it's gone the client can't call anything any more.
  let loginDeleted = true;
  try { await getAdminAuth().deleteUser(uid); } catch (err) { loginDeleted = false; problems.push("login"); console.error("deleteMyAccount login", err?.message); }
  return { ok: !problems.length, loginDeleted, problems };
});

// ------------------------------------------------------------
// Contact the board (v0.129) - contactMessages/{id} + replies thread.
// New message / student follow-up -> board gets a push + a mail to the
// configured from-address inbox. Board reply -> student gets a push AND
// an e-mail with the answer; the parent doc's status follows along.
// ------------------------------------------------------------
async function boardUids() {
  const snap = await db.collection("admins").get();
  return snap.docs
    .filter((d) => ["board", "finance", "superadmin"].includes(d.data().role || "superadmin"))
    .map((d) => d.id);
}

exports.onContactMessage = onDocumentCreated(
  { document: "contactMessages/{msgId}", secrets: [smtpPassword] },
  async (event) => {
    try {
      const m = event.data?.data();
      if (!m) return;
      await event.data.ref.update({ lastReplyAt: FieldValue.serverTimestamp() }).catch(() => {});
      const preview = String(m.message || "").slice(0, 140);
      await sendPushToUids(await boardUids(), "contact",
        `New message: ${m.category || "Other"}`,
        `${m.name || m.email || "A student"}: ${preview}`, "/admin/inbox");
      const cfg = await getMailConfig();
      if (cfg) {
        await queueAndSend(cfg, {
          to: cfg.fromAddress,
          subject: `[App contact] ${m.category || "Other"} - ${m.name || m.email || "student"}`,
          text: `New contact message in the app.\n\nFrom: ${m.name || ""} <${m.email || ""}>\nCategory: ${m.category || "Other"}\n\n${m.message || ""}\n\nReply in the app: ${APP_URL}/admin/inbox`,
          kind: "contact", refId: event.params.msgId,
        });
      }
    } catch (err) { await logServerError("onContactMessage", err); }
  });

exports.onContactReply = onDocumentCreated(
  { document: "contactMessages/{msgId}/replies/{replyId}", secrets: [smtpPassword] },
  async (event) => {
    try {
      const reply = event.data?.data();
      if (!reply) return;
      const parentRef = db.collection("contactMessages").doc(event.params.msgId);
      const parentSnap = await parentRef.get();
      if (!parentSnap.exists) return;
      const m = parentSnap.data();
      // Board-ness is decided HERE, never trusted from the client - and the
      // owner replying to their own thread always counts as the student side.
      const isOwner = reply.uid === m.uid;
      const adminDoc = isOwner ? null : await db.collection("admins").doc(reply.uid).get();
      const fromBoard = !!(adminDoc && adminDoc.exists);
      await parentRef.update({
        status: fromBoard ? "answered" : "open",
        lastReplyAt: FieldValue.serverTimestamp(),
      }).catch(() => {});

      if (fromBoard) {
        const txt = String(reply.text || "");
        await sendPushToUids([m.uid], "contact", "The board replied 💬",
          txt.slice(0, 140), "/contact");
        const cfg = await getMailConfig();
        if (cfg && m.email) {
          await queueAndSend(cfg, {
            to: m.email,
            subject: `Re: your message to ESN Gent (${m.category || "contact"})`,
            text: `Hi ${(m.name || "").split(" ")[0] || "there"},\n\nThe ESN Gent board replied to your message:\n\n${txt}\n\nYou can answer or read the whole conversation in the app:\n${APP_URL}/contact\n\nSee you soon,\nESN Gent`,
            kind: "contact-reply", refId: event.params.msgId,
          });
        }
      } else {
        const preview = String(reply.text || "").slice(0, 140);
        await sendPushToUids(await boardUids(), "contact",
          `Reply from ${m.name || m.email || "a student"}`, preview, "/admin/inbox");
      }
    } catch (err) { await logServerError("onContactReply", err); }
  });

// ------------------------------------------------------------
// Ticket transfer claim (v0.131) - moved from security rules to a
// function so we can enforce what rules cannot: ONE ticket per person
// per event, even via transfers.
// ------------------------------------------------------------
exports.claimTicketTransfer = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to claim a ticket.");
  const { registrationId, code } = request.data || {};
  if (!registrationId || !code) throw new HttpsError("invalid-argument", "This transfer link is incomplete.");
  const uid = request.auth.uid;
  const regRef = db.collection("registrations").doc(String(registrationId));
  const acceptAvail = await acceptAvailableCards(); // read before the tx

  await db.runTransaction(async (tx) => {
    // All reads first (Firestore transaction rule).
    const regSnap = await tx.get(regRef);
    if (!regSnap.exists) throw new HttpsError("not-found", "This ticket no longer exists.");
    const reg = regSnap.data();
    if (!reg.transferCode || reg.transferCode !== String(code)) {
      throw new HttpsError("failed-precondition", "This transfer link is invalid or was cancelled.");
    }
    if (!["paid", "free"].includes(reg.status)) {
      throw new HttpsError("failed-precondition", "This ticket isn't confirmed (any payment was refunded or cancelled).");
    }
    if (reg.checkedInAt) throw new HttpsError("failed-precondition", "This ticket was already scanned at the door.");
    if (reg.uid === uid) throw new HttpsError("failed-precondition", "This is already your own ticket.");

    // One ticket per person - the check rules couldn't do.
    const dupSnap = await tx.get(db.collection("registrations")
      .where("eventId", "==", reg.eventId)
      .where("uid", "==", uid)
      .where("status", "in", ["paid", "free", "pending"]).limit(1));
    if (!dupSnap.empty) {
      throw new HttpsError("already-exists", "You already have a ticket for this event - it's one per person, so the transfer can't go through.");
    }

    // ESNcard-only events: the recipient needs member access too.
    const evSnap = await tx.get(db.collection("events").doc(reg.eventId));
    if (evSnap.exists && evSnap.data().esnOnly === true) {
      const uSnap = await tx.get(db.collection("users").doc(uid));
      const u = uSnap.exists ? uSnap.data() : {};
      if (!profileHasCard(u, acceptAvail) && u.alumni !== true) {
        throw new HttpsError("failed-precondition", "This event is for ESNcard members - link a verified ESNcard on your profile first, then open the link again.");
      }
    }

    tx.update(regRef, {
      uid,
      name: request.auth.token.name || "",
      email: request.auth.token.email || "",
      transferCode: "",
      claimedWith: String(code),
      transferredAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
});

// ------------------------------------------------------------
// ESNcard verification & linking (v0.132-0.133) - reads esncard.org's
// card.json via the Cloudflare-bypass header ESN International gave us.
// The key lives in Secret Manager, never in the repo.
// Card states from esncard.org: active | available (bought, not yet
// activated) | expired | blocked | (empty array = unknown code).
// ------------------------------------------------------------
async function esncardLookup(code) {
  const key = esncardBypass.value();
  if (!key) throw new HttpsError("failed-precondition", "The ESNcard verification key isn't configured yet.");
  let res;
  try {
    res = await fetch(`https://esncard.org/services/1.0/card.json?code=${encodeURIComponent(code)}`, {
      headers: { "x-bypass-cf-api": key, "Accept": "application/json" },
    });
  } catch (err) {
    throw new HttpsError("unavailable", "Couldn't reach esncard.org: " + (err?.message || "network error"));
  }
  if (res.status === 403 || res.status === 401) {
    throw new HttpsError("permission-denied", "esncard.org refused the request - the bypass key may be wrong or disabled. Ask ESN International to confirm it.");
  }
  if (!res.ok) throw new HttpsError("unavailable", `esncard.org returned ${res.status}.`);
  let data;
  try { data = await res.json(); } catch { data = null; }
  const card = Array.isArray(data) ? data[0] : (data && typeof data === "object" ? data : null);
  // The API returns [""] / [] for empty fields (e.g. available cards have
  // no expiry/section yet) - normalise all of that to "".
  const clean = (v) => {
    if (Array.isArray(v)) v = v[0];
    return v == null ? "" : String(v).trim();
  };
  if (!card || !clean(card.code)) return { found: false };
  const status = clean(card.status) || "unknown";
  const expiry = clean(card["expiration-date"]);
  const expiryMs = expiry ? Date.parse(expiry) : null;
  const activated = clean(card["activation date"]);
  const activatedMs = activated ? Date.parse(activated) : null;
  return {
    found: true,
    code: clean(card.code),
    tid: clean(card.tid) || null,
    status, // active | available | expired | blocked | unknown
    section: clean(card["section-code"]),
    expiry: expiry || null,
    expiryMs: Number.isFinite(expiryMs) ? expiryMs : null,
    activated: activated || null,
    activatedMs: Number.isFinite(activatedMs) ? activatedMs : null,
    expired: status === "expired" || (Number.isFinite(expiryMs) && expiryMs < Date.now()),
    blocked: status === "blocked",
  };
}

// Confirm this card number isn't already on ANOTHER account (users +
// applications) - the "one card, one person" guarantee.
async function ensureCardFree(code, uid) {
  const [users, apps] = await Promise.all([
    db.collection("users").where("esncardCode", "==", code).get(),
    db.collection("esncardApplications").where("cardNumber", "==", code).get(),
  ]);
  // Anonymised applications (v0.138.1) don't block the number: they are the
  // kept issue-records of DELETED accounts. If that person returns with a
  // new login, they can relink their own card - possession of the physical
  // card (its number) is the credential, exactly as for any first link, and
  // esncard.org still has to confirm the card's real status. Live accounts
  // can never share a number.
  if (users.docs.some((d) => d.id !== uid)
    || apps.docs.some((d) => d.id !== uid && d.data().anonymized !== true)) {
    throw new HttpsError("already-exists", "This card number is already linked to another account. Double-check the number - or ask at the office if something's off.");
  }
}

// Apply a verified lookup to a user profile. Returns a summary for the UI.
// active    -> verified member, expiry from the API, no board action needed.
// available -> linked but must still be activated on esncard.org.
// expired/blocked/not found -> refuse with a clear message.
async function applyCardLink(uid, code, r) {
  if (!r.found) throw new HttpsError("not-found", "That card number isn't on esncard.org. Check for typos.");
  if (r.blocked) throw new HttpsError("failed-precondition", "This card is BLOCKED on esncard.org. Contact ESN International - it can't be used.");
  if (r.expired) throw new HttpsError("failed-precondition", "This card is EXPIRED. Link a newer card instead.");
  const base = {
    esncardCode: code,
    esncardTid: r.tid || null,
    esncardSection: r.section || null,
    esncardStatus: r.status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (r.status === "active") {
    await db.collection("users").doc(uid).set({
      ...base,
      esncardVerified: true,
      esncardExpiresAt: r.expiryMs ? Timestamp.fromMillis(r.expiryMs) : null,
      esncardActivatedAt: r.activatedMs ? Timestamp.fromMillis(r.activatedMs) : null,
    }, { merge: true });
    await appendCardHistory(uid, { action: "activated", code, section: r.section || null, expiry: r.expiry || null });
    return { status: "active", section: r.section, expiry: r.expiry };
  }
  if (r.status === "available") {
    await db.collection("users").doc(uid).set({
      ...base,
      esncardVerified: false,
      esncardExpiresAt: null, // no expiry until it's activated
    }, { merge: true });
    await appendCardHistory(uid, { action: "linked-available", code });
    return { status: "available" };
  }
  throw new HttpsError("failed-precondition", `esncard.org reports an unexpected status ("${r.status}"). Ask at the office.`);
}

// Card history on userHistory/{uid}.card (board-readable audit trail).
async function appendCardHistory(uid, entry) {
  try {
    await db.collection("userHistory").doc(uid).set({
      card: FieldValue.arrayUnion({ ...entry, at: Timestamp.now() }),
    }, { merge: true });
  } catch { /* audit trail must never block the action */ }
}

// Ad-hoc check (board) - just returns the lookup, writes nothing.
exports.verifyEsncard = onCall({ secrets: [esncardBypass] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
  const role = adminSnap.exists ? (adminSnap.data().role || "superadmin") : null;
  if (!["superadmin", "board", "finance"].includes(role)) {
    throw new HttpsError("permission-denied", "Only board members can verify cards.");
  }
  const code = String(request.data?.code || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{6,20}$/.test(code)) throw new HttpsError("invalid-argument", "That doesn't look like an ESNcard number.");
  return esncardLookup(code);
});

// Student self-service link/refresh (v0.133). Verifies on esncard.org and
// links according to the real status - an ACTIVE card is verified on the
// spot (no board check), an AVAILABLE one is linked pending activation and
// can be refreshed later. Re-submitting your own code refreshes it.
exports.linkEsncard = onCall({ secrets: [esncardBypass] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const code = String(request.data?.code || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{6,20}$/.test(code)) {
    throw new HttpsError("invalid-argument", "That doesn't look like an ESNcard number - letters and digits only, no spaces.");
  }
  await ensureCardFree(code, uid);
  const r = await esncardLookup(code);
  return applyCardLink(uid, code, r);
});

// Board: assign a physical card to an applicant (v0.133). Verifies it's a
// real available/active card, links it, flips the application to "active"
// so the pickup e-mail goes out.
exports.assignEsncard = onCall({ secrets: [esncardBypass] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
  const role = adminSnap.exists ? (adminSnap.data().role || "superadmin") : null;
  if (!["superadmin", "board", "finance"].includes(role)) {
    throw new HttpsError("permission-denied", "Only board members can assign cards.");
  }
  const uid = String(request.data?.uid || "");
  const code = String(request.data?.code || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!uid) throw new HttpsError("invalid-argument", "Missing the student.");
  if (!/^[A-Z0-9]{6,20}$/.test(code)) throw new HttpsError("invalid-argument", "That doesn't look like an ESNcard number.");
  await ensureCardFree(code, uid);
  const r = await esncardLookup(code);
  // The board only hands out AVAILABLE (blank, not-yet-registered) cards. An
  // already-active card belongs to a person who registered it on esncard.org -
  // only that person can link it, from their own account page. Blocked/expired/
  // unknown cards are refused by applyCardLink below.
  if (r.found && r.status === "active" && !r.expired && !r.blocked) {
    throw new HttpsError("failed-precondition", "This card is already active on esncard.org - an active card can only be linked by the student from their own account page. You can only assign available (not-yet-registered) cards here.");
  }
  const result = await applyCardLink(uid, code, r);
  // Flip the application so esncardReadyMail sends the pickup e-mail. Assigned
  // cards are always "available" here (active ones are refused above).
  await db.collection("esncardApplications").doc(uid).set({
    status: "active",
    cardNumber: code,
    esncardStatus: r.status, // active | available - drives the pickup e-mail wording
    activatedAt: FieldValue.serverTimestamp(),
    expiresAt: r.expiryMs ? Timestamp.fromMillis(r.expiryMs) : null,
  }, { merge: true });
  await appendCardHistory(uid, { action: "assigned", code, by: request.auth.uid, section: r.section || null });
  return result;
});
