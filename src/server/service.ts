import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  AppError,
  applyBallot,
  ballotSchema,
  catalogInputSchema,
  emptyAggregate,
  idSchema,
  normalizeCode,
  requireAdmin,
  sessionInputSchema,
  validateSelection,
  type Actor,
  type Aggregate,
  type Catalog,
  type Participation,
  type SessionRecord,
  type TeamRecord,
} from "../domain/model";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const inviteCode = () => randomBytes(8).toString("hex").toUpperCase();
const safeId = (value: string) => idSchema.parse(value);
const now = () => new Date().toISOString();
type Membership = {
  generation: number;
  teamId: string | null;
  teamNumber: number | null;
};

export class WorkspaceService {
  readonly root: DocumentReference;
  constructor(
    readonly db: Firestore,
    projectId: string,
  ) {
    this.root = db.doc(`artifacts/${safeId(projectId)}/public/data`);
  }
  sessions() {
    return this.root.collection("v2Sessions");
  }
  catalogs() {
    return this.root.collection("v2Catalogs");
  }
  pointer() {
    return this.root.collection("v2Settings").doc("public");
  }
  session(id: string) {
    return this.sessions().doc(safeId(id));
  }
  member(ref: DocumentReference, uid: string, teamId?: string | null) {
    return ref
      .collection("members")
      .doc(hash(teamId ? `${uid}:team:${teamId}` : uid));
  }
  invite(code: string) {
    return this.root.collection("v2Invites").doc(hash(code));
  }

