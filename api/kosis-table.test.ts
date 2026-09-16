import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./kosis-table";
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
  delete process.env.KOSIS_API_KEY;
});

describe("KOSIS table server function", () => {
  it("normalizes code lists and supplies the provider's second-level default", async () => {
    process.env.KOSIS_API_KEY = "server-test-key";
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      expect(url.searchParams.get("objL1")).toBe("21010 21020");
      expect(url.searchParams.get("objL2")).toBe("ALL");
      return new Response(JSON.stringify([{
        ORG_ID: "101",
        TBL_ID: "DT_TEST",
        TBL_NM: "지역별 지표",
        C1: "21010",
        C1_NM: "부산광역시 중구",
        ITM_ID: "T001",
        ITM_NM: "총량",
        PRD_SE: "M",
        PRD_DE: "202401",
        DT: "1,234",
      }]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const recorder = responseRecorder();

    await handler({ method: "GET", query: { orgId: "101", tblId: "DT_TEST", objL1: "21010,21020", itmId: "T001", prdSe: "M", startPrdDe: "202401", endPrdDe: "202401" } }, recorder.response);

    expect(recorder.statusCode).toBe(200);
    expect(recorder.payload).toMatchObject({ ok: true, metadata: { rowCount: 1 }, data: [{ value: 1234, period: "202401" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
