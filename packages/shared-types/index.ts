import type { DrawingDocument } from "../drawing-engine/model";
import type { Player } from "../core/index";
export interface Drawing {
  id: string;
  title: string;
  stageId: string | null;
  kind: "scene" | "clothing";
  subjectId?: string;
  asset: string;
  createdAt: string;
  updatedAt: string;
  completed: boolean;
  document: DrawingDocument;
  thumbnail?: Uint8Array | null;
}
export type DrawingSummary = Omit<Drawing, "document">;
export interface Backup {
  format: "colore-backup";
  version: 1;
  exportedAt: string;
  player: Player;
  drawings: Drawing[];
  legacy: Record<string, string>;
}
