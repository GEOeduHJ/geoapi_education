import { describe, expect, it } from "vitest";
import {
  buildKosisMetadataUrl,
  buildKosisSearchUrl,
  buildKosisTableUrl,
  extractKosisProviderError,
  parseKosisMetadataResponse,
  parseKosisResponseText,
  parseKosisSearchResponse,
  parseKosisStatisticsResponse,
  parseKosisValue,
  summarizeKosisRecords,
} from "./kosis";

describe("KOSIS adapter", () => {
  it("builds a server-side table URL without dropping classification parameters", () => {
    const url = buildKosisTableUrl("api-key=with-equals", {
      orgId: "101",
      tblId: "DT_TEST",
      objL1: "11 26",
      objL2: "ALL",
      itmId: "ITM_1",
      prdSe: "Y",
      startPrdDe: "2016",
      endPrdDe: "2025",
      smblChk: "Y",
    });

    expect(url).toContain("method=getList");
    expect(url).toContain("orgId=101");
    expect(url).toContain("objL1=11+26");
    expect(url).toContain("objL2=ALL");
    expect(url).toContain("startPrdDe=2016");
    expect(url).toContain("apiKey=api-key%3Dwith-equals");
  });

  it("builds a bounded search URL", () => {
    const url = buildKosisSearchUrl("key", { searchNm: "지역별 인구", sort: "RANK", resultCount: 10 });
    expect(url).toContain("searchNm=%EC%A7%80%EC%97%AD%EB%B3%84+%EC%9D%B8%EA%B5%AC");
    expect(url).toContain("resultCount=10");
  });

  it("builds a metadata URL for classification and item codes", () => {
    const url = buildKosisMetadataUrl("key", { orgId: "101", tblId: "DT_TEST", objId: "REGION" });
    expect(url).toContain("method=getMeta");
    expect(url).toContain("type=ITM");
    expect(url).toContain("objId=REGION");
  });

  it("keeps missing markers and annotated values out of numeric calculations", () => {
    expect(parseKosisValue("1,234.5")).toEqual({ value: 1234.5, text: "1,234.5", symbol: null });
    expect(parseKosisValue("-")).toEqual({ value: null, text: "-", symbol: "-" });
    expect(parseKosisValue("1,234 (p)")).toEqual({ value: null, text: "1,234 (p)", symbol: "1234 (p)" });
  });

  it("parses KOSIS JSON-like responses without executing upstream text", () => {
    const payload = parseKosisResponseText('[{ORG_ID:"101",TBL_ID:"DT_TEST",DT:"1,000"}]');
    expect(payload).toEqual([{ ORG_ID: "101", TBL_ID: "DT_TEST", DT: "1,000" }]);
    expect(parseKosisResponseText('{ORG_ID:"101",TBL_ID:"DT_TEST"}')).toEqual({ ORG_ID: "101", TBL_ID: "DT_TEST" });
    expect(parseKosisResponseText('[{ITEM03:"비율 = "Pt" / "P0""}]')).toEqual([{ ITEM03: '비율 = "Pt" / "P0"' }]);
    expect(extractKosisProviderError({ err: "20", errMsg: "필수요청변수값이 누락되었습니다." })).toEqual({ code: "20", message: "필수요청변수값이 누락되었습니다." });
    expect(parseKosisResponseText("not-json")).toBeNull();
  });

  it("normalizes KOSIS dimensions, item, unit, period, and raw value", () => {
    const records = parseKosisStatisticsResponse([
      {
        ORG_ID: "101",
        TBL_ID: "DT_TEST",
        TBL_NM: "지역별 인구",
        C1: "11",
        C1_OBJ_NM: "지역",
        C1_NM: "서울",
        ITM_ID: "ITM_1",
        ITM_NM: "총인구",
        UNIT_ID: "명",
        UNIT_NM: "명",
        PRD_SE: "Y",
        PRD_DE: "2024",
        DT: "9,500,000",
        LST_CHN_DE: "2025-01-01",
      },
      {
        ORG_ID: "101",
        TBL_ID: "DT_TEST",
        TBL_NM: "지역별 인구",
        C1: "26",
        C1_OBJ_NM: "지역",
        C1_NM: "부산",
        ITM_ID: "ITM_1",
        ITM_NM: "총인구",
        UNIT_ID: "명",
        UNIT_NM: "명",
        PRD_SE: "Y",
        PRD_DE: "2024",
        DT: "-",
        LST_CHN_DE: "2025-01-01",
      },
    ]);

    expect(records[0]).toEqual(expect.objectContaining({
      orgId: "101",
      tblId: "DT_TEST",
      itemName: "총인구",
      unitName: "명",
      period: "2024",
      value: 9500000,
      valueText: "9,500,000",
    }));
    expect(records[0]?.classifications).toEqual([expect.objectContaining({ level: 1, code: "11", name: "서울", objectName: "지역" })]);
    expect(records[1]?.value).toBeNull();
    expect(records[1]?.valueSymbol).toBe("-");
    expect(records[0]?.raw.DT).toBe("9,500,000");
    expect(summarizeKosisRecords(records)).toEqual(expect.objectContaining({ rowCount: 2, orgId: "101", tblId: "DT_TEST", periods: ["2024"], units: ["명"], classificationLevels: [1] }));
  });

  it("normalizes table search results without exposing credentials", () => {
    const [result] = parseKosisSearchResponse([{
      ORG_ID: "101",
      ORG_NM: "국가데이터처",
      TBL_ID: "DT_TEST",
      TBL_NM: "지역별 인구",
      STAT_ID: "STAT_TEST",
      STAT_NM: "인구총조사",
      STRT_PRD_DE: "2010",
      END_PRD_DE: "2024",
      LINK_URL: "https://kosis.kr/example",
    }]);
    expect(result).toEqual(expect.objectContaining({ organizationId: "101", tableId: "DT_TEST", tableName: "지역별 인구", startPeriod: "2010", endPeriod: "2024" }));
    expect(result?.raw).not.toHaveProperty("apiKey");
  });

  it("normalizes KOSIS classification and item metadata", () => {
    const [result] = parseKosisMetadataResponse([{
      OBJ_ID: "REGION",
      OBJ_NM: "지역",
      ITM_ID: "11",
      ITM_NM: "서울",
      UP_ITM_ID: "00",
      OBJ_ID_SN: "1",
      UNIT_ID: "명",
      UNIT_NM: "명",
    }]);
    expect(result).toEqual(expect.objectContaining({ objectId: "REGION", objectName: "지역", itemId: "11", itemName: "서울", parentItemId: "00", unitName: "명" }));
  });
});
