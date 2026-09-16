import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./sgis-years";
import type { ApiResponse } from "../server/http";

function responseRecorder() {
  let statusCode = 200;
  let payload: unknown;
  const response: ApiResponse = {
    status(code) { statusCode = code; return response; },
    setHeader() { return response; },
    json(body) { payload = body; },
    send() {},
    end() {},
  };
  return { response, get statusCode() { return statusCode; }, get payload() { return payload; } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SGIS_CONSUMER_KEY;
  delete process.env.SGIS_CONSUMER_SECRET;
});

describe("SGIS years server function", () => {
  it("keeps the authentication token inside the server function", async () => {
    process.env.SGIS_CONSUMER_KEY = "consumer-test";
    process.env.SGIS_CONSUMER_SECRET = "secret-test";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errCd: 0, result: { accessToken: "server-only-token" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errCd: 0, result: { lboudary_yr: "2024" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const recorder = responseRecorder();

    await handler({ method: "GET", query: {} }, recorder.response);

    expect(recorder.statusCode).toBe(200);
    expect(recorder.payload).toMatchObject({ ok: true, provider: "sgis", data: { lboudary_yr: "2024" } });
    expect(JSON.stringify(recorder.payload)).not.toContain("server-only-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

