import { describe, expect, it } from "vitest";
import {
  buildKosisTableUrl,
  normalizeCodeList,
  normalizeKosisRecords,
  parseKosisRecords,
  parseProviderText,
} from "./kosis-snapshot.mjs";

describe("KOSIS snapshot ingest helpers", () => {
  it("normalizes comma-separated code lists", () => {
    const url = buildKosisTableUrl("test-key", {
      orgId: "101",
      tblId: "DT_TEST",
      objL1: "21010, 21020",
      objL2: "ALL",
      itmId: "T001",
      prdSe: "M",
      startPrdDe: "202401",
      endPrdDe: "202404",
    });

    expect(normalizeCodeList("21010, 21020")).toBe("21010 21020");
    expect(url.searchParams.get("objL1")).toBe("21010 21020");
    expect(url.toString()).toMatch(/objL1=21010\+21020/);
  });

  it("parses pseudo-JSON and creates a stable regional observation", () => {
    const payload = parseProviderText('[{ORG_ID:"101",TBL_ID:"DT_TEST",C1:"21010",C1_NM:"서울",ITM_ID:"T001",ITM_NM:"계",PRD_SE:"M",PRD_DE:"202401",DT:"691,723"}]');
    expect(Array.isArray(payload)).toBe(true);
    const records = parseKosisRecords(payload);
    expect(records[0].value).toBe(691723);
    expect(records[0].classifications[0].code).toBe("21010");

    const observations = normalizeKosisRecords(records);
    expect(observations[0].region_code).toBe("21010");
    expect(observations[0].observed_at).toBe("2024-01-01");
    expect(observations[0].attributes.period).toBe("202401");
    expect(observations[0].external_id).toMatch(/^101:DT_TEST:T001:M:202401:/);
  });
});
