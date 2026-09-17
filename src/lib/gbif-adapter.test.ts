import { describe, expect, it } from "vitest";
import type { PublicGeoObservation } from "./geo-observations";
import { toGbifProvenance, toGbifTableModel } from "./gbif-adapter";

function gbifRow(id: string, date: string | null): PublicGeoObservation {
  return {
    id,
    snapshot_id: "snapshot-1",
    observed_at: date,
    region_code: null,
    label: "두루미",
    value: null,
    unit: null,
    category: "두루미",
    attributes: { locality: "순천만", license: "http://creativecommons.org/licenses/by/4.0/legalcode" },
  };
}

describe("gbif adapter", () => {
  it("sorts rows by date descending with license short names", () => {
    const table = toGbifTableModel([gbifRow("g-1", "2024-01-01"), gbifRow("g-2", "2025-03-01")]);
    expect(table.columns.map((column) => column.key)).toEqual(["species", "date", "locality", "license"]);
    expect(table.records.map((record) => record.id)).toEqual(["g-2", "g-1"]);
    expect(table.records[0].metadata).toMatchObject({ species: "두루미", date: "2025-03-01", locality: "순천만" });
  });

  it("builds GBIF provenance", () => {
    const provenance = toGbifProvenance(
      { id: "snap", data_source_id: "ds", fetched_at: "", valid_from: "2015-01-01", valid_to: "2026-12-31", request_fingerprint: "", schema_version: "", row_count: 1, checksum: "", is_public: true },
      982,
      "상징종 분포",
      "https://www.gbif.org/",
    );
    expect(provenance).toMatchObject({ provider: "GBIF", unit: "건", observationCount: 982 });
  });
});
