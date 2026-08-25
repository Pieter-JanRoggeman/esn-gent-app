// ============================================================
// Google Calendar sync (one-way: app → your public calendar)
//
// Setup (one time):
// 1. https://console.cloud.google.com → select project esn-gent-9084b
//    → APIs & Services → Library → search "Google Calendar API" → Enable
// 2. APIs & Services → Credentials → under "OAuth 2.0 Client IDs" copy the
//    Client ID of the web client that Firebase auto-created
//    (ends in .apps.googleusercontent.com) and paste it below.
// 3. In the app: Admin → "🗓 Sync calendar" → sign in with the Google
//    account that owns the calendar (esn.gent@gmail.com) and allow access.
// ============================================================
export const calendarSync = {
  clientId: "79769544853-u6ihfv2nebl0lt0dt1iohjdij7u7243b.apps.googleusercontent.com",
  // Public events calendar (students see this one)
  calendarId: "82cc663b35501ed69bd0d63ded38c60b4334717245b67be7be1d7f2ecc0beaeb@group.calendar.google.com",
  // Internal board calendar — board meetings are synced here
  boardCalendarId: "b7b9acc89f01f08a2dc40b108ece7b3d039a3a71c528e5c904b1fdb815a3c79e@group.calendar.google.com",
  timeZone: "Europe/Brussels",
};
