import type { PublicGeoObservation } from "./geo-observations";
import type { SgisBoundaryResponse } from "./sgis";

export type BoundaryJoinStatus =
  | "no-boundaries"
  | "no-public-values"
  | "ambiguous-values"
  | "no-code-matches"
  | "ready";

export interface BoundaryJoinValue {
  code: string;
  value: number;
  label: string | null;
  unit: string | null;
  observationId: string;
  observedAt: string | null;
}

export interface BoundaryJoinResult {
  status: BoundaryJoinStatus;
  boundaryCount: number;
  observationCount: number;
  numericObservationCount: number;
  matchedCount: number;
  missingBoundaryCount: number;
  unmatchedObservationCodes: string[];
  ambiguousCodes: string[];
  values: Record<string, BoundaryJoinValue>;
  periods: string[];
  units: string[];
}

function canonicalCode(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return code || null;
}

function distinctDimensionValues(
  observations: PublicGeoObservation[],
  selector: (observation: PublicGeoObservation) => string | null,
  missingLabel: string,
): string[] {
  return [...new Set(observations.map((observation) => selector(observation)?.trim() || missingLabel))].sort();
}

/**
 * Joins public KOSIS observations to SGIS boundaries by code only.
 *
 * A map value is deliberately considered unsafe when a region has more than
 * one numeric observation, or when the observation set mixes periods/units.
 * This prevents an accidental color map built from multiple categories or
 * time points.
 */
export function joinKosisObservationsToSgisBoundaries(
  boundaries: SgisBoundaryResponse | null,
  observations: PublicGeoObservation[],
): BoundaryJoinResult {
  const boundaryFeatures = boundaries?.data.features ?? [];
  const boundaryCodes = new Set(
    boundaryFeatures
      .map((feature) => canonicalCode(feature.properties.adm_cd))
      .filter((code): code is string => code !== null),
  );
  const numericObservations = observations.filter(
    (observation) => canonicalCode(observation.region_code) !== null
      && typeof observation.value === "number"
      && Number.isFinite(observation.value),
  );
  const periods = distinctDimensionValues(numericObservations, (observation) => observation.observed_at, "(시점 없음)");
  const units = distinctDimensionValues(numericObservations, (observation) => observation.unit, "(단위 없음)");
  const observationsByCode = new Map<string, PublicGeoObservation[]>();

  for (const observation of numericObservations) {
    const code = canonicalCode(observation.region_code);
    if (!code) continue;
    const rows = observationsByCode.get(code) ?? [];
    rows.push(observation);
    observationsByCode.set(code, rows);
  }

  const ambiguousCodes = [...observationsByCode.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([code]) => code)
    .sort();
  const unmatchedObservationCodes = [...observationsByCode.keys()]
    .filter((code) => !boundaryCodes.has(code))
    .sort();
  const matchedCodes = [...observationsByCode.keys()].filter((code) => boundaryCodes.has(code));
  const boundaryCount = boundaryFeatures.length;
  const matchedCount = matchedCodes.length;
  const missingBoundaryCount = Math.max(0, boundaryCount - matchedCount);
  const base = {
    boundaryCount,
    observationCount: observations.length,
    numericObservationCount: numericObservations.length,
    matchedCount,
    missingBoundaryCount,
    unmatchedObservationCodes,
    ambiguousCodes,
    periods,
    units,
  };

  if (boundaryCount === 0) return { ...base, status: "no-boundaries", values: {} };
  if (numericObservations.length === 0) return { ...base, status: "no-public-values", values: {} };
  if (ambiguousCodes.length > 0 || periods.length > 1 || units.length > 1) {
    return { ...base, status: "ambiguous-values", values: {} };
  }
  if (matchedCount === 0) return { ...base, status: "no-code-matches", values: {} };

  const values: Record<string, BoundaryJoinValue> = {};
  for (const code of matchedCodes) {
    const observation = observationsByCode.get(code)?.[0];
    if (!observation || typeof observation.value !== "number" || !Number.isFinite(observation.value)) continue;
    values[code] = {
      code,
      value: observation.value,
      label: observation.label,
      unit: observation.unit,
      observationId: observation.id,
      observedAt: observation.observed_at,
    };
  }

  return { ...base, status: "ready", matchedCount: Object.keys(values).length, values };
}
