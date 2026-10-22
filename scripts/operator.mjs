// Operator-only tooling. Uses the Firebase CLI's authenticated account in memory;
// never emits OAuth tokens or private keys. Not imported by the application.
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
const require = createRequire(import.meta.url);
const cliAuth = require("firebase-tools/lib/auth.js");
const account = cliAuth.getGlobalDefaultAccount();
if (!account)
  throw new Error("Log in with npx -y firebase-tools@latest login first.");
const projectId = process.argv
  .find((v) => v.startsWith("--project="))
  ?.slice(10);
if (!projectId || !/^[a-z][a-z0-9-]{4,50}$/.test(projectId))
  throw new Error("An explicit --project=ID is required.");
const mode = process.argv[2];
const saEmail = `wakabo-runtime@${projectId}.iam.gserviceaccount.com`;
const keyPath = `.private/${projectId}-runtime.json`;
async function google(url, method = "GET", body) {
  const token = await cliAuth.getAccessToken(account.tokens.refresh_token, [
    "https://www.googleapis.com/auth/cloud-platform",
  ]);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      `Google API ${response.status}: ${value.error?.message ?? "request failed"}`,
    );
  return value;
}
if (mode === "policy-check") {
  const policy = await google(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`,
    "POST",
    {},
  );
  console.log(
    JSON.stringify({
      projectId,
      runtimeRoles: policy.bindings
        ?.filter((binding) =>
          binding.members?.includes(`serviceAccount:${saEmail}`),
        )
        .map((binding) => binding.role),
    }),
  );
} else if (mode === "inspect") {
  const accounts = await google(
    `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts`,
  );
  console.log(
    JSON.stringify({
      projectId,
      operator: account.user.email,
      runtimeServiceAccountExists:
        accounts.accounts?.some((a) => a.email === saEmail) ?? false,
    }),
  );
} else if (mode === "provision") {
  if (!process.argv.includes("--apply"))
    throw new Error("Provisioning requires --apply.");
  const accounts = await google(
    `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts`,
  );
  if (!accounts.accounts?.some((a) => a.email === saEmail))
    await google(
      `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts`,
      "POST",
      {
        accountId: "wakabo-runtime",
        serviceAccount: { displayName: "Wakabo application runtime" },
      },
    );
  const policy = await google(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`,
    "POST",
    {},
  );
  policy.bindings ??= [];
  for (const role of ["roles/datastore.user", "roles/firebaseauth.viewer"]) {
    let binding = policy.bindings.find((b) => b.role === role && !b.condition);
    if (!binding) {
      binding = { role, members: [] };
      policy.bindings.push(binding);
    }
    if (!binding.members.includes(`serviceAccount:${saEmail}`))
      binding.members.push(`serviceAccount:${saEmail}`);
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await google(
        `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:setIamPolicy`,
        "POST",
        { policy },
      );
      break;
    } catch (error) {
      if (
        attempt >= 5 ||
        !error.message.includes("Service account") ||
        !error.message.includes("does not exist")
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
    }
  }
  try {
    await readFile(keyPath);
  } catch {
    const key = await google(
      `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts/${saEmail}/keys`,
      "POST",
      { privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE" },
    );
    await mkdir(".private", { recursive: true });
    await writeFile(keyPath, Buffer.from(key.privateKeyData, "base64"), {
      flag: "wx",
      mode: 0o600,
    });
  }
  console.log(
    JSON.stringify({
      projectId,
      runtimeServiceAccount: saEmail,
      keyPath,
      roles: ["datastore.user", "firebaseauth.viewer"],
    }),
  );
} else if (mode === "users" || mode === "grant-admin") {
  // The operator identity is used to manage Auth, not the restricted runtime account.
  const token = await cliAuth.getAccessToken(account.tokens.refresh_token, [
    "https://www.googleapis.com/auth/cloud-platform",
  ]);
  const app = initializeApp({
    projectId,
    credential: {
      getAccessToken: async () => ({
        access_token: token.access_token,
        expires_in: 300,
      }),
    },
  });
  const auth = getAuth(app);
  if (mode === "users") {
    const users = [];
    let pageToken;
    do {
      const page = await auth.listUsers(1000, pageToken);
      users.push(
        ...page.users
          .filter((user) => user.providerData.length > 0)
          .map((user) => ({
            uid: user.uid,
            email: user.email,
            admin: user.customClaims?.admin === true,
          })),
      );
      pageToken = page.pageToken;
    } while (pageToken);
    console.log(
      JSON.stringify({ projectId, operatorEmail: account.user.email, users }),
    );
  } else {
    const uid = process.argv.find((v) => v.startsWith("--uid="))?.slice(6);
    if (!uid || !process.argv.includes("--apply"))
      throw new Error("grant-admin requires --uid=UID --apply.");
    const user = await auth.getUser(uid);
    if (user.disabled || !user.providerData.length)
      throw new Error("Only enabled, non-anonymous users can be admins.");
    await auth.setCustomUserClaims(uid, { ...user.customClaims, admin: true });
    await auth.revokeRefreshTokens(uid);
    console.log(
      JSON.stringify({
        projectId,
        uid,
        admin: true,
        reauthenticationRequired: true,
      }),
    );
  }
} else if (mode === "check-runtime") {
  const key = JSON.parse(await readFile(keyPath, "utf8"));
  const app = initializeApp({ projectId, credential: cert(key) });
  const { getFirestore } = await import("firebase-admin/firestore");
  const db = getFirestore(app);
  const root = db.doc(`artifacts/${projectId}/public/data`);
  const counts = {};
  for (const name of [
    "itemLists",
    "PublicSessions",
    "trainingSessions",
    "v2Catalogs",
    "v2Sessions",
  ])
    counts[name] = (await root.collection(name).count().get()).data().count;
  console.log(JSON.stringify({ projectId, counts }));
  await db.terminate();
} else
  throw new Error(
    "Unknown mode. Use inspect, provision, users, grant-admin, check-runtime.",
  );
