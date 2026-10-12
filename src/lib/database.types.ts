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
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
