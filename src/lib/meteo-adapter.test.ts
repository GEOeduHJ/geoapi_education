import { describe, expect, it } from "vitest";
import type { PublicGeoObservation } from "./geo-observations";
import { toMeteoProvenance, toMeteoTableModel } from "./meteo-adapter";

function meteoRow(id: string, city: string, date: string, value: number | null): PublicGeoObservation {
  return {
    id,
    snapshot_id: "snapshot-1",
    observed_at: date,
    region_code: "SEL",
    label: city,
    value,
    unit: "°C",
    category: "일평균기온",
    attributes: { city_name: city },
  };
}

describe("meteo adapter", () => {
  it("sorts rows by city then date", () => {
    const table = toMeteoTableModel([
      meteoRow("m-2", "도쿄", "2024-01-02", 5),
      meteoRow("m-1", "서울", "2024-01-01", -2),
    ]);
    expect(table.columns.map((column) => column.key)).toEqual(["city", "date", "value", "unit"]);
    expect(table.records.map((record) => record.id)).toEqual(["m-2", "m-1"]);
    expect(table.records[0].metadata).toMatchObject({ city: "도쿄", date: "2024-01-02", value: 5 });
  });

  it("builds Open-Meteo provenance", () => {
    const provenance = toMeteoProvenance(
      { id: "snap", data_source_id: "ds", fetched_at: "", valid_from: "2024-01-01", valid_to: "2024-12-31", request_fingerprint: "", schema_version: "", row_count: 1, checksum: "", is_public: true },
      1830,
      "세계 주요 도시 기후 비교",
      "https://open-meteo.com/",
    );
    expect(provenance).toMatchObject({ provider: "Open-Meteo", observationCount: 1830 });
  });
});
