import { getApp, getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  type Auth,
} from "firebase/auth";
let instance: Auth | undefined;
let anonymousPromise: Promise<import("firebase/auth").User> | undefined;
export function clientAuth() {
  if (instance) return instance;
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (Object.values(config).some((value) => !value))
    throw new Error(
      "Firebaseの接続設定が不足しています。管理者にお問い合わせください。",
    );
  const auth = getAuth(getApps().length ? getApp() : initializeApp(config));
  if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true") {
    if (
      typeof location !== "undefined" &&
      !["localhost", "127.0.0.1"].includes(location.hostname)
    )
      throw new Error("Emulators are restricted to localhost");
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
  }
  instance = auth;
  return auth;
}
export async function participantUser() {
  const auth = clientAuth();
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  anonymousPromise ??= signInAnonymously(auth)
    .then((result) => result.user)
    .finally(() => {
      anonymousPromise = undefined;
    });
  return anonymousPromise;
}
