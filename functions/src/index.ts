import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

admin.initializeApp();

export const onDashboardUpdate = onDocumentWritten(
  { document: "couples/{coupleId}/dashboard/main", region: "asia-southeast2" },
  async (event) => {
    const change = event.data;
    if (!change) return;

    const { coupleId } = event.params;
    const newData = change.after.data();
    const prevData = change.before.data();

    if (!newData) return null; // Document deleted

    const newGreetings = newData.greetings || {};
    const oldGreetings = prevData?.greetings || {};
    const newPaps = newData.paps || {};
    const oldPaps = prevData?.paps || {};

    let title = "";
    let body = "";
    let senderId = "";

    const historyWrites: any[] = [];

    for (const uid of Object.keys(newGreetings)) {
      if (!oldGreetings[uid] || newGreetings[uid].updatedAt !== oldGreetings[uid].updatedAt) {
        title = "New Greeting! 💕";
        body = `Your partner left a greeting: "${newGreetings[uid].text}"`;
        senderId = uid;
        historyWrites.push({
          type: "greeting",
          uid,
          text: newGreetings[uid].text,
          updatedAt: newGreetings[uid].updatedAt
        });
      }
    }

    for (const uid of Object.keys(newPaps)) {
      if (!oldPaps[uid] || newPaps[uid].updatedAt !== oldPaps[uid].updatedAt) {
        title = "New Daily Pipipip! 📸";
        body = "Your partner uploaded a new photo. Open the app to see it!";
        senderId = uid;
        historyWrites.push({
          type: "pap",
          uid,
          url: newPaps[uid].url,
          updatedAt: newPaps[uid].updatedAt
        });
      }
    }

    if (historyWrites.length > 0) {
      const batch = admin.firestore().batch();
      historyWrites.forEach(hw => {
        const docRef = admin.firestore().collection("couples").doc(coupleId).collection("history").doc();
        batch.set(docRef, hw);
      });
      await batch.commit();
    }

    if (!title || !senderId) return null; // No relevant change

    // Find the partner's user document to get their FCM tokens
    // We assume the coupleId document has an array of `users` or we find the other user
    // Since we don't have the exact schema of `couples/{coupleId}`, we'll query for users whose coupleId matches, excluding the sender.
    const usersSnapshot = await admin
      .firestore()
      .collection("users")
      .where("coupleId", "==", coupleId)
      .get();

    const partnerDocs = usersSnapshot.docs.filter((doc) => doc.id !== senderId);
    if (partnerDocs.length === 0) {
      console.log("No partner found for coupleId:", coupleId);
      return null;
    }

    const partnerData = partnerDocs[0].data();
    const fcmTokens = partnerData.fcmTokens || [];

    if (fcmTokens.length === 0) {
      console.log("Partner has no FCM tokens registered.");
      return null;
    }

    const payload = {
      notification: {
        title,
        body,
        icon: "/apple-icon.png", // Ensure this exists in public/
        clickAction: "https://cagie-planner.web.app/home", // Example URL, might need adjustment based on exact domain
      },
    };

    try {
      const response = await admin.messaging().sendToDevice(fcmTokens, payload);
      console.log("Successfully sent message:", response);
      // Optional: Cleanup invalid tokens
      const tokensToRemove: string[] = [];
      response.results.forEach((result, index) => {
        const error = result.error;
        if (error) {
          console.error(
            "Failure sending notification to",
            fcmTokens[index],
            error,
          );
          if (
            error.code === "messaging/invalid-registration-token" ||
            error.code === "messaging/registration-token-not-registered"
          ) {
            tokensToRemove.push(fcmTokens[index]);
          }
        }
      });
      if (tokensToRemove.length > 0) {
        await partnerDocs[0].ref.update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove),
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
    return;
  },
);
