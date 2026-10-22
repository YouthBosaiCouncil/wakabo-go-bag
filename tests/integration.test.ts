import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { WorkspaceService } from "../src/server/service";
import { adminAuth, adminDb } from "../src/server/firebase-admin";
import { handle } from "../src/server/http";
import { handleMaintenance } from "../src/server/maintenance";
import { Timestamp } from "firebase-admin/firestore";
import type { Actor } from "../src/domain/model";

const projectId = "demo-wakabo";
const administrator: Actor = { uid: "admin-user", admin: true };
const participant: Actor = { uid: "participant-a", admin: false };
let env: RulesTestEnvironment;
let service: WorkspaceService;
beforeAll(async () => {
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST
  )
    throw new Error(
      "Run npm run test:emulator. Real Firebase is never used in tests.",
    );
  process.env.FIREBASE_PROJECT_ID = projectId;
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
  service = new WorkspaceService(adminDb(), projectId);
});
beforeEach(async () => {
  await env.clearFirestore();
});
afterAll(async () => {
  await env?.cleanup();
  await adminDb().terminate();
});
const catalogData = {
  name: "教材",
  items: [
    { id: "water", name: "水" },
    { id: "food", name: "食料" },
  ],
};
async function fixture(kind: "public" | "lesson" | "workshop" = "public") {
  const catalog = await service.saveCatalog(administrator, catalogData);
  const { id } = await service.createSession(administrator, {
    name: "防災体験",
    kind,
    itemListId: catalog.id,
    teamCount: 2,
  });
  await service.setStatus(administrator, id, "open");
  if (kind === "public") await service.activatePublic(administrator, id);
  return { id, catalogId: catalog.id };
}
const ballot = (ids = ["water"], teamId: string | null = null) => ({
  requestId: crypto.randomUUID(),
  generation: 1,
  teamId,
  selectedItemIds: ids,
});

