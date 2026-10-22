"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { makeCsv } from "@/domain/csv";
import type { ResultView } from "@/domain/model";
import { Button, Card } from "@/components/ui";

export default function ResultsDashboard({
  sessionId,
  participant = false,
  onBack,
}: {
  sessionId: string;
  participant?: boolean;
  onBack: () => void;
}) {
  const [data, setData] = useState<ResultView | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let controller: AbortController;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      if (document.visibilityState !== 'visible') {
        if (active) timer = setTimeout(() => void load(), 30_000);
        return;
      }
      controller = new AbortController();
      try {
        const result = await api<ResultView>(`/results/${sessionId}`, {
          participant,
          signal: controller.signal,
        });
        if (active) {
          setData(result);
          setError("");
        }
      } catch (error) {
        if (active)
          setError(
            error instanceof Error ? error.message : "集計を取得できません。",
          );
      }
      // No raw-answer subscription. Hidden tabs do not poll.
      if (active)
        timer = setTimeout(() => void load(), 30_000);
    }
    setData(null);
    setError("");
    void load();
    return () => {
      active = false;
      controller?.abort();
      clearTimeout(timer);
    };
  }, [sessionId, participant, retry]);
  const rows =
    data?.session.catalog.items
      .map((item) => ({ ...item, count: data.aggregate.counts[item.id] ?? 0 }))
      .sort((a, b) => b.count - a.count) ?? [];
  const total = data?.aggregate.submittedCount ?? 0;
  const rate = (count: number) =>
    total ? ((count / total) * 100).toFixed(1) : "0.0";
  function download() {
    if (!data) return;
    const csv = makeCsv([
      ["アイテム名", "カテゴリー", "選択数", "選択率(%)"],
      ...rows.map((row) => [
        row.name,
        row.category,
        row.count,
        rate(row.count),
      ]),
    ]);
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.session.name.replace(/[\\/:*?"<>|\r\n]/g, "_")}_集計結果.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-bold">
          {data?.session.name ?? "集計結果"}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onBack}>
            {participant ? "次の回答・選び直し" : "一覧に戻る"}
          </Button>
          <Button onClick={download} disabled={!data}>
            CSV出力
          </Button>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded border border-destructive p-4 space-y-2"
        >
          <p>
            {error}
            {data ? " 表示中の集計は最終取得時の値です。" : ""}
          </p>
          <Button onClick={() => setRetry((value) => value + 1)}>再試行</Button>
        </div>
      )}
      {!data && !error && <p role="status">結果を読み込み中...</p>}
      {data && (
        <>
          <p className="text-lg font-bold">
            {data.session.kind === "lesson" ? "提出チーム数" : "回答数"}:{" "}
            {total}
          </p>
          <p className="text-sm text-muted-foreground">
            30秒ごとに更新 · 最終取得:{" "}
            {new Date(data.aggregate.updatedAt).toLocaleString("ja-JP")}
          </p>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <caption className="sr-only">
                  持ち出し品の選択数と選択率
                </caption>
                <thead>
                  <tr>
                    <th className="p-2">アイテム</th>
                    <th className="p-2">選択数</th>
                    <th className="p-2">選択率</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <th scope="row" className="p-3 font-medium">
                        {row.name}
                        <div className="h-2 mt-2 rounded bg-secondary">
                          <div
                            className="h-full rounded bg-primary"
                            style={{ width: `${rate(row.count)}%` }}
                          />
                        </div>
                      </th>
                      <td className="p-3">{row.count}</td>
                      <td className="p-3">{rate(row.count)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </section>
  );
}
