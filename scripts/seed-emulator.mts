import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { WorkspaceService } from "../src/server/service";
import { INITIAL_DEFAULT_ITEMS } from "../src/lib/utils";
if (
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw new Error("This seed script is restricted to local emulators.");
const app = initializeApp({ projectId: "demo-wakabo" });
const db = getFirestore(app);
const auth = getAuth(app);
const email = "qa-admin@example.test";
let user;
try {
  user = await auth.getUserByEmail(email);
} catch {
  user = await auth.createUser({ email, password: "local-only-test-password" });
}
await auth.setCustomUserClaims(user.uid, { admin: true });
const actor = { uid: user.uid, admin: true };
const service = new WorkspaceService(db, "demo-wakabo");
const list = await service.saveCatalog(actor, {
  name: "基本セット",
  items: INITIAL_DEFAULT_ITEMS.map((name, index) => ({
    id: `item-${index + 1}`,
    name,
    category: index < 3 ? "食料・水" : "生活用品",
    icon: index === 0 ? "water" : "package",
    description: "",
  })),
});
const sessions = [];
for (const kind of ["public", "workshop", "lesson"] as const) {
  const { id } = await service.createSession(actor, {
    name: `防災ワークショップ ${kind}`,
    kind,
    itemListId: list.id,
    teamCount: 2,
  });
  await service.setStatus(actor, id, "open");
  if (kind === "public") await service.activatePublic(actor, id);
  sessions.push({
    id,
    kind,
    accessCode: (await service.session(id).get()).data()?.accessCode,
    teams: kind === "lesson" ? await service.listTeams(actor, id) : [],
  });
}
console.log(JSON.stringify({ email, sessions }));
await db.terminate();
