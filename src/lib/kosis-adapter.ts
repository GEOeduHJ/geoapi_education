/**
 * KOSIS 공개 snapshot → 공통 시각화 계약 adapter.
 *
 * 단일 항목·단일 시점·단일 단위 snapshot만 받는다. 복수 시점/단위나
 * 지역당 복수 값은 `joinKosisObservationsToSgisBoundaries`가 이미
 * `ambiguous-values`로 걸러내므로 여기서는 값 내림차순(순위 순)으로 정렬한다.
 */

import type { ChartSpec, NormalizedRecord, Provenance, TableModel } from "./data-contract";
import type { BoundaryJoinValue } from "./geo-join";
import type { PublicSourceSnapshot } from "./geo-observations";

export function toKosisNormalizedRecords(
  values: Record<string, BoundaryJoinValue>,
  boundaryNames: Record<string, string> = {},
): NormalizedRecord[] {
  return Object.values(values)
    .filter((entry) => typeof entry.value === "number" && Number.isFinite(entry.value))
    .sort((a, b) => b.value - a.value)
    .map((entry, index) => ({
      id: `kosis-${entry.code}`,
      timestamp: entry.observedAt ?? "",
      location: {
        adm_cd: entry.code,
        name: entry.label ?? boundaryNames[entry.code] ?? entry.code,
      },
      value: entry.value,
      unit: entry.unit ?? "",
      metadata: {
        rank: index + 1,
        name: entry.label ?? boundaryNames[entry.code] ?? entry.code,
        value: entry.value,
        unit: entry.unit ?? "",
        observedAt: entry.observedAt ?? "",
        regionCode: entry.code,
        observationId: entry.observationId,
      },
    }));
}

export function toKosisChartSpec(records: NormalizedRecord[]): ChartSpec {
  return {
    type: "bar",
    records,
    xField: (record) => record.location.name,
    yField: (record) => record.value,
  };
}

function formatKosisValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.round(value * 10) / 10);
  }
  return String(value ?? "");
}

export function toKosisTableModel(records: NormalizedRecord[]): TableModel {
  return {
    columns: [
      { key: "rank", label: "순위" },
      { key: "name", label: "지역" },
      { key: "value", label: "값", format: formatKosisValue },
      { key: "unit", label: "단위" },
      { key: "observedAt", label: "기준시점" },
    ],
    records,
  };
}

export function toKosisProvenance(
  snapshot: PublicSourceSnapshot | null,
  records: NormalizedRecord[],
  datasetTitle: string,
  sourceUrl: string,
  requestedYear?: string,
): Provenance {
  const stamps = records.map((record) => record.timestamp).filter(Boolean).sort();
  const unit = records[0]?.unit ?? "";
  return {
    datasetTitle,
    provider: "KOSIS",
    sourceUrl,
    snapshotId: snapshot?.id,
    requestedPeriod: {
      from: requestedYear ?? snapshot?.valid_from ?? stamps[0] ?? "",
      to: requestedYear ?? snapshot?.valid_to ?? stamps.at(-1) ?? "",
    },
    actualPeriod: {
      from: stamps[0] ?? "",
      to: stamps.at(-1) ?? "",
    },
    unit,
    observationCount: records.length,
  };
}
