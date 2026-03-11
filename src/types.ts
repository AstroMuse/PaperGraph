import { Type } from "@google/genai";

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}

export interface PaperNode {
  id: string;
  name: string;
  citations: number;
  pdfUrl?: string;
  group?: string; // For clustering
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface PaperLink {
  source: string;
  target: string;
  type: string;
}

export interface RelationDefinition {
  id: string;
  label: string;
  color: string;
  directed: boolean;
}

export const DEFAULT_RELATIONS: RelationDefinition[] = [
  { id: "conflict", label: "冲突", color: "#ef4444", directed: true },
  { id: "similar", label: "相似", color: "#3b82f6", directed: false },
  { id: "premise", label: "前提", color: "#10b981", directed: true },
  { id: "support", label: "支持", color: "#f59e0b", directed: true },
  { id: "other", label: "其他", color: "#94a3b8", directed: false }
];
