/**
 * USGS 지진 관측값 → 규모 색상 점·표·출처 adapter.
 * 규모 구간 색상은 지도 범례와 표기가 일치해야 한다.
 */

import type { Provenance, TableModel } from "./data-contract";
import type { PublicGeoObservation, PublicSourceSnapshot } from "./geo-observations";
import type { PoiPointInput } from "./vworld2d";

export const QUAKE_COLOR_MODERATE = "rgba(15, 139, 141, 0.92)";
export const QUAKE_COLOR_STRONG = "rgba(183, 121, 31, 0.92)";
export const QUAKE_COLOR_MAJOR = "rgba(179, 55, 47, 0.92)";

/** 규모별 점 색상. 경계값(7.0·8.0)은 위 구간에 포함한다. */
export function quakeColor(magnitude: number | null): string {
  if (typeof magnitude !== "number" || !Number.isFinite(magnitude)) return QUAKE_COLOR_MODERATE;
  if (magnitude >= 8) return QUAKE_COLOR_MAJOR;
  if (magnitude >= 7) return QUAKE_COLOR_STRONG;
  return QUAKE_COLOR_MODERATE;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function toQuakePoints(observations: PublicGeoObservation[]): PoiPointInput[] {
  const points: PoiPointInput[] = [];
  for (const observation of observations) {
    const lon = finiteNumber(observation.attributes.longitude);
    const lat = finiteNumber(observation.attributes.latitude);
    if (lon === null || lat === null) continue;
    points.push({
      id: observation.id,
      lon,
      lat,
      title: observation.label ?? "",
      color: quakeColor(typeof observation.value === "number" ? observation.value : null),
    });
  }
  return points;
}

function formatDateTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${value.slice(0, 10)} ${value.slice(11, 16)}`;
}

export function toQuakeTableModel(observations: PublicGeoObservation[]): TableModel {
  const sorted = [...observations].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  return {
    columns: [
      { key: "time", label: "발생시각(UTC)" },
      { key: "magnitude", label: "규모" },
      { key: "depth", label: "깊이(km)" },
      { key: "place", label: "위치" },
    ],
    records: sorted.map((observation) => ({
      id: observation.id,
      timestamp: typeof observation.observed_at === "string" ? observation.observed_at : "",
      location: { name: observation.label ?? "" },
      value: typeof observation.value === "number" ? observation.value : 0,
      unit: "M",
      metadata: {
        time: formatDateTime(observation.observed_at),
        magnitude: typeof observation.value === "number" ? observation.value.toFixed(1) : "-",
        depth: (() => {
          const depth = finiteNumber(observation.attributes.depth_km);
          return depth === null ? "-" : String(Math.round(depth * 10) / 10);
        })(),
        place: observation.label ?? "",
      },
    })),
  };
}

export function toQuakeProvenance(
  snapshot: PublicSourceSnapshot | null,
  count: number,
  datasetTitle: string,
  sourceUrl: string,
): Provenance {
  return {
    datasetTitle,
    provider: "USGS",
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
    unit: "M",
    observationCount: count,
  };
}
