import type { ApiRequest, ApiResponse } from "../server/http";
import { methodNotAllowed, upstreamUnavailable } from "../server/http";
import { buildSgisAuthUrl } from "../src/lib/api/requests";

const SGIS_BASE = "https://sgisapi.mods.go.kr/OpenAPI3";
let tokenCache: { value: string; expiresAt: number } | undefined;

interface SgisPayload {
  errCd?: number;
  errMsg?: string;
  result?: {
    accessToken?: string;
    [key: string]: unknown;
  };
  accessToken?: string;
  [key: string]: unknown;
}

async function getSgisToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;

  const url = buildSgisAuthUrl(
    `${SGIS_BASE}/auth/authentication.json`,
    process.env.SGIS_CONSUMER_KEY ?? "",
    process.env.SGIS_CONSUMER_SECRET ?? "",
  );
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = (await response.json()) as SgisPayload;
  const token = payload.result?.accessToken ?? payload.accessToken;
  if (!response.ok || !token || (payload.errCd !== undefined && payload.errCd !== 0)) {
    throw new Error("SGIS authentication failed");
  }

  tokenCache = { value: token, expiresAt: Date.now() + 3 * 60 * 60 * 1000 };
  return token;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method && request.method !== "GET") return methodNotAllowed(response);
  if (!process.env.SGIS_CONSUMER_KEY || !process.env.SGIS_CONSUMER_SECRET) {
    return response.status(503).json({ ok: false, error: "SGIS_NOT_CONFIGURED" });
  }

  try {
    const accessToken = await getSgisToken();
    const url = new URL(`${SGIS_BASE}/year/data.json`);
    url.searchParams.set("accessToken", accessToken);
    const upstream = await fetch(url, { headers: { Accept: "application/json" } });
    const payload = (await upstream.json()) as SgisPayload;
    if (!upstream.ok || (payload.errCd !== undefined && payload.errCd !== 0)) {
      return upstreamUnavailable(response, "sgis", upstream.status);
    }

    response.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=300").status(200).json({
      ok: true,
      provider: "sgis",
      data: payload.result ?? payload,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    response.status(502).json({ ok: false, provider: "sgis", error: "SGIS_REQUEST_FAILED" });
  }
}
