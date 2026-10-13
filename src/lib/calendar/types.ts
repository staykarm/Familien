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
