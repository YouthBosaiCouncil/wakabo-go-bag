import { createHash } from "node:crypto";
import {
  applyBallot,
  catalogInputSchema,
  emptyAggregate,
  type CatalogItem,
} from "../domain/model";
const legacyId = (text: string) =>
  `legacy-${createHash("sha256").update(text).digest("hex").slice(0, 24)}`;
export function convertLegacy(
  list: { name: string; items: unknown[] },
  entries: { id: string; data: Record<string, unknown> }[],
  lesson: boolean,
) {
  const items: CatalogItem[] = [];
  const names = new Map<string, string>();
  const warnings: string[] = [];
  function add(name: string, source?: Record<string, unknown>) {
    if (names.has(name)) return names.get(name)!;
    const id = legacyId(name);
    items.push({
      id,
      name,
      category:
        typeof source?.category === "string" ? source.category : "その他",
      icon: typeof source?.icon === "string" ? source.icon : "package",
      description:
        typeof source?.description === "string" ? source.description : "",
    });
    names.set(name, id);
    return id;
  }
  for (const item of list.items) {
    if (typeof item === "string") add(item);
    else if (
      item &&
      typeof item === "object" &&
      "name" in item &&
      typeof item.name === "string"
    )
      add(item.name, item as Record<string, unknown>);
    else
      throw new Error(
        "Legacy catalog contains an invalid item. Source was not modified.",
      );
  }
  let aggregate = emptyAggregate();
  const answers: {
    id: string;
    selectedItemIds: string[];
    legacySourceId: string;
  }[] = [];
  for (const entry of entries) {
    if (lesson && entry.data.isSubmitted !== true) continue;
    const selected = entry.data.selectedItems;
    if (
      !Array.isArray(selected) ||
      selected.length === 0 ||
      selected.length > 10 ||
      selected.some((name) => typeof name !== "string")
    )
      throw new Error(
        `Invalid legacy ballot ${entry.id}. Source was not modified.`,
      );
    const ids = [
      ...new Set(
        (selected as string[]).map((name) => {
          if (!names.has(name)) {
            warnings.push(
              `Preserved an item missing from the current catalog in ballot ${entry.id}`,
            );
            return add(name);
          }
          return names.get(name)!;
        }),
      ),
    ];
    if (ids.length !== selected.length)
      warnings.push(`Deduplicated legacy ballot ${entry.id}`);
    aggregate = applyBallot(aggregate, null, ids);
    answers.push({
      id: legacyId(entry.id),
      selectedItemIds: ids,
      legacySourceId: entry.id,
    });
  }
  const catalog = catalogInputSchema.parse({ name: list.name, items });
  return { catalog: { ...catalog, version: 1 }, aggregate, answers, warnings };
}
