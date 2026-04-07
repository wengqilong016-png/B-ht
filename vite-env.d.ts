/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  readonly VITE_OPENAI_API_KEY?: string
  readonly VITE_DISABLE_AUTH?: string
  readonly VITE_VERCEL_ANALYTICS_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
