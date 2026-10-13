// Håndskrevne typer i samme format som `supabase gen types typescript`.
// Når prosjektet er koblet til: `npx supabase gen types typescript --linked > src/lib/database.types.ts`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      members: {
        Row: {
          id: string;
          slug: string;
          name: string;
          color: string;
          icon: string;
          avatar_path: string | null;
          details: Json;
          is_shared: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          color: string;
          icon?: string;
          avatar_path?: string | null;
          details?: Json;
          is_shared?: boolean;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["members"]["Insert"]>;
        Relationships: [];
      };
      app_users: {
        Row: {
          user_id: string;
          role: "adult" | "shared";
          member_id: string | null;
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          role: "adult" | "shared";
          member_id?: string | null;
          display_name?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["app_users"]["Insert"]>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          scope: "event" | "task" | "shopping";
          name: string;
          icon: string;
          color: string;
          outlook_category: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          scope: "event" | "task" | "shopping";
          name: string;
          icon?: string;
          color: string;
          outlook_category?: string | null;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          title: string;
          start_at: string;
          end_at: string;
          all_day: boolean;
          location: string | null;
          notes: string | null;
          category_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          origin: "app" | "outlook";
          outlook_id: string | null;
          outlook_ical_uid: string | null;
          outlook_change_key: string | null;
          outlook_series_id: string | null;
          outlook_last_modified: string | null;
          sync_status: "local" | "pending" | "synced" | "conflict" | "error";
          sync_error: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          start_at: string;
          end_at: string;
          all_day?: boolean;
          location?: string | null;
          notes?: string | null;
          category_id?: string | null;
          deleted_at?: string | null;
          origin?: "app" | "outlook";
          outlook_id?: string | null;
          outlook_ical_uid?: string | null;
          outlook_change_key?: string | null;
          outlook_series_id?: string | null;
          outlook_last_modified?: string | null;
          sync_status?: "local" | "pending" | "synced" | "conflict" | "error";
          sync_error?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
        Relationships: [];
      };
      event_participants: {
        Row: { event_id: string; member_id: string };
        Insert: { event_id: string; member_id: string };
        Update: Partial<Database["public"]["Tables"]["event_participants"]["Insert"]>;
        Relationships: [];
      };
      settings: {
        Row: { key: string; value: Json; updated_at: string };
        Insert: { key: string; value: Json };
        Update: Partial<Database["public"]["Tables"]["settings"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_family: { Args: Record<string, never>; Returns: boolean };
      is_adult: { Args: Record<string, never>; Returns: boolean };
      save_event: {
        Args: {
          p_id: string | null;
          p_title: string;
          p_start_at: string;
          p_end_at: string;
          p_all_day: boolean;
          p_location: string | null;
          p_notes: string | null;
          p_category_id: string | null;
          p_participants: string[];
        };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