describe("direct Firestore boundary", () => {
  for (const identity of ["unauthenticated", "anonymous", "ordinary", "admin"])
    it(`denies every direct read/write for ${identity}`, async () => {
      const db =
        identity === "unauthenticated"
          ? env.unauthenticatedContext().firestore()
          : env
              .authenticatedContext(identity, {
                admin: identity === "admin",
                firebase: {
                  sign_in_provider:
                    identity === "anonymous" ? "anonymous" : "password",
                },
              })
              .firestore();
      for (const path of [
        "itemLists/x",
        "trainingSessions/x/participants/victim",
        "PublicSessions/x/teams/one",
        "v2Sessions/x/answers/victim",
        "v2Invites/secret",
      ]) {
        const ref = doc(db, `${service.root.path}/${path}`);
        await env.withSecurityRulesDisabled(async (context) =>
          setDoc(doc(context.firestore(), ref.path), { name: "protected" }),
        );
        await assertFails(getDoc(ref));
        await assertFails(setDoc(ref, { ownerUid: identity }));
        await assertFails(updateDoc(ref, { name: "changed" }));
        await assertFails(deleteDoc(ref));
      }
      await assertFails(
        getDocs(collection(db, `${service.root.path}/v2Sessions`)),
      );
    });
});
describe("server workflows", () => {
  it("rejects anonymous and ordinary users on all admin service operations", async () => {
    await expect(service.listCatalogs(participant)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service.saveCatalog(participant, catalogData),
    ).rejects.toMatchObject({ status: 403 });
    await expect(service.createSession(participant, {})).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service.deleteSession(participant, "victim"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.activatePublic(participant, "victim"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("preserves deliberate same-device ballots but deduplicates retries and concurrent retries", async () => {
    const { id } = await fixture();
    await service.join(participant);
    const first = ballot();
    await Promise.all([
      service.submit(participant, id, first),
      service.submit(participant, id, first),
    ]);
    await service.submit(participant, id, ballot(["food"]));
    const result = await service.results(participant, id);
    expect(result.aggregate.submittedCount).toBe(2);
    expect(result.aggregate.counts).toEqual({ water: 1, food: 1 });
    await expect(
      service.submit(participant, id, { ...first, selectedItemIds: ["food"] }),
    ).rejects.toMatchObject({ status: 409 });
    expect(JSON.stringify(result)).not.toMatch(
      /ownerUid|accessCode|participant-a|selectedItemIds/,
    );
  });
  it("rejects empty, duplicate, unknown, non-string, forged and oversize ballots", async () => {
    const { id } = await fixture();
    await service.join(participant);
    for (const ids of [
      [],
      ["water", "water"],
      ["bad"],
      ["__proto__"],
      [42],
      Array(11).fill("water"),
    ])
      await expect(
        service.submit(participant, id, {
          ...ballot(),
          selectedItemIds: ids,
        }),
      ).rejects.toThrow();
    await expect(
      service.submit(participant, id, {
        ...ballot(),
        ownerUid: "victim",
        teamId: "fake",
      }),
    ).rejects.toThrow();
    expect(
      (await service.results(participant, id)).aggregate.submittedCount,
    ).toBe(0);
  });
  it("requires membership, prevents cross-session access, rejects closed joins/submissions", async () => {
    const { id } = await fixture();
    await expect(
      service.submit(participant, id, ballot()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(service.results(participant, id)).rejects.toMatchObject({
      status: 403,
    });
    await service.join(participant);
    await service.setStatus(administrator, id, "closed");
    await expect(
      service.submit(participant, id, ballot()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(service.join(participant)).rejects.toMatchObject({
      status: 404,
    });
    const other = await fixture();
    await expect(
      service.submit(participant, other.id, ballot()),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("creates all teams atomically, uses private indexed codes and replaces team ballots", async () => {
    const { id } = await fixture("lesson");
    const teams = await service.listTeams(administrator, id);
    expect(teams).toHaveLength(2);
    expect(new Set(teams.map((t) => t.accessCode)).size).toBe(2);
    const info = await service.join(participant, teams[0].accessCode);
    expect(info.team?.id).toBe(teams[0].id);
    await service.submit(participant, id, ballot(["water"], teams[0].id));
    await service.submit(participant, id, ballot(["food"], teams[0].id));
    expect((await service.results(participant, id)).aggregate).toMatchObject({
      submittedCount: 1,
      counts: { water: 0, food: 1 },
    });
    expect(
      (await service.session(id).collection("answers").get()).docs[0].id,
    ).toBe(teams[0].id);
    await expect(service.join(participant, "1234")).rejects.toMatchObject({
      status: 400,
    });
  });
  it("binds parallel lesson tabs to their respective teams and receipt scopes", async () => {
    const { id } = await fixture("lesson");
    const teams = await service.listTeams(administrator, id);
    await service.join(participant, teams[0].accessCode);
    await expect(
      service.submit(participant, id, ballot(["water"], teams[1].id)),
    ).rejects.toMatchObject({ status: 403 });
    await service.join(participant, teams[1].accessCode);
    const first = ballot(["water"], teams[0].id);
    await service.submit(participant, id, first);
    await service.submit(participant, id, {
      ...first,
      teamId: teams[1].id,
      selectedItemIds: ["food"],
    });
    await service.submit(participant, id, first);
    expect(
      (
        await service.session(id).collection("answers").doc(teams[0].id).get()
      ).data()!.selectedItemIds,
    ).toEqual(["water"]);
    expect(
      (
        await service.session(id).collection("answers").doc(teams[1].id).get()
      ).data()!.selectedItemIds,
    ).toEqual(["food"]);
    expect((await service.results(participant, id)).aggregate).toMatchObject({
      submittedCount: 2,
      counts: { water: 1, food: 1 },
    });
    await expect(
      service.submit(participant, id, {
        ...ballot(["water"], teams[0].id),
        generation: 99,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("imports used and unused catalogs and historical ballots without deleting source data", async () => {
    await service.root
      .collection("itemLists")
      .doc("used")
      .set({ name: "教材", items: ["水"] });
    await service.root
      .collection("itemLists")
      .doc("unused")
      .set({ name: "未使用教材", items: ["食料"] });
    const old = service.root.collection("PublicSessions").doc("legacy-session");
    await old.set({ name: "過去の授業", itemListId: "used" });
    await old
      .collection("participants")
      .doc("one")
      .set({ selectedItems: ["水"] });
    const run = () =>
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/migrate.mts",
          "--project=demo-wakabo",
          "--apply",
        ],
        { env: process.env, encoding: "utf8", timeout: 20000 },
      );
    expect(run()).toContain('"answers":1');
    expect(
      (await service.listCatalogs(administrator)).map((c) => c.name).sort(),
    ).toEqual(["教材", "未使用教材"].sort());
    const imported = (await service.listSessions(administrator)).sessions[0];
    expect(
      (await service.results(administrator, imported.id)).aggregate
        .submittedCount,
    ).toBe(1);
    expect((await old.collection("participants").get()).size).toBe(1);
    expect(run()).toContain('"sessions":0');
    await expect(
      service.setStatus(administrator, imported.id, "open"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("continues the active public session with existing counts and fresh authenticated ballots", async () => {
    await service.root
      .collection("itemLists")
      .doc("catalog")
      .set({ name: "教材", items: ["水"] });
    const old = service.root.collection("PublicSessions").doc("active");
    await old.set({ name: "開催中", itemListId: "catalog", isActive: true });
    await old
      .collection("participants")
      .doc("one")
      .set({ selectedItems: ["水"] });
    const args = [
      "--import",
      "tsx",
      "scripts/migrate.mts",
      "--project=demo-wakabo",
      "--continue-public",
      "--apply",
    ];
    const run = () =>
      execFileSync(process.execPath, args, {
        env: process.env,
        encoding: "utf8",
        timeout: 20000,
      });
    expect(run()).toContain('"continuedPublicSessions":1');
    const info = await service.join(participant);
    expect(info.session.status).toBe("open");
    expect(
      (await service.results(participant, info.session.id)).aggregate
        .submittedCount,
    ).toBe(1);
    await service.submit(
      participant,
      info.session.id,
      ballot([info.session.catalog.items[0].id]),
    );
    expect(
      (await service.results(participant, info.session.id)).aggregate
        .submittedCount,
    ).toBe(2);
    await service.setStatus(administrator, info.session.id, "closed");
    expect(run()).toContain('"sessions":0');
    expect((await service.pointer().get()).data()!.activeSessionId).toBeNull();
    expect((await service.session(info.session.id).get()).data()!.status).toBe(
      "closed",
    );
  });
  it("keeps historical labels and votes fixed after catalog edit/deletion", async () => {
    const { id, catalogId } = await fixture();
    await service.join(participant);
    await service.submit(participant, id, ballot());
    await service.saveCatalog(
      administrator,
      { ...catalogData, version: 1, items: [{ id: "water", name: "飲料水" }] },
      catalogId,
    );
    await expect(
      service.saveCatalog(
        administrator,
        { ...catalogData, version: 1 },
        catalogId,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await service.deleteCatalog(administrator, catalogId);
    const result = await service.results(participant, id);
    expect(result.session.catalog.items[0].name).toBe("水");
    expect(result.aggregate.counts.water).toBe(1);
  });
  it("serializes activation to one pointer and stops ballots to a displaced public session", async () => {
    const a = await fixture();
    await service.join(participant);
    const b = await fixture();
    await Promise.all([
      service.activatePublic(administrator, a.id),
      service.activatePublic(administrator, b.id),
    ]);
    const current = (await service.pointer().get()).data()!.activeSessionId;
    expect([a.id, b.id]).toContain(current);
    const old = current === a.id ? b.id : a.id;
    await service
      .member(service.session(old), participant.uid)
      .set({ generation: 1, teamId: null, teamNumber: null });
    await expect(
      service.submit(participant, old, ballot()),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("does not lose counts during concurrent submissions", async () => {
    const { id } = await fixture();
    await service.join(participant);
    await Promise.all(
      Array.from({ length: 6 }, () =>
        service.submit(participant, id, ballot()),
      ),
    );
    expect((await service.results(participant, id)).aggregate).toMatchObject({
      submittedCount: 6,
      counts: { water: 6 },
    });
  });
  it("recursively deletes answers, members, receipts and invite indexes and supports retries", async () => {
    const { id } = await fixture("workshop");
    const code = (await service.session(id).get()).data()!.accessCode;
    await service.join(participant, code);
    await service.submit(participant, id, ballot());
    await service.deleteSession(administrator, id);
    await service.deleteSession(administrator, id);
    expect((await service.session(id).get()).exists).toBe(false);
    expect(await service.session(id).listCollections()).toHaveLength(0);
    await expect(service.join(participant, code)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("enforces distributed rate limits", async () => {
    await service.rateLimit("test", 1);
    await expect(service.rateLimit("test", 1)).rejects.toMatchObject({
      status: 429,
    });
  });
});

describe("HTTP authentication and input boundary", () => {
  it("protects scheduled cleanup and deletes only expired rate limits", async () => {
    const oldSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-only-maintenance-secret-with-32-characters";
    try {
      const url = "http://localhost/api/maintenance";
      expect((await handleMaintenance(new Request(url))).status).toBe(401);
      expect(
        (
          await handleMaintenance(
            new Request(url, { headers: { authorization: "Bearer forged" } }),
          )
        ).status,
      ).toBe(401);
      const limits = service.root.collection("v2RateLimits");
      await limits
        .doc("expired")
        .set({ expiresAt: Timestamp.fromMillis(Date.now() - 60_000) });
      await limits
        .doc("active")
        .set({ expiresAt: Timestamp.fromMillis(Date.now() + 60_000) });
      const result = await handleMaintenance(
        new Request(url, {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        }),
      );
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ deleted: 1, hasMore: false });
      expect((await limits.doc("active").get()).exists).toBe(true);
      expect((await limits.doc("expired").get()).exists).toBe(false);
    } finally {
      if (oldSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = oldSecret;
    }
  });
  async function token(admin: boolean) {
    const email = `${crypto.randomUUID()}@example.test`;
    const password = "test-only-strong-password";
    const endpoint =
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:";
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    };
    const signed = await (
      await fetch(`${endpoint}signUp?key=demo`, options)
    ).json();
    if (admin)
      await adminAuth().setCustomUserClaims(signed.localId, { admin: true });
    return (
      await (
        await fetch(`${endpoint}signInWithPassword?key=demo`, options)
      ).json()
    ).idToken as string;
  }
  it("rejects missing/forged tokens before touching administrative data", async () => {
    for (const headers of [{}, { authorization: "Bearer forged" }] as Record<
      string,
      string
    >[]) {
      const response = await handle(
        new Request("http://localhost/api/workspace/catalogs", { headers }),
        ["catalogs"],
      );
      expect(response.status).toBe(401);
    }
  });
  it("rejects a signed ordinary account and accepts only an explicit admin claim", async () => {
    const ordinary = await token(false);
    const admin = await token(true);
    expect(
      (
        await handle(
          new Request("http://localhost/api/workspace/catalogs", {
            headers: { authorization: `Bearer ${ordinary}` },
          }),
          ["catalogs"],
        )
      ).status,
    ).toBe(403);
    const response = await handle(
      new Request("http://localhost/api/workspace/catalogs", {
        headers: { authorization: `Bearer ${admin}` },
      }),
      ["catalogs"],
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects cross-origin requests, invalid JSON and oversized streamed bodies", async () => {
    const auth = await token(true);
    const request = (body: string, origin = "http://localhost") =>
      new Request("http://localhost/api/workspace/catalogs", {
        method: "POST",
        headers: {
          authorization: `Bearer ${auth}`,
          "content-type": "application/json",
          origin,
        },
        body,
      });
    expect(
      (await handle(request("{}", "https://evil.test"), ["catalogs"])).status,
    ).toBe(403);
    expect((await handle(request("{"), ["catalogs"])).status).toBe(400);
    expect(
      (await handle(request("a".repeat(65537)), ["catalogs"])).status,
    ).toBe(413);
  });
});
