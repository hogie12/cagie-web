import * as admin from "firebase-admin";

admin.initializeApp();

export { onDashboardUpdate } from "./notifications";
export { getInviteCode, pairWithCode } from "./pairing";
