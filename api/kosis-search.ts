import type { ApiRequest, ApiResponse } from "../server/http";
import { methodNotAllowed, queryParam, upstreamUnavailable } from "../server/http";
import {
  buildKosisSearchUrl,
  parseKosisResponseText,
  parseKosisSearchResponse,
  type KosisSearchQuery,
} from "../src/lib/kosis";

const SAFE_ORG_ID = /^[A-Za-z0-9_.-]{1,40}$/;
const SORTS = new Set(["RANK", "DATE"]);

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number | null {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method && request.method !== "GET") return methodNotAllowed(response);
  const apiKey = process.env.KOSIS_API_KEY?.trim();
  if (!apiKey) return response.status(503).json({ ok: false, error: "KOSIS_NOT_CONFIGURED" });

  const searchNm = queryParam(request, "searchNm")?.trim() ?? "";
  const orgId = queryParam(request, "orgId")?.trim();
  const sort = queryParam(request, "sort")?.trim().toUpperCase() || "RANK";
  const startCount = positiveInteger(queryParam(request, "startCount"), 1, 1000);
  const resultCount = positiveInteger(queryParam(request, "resultCount"), 20, 50);
  if (!searchNm || searchNm.length > 80 || /[\u0000-\u001f\u007f]/.test(searchNm) || (orgId && !SAFE_ORG_ID.test(orgId)) || !SORTS.has(sort) || startCount === null || resultCount === null) {
    return response.status(400).json({ ok: false, error: "INVALID_KOSIS_SEARCH_PARAMETERS" });
  }

  const query: KosisSearchQuery = {
    searchNm,
    ...(orgId ? { orgId } : {}),
    sort: sort as KosisSearchQuery["sort"],
    startCount,
    resultCount,
  };

  try {
    const upstream = await fetch(buildKosisSearchUrl(apiKey, query), { headers: { Accept: "application/json" } });
    if (!upstream.ok) return upstreamUnavailable(response, "kosis", upstream.status);
    const payload = parseKosisResponseText(await upstream.text());
    const records = parseKosisSearchResponse(payload);
    if (records.length === 0 && !Array.isArray(payload)) {
      return response.status(502).json({ ok: false, provider: "kosis", error: "KOSIS_UNEXPECTED_RESPONSE" });
    }

    response
      .setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=300")
      .status(200)
      .json({ ok: true, provider: "kosis", query: { searchNm, orgId: orgId ?? null, sort, startCount, resultCount }, data: records, fetchedAt: new Date().toISOString() });
  } catch {
    response.status(502).json({ ok: false, provider: "kosis", error: "KOSIS_SEARCH_REQUEST_FAILED" });
  }
}
