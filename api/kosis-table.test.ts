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
  it("normalizes code lists and preserves an explicit second-level value", async () => {
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

    await handler({ method: "GET", query: { orgId: "101", tblId: "DT_TEST", objL1: "21010,21020", objL2: "ALL", itmId: "T001", prdSe: "M", startPrdDe: "202401", endPrdDe: "202401" } }, recorder.response);

    expect(recorder.statusCode).toBe(200);
    expect(recorder.payload).toMatchObject({ ok: true, metadata: { rowCount: 1 }, data: [{ value: 1234, period: "202401" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("omits the second-level parameter for a single-classification table", async () => {
    process.env.KOSIS_API_KEY = "server-test-key";
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      expect(url.searchParams.get("objL1")).toBe("27");
      expect(url.searchParams.has("objL2")).toBe(false);
      return new Response(JSON.stringify([{
        ORG_ID: "101",
        TBL_ID: "DT_ONE_LEVEL",
        TBL_NM: "시도 지표",
        C1: "27",
        C1_NM: "대구광역시",
        ITM_ID: "T20",
        ITM_NM: "계",
        PRD_SE: "A",
        PRD_DE: "2025",
        DT: "2,353,032",
      }]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const recorder = responseRecorder();

    await handler({ method: "GET", query: { orgId: "101", tblId: "DT_ONE_LEVEL", objL1: "27", itmId: "T20", prdSe: "Y", startPrdDe: "2025", endPrdDe: "2025" } }, recorder.response);

    expect(recorder.statusCode).toBe(200);
    expect(recorder.payload).toMatchObject({ ok: true, metadata: { rowCount: 1 }, data: [{ value: 2353032, period: "2025" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
