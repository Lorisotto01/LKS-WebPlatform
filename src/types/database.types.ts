// Hand-authored to mirror supabase/migrations/0001_init.sql.
// Regenerate with: supabase gen types typescript --project-id <id> > src/types/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      registrations: {
        // GDPR (C2 / 0007): colonna `name` rimossa — il nome resta in auth user_metadata.
        Row: {
          id: string; email: string; hardware_id: string | null;
          plan: string; registered_at: string; last_download_at: string | null;
          last_unlock_at: string | null;
        };
        Insert: {
          id?: string; email: string; hardware_id?: string | null;
          plan?: string; registered_at?: string; last_download_at?: string | null;
          last_unlock_at?: string | null;
        };
        Update: {
          hardware_id?: string | null; plan?: string;
          last_download_at?: string | null; last_unlock_at?: string | null;
        };
        Relationships: [];
      };
      downloads: {
        // GDPR (C2 / 0007): colonna `ip_address` rimossa.
        Row: { id: string; email: string; version: string; downloaded_at: string };
        Insert: { id?: string; email: string; version: string; downloaded_at?: string };
        Update: { version?: string };
        Relationships: [];
      };
      releases: {
        // C1 (0006): hash SHA-256 + firma Ed25519 detached per la verifica desktop.
        Row: {
          id: string; version: string; release_date: string; notes: string | null;
          download_url: string; is_active: boolean; min_version: string | null;
          sha256: string | null; signature: string | null; sign_key_id: string | null;
        };
        Insert: {
          id?: string; version: string; release_date?: string; notes?: string | null;
          download_url: string; is_active?: boolean; min_version?: string | null;
          sha256?: string | null; signature?: string | null; sign_key_id?: string | null;
        };
        Update: {
          notes?: string | null; is_active?: boolean; min_version?: string | null; download_url?: string;
          sha256?: string | null; signature?: string | null; sign_key_id?: string | null;
        };
        Relationships: [];
      };
      activations: {
        Row: {
          id: string; email: string; activation_token: string; hwid: string | null;
          status: "pending" | "active" | "suspended"; app_version: string | null;
          created_at: string; activated_at: string | null;
        };
        Insert: {
          id?: string; email: string; activation_token?: string; hwid?: string | null;
          status?: "pending" | "active" | "suspended"; app_version?: string | null;
          created_at?: string; activated_at?: string | null;
        };
        Update: {
          hwid?: string | null; status?: "pending" | "active" | "suspended";
          app_version?: string | null; activated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // GDPR (C2 / 0007): diritto all'oblio — cancella i dati dell'utente loggato.
      delete_my_account: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Release = Database["public"]["Tables"]["releases"]["Row"];
export type Registration = Database["public"]["Tables"]["registrations"]["Row"];
export type Download = Database["public"]["Tables"]["downloads"]["Row"];
export type Activation = Database["public"]["Tables"]["activations"]["Row"];
