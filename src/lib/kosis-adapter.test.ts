import { describe, expect, it } from "vitest";
import type { BoundaryJoinValue } from "./geo-join";
import {
  toKosisChartSpec,
  toKosisNormalizedRecords,
  toKosisProvenance,
  toKosisTableModel,
} from "./kosis-adapter";

function joinValue(code: string, value: number, overrides: Partial<BoundaryJoinValue> = {}): BoundaryJoinValue {
  return {
    code,
    value,
    label: `지역 ${code}`,
    unit: "천㎡",
    observationId: `obs-${code}`,
    observedAt: "2025-01-01T00:00:00+00:00",
    ...overrides,
  };
}

describe("KOSIS adapter", () => {
  it("converts join values to ranking-ordered normalized records", () => {
    const records = toKosisNormalizedRecords({
      "11": joinValue("11", 4.6, { label: "서울특별시" }),
      "29": joinValue("29", 61.9, { label: "세종특별자치시" }),
      "24": joinValue("24", 13, { label: "광주광역시" }),
    });

    expect(records.map((record) => record.location.adm_cd)).toEqual(["29", "24", "11"]);
    expect(records[0]).toMatchObject({
      id: "kosis-29",
      value: 61.9,
      unit: "천㎡",
      metadata: expect.objectContaining({ rank: 1, name: "세종특별자치시", regionCode: "29" }),
    });
  });

  it("falls back to boundary names and drops non-numeric values", () => {
    const records = toKosisNormalizedRecords(
      {
        "11": joinValue("11", Number.NaN, { label: null }),
        "21": joinValue("21", 12.1, { label: null }),
      },
      { "21": "부산광역시" },
    );

    expect(records).toHaveLength(1);
    expect(records[0].location.name).toBe("부산광역시");
  });

  it("builds bar chart and table models from the same records", () => {
    const records = toKosisNormalizedRecords({ "11": joinValue("11", 4.6, { label: "서울" }) });
    const chart = toKosisChartSpec(records);
    expect(chart.type).toBe("bar");
    expect(chart.xField(records[0])).toBe("서울");
    expect(chart.yField(records[0])).toBe(4.6);

    const table = toKosisTableModel(records);
    expect(table.columns.map((column) => column.key)).toEqual(["rank", "name", "value", "unit", "observedAt"]);
    const valueColumn = table.columns.find((column) => column.key === "value");
    expect(valueColumn?.format?.(4.66)).toBe("4.7");
  });

  it("builds provenance from the snapshot range and records", () => {
    const records = toKosisNormalizedRecords({ "11": joinValue("11", 4.6) });
    const provenance = toKosisProvenance(
      { id: "snap-1", data_source_id: "ds", fetched_at: "", valid_from: "2025-01-01", valid_to: "2025-01-01", request_fingerprint: "", schema_version: "", row_count: 1, checksum: "", is_public: true },
      records,
      "시도별 인구 천 명당 도시공원 조성면적",
      "https://kosis.kr/",
    );

    expect(provenance).toMatchObject({
      datasetTitle: "시도별 인구 천 명당 도시공원 조성면적",
      provider: "KOSIS",
      sourceUrl: "https://kosis.kr/",
      snapshotId: "snap-1",
      unit: "천㎡",
      observationCount: 1,
    });
    expect(provenance.missingRatio).toBeUndefined();
  });
});
