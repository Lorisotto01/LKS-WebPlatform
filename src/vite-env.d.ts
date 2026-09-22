/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_PUBLIC_SITE_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Versione dell'ultima release, iniettata da Vite leggendo il CHANGELOG (v4.9.3).
 * Non usarla direttamente: passa da `@/lib/version`.
 */
declare const __APP_VERSION__: string;
