import type { ApiRequest, ApiResponse } from "../server/http.js";
import { methodNotAllowed, queryParam, upstreamUnavailable } from "../server/http.js";
import { buildSgisAuthUrl } from "../src/lib/api/requests.js";

const SGIS_BASE = "https://sgisapi.mods.go.kr/OpenAPI3";
const MIN_YEAR = 2000;
const MAX_YEAR = 2025;
const DEFAULT_YEAR = 2025;
const DEFAULT_ADM_CD = "non";
const DEFAULT_LOW_SEARCH = 1;
const ADM_CD_PATTERN = /^(?:non|\d{2}|\d{5}|\d{8})$/;
const LOW_SEARCH_VALUES = new Set([0, 1, 2]);

let tokenCache: { value: string; expiresAt: number } | undefined;

interface SgisPayload {
  errCd?: number;
  errMsg?: string;
  result?: {
    accessToken?: string;
    [key: string]: unknown;
  };
  accessToken?: string;
  features?: unknown[];
  [key: string]: unknown;
}

interface BoundaryFeature {
  type: "Feature";
  geometry: unknown;
  properties: {
    adm_cd: string | null;
    adm_nm: string | null;
    addr_en: string | null;
    x: string | null;
    y: string | null;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function positiveInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number | undefined {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

function readQuery(request: ApiRequest): { year: number; admCd: string; lowSearch: number } | { error: string } {
  const rawYear = queryParam(request, "year");
  const year = positiveInteger(rawYear, DEFAULT_YEAR, MIN_YEAR, MAX_YEAR);
  const admCd = queryParam(request, "admCd")?.trim() || DEFAULT_ADM_CD;
  const lowSearch = positiveInteger(queryParam(request, "lowSearch"), DEFAULT_LOW_SEARCH, 0, 2);

  if (year === undefined) return { error: "INVALID_SGIS_BOUNDARY_YEAR" };
  if (!ADM_CD_PATTERN.test(admCd)) return { error: "INVALID_SGIS_BOUNDARY_CODE" };
  if (lowSearch === undefined || !LOW_SEARCH_VALUES.has(lowSearch)) return { error: "INVALID_SGIS_BOUNDARY_LOW_SEARCH" };
  return { year, admCd, lowSearch };
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

function normalizeFeature(value: unknown): BoundaryFeature | null {
  if (!isRecord(value) || value.type !== "Feature" || !isRecord(value.geometry)) return null;
  const properties = isRecord(value.properties) ? value.properties : {};
  return {
    type: "Feature",
    geometry: value.geometry,
    properties: {
      adm_cd: stringValue(properties.adm_cd),
      adm_nm: stringValue(properties.adm_nm),
      addr_en: stringValue(properties.addr_en),
      x: stringValue(properties.x),
      y: stringValue(properties.y),
    },
  };
}

function normalizeFeatureCollection(payload: SgisPayload): { type: "FeatureCollection"; features: BoundaryFeature[] } | null {
  if (!Array.isArray(payload.features)) return null;
  return {
    type: "FeatureCollection",
    features: payload.features.map(normalizeFeature).filter((feature): feature is BoundaryFeature => feature !== null),
  };
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method && request.method !== "GET") return methodNotAllowed(response);
  if (!process.env.SGIS_CONSUMER_KEY || !process.env.SGIS_CONSUMER_SECRET) {
    return response.status(503).json({ ok: false, error: "SGIS_NOT_CONFIGURED" });
  }

  const parsed = readQuery(request);
  if ("error" in parsed) return response.status(400).json({ ok: false, error: parsed.error });

  try {
    const accessToken = await getSgisToken();
    const url = new URL(`${SGIS_BASE}/boundary/hadmarea.geojson`);
    url.searchParams.set("accessToken", accessToken);
    url.searchParams.set("year", String(parsed.year));
    url.searchParams.set("adm_cd", parsed.admCd);
    url.searchParams.set("low_search", String(parsed.lowSearch));

    const upstream = await fetch(url, { headers: { Accept: "application/json" } });
    const payload = (await upstream.json()) as SgisPayload;
    if (!upstream.ok) return upstreamUnavailable(response, "sgis", upstream.status);
    if (payload.errCd !== undefined && payload.errCd !== 0) {
      return response.status(502).json({ ok: false, provider: "sgis", error: "SGIS_BOUNDARY_REQUEST_REJECTED", upstreamCode: payload.errCd, message: payload.errMsg ?? "제공기관이 경계 요청을 거부했습니다." });
    }

    const data = normalizeFeatureCollection(payload);
    if (!data) return response.status(502).json({ ok: false, provider: "sgis", error: "SGIS_BOUNDARY_UNEXPECTED_RESPONSE" });

    response
      .setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600")
      .status(200)
      .json({
        ok: true,
        provider: "sgis",
        query: parsed,
        sourceCrs: "EPSG:5179",
        data,
        fetchedAt: new Date().toISOString(),
      });
  } catch {
    response.status(502).json({ ok: false, provider: "sgis", error: "SGIS_BOUNDARY_REQUEST_FAILED" });
  }
}
