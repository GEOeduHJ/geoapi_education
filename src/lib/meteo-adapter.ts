/**
 * Open-Meteo 도시 일자료 → 도시 비교 표·출처 adapter.
 * 지도 점은 공용 toPoiPoints를 재사용한다.
 */

import type { Provenance, TableModel } from "./data-contract";
import type { PublicGeoObservation, PublicSourceSnapshot } from "./geo-observations";

export function toMeteoTableModel(observations: PublicGeoObservation[]): TableModel {
  const sorted = [...observations].sort((a, b) =>
    String(a.attributes.city_name ?? a.label ?? "").localeCompare(String(b.attributes.city_name ?? b.label ?? ""), "ko") ||
    String(a.observed_at ?? "").localeCompare(String(b.observed_at ?? "")),
  );
  return {
    columns: [
      { key: "city", label: "도시" },
      { key: "date", label: "날짜" },
      { key: "value", label: "값", format: (value) => typeof value === "number" ? String(value) : String(value ?? "-") },
      { key: "unit", label: "단위" },
    ],
    records: sorted.map((observation) => ({
      id: observation.id,
      timestamp: observation.observed_at ?? "",
      location: { name: observation.label ?? "" },
      value: typeof observation.value === "number" ? observation.value : 0,
      unit: observation.unit ?? "",
      metadata: {
        city: typeof observation.attributes.city_name === "string" ? observation.attributes.city_name : (observation.label ?? ""),
        date: (observation.observed_at ?? "").slice(0, 10),
        value: observation.value,
        unit: observation.unit ?? "",
      },
    })),
  };
}

export function toMeteoProvenance(
  snapshot: PublicSourceSnapshot | null,
  count: number,
  datasetTitle: string,
  sourceUrl: string,
): Provenance {
  return {
    datasetTitle,
    provider: "Open-Meteo",
    sourceUrl,
    snapshotId: snapshot?.id,
    requestedPeriod: {
      from: snapshot?.valid_from ?? "",
      to: snapshot?.valid_to ?? "",
    },
    actualPeriod: {
      from: snapshot?.valid_from ?? "",
      to: snapshot?.valid_to ?? "",
    },
    unit: "°C·mm(지표별)",
    observationCount: count,
  };
}
