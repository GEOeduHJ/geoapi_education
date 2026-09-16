import type { ApiRequest, ApiResponse } from "../server/http.js";
import { methodNotAllowed, queryParam, upstreamUnavailable } from "../server/http.js";
import { buildKmaHubUrl } from "../src/lib/api/requests.js";

const ASOS_ENDPOINT = "https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method && request.method !== "GET") return methodNotAllowed(response);
  const authKey = process.env.KMA_AUTH_KEY;
  if (!authKey) return response.status(503).json({ ok: false, error: "KMA_NOT_CONFIGURED" });

  const tm = queryParam(request, "tm");
  const stn = queryParam(request, "stn") ?? "108";
  if ((tm && !/^\\d{8,12}$/.test(tm)) || !/^\\d+(?::\\d+)*$/.test(stn)) {
    return response.status(400).json({ ok: false, error: "INVALID_ASOS_PARAMETERS" });
  }

  const url = buildKmaHubUrl(ASOS_ENDPOINT, authKey, {
    ...(tm ? { tm } : {}),
    stn,
    help: 0,
  });

  try {
    const upstream = await fetch(url, { headers: { Accept: "text/plain", "User-Agent": "GeoLab-Classroom/0.1" } });
    if (!upstream.ok) return upstreamUnavailable(response, "kma", upstream.status);
    const body = await upstream.text();
    response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60").setHeader("Content-Type", "text/plain; charset=utf-8").status(200).send(body);
  } catch {
    response.status(502).json({ ok: false, provider: "kma", error: "ASOS_REQUEST_FAILED" });
  }
}
