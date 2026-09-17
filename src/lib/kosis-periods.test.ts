import { describe, expect, it } from "vitest";
import { getKosisDatasetPeriodRange, formatKosisPeriod } from "./kosis-periods";
import type { KosisSearchResult } from "./kosis";

function searchResult(overrides: Partial<KosisSearchResult> = {}): KosisSearchResult {
  return {
    organizationId: "101",
    organizationName: "국가데이터처",
    tableId: "DT_TEST",
    tableName: "지역별 지표",
    statId: "STAT_TEST",
    statName: "지역통계",
    periodType: null,
    contents: null,
    startPeriod: "2010",
    endPeriod: "2024",
    tableViewUrl: null,
    linkUrl: null,
    raw: {},
    ...overrides,
  };
}

describe("KOSIS dataset period options", () => {
  it("creates bounded annual options from the selected table range", () => {
    const range = getKosisDatasetPeriodRange(searchResult());
    expect(range).toMatchObject({ period: "Y", min: "2010", max: "2024", truncated: false });
    expect(range?.options).toHaveLength(15);
    expect(range?.options[0]).toBe("2010");
    expect(range?.options.at(-1)).toBe("2024");
  });

  it("uses the provider period type and creates month options", () => {
    const range = getKosisDatasetPeriodRange(searchResult({
      periodType: "M",
      startPeriod: "202401",
      endPeriod: "202403",
    }));
    expect(range?.options).toEqual(["202401", "202402", "202403"]);
    expect(formatKosisPeriod("202403", "M")).toBe("2024년 3월");
  });

  it("rejects a missing or inconsistent dataset range instead of inventing 2024", () => {
    expect(getKosisDatasetPeriodRange(searchResult({ startPeriod: null }))).toBeNull();
    expect(getKosisDatasetPeriodRange(searchResult({ startPeriod: "2010", endPeriod: "202401" }))).toBeNull();
  });

  it("keeps the dataset maximum selectable when a daily range is longer than the UI cap", () => {
    const range = getKosisDatasetPeriodRange(searchResult({
      periodType: "D",
      startPeriod: "20000101",
      endPeriod: "20251231",
    }));
    expect(range?.truncated).toBe(true);
    expect(range?.options).toHaveLength(5_000);
    expect(range?.options.at(-1)).toBe("20251231");
  });
});
