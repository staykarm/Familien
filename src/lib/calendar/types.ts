import type { RecurrenceRule } from "./recurrence";

/** Aktivitet slik kalenderen i nettleseren får den. Tidspunkt er ISO i UTC. */
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  categoryId: string | null;
  participantIds: string[];
  syncStatus: "local" | "pending" | "synced" | "conflict" | "error";
  origin: "app" | "outlook";
  /** Feilmelding fra Outlook-synken, hvis den feilet. */
  syncError?: string | null;
  /** Outlook sin versjon når aktiviteten er endret begge steder. */
  conflict?: { title: string; start: string; end: string; allDay: boolean } | null;
  /** Satt når aktiviteten er en del av en gjentakende serie. */
  seriesId?: string | null;
  recurrence?: RecurrenceRule | null;
  /** Satt for oppgaver med frist som vises i kalenderen. id er da «task:<oppgave-id>». */
  kind?: "task" | "care";
  done?: boolean;
}

export interface CalendarMember {
  id: string;
  name: string;
  color: string;
  icon: string;
  isShared: boolean;
  avatarUrl: string | null;
}

export interface CalendarCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}
