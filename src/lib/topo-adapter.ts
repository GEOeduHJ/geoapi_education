/**
 * OpenTopoData 횡단면 → 고도 단면 adapter.
 */

import type { Provenance, TableModel } from "./data-contract";
import type { PublicGeoObservation, PublicSourceSnapshot } from "./geo-observations";

export interface ProfilePoint {
  sequence: number;
  elevation: number;
  lon: number;
  lat: number;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** sequence 순으로 정렬된 단면 점. 고도 결측 지점은 제외한다. */
export function toProfilePoints(observations: PublicGeoObservation[]): ProfilePoint[] {
  return observations
    .map((observation) => ({
      sequence: finiteNumber(observation.attributes.sequence) ?? Number.MAX_SAFE_INTEGER,
      elevation: finiteNumber(observation.value),
      lon: finiteNumber(observation.attributes.longitude) ?? 0,
      lat: finiteNumber(observation.attributes.latitude) ?? 0,
    }))
    .filter((point) => point.elevation !== null)
    .sort((a, b) => a.sequence - b.sequence) as ProfilePoint[];
}

export function toTopoTableModel(points: ProfilePoint[]): TableModel {
  return {
    columns: [
      { key: "sequence", label: "지점" },
      { key: "elevation", label: "고도(m)" },
      { key: "lon", label: "경도" },
      { key: "lat", label: "위도" },
    ],
    records: points.map((point) => ({
      id: `topo-${point.sequence}`,
      timestamp: "",
      location: { name: `지점 ${point.sequence}` },
      value: point.elevation,
      unit: "m",
      metadata: {
        sequence: point.sequence,
        elevation: point.elevation,
        lon: point.lon,
        lat: point.lat,
      },
    })),
  };
}

export function toTopoProvenance(
  snapshot: PublicSourceSnapshot | null,
  count: number,
  datasetTitle: string,
  sourceUrl: string,
): Provenance {
  const collected = (snapshot?.fetched_at ?? "").slice(0, 10);
  return {
    datasetTitle,
    provider: "OpenTopoData",
    sourceUrl,
    snapshotId: snapshot?.id,
    requestedPeriod: { from: collected, to: collected },
    actualPeriod: { from: collected, to: collected },
    unit: "m",
    observationCount: count,
  };
}
