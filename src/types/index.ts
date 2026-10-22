// Presentation types. Persisted records and API contracts live in domain/model.ts.
export type NotificationType = {
  type: "success" | "error";
  message: string;
} | null;
export interface ItemData {
  id?: string;
  name: string;
  icon?: string;
  category?: string;
  description?: string;
}
