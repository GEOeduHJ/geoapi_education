import type { ApiRequest, ApiResponse } from "../server/http";
import { methodNotAllowed, queryParam, upstreamUnavailable } from "../server/http";
import { buildDataPortalUrl } from "../src/lib/api/requests";

const FORECAST_ENDPOINT = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";
const digits = (value: string | undefined, length: number): boolean => Boolean(value && new RegExp(`^\\d{${length}}$`).test(value));
const gridCoordinate = (value: string): boolean => /^\d{1,3}$/.test(value);

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method && request.method !== "GET") return methodNotAllowed(response);
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) return response.status(503).json({ ok: false, error: "DATA_PORTAL_NOT_CONFIGURED" });

  const baseDate = queryParam(request, "baseDate");
  const baseTime = queryParam(request, "baseTime");
  const nx = queryParam(request, "nx") ?? "60";
  const ny = queryParam(request, "ny") ?? "127";
  if (!baseDate || !baseTime || !digits(baseDate, 8) || !digits(baseTime, 4) || !gridCoordinate(nx) || !gridCoordinate(ny)) {
    return response.status(400).json({ ok: false, error: "INVALID_FORECAST_PARAMETERS" });
  }

  const url = buildDataPortalUrl(FORECAST_ENDPOINT, serviceKey, {
    pageNo: 1,
    numOfRows: 1000,
    dataType: "JSON",
    base_date: baseDate,
    base_time: baseTime,
    nx,
    ny,
  });

  try {
    const upstream = await fetch(url, { headers: { Accept: "application/json" } });
    if (!upstream.ok) return upstreamUnavailable(response, "data.go.kr", upstream.status);
    const payload = (await upstream.json()) as { response?: { header?: unknown; body?: { items?: { item?: unknown[] }; totalCount?: number } } };
    const body = payload.response?.body;
    response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60").status(200).json({
      ok: true,
      provider: "data.go.kr",
      data: body?.items?.item ?? [],
      totalCount: body?.totalCount ?? 0,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    response.status(502).json({ ok: false, provider: "data.go.kr", error: "FORECAST_REQUEST_FAILED" });
  }
}
