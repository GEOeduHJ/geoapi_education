import { describe, expect, it } from "vitest";
import type { PublicGeoObservation } from "./geo-observations";
import { toProfilePoints, toTopoProvenance, toTopoTableModel } from "./topo-adapter";

function topoRow(sequence: number, elevation: number | null): PublicGeoObservation {
  return {
    id: `t-${sequence}`,
    snapshot_id: "snapshot-1",
    observed_at: null,
    region_code: null,
    label: `지점 ${sequence}`,
    value: elevation,
    unit: "m",
    category: "고도",
    attributes: { sequence, longitude: 127 + sequence * 0.1, latitude: 37 - sequence * 0.1 },
  };
}

describe("topo adapter", () => {
  it("orders profile points by sequence and drops missing elevations", () => {
    const points = toProfilePoints([topoRow(3, 100), topoRow(1, 50), topoRow(2, null)]);
    expect(points.map((point) => point.sequence)).toEqual([1, 3]);
  });

  it("builds a table and provenance", () => {
    const points = toProfilePoints([topoRow(1, 50)]);
    const table = toTopoTableModel(points);
    expect(table.columns.map((column) => column.key)).toEqual(["sequence", "elevation", "lon", "lat"]);
    const provenance = toTopoProvenance(
      { id: "snap", data_source_id: "ds", fetched_at: "2026-09-17T10:00:00Z", valid_from: null, valid_to: null, request_fingerprint: "", schema_version: "", row_count: 1, checksum: "", is_public: true },
      1,
      "서울-부산 고도 횡단면",
      "https://www.opentopodata.org/",
    );
    expect(provenance).toMatchObject({ provider: "OpenTopoData", unit: "m", observationCount: 1 });
  });
});
