import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./short-forecast";
import type { ApiRequest, ApiResponse } from "../server/http";

function responseRecorder() {
  let statusCode = 200;
  let payload: unknown;
  const headers: Record<string, string | string[]> = {};
  const response: ApiResponse = {
    status(code) { statusCode = code; return response; },
    setHeader(name, value) { headers[name] = value; return response; },
    json(body) { payload = body; },
    send(body) { payload = body; },
    end() {},
  };
  return { response, get statusCode() { return statusCode; }, get payload() { return payload; }, headers };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DATA_GO_KR_SERVICE_KEY;
});

describe("short forecast server function", () => {
  it("rejects incomplete date parameters before calling the provider", async () => {
    process.env.DATA_GO_KR_SERVICE_KEY = "test%2Bkey%3D%3D";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const recorder = responseRecorder();

    await handler({ method: "GET", query: { baseDate: "20260916" } }, recorder.response);

    expect(recorder.statusCode).toBe(400);
    expect(recorder.payload).toEqual({ ok: false, error: "INVALID_FORECAST_PARAMETERS" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes an encoded service key once and returns normalized items", async () => {
    process.env.DATA_GO_KR_SERVICE_KEY = "test%2Bkey%3D%3D";
    const fetchMock = vi.fn(async (input: URL) => {
      expect(input.toString()).toContain("serviceKey=test%2Bkey%3D%3D");
      expect(input.toString()).not.toContain("%252B");
      return new Response(JSON.stringify({ response: { body: { totalCount: 1, items: { item: [{ category: "TMP", fcstValue: "24" }] } } } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const recorder = responseRecorder();

    await handler({ method: "GET", query: { baseDate: "20260916", baseTime: "0800", nx: "60", ny: "127" } }, recorder.response);

    expect(recorder.statusCode).toBe(200);
    expect(recorder.payload).toMatchObject({ ok: true, totalCount: 1, data: [{ category: "TMP" }] });
  });
});

