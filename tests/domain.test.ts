import { describe, expect, it } from "vitest";
import {
  applyBallot,
  ballotSchema,
  catalogInputSchema,
  emptyAggregate,
  normalizeCode,
  validateSelection,
} from "../src/domain/model";
import { csvCell, makeCsv } from "../src/domain/csv";
const items = [
  { id: "water", name: "水", category: "", icon: "", description: "" },
];
describe("domain invariants", () => {
  it("rejects missing/duplicate/unknown/oversize selections", () => {
    for (const value of [
      [],
      ["water", "water"],
      ["unknown"],
      Array(11).fill("water"),
    ])
      expect(() => validateSelection(items, value)).toThrow();
    expect(() => validateSelection(items, ["water"])).not.toThrow();
  });
  it("rejects injected fields, prototype keys, malformed request IDs and duplicate item IDs", () => {
    expect(
      ballotSchema.safeParse({ requestId: "bad", selectedItemIds: ["water"] })
        .success,
    ).toBe(false);
    expect(
      ballotSchema.safeParse({
        requestId: crypto.randomUUID(),
        selectedItemIds: ["water"],
        ownerUid: "victim",
      }).success,
    ).toBe(false);
    for (const id of ["__proto__", "constructor", "prototype"])
      expect(
        catalogInputSchema.safeParse({
          name: "x",
          items: [{ ...items[0], id }],
        }).success,
      ).toBe(false);
    expect(
      catalogInputSchema.safeParse({ name: "x", items: [items[0], items[0]] })
        .success,
    ).toBe(false);
  });
  it("replaces team answers without inflating the denominator", () => {
    const one = applyBallot(emptyAggregate(), null, ["water"]);
    const two = applyBallot(one, ["water"], ["food"]);
    expect(two.submittedCount).toBe(1);
    expect(two.counts).toEqual({ water: 0, food: 1 });
  });
  it("normalizes full width input without stripping arbitrary invalid characters", () => {
    expect(normalizeCode("ａｂｃｄ-１２３４")).toBe("ABCD1234");
    expect(normalizeCode("ABCD/1234")).toBe("ABCD/1234");
  });
  it("escapes CSV delimiters, quotes, newlines and spreadsheet formulas", () => {
    expect(csvCell('水, "食料"\n予備')).toBe('"水, ""食料""\n予備"');
    for (const value of ["=1+1", "+cmd", "-1", "@sum", "  =1", "\t=1", "\r=1"])
      expect(csvCell(value).startsWith("\"'")).toBe(true);
    expect(makeCsv([["水", 1]])).toBe('\uFEFF"水","1"');
  });
});
