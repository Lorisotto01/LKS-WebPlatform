// Hand-authored to mirror supabase/migrations/0001_init.sql.
// Regenerate with: supabase gen types typescript --project-id <id> > src/types/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Voce di contatto della pagina /chi-sono (author_profile.contacts). */
export interface AuthorContact {
  label: string;
  value: string;
  href?: string;
}

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
        // v4.3.5 (0012): tipo 'idea' -> 'implementazione'.
        Row: {
          id: string; email: string | null; hwid: string | null;
          tipo: "bug" | "implementazione" | "altro"; titolo: string; descrizione: string | null;
          app_version: string | null; status: "aperta" | "in_lavorazione" | "chiusa";
          admin_note: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; email?: string | null; hwid?: string | null;
          tipo?: "bug" | "implementazione" | "altro"; titolo: string; descrizione?: string | null;
          app_version?: string | null; status?: "aperta" | "in_lavorazione" | "chiusa";
          admin_note?: string | null; created_at?: string; updated_at?: string;
        };
        Update: {
          status?: "aperta" | "in_lavorazione" | "chiusa"; admin_note?: string | null;
          tipo?: "bug" | "implementazione" | "altro"; titolo?: string; descrizione?: string | null;
        };
        Relationships: [];
      };
      report_attachments: {
        // v4.3.5 (0012): screenshot allegati alle segnalazioni (bucket 'report-attachments').
        Row: {
          id: string; report_id: string; path: string; filename: string | null;
          content_type: string | null; size_bytes: number | null; created_at: string;
        };
        Insert: {
          id?: string; report_id: string; path: string; filename?: string | null;
          content_type?: string | null; size_bytes?: number | null; created_at?: string;
        };
        Update: {
          filename?: string | null; content_type?: string | null; size_bytes?: number | null;
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
      author_profile: {
        // v4.3.4 (0010): contenuti della pagina /chi-sono, editabili dall'admin.
        Row: {
          id: number; display_name: string; headline: string | null; bio: string | null;
          photo_url: string | null; email: string | null; location: string | null;
          contacts: AuthorContact[]; updated_at: string;
        };
        Insert: {
          id?: number; display_name?: string; headline?: string | null; bio?: string | null;
          photo_url?: string | null; email?: string | null; location?: string | null;
          contacts?: AuthorContact[]; updated_at?: string;
        };
        Update: {
          display_name?: string; headline?: string | null; bio?: string | null;
          photo_url?: string | null; email?: string | null; location?: string | null;
          contacts?: AuthorContact[]; updated_at?: string;
        };
        Relationships: [];
      };
      reviews: {
        // v4.3.4 (0010): recensioni per versione (rating 1..5).
        Row: {
          id: string; email: string | null; author_name: string | null;
          version: string; titolo: string; rating: number; descrizione: string | null;
          created_at: string;
        };
        Insert: {
          id?: string; email?: string | null; author_name?: string | null;
          version: string; titolo: string; rating: number; descrizione?: string | null;
          created_at?: string;
        };
        Update: {
          titolo?: string; rating?: number; descrizione?: string | null;
        };
        Relationships: [];
      };
      doc_settings: {
        // v4.3.4 (0011): impostazioni della pagina /docs.
        Row: {
          id: number; page_title: string; page_subtitle: string | null;
          show_index: boolean; show_numbering: boolean; updated_at: string;
        };
        Insert: {
          id?: number; page_title?: string; page_subtitle?: string | null;
          show_index?: boolean; show_numbering?: boolean; updated_at?: string;
        };
        Update: {
          page_title?: string; page_subtitle?: string | null;
          show_index?: boolean; show_numbering?: boolean; updated_at?: string;
        };
        Relationships: [];
      };
      doc_blocks: {
        // v4.3.4 (0011): blocchi ordinati e riordinabili della /docs.
        Row: {
          id: string; position: number;
          type: "title" | "paragraph" | "image" | "note" | "warning" | "list" | "table" | "code" | "divider";
          content: Json; visible: boolean; updated_at: string;
        };
        Insert: {
          id?: string; position?: number;
          type?: "title" | "paragraph" | "image" | "note" | "warning" | "list" | "table" | "code" | "divider";
          content?: Json; visible?: boolean; updated_at?: string;
        };
        Update: {
          position?: number;
          type?: "title" | "paragraph" | "image" | "note" | "warning" | "list" | "table" | "code" | "divider";
          content?: Json; visible?: boolean; updated_at?: string;
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
      // v4.3.4 (0010): download mensili per il KPI analytics (solo admin).
      downloads_per_month: {
        Args: Record<PropertyKey, never>;
        Returns: { month: string; total: number; unique_users: number }[];
      };
      // v4.3.4 (0011): l'utente revoca la propria licenza e rigenera il token.
      revoke_activation: {
        Args: { p_id: string };
        Returns: Json;
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
export type ReportAttachment = Database["public"]["Tables"]["report_attachments"]["Row"];
export type AuthorProfile = Database["public"]["Tables"]["author_profile"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type DocSettings = Database["public"]["Tables"]["doc_settings"]["Row"];
export type DocBlockRow = Database["public"]["Tables"]["doc_blocks"]["Row"];