  async rateLimit(key: string, maximum: number, intervalMs = 60_000) {
    const ref = this.root.collection("v2RateLimits").doc(hash(key));
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const old = snap.data();
      const reset = !old || old.resetAt <= Date.now();
      const count = reset ? 0 : old.count;
      if (count >= maximum)
        throw new AppError(
          429,
          "操作が多すぎます。しばらくしてから再試行してください。",
        );
      tx.set(ref, {
        count: count + 1,
        resetAt: reset ? Date.now() + intervalMs : old!.resetAt,
        expiresAt: Timestamp.fromMillis(Date.now() + intervalMs * 2),
      });
    });
  }

  async listCatalogs(actor: Actor) {
    requireAdmin(actor);
    const snap = await this.catalogs()
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Catalog);
  }

  async saveCatalog(actor: Actor, input: unknown, id?: string) {
    requireAdmin(actor);
    const data = catalogInputSchema.parse(input);
    const ref = id ? this.catalogs().doc(safeId(id)) : this.catalogs().doc();
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (id && !snap.exists) throw new AppError(404, "教材が見つかりません。");
      if (snap.data()?.deleting) throw new AppError(409, "教材を削除中です。");
      const old = snap.data() as Catalog | undefined;
      if (old && data.version !== old.version)
        throw new AppError(
          409,
          "教材が別の画面で更新されました。再読み込みしてください。",
        );
      const value = {
        ...data,
        version: (old?.version ?? 0) + 1,
        createdAt: old?.createdAt ?? now(),
      };
      tx.set(ref, value);
      tx.set(ref.collection("versions").doc(String(value.version)), value);
      this.audit(tx, actor, "catalog.save", ref.id);
    });
    return { id: ref.id };
  }

  async deleteCatalog(actor: Actor, id: string) {
    requireAdmin(actor);
    const ref = this.catalogs().doc(safeId(id));
    // Sessions own an immutable snapshot; catalog deletion cannot invalidate history.
    await this.db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) tx.update(ref, { deleting: true });
    });
    await this.db.recursiveDelete(ref);
    await this.recordAudit(actor, "catalog.delete", id);
  }

  async listSessions(actor: Actor, cursor?: string) {
    requireAdmin(actor);
    let q = this.sessions()
      .orderBy("createdAt", "desc")
      .orderBy("__name__", "desc")
      .limit(30);
    if (cursor) {
      const snap = await this.session(cursor).get();
      if (!snap.exists)
        throw new AppError(400, "一覧を再読み込みしてください。");
      q = q.startAfter(snap);
    }
    const [snap, pointer] = await Promise.all([q.get(), this.pointer().get()]);
    return {
      sessions: snap.docs.map(
        (d) => ({ ...d.data(), id: d.id }) as SessionRecord,
      ),
      activeSessionId: pointer.data()?.activeSessionId ?? null,
      nextCursor: snap.size === 30 ? snap.docs.at(-1)!.id : null,
    };
  }

  async createSession(actor: Actor, input: unknown) {
    requireAdmin(actor);
    const data = sessionInputSchema.parse(input);
    const ref = this.sessions().doc();
    const teams: TeamRecord[] =
      data.kind === "lesson"
        ? Array.from({ length: data.teamCount }, (_, i) => ({
            id: randomUUID(),
            teamNumber: i + 1,
            accessCode: inviteCode(),
          }))
        : [];
    const accessCode = data.kind === "workshop" ? inviteCode() : null;
    await this.db.runTransaction(async (tx) => {
      const catalogSnap = await tx.get(this.catalogs().doc(data.itemListId));
      if (!catalogSnap.exists || catalogSnap.data()?.deleting)
        throw new AppError(404, "教材が見つかりません。");
      const catalog = { ...catalogSnap.data(), id: catalogSnap.id } as Catalog;
      const codes = teams
        .map((t) => t.accessCode)
        .concat(accessCode ? [accessCode] : []);
      for (const code of codes) {
        if ((await tx.get(this.invite(code))).exists)
          throw new AppError(
            409,
            "コードが衝突しました。もう一度作成してください。",
          );
      }
      tx.create(ref, {
        name: data.name,
        kind: data.kind,
        itemListId: data.itemListId,
        catalog,
        status: "closed",
        generation: 1,
        teamCount: teams.length,
        createdAt: now(),
        ...(accessCode ? { accessCode } : {}),
      });
      tx.create(ref.collection("aggregates").doc("current"), emptyAggregate());
      for (const team of teams) {
        tx.create(ref.collection("teams").doc(team.id), team);
        tx.create(this.invite(team.accessCode), {
          sessionId: ref.id,
          teamId: team.id,
          teamNumber: team.teamNumber,
          generation: 1,
        });
      }
      if (accessCode)
        tx.create(this.invite(accessCode), {
          sessionId: ref.id,
          teamId: null,
          teamNumber: null,
          generation: 1,
        });
      this.audit(tx, actor, "session.create", ref.id);
    });
    return { id: ref.id };
  }

  async listTeams(actor: Actor, id: string) {
    requireAdmin(actor);
    const snap = await this.session(id)
      .collection("teams")
      .orderBy("teamNumber")
      .limit(50)
      .get();
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as TeamRecord);
  }

  async setStatus(actor: Actor, id: string, status: "open" | "closed") {
    requireAdmin(actor);
    const ref = this.session(id);
    await this.db.runTransaction(async (tx) => {
      const [snap, pointer] = await Promise.all([
        tx.get(ref),
        tx.get(this.pointer()),
      ]);
      if (!snap.exists || snap.data()!.status === "deleting")
        throw new AppError(404, "セッションが見つかりません。");
      if (status === "open" && snap.data()!.legacySource)
        throw new AppError(
          409,
          "移行済みの履歴は参照専用です。新しいセッションを作成してください。",
        );
      tx.update(ref, { status });
      if (status === "closed" && pointer.data()?.activeSessionId === id)
        tx.set(this.pointer(), { activeSessionId: null });
      this.audit(tx, actor, `session.${status}`, id);
    });
  }

  async activatePublic(actor: Actor, id: string) {
    requireAdmin(actor);
    const ref = this.session(id);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (
        !snap.exists ||
        snap.data()!.kind !== "public" ||
        snap.data()!.status !== "open"
      )
        throw new AppError(409, "受付中の公開セッションを選択してください。");
      tx.set(this.pointer(), { activeSessionId: id });
      this.audit(tx, actor, "session.publish", id);
    });
  }

  async join(actor: Actor, code?: string): Promise<Participation> {
    if (code !== undefined && !/^[A-F0-9]{16}$/.test(normalizeCode(code)))
      throw new AppError(400, "16桁の参加コードを入力してください。");
    return this.db.runTransaction(async (tx) => {
      let id: string;
      let membership: Membership;
      if (code !== undefined) {
        const invite = (await tx.get(this.invite(normalizeCode(code)))).data();
        if (!invite)
          throw new AppError(404, "有効な参加コードではありません。");
        id = invite.sessionId;
        membership = {
          generation: invite.generation,
          teamId: invite.teamId,
          teamNumber: invite.teamNumber,
        };
      } else {
        const pointer = (await tx.get(this.pointer())).data();
        if (!pointer?.activeSessionId)
          throw new AppError(404, "現在、公開中のセッションはありません。");
        id = pointer.activeSessionId;
        membership = { generation: 0, teamId: null, teamNumber: null };
      }
      const ref = this.session(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError(404, "セッションが見つかりません。");
      const session = { ...snap.data(), id } as SessionRecord;
      if (
        session.status !== "open" ||
        (code === undefined && session.kind !== "public") ||
        (code !== undefined && session.generation !== membership.generation)
      )
        throw new AppError(409, "このセッションは受付を終了しました。");
      membership.generation = session.generation;
      tx.set(this.member(ref, actor.uid), membership);
      if (membership.teamId)
        tx.set(this.member(ref, actor.uid, membership.teamId), membership);
      return this.participation(session, membership);
    });
  }

  private participation(
    session: SessionRecord,
    membership?: Membership,
  ): Participation {
    // Explicit projection: never return invitation codes, ownership, or raw answers.
    const { id, name, kind, status, generation, catalog } = session;
    return {
      session: { id, name, kind, status, generation, catalog },
      ...(membership?.teamId
        ? {
            team: { id: membership.teamId, teamNumber: membership.teamNumber! },
          }
        : {}),
    };
  }

  async results(actor: Actor, id: string) {
    const ref = this.session(id);
    const [snap, member, aggregate] = await Promise.all([
      ref.get(),
      this.member(ref, actor.uid).get(),
      ref.collection("aggregates").doc("current").get(),
    ]);
    if (!snap.exists || snap.data()!.status === "deleting")
      throw new AppError(404, "セッションが見つかりません。");
    const session = { ...snap.data(), id } as SessionRecord;
    if (
      !actor.admin &&
      (!member.exists || member.data()!.generation !== session.generation)
    )
      throw new AppError(403, "このセッションに参加してください。");
    return {
      session: this.participation(session).session,
      aggregate:
        (aggregate.data() as Aggregate | undefined) ?? emptyAggregate(),
    };
  }

  async submit(actor: Actor, id: string, input: unknown) {
    const data = ballotSchema.parse(input);
    const ref = this.session(id);
    return this.db.runTransaction(async (tx) => {
      const [snap, memberSnap, pointer] = await Promise.all([
        tx.get(ref),
        tx.get(this.member(ref, actor.uid, data.teamId)),
        tx.get(this.pointer()),
      ]);
      if (!snap.exists) throw new AppError(404, "セッションが見つかりません。");
      const session = { ...snap.data(), id } as SessionRecord;
      const member = memberSnap.data() as Membership | undefined;
      if (
        !member ||
        member.generation !== session.generation ||
        data.generation !== session.generation ||
        member.teamId !== data.teamId
      )
        throw new AppError(
          403,
          "参加情報が無効です。もう一度参加してください。",
        );
      validateSelection(session.catalog.items, data.selectedItemIds);
      const receiptRef = ref
        .collection("receipts")
        .doc(
          hash(
            `${actor.uid}:${data.teamId ?? "individual"}:${data.generation}:${data.requestId}`,
          ),
        );
      const receipt = await tx.get(receiptRef);
      if (receipt.exists) {
        if (
          JSON.stringify(receipt.data()!.selectedItemIds) !==
          JSON.stringify(data.selectedItemIds)
        )
          throw new AppError(409, "送信済みの回答内容と異なります。");
        return { submitted: true, replayed: true };
      }
      if (
        session.status !== "open" ||
        (session.kind === "public" && pointer.data()?.activeSessionId !== id)
      )
        throw new AppError(409, "このセッションは受付を終了しました。");
      if (session.kind === "lesson" && !member.teamId)
        throw new AppError(403, "チームへの参加が必要です。");
      const answerRef = ref
        .collection("answers")
        .doc(
          session.kind === "lesson"
            ? member.teamId!
            : hash(`${actor.uid}:${data.requestId}`),
        );
      const aggregateRef = ref.collection("aggregates").doc("current");
      const [answer, aggregate] = await Promise.all([
        tx.get(answerRef),
        tx.get(aggregateRef),
      ]);
      const before = answer.exists
        ? (answer.data()!.selectedItemIds as string[])
        : null;
      const updated = applyBallot(
        (aggregate.data() as Aggregate | undefined) ?? emptyAggregate(),
        before,
        data.selectedItemIds,
      );
      const value = {
        selectedItemIds: data.selectedItemIds,
        ownerUid: actor.uid,
        teamId: member.teamId,
        generation: session.generation,
        submittedAt: now(),
      };
      tx.set(answerRef, value);
      tx.set(aggregateRef, updated);
      tx.create(receiptRef, {
        selectedItemIds: data.selectedItemIds,
        submittedAt: value.submittedAt,
      });
      return { submitted: true, replayed: false };
    });
  }

  async deleteSession(actor: Actor, id: string) {
    requireAdmin(actor);
    const ref = this.session(id);
    // Persist a tombstone first. Retries can resume recursive deletion, and joins/submits
    // racing with deletion conflict on the parent transaction and observe the tombstone.
    await this.db.runTransaction(async (tx) => {
      const [snap, pointer] = await Promise.all([
        tx.get(ref),
        tx.get(this.pointer()),
      ]);
      if (snap.exists) tx.update(ref, { status: "deleting" });
      if (pointer.data()?.activeSessionId === id)
        tx.set(this.pointer(), { activeSessionId: null });
      this.audit(tx, actor, "session.delete", id);
    });
    const invites = await this.root
      .collection("v2Invites")
      .where("sessionId", "==", id)
      .get();
    const writer = this.db.bulkWriter();
    for (const invite of invites.docs) writer.delete(invite.ref);
    await writer.close();
    await this.db.recursiveDelete(ref);
  }

  private audit(tx: Transaction, actor: Actor, action: string, target: string) {
    tx.create(this.root.collection("v2Audit").doc(), {
      actorUid: actor.uid,
      action,
      target,
      at: now(),
    });
  }
  private async recordAudit(actor: Actor, action: string, target: string) {
    await this.root
      .collection("v2Audit")
      .add({ actorUid: actor.uid, action, target, at: now() });
  }
}
