/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Route to open after setup instead of chat, e.g. "nour". */
  readonly VITE_START_PAGE?: string;
  readonly VITE_OPENJARVIS_NO_UPDATER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
