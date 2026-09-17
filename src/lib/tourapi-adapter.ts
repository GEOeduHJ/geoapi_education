/**
 * TourAPI POI 관측값 → 점분포·목록 표현 adapter.
 * 좌표가 없는 행은 지도에서 제외하고 표에만 남긴다.
 */

import type { Provenance, TableModel } from "./data-contract";
import type { PublicGeoObservation, PublicSourceSnapshot } from "./geo-observations";

export interface PoiPoint {
  id: string;
  lon: number;
  lat: number;
  title: string;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function attributeText(attributes: Record<string, unknown>, key: string): string {
  const value = attributes[key];
  return typeof value === "string" ? value : "";
}

export function toPoiPoints(observations: PublicGeoObservation[]): PoiPoint[] {
  const points: PoiPoint[] = [];
  for (const observation of observations) {
    const lon = finiteNumber(observation.attributes.longitude);
    const lat = finiteNumber(observation.attributes.latitude);
    if (lon === null || lat === null) continue;
    points.push({ id: observation.id, lon, lat, title: observation.label ?? "" });
  }
  return points;
}

export function toPoiTableModel(observations: PublicGeoObservation[]): TableModel {
  return {
    columns: [
      { key: "title", label: "이름" },
      { key: "address", label: "주소" },
      { key: "longitude", label: "경도" },
      { key: "latitude", label: "위도" },
    ],
    records: observations.map((observation) => {
      const lon = finiteNumber(observation.attributes.longitude);
      const lat = finiteNumber(observation.attributes.latitude);
      return {
        id: observation.id,
        timestamp: "",
        location: { name: observation.label ?? "" },
        value: 0,
        unit: "",
        metadata: {
          title: observation.label ?? "",
          address: attributeText(observation.attributes, "address"),
          longitude: lon === null ? "" : String(lon),
          latitude: lat === null ? "" : String(lat),
        },
      };
    }),
  };
}

export function toPoiProvenance(
  snapshot: PublicSourceSnapshot | null,
  count: number,
  datasetTitle: string,
  sourceUrl: string,
): Provenance {
  const collected = (snapshot?.fetched_at ?? "").slice(0, 10);
  return {
    datasetTitle,
    provider: "한국관광공사",
    sourceUrl,
    snapshotId: snapshot?.id,
    requestedPeriod: { from: collected, to: collected },
    actualPeriod: { from: collected, to: collected },
    unit: "곳",
    observationCount: count,
  };
}
