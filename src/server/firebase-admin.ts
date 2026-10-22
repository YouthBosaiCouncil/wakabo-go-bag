import "server-only";
import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export function adminApp() {
  if (getApps().length) return getApp();
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required");
  const emulated =
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (
    process.env.NODE_ENV === "production" &&
    emulated &&
    process.env.ALLOW_LOCAL_EMULATORS !== "true"
  ) {
    throw new Error("Emulators are forbidden in production");
  }
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return initializeApp({
    projectId,
    ...(emulated
      ? {}
      : {
          credential: serviceAccount
            ? cert(JSON.parse(serviceAccount))
            : applicationDefault(),
        }),
  });
}

export function adminDb() {
  return getFirestore(adminApp());
}
export function adminAuth() {
  return getAuth(adminApp());
}
