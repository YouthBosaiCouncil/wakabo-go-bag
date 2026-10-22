"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import SessionManager from "./SessionManager";
import ItemListManager from "./ItemListManager";
import { INITIAL_DEFAULT_ITEMS } from "@/lib/utils";
import type { Catalog, SessionRecord } from "@/domain/model";
import type { NotificationType } from "@/types";
const ResultsDashboard = dynamic(() => import("./ResultsDashboard"), {
  loading: () => <p role="status">結果を読み込み中...</p>,
});
export default function AdminHub({
  setNotification,
}: {
  setNotification: (n: NotificationType) => void;
}) {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"sessions" | "catalogs">("sessions");
  const [resultId, setResultId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      api<Catalog[]>("/catalogs", { signal: controller.signal }),
      api<{
        sessions: SessionRecord[];
        activeSessionId: string | null;
        nextCursor: string | null;
      }>("/sessions", { signal: controller.signal }),
    ])
      .then(([lists, page]) => {
        if (!controller.signal.aborted) {
          setCatalogs(lists);
          setSessions(page.sessions);
          setActiveId(page.activeSessionId);
          setCursor(page.nextCursor);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  const refresh = () => setRevision((value) => value + 1);
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const page = await api<{
        sessions: SessionRecord[];
        nextCursor: string | null;
      }>(`/sessions?cursor=${encodeURIComponent(cursor)}`);
      setSessions((old) => [
        ...new Map(
          [...old, ...page.sessions].map((session) => [session.id, session]),
        ).values(),
      ]);
      setCursor(page.nextCursor);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "読み込みに失敗しました。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function seed() {
    if (busy) return;
    setBusy(true);
    try {
      await api("/catalogs", {
        method: "POST",
        body: {
          name: "基本セット",
          items: INITIAL_DEFAULT_ITEMS.map((name, index) => ({
            id: `basic-${index + 1}`,
            name,
            category: "その他",
            icon: "package",
            description: "",
          })),
        },
      });
      refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "教材の作成に失敗しました。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={tab === "sessions" ? "default" : "secondary"}
          onClick={() => {
            setTab("sessions");
            setResultId(null);
          }}
        >
          セッション管理
        </Button>
        <Button
          variant={tab === "catalogs" ? "default" : "secondary"}
          onClick={() => {
            setTab("catalogs");
            setResultId(null);
          }}
        >
          教材管理
        </Button>
        <Button variant="ghost" onClick={refresh} disabled={loading}>
          一覧を更新
        </Button>
      </div>
      {error && (
        <div role="alert" className="p-4 border border-destructive rounded">
          <p>{error}</p>
          <Button onClick={refresh}>再試行</Button>
        </div>
      )}
      {loading ? (
        <p role="status">管理データを読み込み中...</p>
      ) : resultId ? (
        <ResultsDashboard
          sessionId={resultId}
          onBack={() => setResultId(null)}
        />
      ) : tab === "catalogs" ? (
        <ItemListManager
          catalogs={catalogs}
          onSaved={refresh}
          setNotification={setNotification}
        />
      ) : (
        <>
          {!catalogs.length && (
            <Card>
              <p className="mb-4">セッションを作るには教材が必要です。</p>
              <Button onClick={seed} disabled={busy}>
                基本セットを作成
              </Button>
            </Card>
          )}
          <SessionManager
            catalogs={catalogs}
            sessions={sessions}
            activeId={activeId}
            onChanged={refresh}
            onResults={setResultId}
            setNotification={setNotification}
          />
          {cursor && (
            <Button onClick={more} disabled={busy}>
              過去のセッションをさらに表示
            </Button>
          )}
        </>
      )}
    </div>
  );
}
