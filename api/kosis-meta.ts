import type { ApiRequest, ApiResponse } from "../server/http.js";
import { methodNotAllowed, queryParam, upstreamUnavailable } from "../server/http.js";
import {
  buildKosisMetadataUrl,
  parseKosisResponseText,
  parseKosisMetadataResponse,
  type KosisMetadataQuery,
} from "../src/lib/kosis.js";

const SAFE_CODE = /^[A-Za-z0-9_.-]{1,40}$/;

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method && request.method !== "GET") return methodNotAllowed(response);
  const apiKey = process.env.KOSIS_API_KEY?.trim();
  if (!apiKey) return response.status(503).json({ ok: false, error: "KOSIS_NOT_CONFIGURED" });

  const orgId = queryParam(request, "orgId")?.trim() ?? "";
  const tblId = queryParam(request, "tblId")?.trim() ?? "";
  const objId = queryParam(request, "objId")?.trim();
  const itmId = queryParam(request, "itmId")?.trim();
  if (!SAFE_CODE.test(orgId) || !SAFE_CODE.test(tblId) || (objId && !SAFE_CODE.test(objId)) || (itmId && !SAFE_CODE.test(itmId))) {
    return response.status(400).json({ ok: false, error: "INVALID_KOSIS_METADATA_PARAMETERS" });
  }

  const query: KosisMetadataQuery = { orgId, tblId, ...(objId ? { objId } : {}), ...(itmId ? { itmId } : {}) };
  try {
    const upstream = await fetch(buildKosisMetadataUrl(apiKey, query), { headers: { Accept: "application/json" } });
    if (!upstream.ok) return upstreamUnavailable(response, "kosis", upstream.status);
    const payload = parseKosisResponseText(await upstream.text());
    const records = parseKosisMetadataResponse(payload);
    if (records.length === 0 && !Array.isArray(payload)) {
      return response.status(502).json({ ok: false, provider: "kosis", error: "KOSIS_UNEXPECTED_RESPONSE" });
    }

    response
      .setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600")
      .status(200)
      .json({ ok: true, provider: "kosis", query, data: records, fetchedAt: new Date().toISOString() });
  } catch {
    response.status(502).json({ ok: false, provider: "kosis", error: "KOSIS_METADATA_REQUEST_FAILED" });
  }
}
