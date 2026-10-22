"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { participantUser } from "@/lib/firebase";
import { Button, Card, Item } from "@/components/ui";
import type { BallotInput, Participation } from "@/domain/model";
import { ballotSchema } from "@/domain/model";
import type { NotificationType } from "@/types";

export default function ParticipantMode({
  info,
  setNotification,
  onSubmitted,
}: {
  info: Participation;
  setNotification: (n: NotificationType) => void;
  onSubmitted: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<BallotInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const key = useRef("");
  const sending = useRef(false);
  useEffect(() => {
    let active = true;
    participantUser()
      .then((user) => {
        key.current = `wakabo-ballot-v2:${user.uid}:${info.session.id}:${info.session.generation}:${info.team?.id ?? "individual"}`;
        try {
          const raw = sessionStorage.getItem(key.current);
          if (raw) {
            const data = ballotSchema.parse(JSON.parse(raw));
            if (active) {
              setPending(data);
              setSelected(data.selectedItemIds);
            }
          }
        } catch {
          sessionStorage.removeItem(key.current);
        }
        if (active) setReady(true);
      })
      .catch((error) => {
        if (active) setNotification({ type: "error", message: error.message });
      });
    return () => {
      active = false;
    };
  }, [
    info.session.id,
    info.session.generation,
    info.team?.id,
    setNotification,
  ]);
  function toggle(id: string) {
    if (pending || sending.current) return;
    if (selected.includes(id))
      setSelected(selected.filter((value) => value !== id));
    else if (selected.length < 10) setSelected([...selected, id]);
    else
      setNotification({
        type: "error",
        message: "アイテムは10個まで選択できます。",
      });
  }
  async function submit() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    const payload = pending ?? {
      requestId: crypto.randomUUID(),
      generation: info.session.generation,
      teamId: info.team?.id ?? null,
      selectedItemIds: selected,
    };
    try {
      // Persist before sending, so a reload after an ambiguous network failure retries
      // the same ballot instead of silently creating an additional vote.
      sessionStorage.setItem(key.current, JSON.stringify(payload));
      setPending(payload);
      await api(`/submit/${info.session.id}`, {
        method: "POST",
        body: payload,
        participant: true,
      });
      sessionStorage.removeItem(key.current);
      setNotification({ type: "success", message: "提出しました。" });
      onSubmitted();
    } catch (error) {
      setNotification({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "提出に失敗しました。同じ回答を再送できます。",
      });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">{info.session.name}</h1>
        <p>{info.team ? `チーム ${info.team.teamNumber}` : "個人ワーク"}</p>
        <p className="mt-4">必要なアイテムを1〜10個選んでください</p>
        <p aria-live="polite" className="mt-2 font-bold">
          選択中: {selected.length} / 10
        </p>
      </div>
      {pending && (
        <p role="status" className="rounded border border-border p-4">
          送信内容を保存しています。通信に失敗した場合は同じ内容で再送してください。
        </p>
      )}
      <Card>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {info.session.catalog.items.map((item) => (
            <Item
              key={item.id}
              item={item}
              isSelected={selected.includes(item.id)}
              onClick={() => toggle(item.id)}
              disabled={busy || !!pending || !ready}
            />
          ))}
        </div>
      </Card>
      <div className="sticky bottom-4 flex justify-center">
        <Button
          size="lg"
          disabled={!ready || busy || !selected.length}
          onClick={submit}
        >
          {busy
            ? "提出中..."
            : pending
              ? "同じ回答を再送する"
              : "この内容で提出する"}
        </Button>
      </div>
    </section>
  );
}
