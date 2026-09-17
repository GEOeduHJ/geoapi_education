import { describe, expect, it } from "vitest";
import type { PublicGeoObservation } from "./geo-observations";
import { toPoiPoints, toPoiProvenance, toPoiTableModel } from "./tourapi-adapter";

function poiObservation(id: string, overrides: Partial<PublicGeoObservation> = {}): PublicGeoObservation {
  return {
    id,
    snapshot_id: "snapshot-1",
    observed_at: null,
    region_code: "38",
    label: "가거도",
    value: null,
    unit: null,
    category: "관광지",
    attributes: {
      longitude: 125.123,
      latitude: 34.456,
      address: "전남 신안군",
    },
    ...overrides,
  };
}

describe("TourAPI POI adapter", () => {
  it("converts observations with coordinates to map points", () => {
    const points = toPoiPoints([
      poiObservation("p-1"),
      poiObservation("p-2", { attributes: { longitude: null, latitude: null } }),
    ]);
    expect(points).toEqual([{ id: "p-1", lon: 125.123, lat: 34.456, title: "가거도" }]);
  });

  it("builds a table model with name, address and coordinates", () => {
    const table = toPoiTableModel([poiObservation("p-1")]);
    expect(table.columns.map((column) => column.key)).toEqual(["title", "address", "longitude", "latitude"]);
    expect(table.records[0].metadata).toMatchObject({
      title: "가거도",
      address: "전남 신안군",
      longitude: "125.123",
      latitude: "34.456",
    });
  });

  it("builds provenance from the collection date", () => {
    const provenance = toPoiProvenance(
      { id: "snap-1", data_source_id: "ds", fetched_at: "2026-09-17T10:00:00Z", valid_from: null, valid_to: null, request_fingerprint: "", schema_version: "", row_count: 1, checksum: "", is_public: true },
      645,
      "지역별 관광지 분포",
      "https://www.data.go.kr/data/15101578/openapi.do",
    );
    expect(provenance).toMatchObject({
      provider: "한국관광공사",
      unit: "곳",
      observationCount: 645,
      requestedPeriod: { from: "2026-09-17", to: "2026-09-17" },
    });
  });
});
