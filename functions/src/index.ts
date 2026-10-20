import { initializeApp } from "firebase-admin/app";

initializeApp();

export { onDashboardUpdate } from "./notifications";
export { getInviteCode, pairWithCode } from "./pairing";
export { scheduleApi } from "./scheduleApi";
export { getWhatsAppLinkCode, unlinkWhatsApp } from "./whatsappLink";
