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
      reports: {
        // v4.3.1 (0009): segnalazioni aperte dalla DesktopApp, gestite dall'admin.
        Row: {
          id: string; email: string | null; hwid: string | null;
          tipo: "bug" | "idea" | "altro"; titolo: string; descrizione: string | null;
          app_version: string | null; status: "aperta" | "in_lavorazione" | "chiusa";
          admin_note: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; email?: string | null; hwid?: string | null;
          tipo?: "bug" | "idea" | "altro"; titolo: string; descrizione?: string | null;
          app_version?: string | null; status?: "aperta" | "in_lavorazione" | "chiusa";
          admin_note?: string | null; created_at?: string; updated_at?: string;
        };
        Update: {
          status?: "aperta" | "in_lavorazione" | "chiusa"; admin_note?: string | null;
          tipo?: "bug" | "idea" | "altro"; titolo?: string; descrizione?: string | null;
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
      // v4.3.1 (0009): apre una segnalazione (chiamata dalla DesktopApp).
      open_report: {
        Args: {
          p_titolo: string; p_descrizione?: string | null; p_tipo?: string | null;
          p_email?: string | null; p_hwid?: string | null; p_app_version?: string | null;
        };
        Returns: Json;
      };
      // v4.3.1 (0009): elenca le segnalazioni di un dispositivo.
      list_my_reports: {
        Args: { p_email?: string | null; p_hwid?: string | null };
        Returns: Database["public"]["Tables"]["reports"]["Row"][];
      };
      // v4.3.1 (0009): conteggi download per versione (solo admin).
      release_download_counts: {
        Args: Record<PropertyKey, never>;
        Returns: { version: string; total: number; unique_users: number }[];
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
export type Report = Database["public"]["Tables"]["reports"]["Row"];
