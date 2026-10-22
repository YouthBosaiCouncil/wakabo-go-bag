"use client";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, Modal } from "@/components/ui";
import AddItemModal from "@/components/AddItemModal";
import type { Catalog, CatalogItem } from "@/domain/model";
import type { NotificationType } from "@/types";
export default function ItemListManager({
  catalogs,
  onSaved,
  setNotification,
}: {
  catalogs: Catalog[];
  onSaved: () => void;
  setNotification: (n: NotificationType) => void;
}) {
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    items: CatalogItem[];
    version?: number;
  } | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await api(`/catalogs${editing.id ? `/${editing.id}` : ""}`, {
        method: editing.id ? "PUT" : "POST",
        body: {
          name: editing.name,
          items: editing.items,
          ...(editing.version ? { version: editing.version } : {}),
        },
      });
      setEditing(null);
      onSaved();
      setNotification({
        type: "success",
        message: "教材を保存しました。既存セッションの教材は変わりません。",
      });
    } catch (error) {
      setNotification({
        type: "error",
        message:
          error instanceof Error ? error.message : "保存に失敗しました。",
      });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (
      !confirm("教材を削除しますか？既存セッションの教材と結果は保持されます。")
    )
      return;
    try {
      await api(`/catalogs/${id}`, { method: "DELETE" });
      onSaved();
    } catch (error) {
      setNotification({
        type: "error",
        message:
          error instanceof Error ? error.message : "削除に失敗しました。",
      });
    }
  }
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">教材管理</h2>
        <Button onClick={() => setEditing({ name: "", items: [] })}>
          新しい教材
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {catalogs.map((c) => (
          <Card key={c.id}>
            <h3 className="text-xl font-bold">
              {c.name} v{c.version}
            </h3>
            <p className="my-3">{c.items.length}品目</p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  setEditing({
                    id: c.id,
                    name: c.name,
                    items: c.items.map((i) => ({ ...i })),
                    version: c.version,
                  })
                }
              >
                編集
              </Button>
              <Button variant="destructive" onClick={() => void remove(c.id)}>
                削除
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <Modal
        isOpen={!!editing}
        onClose={() => {
          if (!busy) setEditing(null);
        }}
        title="教材を編集"
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        <form onSubmit={save} className="space-y-4">
          <label htmlFor="catalog-name">教材名</label>
          <input
            id="catalog-name"
            required
            maxLength={100}
            value={editing?.name ?? ""}
            onChange={(e) =>
              setEditing((old) =>
                old ? { ...old, name: e.target.value } : old,
              )
            }
            className="block w-full rounded border border-border bg-input p-2"
          />
          {editing?.items.map((item, index) => (
            <div key={item.id} className="flex gap-2">
              <input
                aria-label={`品目${index + 1}の名前`}
                value={item.name}
                maxLength={100}
                required
                onChange={(e) =>
                  setEditing((old) =>
                    old
                      ? {
                          ...old,
                          items: old.items.map((i) =>
                            i.id === item.id
                              ? { ...i, name: e.target.value }
                              : i,
                          ),
                        }
                      : old,
                  )
                }
                className="flex-1 min-w-0 rounded border border-border bg-input p-2"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setEditing((old) =>
                    old
                      ? {
                          ...old,
                          items: old.items.filter((i) => i.id !== item.id),
                        }
                      : old,
                  )
                }
              >
                削除
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={busy || (editing?.items.length ?? 0) >= 100}
            onClick={() => setAdding(true)}
          >
            品目を追加
          </Button>
          <p className="text-sm text-muted-foreground">
            1〜100品目。編集しても過去のセッションの集計は変わりません。
          </p>
          <Button type="submit" disabled={busy || !editing?.items.length}>
            教材を保存
          </Button>
        </form>
      </Modal>
      <AddItemModal
        isOpen={adding}
        onClose={() => setAdding(false)}
        existingItems={editing?.items ?? []}
        onAdd={(item) =>
          setEditing((old) =>
            old
              ? {
                  ...old,
                  items: [
                    ...old.items,
                    {
                      id: crypto.randomUUID(),
                      name: item.name,
                      category: item.category ?? "その他",
                      icon: item.icon ?? "package",
                      description: item.description ?? "",
                    },
                  ],
                }
              : old,
          )
        }
      />
    </section>
  );
}
