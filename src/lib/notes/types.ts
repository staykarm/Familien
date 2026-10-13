import type { DocNode } from "./text";

export interface NoteSummary {
  id: string;
  title: string;
  preview: string;
  ownerId: string | null;
  pinned: boolean;
  updatedAt: string;
  deletedAt: string | null;
  checklist: { done: number; total: number };
}

export interface NoteFull extends NoteSummary {
  content: DocNode;
  version: number;
}
