export function decodeServiceKey(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function buildDataPortalUrl(
  endpoint: string,
  serviceKey: string,
  params: Record<string, string | number>,
): string {
  const url = new URL(endpoint);
  url.searchParams.set("serviceKey", decodeServiceKey(serviceKey));

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

export function buildKmaHubUrl(
  endpoint: string,
  authKey: string,
  params: Record<string, string | number>,
): string {
  const url = new URL(endpoint);
  url.searchParams.set("authKey", authKey);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

export function buildVWorldLoaderUrl(
  apiKey: string,
  domain: string,
  version = "2.0",
): string {
  const url = new URL("https://map.vworld.kr/js/vworldMapInit.js.do");
  url.searchParams.set("version", version);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("domain", domain);
  return url.toString();
}

/** VWorld WebGL 3D loader (Cesium 기반). 2D 로더와 다른 스크립트다. */
export function buildVWorld3DLoaderUrl(apiKey: string, domain: string): string {
  const url = new URL("https://map.vworld.kr/js/webglMapInit.js.do");
  url.searchParams.set("version", "3.0");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("domain", domain);
  return url.toString();
}

export function buildSgisAuthUrl(
  endpoint: string,
  consumerKey: string,
  consumerSecret: string,
): string {
  const url = new URL(endpoint);
  url.searchParams.set("consumer_key", consumerKey);
  url.searchParams.set("consumer_secret", consumerSecret);
  return url.toString();
}

/**
 * Esri Light Gray Canvas raster tiles (no key, attribution required).
 * `{z}/{y}/{x}` order matches the ArcGIS tile path convention.
 */
export function buildEsriCanvasTileUrl(kind: "base" | "reference"): string {
  const layer = kind === "reference" ? "World_Light_Gray_Reference" : "World_Light_Gray_Base";
  return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${layer}/MapServer/tile/{z}/{y}/{x}`;
}
