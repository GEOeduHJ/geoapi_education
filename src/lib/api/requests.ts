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
