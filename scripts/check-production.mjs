// A production Git push must not promote an app with missing server credentials.
if (process.env.VERCEL_ENV === "production") {
  const missing = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "CRON_SECRET",
  ].filter((key) => !process.env[key]);
  if (missing.length)
    throw new Error(`Production configuration missing: ${missing.join(", ")}`);
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (process.env.CRON_SECRET.length < 32)
    throw new Error("CRON_SECRET must contain at least 32 characters");
  if (
    key.project_id !== process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !==
      process.env.FIREBASE_PROJECT_ID
  )
    throw new Error("Firebase client/server projects do not match");
  if (
    process.env.NEXT_PUBLIC_USE_EMULATORS === "true" ||
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST
  )
    throw new Error("Production cannot use emulators");
}
