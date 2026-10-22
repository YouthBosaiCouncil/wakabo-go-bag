import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { convertLegacy } from "../src/server/legacy";
const projectId = process.argv
  .find((value) => value.startsWith("--project="))
  ?.slice(10);
if (!projectId || !/^[a-z][a-z0-9-]{4,50}$/.test(projectId))
  throw new Error("Explicit --project=ID required.");
const apply = process.argv.includes("--apply");
const continuePublic = process.argv.includes("--continue-public");
const emulated = process.env.FIRESTORE_EMULATOR_HOST;
if (emulated && (projectId !== "demo-wakabo" || emulated !== "127.0.0.1:8080"))
  throw new Error("Migration emulator target must be local demo-wakabo.");
const credential = emulated
  ? undefined
  : process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? applicationDefault()
    : cert(
        JSON.parse(
          await readFile(`.private/${projectId}-runtime.json`, "utf8"),
        ),
      );
const app = initializeApp({ projectId, ...(credential ? { credential } : {}) });
const db = getFirestore(app);
const root = db.doc(`artifacts/${projectId}/public/data`);
const catalogs = await root.collection("itemLists").get();
const legacyLists = new Map(catalogs.docs.map((d) => [d.id, d.data()]));
const catalogPlans = [];
for (const source of catalogs.docs) {
  const id = `legacy-${source.id}`;
  if ((await root.collection("v2Catalogs").doc(id).get()).exists) continue;
  const list = source.data();
  if (typeof list.name !== "string" || !Array.isArray(list.items))
    throw new Error(`Invalid legacy catalog ${source.id}; no changes made.`);
  const converted = convertLegacy(
    { name: list.name, items: list.items },
    [],
    false,
  );
  catalogPlans.push({
    id,
    value: {
      ...converted.catalog,
      createdAt:
        list.createdAt?.toDate?.().toISOString() ?? new Date().toISOString(),
    },
  });
}
const plans = [];
let activePublicSources = 0;
const sourceArchive: unknown[] = [];
for (const collection of ["PublicSessions", "trainingSessions"]) {
  for (const doc of (await root.collection(collection).get()).docs) {
    const source = doc.data();
    const continuation =
      continuePublic &&
      collection === "PublicSessions" &&
      source.isActive === true;
    if (continuation) activePublicSources++;
    const id = `legacy-${createHash("sha256").update(`${collection}/${doc.id}`).digest("hex").slice(0, 24)}`;
    if ((await root.collection("v2Sessions").doc(id).get()).exists) continue;
    const list = legacyLists.get(source.itemListId);
    if (!list || typeof list.name !== "string" || !Array.isArray(list.items))
      throw new Error(
        `Missing legacy catalog for ${collection}/${doc.id}; no changes made.`,
      );
    const lesson =
      collection === "trainingSessions" && source.type === "lesson";
    const subcollection = lesson ? "teams" : "participants";
    const entries = (await doc.ref.collection(subcollection).get()).docs.map(
      (d) => ({ id: d.id, data: d.data() }),
    );
    const converted = convertLegacy(
      { name: list.name, items: list.items },
      entries,
      lesson,
    );
    const createdAt =
      source.createdAt?.toDate?.().toISOString() ?? new Date().toISOString();
    const session = {
      name: source.name || "移行済みセッション",
      kind:
        collection === "PublicSessions"
          ? "public"
          : lesson
            ? "lesson"
            : "workshop",
      status: continuation ? "open" : "closed",
      generation: 1,
      itemListId: `legacy-${source.itemListId}`,
      catalog: {
        ...converted.catalog,
        id: `legacy-${source.itemListId}`,
        createdAt,
      },
      teamCount: lesson ? entries.length : 0,
      createdAt,
      ...(continuation
        ? { importedFrom: `${collection}/${doc.id}` }
        : { legacySource: `${collection}/${doc.id}` }),
    };
    plans.push({
      id,
      session,
      continuation,
      sourcePath: `${collection}/${doc.id}`,
      ...converted,
    });
    sourceArchive.push({ path: doc.ref.path, source, list, entries });
  }
}
if (activePublicSources > 1)
  throw new Error(
    "Multiple active public sessions; choose one in the old system before migration. No changes made.",
  );
console.log(
  JSON.stringify({
    projectId,
    mode: apply ? "apply" : "dry-run",
    sessions: plans.length,
    catalogs: catalogPlans.length,
    continuedPublicSessions: plans.filter((plan) => plan.continuation).length,
    answers: plans.reduce((sum, plan) => sum + plan.answers.length, 0),
    warnings: plans.flatMap((plan) => plan.warnings),
  }),
);
if (apply && (plans.length || catalogPlans.length)) {
  await mkdir(".private", { recursive: true });
  await writeFile(
    `.private/migration-${projectId}-${Date.now()}.json`,
    JSON.stringify({
      catalogs: catalogs.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
      sessions: sourceArchive,
    }),
    { flag: "wx", mode: 0o600 },
  );
  for (const plan of catalogPlans) {
    const ref = root.collection("v2Catalogs").doc(plan.id);
    await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return;
      tx.create(ref, plan.value);
      tx.create(ref.collection("versions").doc("1"), plan.value);
    });
  }
  for (const plan of plans) {
    const ref = root.collection("v2Sessions").doc(plan.id);
    const writer = db.bulkWriter();
    for (const answer of plan.answers)
      writer.set(ref.collection("answers").doc(answer.id), {
        ...answer,
        ownerUid: "legacy-import",
        generation: 1,
        submittedAt: plan.session.createdAt,
      });
    await writer.close();
    await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return;
      tx.create(ref, plan.session);
      tx.create(ref.collection("aggregates").doc("current"), plan.aggregate);
      if (plan.continuation)
        tx.set(root.collection("v2Settings").doc("public"), {
          activeSessionId: ref.id,
        });
      tx.create(root.collection("v2Audit").doc(), {
        actorUid: "migration-operator",
        action: "legacy.import",
        target: plan.sourcePath,
        at: new Date().toISOString(),
      });
    });
  }
}
await db.terminate();
