"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Button, Card, Notification } from "@/components/ui";
import ParticipantMode from "@/modules/participant/ParticipantMode";
import type { Participation } from "@/domain/model";
import type { NotificationType } from "@/types";
const ResultsDashboard = dynamic(
  () => import("@/modules/admin/ResultsDashboard"),
  { loading: () => <p role="status">結果を読み込み中...</p> },
);

export default function PublicPage({
  codeEntry = false,
}: {
  codeEntry?: boolean;
}) {
  const [info, setInfo] = useState<Participation | null>(null);
  const [phase, setPhase] = useState<
    "loading" | "join" | "error" | "participating" | "results"
  >(codeEntry ? "join" : "loading");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [retry, setRetry] = useState(0);
  const [notification, setNotification] = useState<NotificationType>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (codeEntry) return;
    const controller = new AbortController();
    setPhase("loading");
    api<Participation>("/join", {
      method: "POST",
      body: {},
      participant: true,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setInfo(data);
          setPhase("participating");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error.message);
          setPhase("error");
        }
      });
    return () => controller.abort();
  }, [codeEntry, retry]);
  async function join(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setPhase("loading");
    try {
      setInfo(
        await api<Participation>("/join", {
          method: "POST",
          body: { code },
          participant: true,
        }),
      );
      setPhase("participating");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "参加できませんでした。",
      );
      setPhase("join");
    }
  }
  return (
    <AppShell>
      {notification && (
        <Notification {...notification} onClose={() => setNotification(null)} />
      )}
      {phase === "loading" && (
        <p role="status" className="text-center py-20">
          認証・セッションを確認中...
        </p>
      )}
      {phase === "error" && (
        <Card className="max-w-lg mx-auto text-center space-y-4">
          <p role="alert">{error}</p>
          <Button onClick={() => setRetry((value) => value + 1)}>再試行</Button>
        </Card>
      )}
      {phase === "join" && (
        <Card className="max-w-lg mx-auto">
          <h1 className="text-2xl font-bold mb-6">セッションに参加</h1>
          <form onSubmit={join} className="space-y-4">
            <label htmlFor="access-code">参加コード（16桁）</label>
            <input
              id="access-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={40}
              required
              className="block w-full rounded border border-border bg-input p-3 font-mono"
            />
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={!hydrated}>
              参加する
            </Button>
          </form>
        </Card>
      )}
      {phase === "participating" && info && (
        <ParticipantMode
          key={`${info.session.id}:${info.session.generation}`}
          info={info}
          setNotification={setNotification}
          onSubmitted={() => setPhase("results")}
        />
      )}
      {phase === "results" && info && (
        <ResultsDashboard
          sessionId={info.session.id}
          participant
          onBack={() => setPhase("participating")}
        />
      )}
    </AppShell>
  );
}
