import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./sgis-boundary";
import type { ApiResponse } from "../server/http";

function responseRecorder() {
  let statusCode = 200;
  let payload: unknown;
  const headers: Record<string, string | string[]> = {};
  const response: ApiResponse = {
    status(code) { statusCode = code; return response; },
    setHeader(name, value) { headers[name] = value; return response; },
    json(body) { payload = body; },
    send() {},
    end() {},
  };
  return { response, get statusCode() { return statusCode; }, get payload() { return payload; }, headers };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SGIS_CONSUMER_KEY;
  delete process.env.SGIS_CONSUMER_SECRET;
});

describe("SGIS boundary server function", () => {
  it("rejects unsupported boundary parameters before contacting SGIS", async () => {
    process.env.SGIS_CONSUMER_KEY = "consumer-test";
    process.env.SGIS_CONSUMER_SECRET = "secret-test";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const recorder = responseRecorder();

    await handler({ method: "GET", query: { year: "2026", admCd: "11" } }, recorder.response);

    expect(recorder.statusCode).toBe(400);
    expect(recorder.payload).toEqual({ ok: false, error: "INVALID_SGIS_BOUNDARY_YEAR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns normalized GeoJSON and never exposes the access token", async () => {
    process.env.SGIS_CONSUMER_KEY = "consumer-test";
    process.env.SGIS_CONSUMER_SECRET = "secret-test";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errCd: 0, result: { accessToken: "server-only-token" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        type: "FeatureCollection",
        errCd: 0,
        errMsg: "Success",
        features: [{
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [[[958712, 1951621], [958801, 1951564], [958712, 1951621]]] },
          properties: { adm_cd: "11", adm_nm: "서울특별시", x: "953000", y: "1950000", ignored: "not-public" },
        }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const recorder = responseRecorder();

    await handler({ method: "GET", query: { year: "2025", admCd: "11", lowSearch: "1" } }, recorder.response);

    expect(recorder.statusCode).toBe(200);
    expect(recorder.headers["Cache-Control"]).toContain("s-maxage=86400");
    expect(recorder.payload).toMatchObject({
      ok: true,
      provider: "sgis",
      sourceCrs: "EPSG:5179",
      query: { year: 2025, admCd: "11", lowSearch: 1 },
      data: { features: [{ properties: { adm_cd: "11", adm_nm: "서울특별시" } }] },
    });
    expect(JSON.stringify(recorder.payload)).not.toContain("server-only-token");
    expect(JSON.stringify(recorder.payload)).not.toContain("ignored");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const boundaryUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(boundaryUrl.searchParams.get("year")).toBe("2025");
    expect(boundaryUrl.searchParams.get("adm_cd")).toBe("11");
    expect(boundaryUrl.searchParams.get("low_search")).toBe("1");
  });
});
