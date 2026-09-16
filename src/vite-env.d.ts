/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_VWORLD_API_KEY?: string;
  readonly VITE_VWORLD_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
