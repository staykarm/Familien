import type { EventSuggestion, ShoppingSuggestion, TaskSuggestion } from "./schema";

export type SuggestionStatus = "pending" | "approved" | "rejected";

export type Suggestion =
  | { id: string; kind: "event"; status: SuggestionStatus; payload: EventSuggestion }
  | { id: string; kind: "task"; status: SuggestionStatus; payload: TaskSuggestion }
  | { id: string; kind: "shopping"; status: SuggestionStatus; payload: ShoppingSuggestion };

export interface UploadWithSuggestions {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  status: "uploaded" | "analyzing" | "done" | "failed";
  error: string | null;
  summary: string | null;
  createdAt: string;
  suggestions: Suggestion[];
}
