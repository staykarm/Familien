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
          outlook_conflict: Json | null;
          outlook_synced_hash: string | null;
          series_id: string | null;
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
          outlook_conflict?: Json | null;
          outlook_synced_hash?: string | null;
          series_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
        Relationships: [];
      };
      event_series: {
        Row: {
          id: string;
          freq: "daily" | "weekly" | "monthly";
          interval: number;
          weekdays: number[];
          until: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          freq: "daily" | "weekly" | "monthly";
          interval?: number;
          weekdays?: number[];
          until: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_series"]["Insert"]>;
        Relationships: [];
      };
      event_participants: {
        Row: { event_id: string; member_id: string };
        Insert: { event_id: string; member_id: string };
        Update: Partial<Database["public"]["Tables"]["event_participants"]["Insert"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          title: string;
          notes: string | null;
          assignee_id: string | null;
          category_id: string | null;
          due_date: string | null;
          due_time: string | null;
          status: "todo" | "doing" | "done";
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          notes?: string | null;
          assignee_id?: string | null;
          category_id?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          status?: "todo" | "doing" | "done";
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
        Relationships: [];
      };
      weather_cache: {
        Row: { lat: number; lon: number; payload: Json; expires_at: string; last_modified: string | null; fetched_at: string };
        Insert: { lat: number; lon: number; payload: Json; expires_at: string; last_modified?: string | null; fetched_at?: string };
        Update: Partial<Database["public"]["Tables"]["weather_cache"]["Insert"]>;
        Relationships: [];
      };
      shopping_items: {
        Row: {
          id: string;
          name: string;
          quantity: string | null;
          category_id: string | null;
          checked: boolean;
          checked_at: string | null;
          added_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          quantity?: string | null;
          category_id?: string | null;
          checked?: boolean;
          checked_at?: string | null;
          added_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["shopping_items"]["Insert"]>;
        Relationships: [];
      };
      shopping_templates: {
        Row: { id: string; name: string; icon: string; sort_order: number; created_at: string };
        Insert: { id?: string; name: string; icon?: string; sort_order?: number };
        Update: Partial<Database["public"]["Tables"]["shopping_templates"]["Insert"]>;
        Relationships: [];
      };
      shopping_template_items: {
        Row: { id: string; template_id: string; name: string; quantity: string | null; category_id: string | null; sort_order: number };
        Insert: { id?: string; template_id: string; name: string; quantity?: string | null; category_id?: string | null; sort_order?: number };
        Update: Partial<Database["public"]["Tables"]["shopping_template_items"]["Insert"]>;
        Relationships: [];
      };
      notes: {
        Row: {
          id: string;
          owner_id: string | null;
          content: Json;
          title: string;
          plain_text: string;
          pinned: boolean;
          version: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          content?: Json;
          title?: string;
          plain_text?: string;
          pinned?: boolean;
          version?: number;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["notes"]["Insert"]>;
        Relationships: [];
      };
      uploads: {
        Row: {
          id: string;
          storage_path: string;
          filename: string;
          mime: string;
          size_bytes: number;
          uploaded_by: string | null;
          status: "uploaded" | "analyzing" | "done" | "failed";
          error: string | null;
          summary: string | null;
          created_at: string;
          analyzed_at: string | null;
          member_ids: string[];
        };
        Insert: {
          id?: string;
          storage_path: string;
          filename: string;
          mime: string;
          size_bytes?: number;
          uploaded_by?: string | null;
          status?: "uploaded" | "analyzing" | "done" | "failed";
          error?: string | null;
          summary?: string | null;
          analyzed_at?: string | null;
          member_ids?: string[];
        };
        Update: Partial<Database["public"]["Tables"]["uploads"]["Insert"]>;
        Relationships: [];
      };
      suggestions: {
        Row: {
          id: string;
          upload_id: string;
          kind: "event" | "task" | "shopping";
          payload: Json;
          status: "pending" | "approved" | "rejected";
          created_ref: string | null;
          created_at: string;
          decided_at: string | null;
        };
        Insert: {
          id?: string;
          upload_id: string;
          kind: "event" | "task" | "shopping";
          payload: Json;
          status?: "pending" | "approved" | "rejected";
          created_ref?: string | null;
          decided_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["suggestions"]["Insert"]>;
        Relationships: [];
      };
      oda_connection: {
        Row: {
          id: number;
          email: string;
          cookies_encrypted: string;
          password_encrypted: string | null;
          connected_at: string;
          last_used_at: string | null;
        };
        Insert: {
          id?: number;
          email: string;
          cookies_encrypted: string;
          password_encrypted?: string | null;
          connected_at?: string;
          last_used_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["oda_connection"]["Insert"]>;
        Relationships: [];
      };
      outlook_connection: {
        Row: {
          id: number;
          account_email: string;
          account_name: string | null;
          tokens_encrypted: string;
          calendar_id: string | null;
          calendar_name: string | null;
          delta_link: string | null;
          delta_window_start: string | null;
          subscription_id: string | null;
          subscription_expires_at: string | null;
          site_url: string | null;
          sync_lock_until: string | null;
          resync_requested: boolean;
          last_sync_at: string | null;
          last_error: string | null;
          connected_at: string;
        };
        Insert: {
          id?: number;
          account_email: string;
          account_name?: string | null;
          tokens_encrypted: string;
          calendar_id?: string | null;
          calendar_name?: string | null;
          delta_link?: string | null;
          delta_window_start?: string | null;
          subscription_id?: string | null;
          subscription_expires_at?: string | null;
          site_url?: string | null;
          sync_lock_until?: string | null;
          resync_requested?: boolean;
          last_sync_at?: string | null;
          last_error?: string | null;
          connected_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["outlook_connection"]["Insert"]>;
        Relationships: [];
      };
      sync_log: {
        Row: { id: number; created_at: string; direction: "in" | "out" | "system"; ok: boolean; message: string; event_id: string | null };
        Insert: { direction: "in" | "out" | "system"; ok?: boolean; message: string; event_id?: string | null };
        Update: Partial<Database["public"]["Tables"]["sync_log"]["Insert"]>;
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
      save_event_series: {
        Args: {
          p_series_id: string | null;
          p_freq: "daily" | "weekly" | "monthly";
          p_interval: number;
          p_weekdays: number[];
          p_until: string;
          p_replace_from: string | null;
          p_replace_event: string | null;
          p_title: string;
          p_starts: string[];
          p_ends: string[];
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
