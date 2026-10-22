"use client";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import type {
  Catalog,
  SessionKind,
  SessionRecord,
  TeamRecord,
} from "@/domain/model";
import type { NotificationType } from "@/types";
export default function SessionManager({
  catalogs,
  sessions,
  activeId,
  onChanged,
  onResults,
  setNotification,
}: {
  catalogs: Catalog[];
  sessions: SessionRecord[];
  activeId: string | null;
  onChanged: () => void;
  onResults: (id: string) => void;
  setNotification: (n: NotificationType) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SessionKind>("public");
  const [catalogId, setCatalogId] = useState("");
  const [teamCount, setTeamCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [teams, setTeams] = useState<Record<string, TeamRecord[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  async function action(path: string, method = "POST", body?: unknown) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await api(path, { method, body });
      onChanged();
      setNotification({ type: "success", message: "保存しました。" });
    } catch (error) {
      setNotification({
        type: "error",
        message:
          error instanceof Error ? error.message : "操作に失敗しました。",
      });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function showTeams(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (teams[id]) return;
    try {
      const data = await api<TeamRecord[]>(`/sessions/${id}/teams`);
      setTeams((old) => ({ ...old, [id]: data }));
    } catch (error) {
      setNotification({
        type: "error",
        message:
          error instanceof Error ? error.message : "コードを取得できません。",
      });
      setExpanded(null);
    }
  }
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-bold">セッション管理</h2>
      <Card>
        <h3 className="text-xl font-bold mb-4">新しいセッション</h3>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action("/sessions", "POST", {
              name,
              kind,
              itemListId: catalogId,
              teamCount,
            });
          }}
        >
          <label className="space-y-1">
            セッション名
            <input
              aria-label="セッション名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              className="block w-full rounded border border-border bg-input p-2"
            />
          </label>
          <label className="space-y-1">
            種類
            <select
              aria-label="種類"
              value={kind}
              onChange={(e) => setKind(e.target.value as SessionKind)}
              className="block w-full rounded border border-border bg-input p-2"
            >
              <option value="public">公開ワークショップ</option>
              <option value="workshop">コード式ワークショップ</option>
              <option value="lesson">授業（チーム）</option>
            </select>
          </label>
          <label className="space-y-1">
            教材
            <select
              aria-label="教材"
              value={catalogId}
              onChange={(e) => setCatalogId(e.target.value)}
              required
              className="block w-full rounded border border-border bg-input p-2"
            >
              <option value="">教材を選択</option>
              {catalogs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} v{c.version}
                </option>
              ))}
            </select>
          </label>
          {kind === "lesson" && (
            <label>
              チーム数
              <input
                aria-label="チーム数"
                type="number"
                min={1}
                max={50}
                value={teamCount}
                onChange={(e) => setTeamCount(Number(e.target.value))}
                className="block w-full rounded border border-border bg-input p-2"
                required
              />
            </label>
          )}
          <div className="sm:col-span-2">
            <p className="text-sm text-muted-foreground mb-3">
              教材は作成時点の内容に固定されます。作成後に受付を開始してください。
            </p>
            <Button type="submit" disabled={busy || !catalogs.length}>
              セッションを作成
            </Button>
          </div>
        </form>
      </Card>
      {!sessions.length && <p>セッションはまだありません。</p>}
      {sessions.map((s) => (
        <Card key={s.id}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold">{s.name}</h3>
              <p className="text-sm text-muted-foreground">
                {s.kind === "public"
                  ? "公開"
                  : s.kind === "lesson"
                    ? "授業"
                    : "コード式"}{" "}
                ·{" "}
                {s.status === "open"
                  ? "受付中"
                  : s.status === "deleting"
                    ? "削除中（再試行できます）"
                    : "受付終了"}
                {activeId === s.id ? " · トップページに公開中" : ""}
              </p>
              <p className="text-sm mt-2">
                {s.catalog.name} v{s.catalog.version}
              </p>
              {s.accessCode && (
                <p className="mt-2 font-mono break-all">
                  参加コード: {s.accessCode}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={busy || s.status === "deleting" || !!s.legacySource}
                onClick={() =>
                  void action(
                    `/sessions/${s.id}/${s.status === "open" ? "closed" : "open"}`,
                  )
                }
              >
                {s.legacySource
                  ? "移行済み履歴"
                  : s.status === "open"
                    ? "受付を終了"
                    : "受付を開始"}
              </Button>
              {s.kind === "public" && (
                <Button
                  disabled={busy || s.status !== "open" || activeId === s.id}
                  onClick={() => void action(`/sessions/${s.id}/publish`)}
                >
                  トップに公開
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={s.status === "deleting"}
                onClick={() => onResults(s.id)}
              >
                集計結果
              </Button>
              {s.kind === "lesson" && (
                <Button
                  variant="secondary"
                  onClick={() => void showTeams(s.id)}
                >
                  チームコード
                </Button>
              )}
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "セッションと回答をすべて削除します。続行しますか？",
                    )
                  )
                    void action(`/sessions/${s.id}`, "DELETE");
                }}
              >
                削除
              </Button>
            </div>
          </div>
          {expanded === s.id && (
            <div className="grid gap-2 mt-4 sm:grid-cols-2">
              {teams[s.id] ? (
                teams[s.id].map((team) => (
                  <p
                    key={team.id}
                    className="font-mono rounded bg-secondary p-3 break-all"
                  >
                    チーム{team.teamNumber}: {team.accessCode}
                  </p>
                ))
              ) : (
                <p role="status">コードを読み込み中...</p>
              )}
            </div>
          )}
        </Card>
      ))}
    </section>
  );
}
