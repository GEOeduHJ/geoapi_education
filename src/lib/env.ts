const readEnv = (key: string): string => {
  return (import.meta.env[key] ?? "").trim();
};

export const publicEnv = {
  apiMode: readEnv("VITE_API_MODE") || "mock",
  supabaseUrl: readEnv("VITE_SUPABASE_URL"),
  supabaseAnonKey: readEnv("VITE_SUPABASE_ANON_KEY"),
  vworldApiKey: readEnv("VITE_VWORLD_API_KEY"),
  vworldDomain: readEnv("VITE_VWORLD_DOMAIN"),
} as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.replace(/^\[|\]$/g, "").trim());
}

/**
 * VWorld's browser domain parameter must match the host in the current URL.
 * During local development the Vite port may change, so use hostname rather
 * than a manually maintained environment value. In non-browser contexts the
 * configured value remains the fallback for smoke tests and deployment.
 */
export function resolveVWorldDomain(browserHostname?: string): string {
  const runtimeHostname =
    browserHostname?.trim() ||
    (typeof window !== "undefined" ? window.location.hostname.trim() : "");

  return runtimeHostname || publicEnv.vworldDomain;
}

export const hasSupabaseClientConfig = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseAnonKey,
);

export const hasVWorldClientConfig = Boolean(
  publicEnv.vworldApiKey && resolveVWorldDomain(),
);

export const hasVWorldRegisteredDomain = Boolean(
  publicEnv.vworldApiKey &&
    publicEnv.vworldDomain &&
    !isLocalHost(resolveVWorldDomain()) &&
    publicEnv.vworldDomain === resolveVWorldDomain(),
);
