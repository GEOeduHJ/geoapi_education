/**
 * GBIF 발생 기록 → 종·날짜·장소·라이선스 표·출처 adapter.
 * 지도 점은 공용 toPoiPoints를 재사용한다.
 */

import type { Provenance, TableModel } from "./data-contract";
import type { PublicGeoObservation, PublicSourceSnapshot } from "./geo-observations";

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function toGbifTableModel(observations: PublicGeoObservation[]): TableModel {
  const sorted = [...observations].sort((a, b) =>
    String(b.observed_at ?? "").localeCompare(String(a.observed_at ?? "")),
  );
  return {
    columns: [
      { key: "species", label: "종" },
      { key: "date", label: "관측일" },
      { key: "locality", label: "장소" },
      { key: "license", label: "라이선스" },
    ],
    records: sorted.map((observation) => ({
      id: observation.id,
      timestamp: observation.observed_at ?? "",
      location: { name: observation.label ?? "" },
      value: 0,
      unit: "",
      metadata: {
        species: observation.label ?? "",
        date: (observation.observed_at ?? "").slice(0, 10) || "-",
        locality: cellText(observation.attributes.locality),
        license: cellText(observation.attributes.license).split("/").pop() || "-",
      },
    })),
  };
}

export function toGbifProvenance(
  snapshot: PublicSourceSnapshot | null,
  count: number,
  datasetTitle: string,
  sourceUrl: string,
): Provenance {
  return {
    datasetTitle,
    provider: "GBIF",
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
    unit: "건",
    observationCount: count,
  };
}
