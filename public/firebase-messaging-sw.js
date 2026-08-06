// Give the service worker access to Firebase Messaging.
// Note that you can only use Firebase Messaging here. Other Firebase libraries
// are not available in the service worker.
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js",
);

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// You need to replace this with your actual Firebase config but since the service worker doesn't have process.env,
// you can pass url params when registering or hardcode for now.
// A common approach is using firebase.initializeApp(firebaseConfig) with hardcoded values,
// OR fetching them via a fetch call. We'll leave it as a placeholder to be configured by the user.

const firebaseConfig = {
  // Replace these with the actual values from .env.local
  // This is required for background notifications to work on Android/Web
  apiKey: "AIzaSyCqYGGdeplZ5FDCs5UdPc1zn93PRWy7a2w",
  authDomain: "cagie-web.firebaseapp.com",
  projectId: "cagie-web",
  storageBucket: "cagie-web",
  messagingSenderId: "1021759447136",
  appId: "1:1021759447136:web:abdc6f3b4961cb4372a305",
  measurementId: "G-PM4PTSJG85",
};

// Only initialize if we have the config
if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
  firebase.initializeApp(firebaseConfig);

  // Retrieve an instance of Firebase Messaging so that it can handle background
  // messages.
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log(
      "[firebase-messaging-sw.js] Received background message ",
      payload,
    );
    // Customize notification here
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
      body: payload.notification.body,
      icon: payload.notification.icon || "/apple-icon.png",
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
}
