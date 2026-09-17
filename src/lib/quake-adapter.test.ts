import { describe, expect, it } from "vitest";
import type { PublicGeoObservation } from "./geo-observations";
import {
  QUAKE_COLOR_MAJOR,
  QUAKE_COLOR_MODERATE,
  QUAKE_COLOR_STRONG,
  quakeColor,
  toQuakePoints,
  toQuakeProvenance,
  toQuakeTableModel,
} from "./quake-adapter";

function quakeObservation(id: string, overrides: Partial<PublicGeoObservation> = {}): PublicGeoObservation {
  return {
    id,
    snapshot_id: "snapshot-1",
    observed_at: "2024-01-01T00:00:00.000Z",
    region_code: null,
    label: "off the coast",
    value: 7.2,
    unit: "M",
    category: "지진",
    attributes: { longitude: 140.1, latitude: 35.2, depth_km: 10 },
    ...overrides,
  };
}

describe("quake adapter", () => {
  it("colors points by magnitude bands", () => {
    expect(quakeColor(6.0)).toBe(QUAKE_COLOR_MODERATE);
    expect(quakeColor(6.9)).toBe(QUAKE_COLOR_MODERATE);
    expect(quakeColor(7.0)).toBe(QUAKE_COLOR_STRONG);
    expect(quakeColor(8.0)).toBe(QUAKE_COLOR_MAJOR);
    expect(quakeColor(null)).toBe(QUAKE_COLOR_MODERATE);
  });

  it("converts observations to colored map points", () => {
    const points = toQuakePoints([
      quakeObservation("q-1"),
      quakeObservation("q-2", { attributes: { longitude: null, latitude: null } }),
    ]);
    expect(points).toEqual([{ id: "q-1", lon: 140.1, lat: 35.2, title: "off the coast", color: QUAKE_COLOR_STRONG }]);
  });

  it("sorts the table by magnitude and builds USGS provenance", () => {
    const table = toQuakeTableModel([quakeObservation("q-1"), quakeObservation("q-2", { value: 8.1, label: "big" })]);
    expect(table.columns.map((column) => column.key)).toEqual(["time", "magnitude", "depth", "place"]);
    expect(table.records[0].id).toBe("q-2");
    const provenance = toQuakeProvenance(
      { id: "snap", data_source_id: "ds", fetched_at: "", valid_from: "2020-01-01", valid_to: "2026-09-18", request_fingerprint: "", schema_version: "", row_count: 2, checksum: "", is_public: true },
      2,
      "세계 지진 분포와 규모",
      "https://earthquake.usgs.gov/fdsnws/event/1/",
    );
    expect(provenance).toMatchObject({ provider: "USGS", unit: "M", observationCount: 2 });
  });
});
