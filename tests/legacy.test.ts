import { expect, it } from "vitest";
import { convertLegacy } from "../src/server/legacy";
it("preserves original answer names absent from the current catalog", () => {
  const result = convertLegacy(
    { name: "教材", items: [{ id: "water", name: "飲料水" }] },
    [{ id: "old", data: { selectedItems: ["水"] } }],
    false,
  );
  expect(result.catalog.items.map((i) => i.name)).toEqual(["飲料水", "水"]);
  expect(result.aggregate.submittedCount).toBe(1);
  expect(result.aggregate.counts[result.catalog.items[1].id]).toBe(1);
  expect(result.warnings).toHaveLength(1);
});
it("does not count unsubmitted teams and rejects malformed legacy ballots", () => {
  const list = { name: "教材", items: ["水"] };
  const result = convertLegacy(
    list,
    [
      { id: "a", data: { isSubmitted: false } },
      { id: "b", data: { isSubmitted: true, selectedItems: ["水"] } },
    ],
    true,
  );
  expect(result.aggregate.submittedCount).toBe(1);
  expect(() =>
    convertLegacy(list, [{ id: "c", data: { selectedItems: [42] } }], false),
  ).toThrow();
});
