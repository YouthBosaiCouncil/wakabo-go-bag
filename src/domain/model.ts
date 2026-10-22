import { z } from "zod";

export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,100}$/)
  .refine(
    (value) => !["__proto__", "prototype", "constructor"].includes(value),
  );
const label = (max: number) => z.string().trim().min(1).max(max);
export const itemSchema = z
  .object({
    id: idSchema,
    name: label(100),
    category: z.string().trim().max(60).default("その他"),
    icon: z.string().max(40).default("package"),
    description: z.string().max(500).default(""),
  })
  .strict();
export const catalogInputSchema = z
  .object({
    name: label(100),
    items: z.array(itemSchema).min(1).max(100),
    version: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (v) => new Set(v.items.map((i) => i.id)).size === v.items.length,
    "品目IDが重複しています。",
  );
export const sessionInputSchema = z
  .object({
    name: label(100),
    kind: z.enum(["public", "workshop", "lesson"]),
    itemListId: idSchema,
    teamCount: z.number().int().min(1).max(50).default(1),
  })
  .strict();
export const ballotSchema = z
  .object({
    requestId: z.uuid(),
    generation: z.number().int().positive(),
    teamId: idSchema.nullable(),
    selectedItemIds: z.array(idSchema).min(1).max(10),
  })
  .strict();

export type CatalogItem = z.infer<typeof itemSchema>;
export type CatalogInput = z.infer<typeof catalogInputSchema>;
export type Catalog = CatalogInput & {
  id: string;
  version: number;
  createdAt: string;
};
export type SessionInput = z.infer<typeof sessionInputSchema>;
export type BallotInput = z.infer<typeof ballotSchema>;
export type SessionKind = SessionInput["kind"];
export type SessionStatus = "open" | "closed" | "deleting";
export interface SessionRecord {
  id: string;
  name: string;
  kind: SessionKind;
  status: SessionStatus;
  generation: number;
  itemListId: string;
  catalog: Catalog;
  teamCount: number;
  createdAt: string;
  accessCode?: string;
  legacySource?: string;
  importedFrom?: string;
}
export interface TeamRecord {
  id: string;
  teamNumber: number;
  accessCode: string;
}
export interface Participation {
  session: Pick<
    SessionRecord,
    "id" | "name" | "kind" | "status" | "generation" | "catalog"
  >;
  team?: Pick<TeamRecord, "id" | "teamNumber">;
}
export interface Aggregate {
  submittedCount: number;
  counts: Record<string, number>;
  updatedAt: string;
}
export interface ResultView {
  session: Participation["session"];
  aggregate: Aggregate;
}
export interface Actor {
  uid: string;
  admin: boolean;
}

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function requireAdmin(actor: Actor) {
  if (!actor.admin) throw new AppError(403, "管理者権限が必要です。");
}

export function validateSelection(items: CatalogItem[], selected: string[]) {
  const valid = new Set(items.map((i) => i.id));
  if (
    !selected.length ||
    selected.length > 10 ||
    new Set(selected).size !== selected.length ||
    selected.some((id) => !valid.has(id))
  ) {
    throw new AppError(
      400,
      "教材に含まれる品目を1〜10個、重複せず選んでください。",
    );
  }
}

export function normalizeCode(input: string) {
  return input.normalize("NFKC").toUpperCase().replace(/[\s-]/g, "");
}

export function emptyAggregate(): Aggregate {
  return { submittedCount: 0, counts: {}, updatedAt: new Date().toISOString() };
}

export function applyBallot(
  aggregate: Aggregate,
  before: string[] | null,
  after: string[],
): Aggregate {
  const counts = { ...aggregate.counts };
  for (const id of before ?? [])
    counts[id] = Math.max(0, (counts[id] ?? 0) - 1);
  for (const id of after) counts[id] = (counts[id] ?? 0) + 1;
  return {
    submittedCount: aggregate.submittedCount + (before ? 0 : 1),
    counts,
    updatedAt: new Date().toISOString(),
  };
}
