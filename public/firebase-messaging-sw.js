// Firebase Cloud Messaging service worker.
//
// Messages from the `onDashboardUpdate` Cloud Function carry a `notification`
// payload, which the Messaging SDK displays by itself when the app is in the
// background, and opens `webpush.fcmOptions.link` when tapped. Do NOT call
// showNotification() in onBackgroundMessage as well, or users get duplicates.
// Foreground messages are shown as an in-app toast (see src/app/(app)/layout.tsx).
//
// Keep the SDK version in sync with the `firebase` package in package.json.
importScripts("https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js");

// These values are public (they ship in the web bundle too). A service worker
// can't read process.env, so they are inlined here.
firebase.initializeApp({
  apiKey: "AIzaSyCqYGGdeplZ5FDCs5UdPc1zn93PRWy7a2w",
  authDomain: "cagie-web.firebaseapp.com",
  projectId: "cagie-web",
  messagingSenderId: "1021759447136",
  appId: "1:1021759447136:web:abdc6f3b4961cb4372a305",
});

firebase.messaging();
