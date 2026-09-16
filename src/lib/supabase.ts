import { createClient } from "@supabase/supabase-js";
import { hasSupabaseClientConfig, publicEnv } from "./env";

/**
 * The browser client is intentionally optional during local development.
 * Server-side service-role credentials must never be exposed through Vite.
 */
export const supabase = hasSupabaseClientConfig
  ? createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey)
  : null;

