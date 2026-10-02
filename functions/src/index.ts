import { initializeApp } from "firebase-admin/app";

initializeApp();

export { onDashboardUpdate } from "./notifications";
export { getInviteCode, pairWithCode } from "./pairing";
