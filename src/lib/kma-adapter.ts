/**
 * KMA ASOS climate data adapter.
 * Converts KMA data to the unified visualization contract.
 */

import type {
  ChartSpec,
  DatasetQuery,
  MapLayerSpec,
  NormalizedRecord,
  Provenance,
  TableModel,
} from "./data-contract";
import type { ClimateSummary, ClimateStation } from "./climate";
import { climateMetrics, lawCodeToSgisAdmCds } from "./climate";

export function toNormalizedRecords(
  summaries: ClimateSummary[],
  metric: string,
  stations?: ClimateStation[],
): NormalizedRecord[] {
  const stationMap = new Map(stations?.map((s) => [s.station_id, s]) ?? []);

  return summaries.map((summary) => {
    const station = stationMap.get(summary.stationId);
    const admCds = lawCodeToSgisAdmCds(station?.law_code ?? null);

    return {
      id: summary.stationId,
      timestamp: `${summary.firstDate}T00:00:00Z`,
      location: {
        lat: station?.latitude,
        lon: station?.longitude,
        adm_cd: admCds[0],
        admCds,
        name: summary.stationName,
      },
      value: summary.value,
      unit: summary.unit,
      metadata: {
        stationId: summary.stationId,
        stationName: summary.stationName,
        metric,
        observationCount: summary.observationCount,
        expectedObservationCount: summary.expectedObservationCount,
        coverageRatio: summary.coverageRatio,
        firstDate: summary.firstDate,
        lastDate: summary.lastDate,
      },
    };
  });
}

// Helper: 경계별 집계 데이터 생성. 한 record가 여러 SGIS 경계에 대응하면(예: 아직
// 옛 경계로 남아있는 통합 행정구역) 각 경계 그룹에 동일하게 기여한다.
function aggregateByBoundary(records: NormalizedRecord[]): Record<string, { records: NormalizedRecord[]; avg: number }> {
  const grouped: Record<string, NormalizedRecord[]> = {};

  for (const record of records) {
    const admCds = record.location.admCds?.length ? record.location.admCds : record.location.adm_cd ? [record.location.adm_cd] : [];
    for (const admCd of admCds) {
      if (!grouped[admCd]) grouped[admCd] = [];
      grouped[admCd].push(record);
    }
  }

  const result: Record<string, { records: NormalizedRecord[]; avg: number }> = {};
  for (const [admCd, admRecords] of Object.entries(grouped)) {
    const values = admRecords.map((r) => r.value).filter(Number.isFinite);
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    result[admCd] = { records: admRecords, avg };
  }

  return result;
}

export function toMapLayerSpec(
  records: NormalizedRecord[],
  metric: string,
  boundaryNames?: Record<string, string>,
): MapLayerSpec {
  const aggregated = aggregateByBoundary(records);

  // 경계별 대표값 record 생성
  const aggregatedRecords = Object.entries(aggregated).map(([admCd, data]) => ({
    id: admCd,
    timestamp: records[0]?.timestamp ?? new Date().toISOString(),
    location: {
      adm_cd: admCd,
      name: boundaryNames?.[admCd] ?? admCd,
    },
    value: data.avg,
    unit: records[0]?.unit ?? "",
    metadata: {
      stationType: "aggregated_boundary",
      observationStationCount: data.records.length,
      stationIds: data.records.map((r) => r.metadata.stationId).filter(Boolean),
    },
  }));

  const values = aggregatedRecords.map((r) => r.value).filter(Number.isFinite);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;

  return {
    type: "polygon",
    records: aggregatedRecords,
    colorScale: {
      min,
      max,
      label: metric,
    },
    valueField: (record) => record.value,
  };
}

export function toChartSpec(
  records: NormalizedRecord[],
  metric: string,
): ChartSpec {
  return {
    type: "bar",
    records,
    xField: (record) => record.location.name,
    yField: (record) => record.value,
  };
}

export function toTableModel(records: NormalizedRecord[], metric: string): TableModel {
  const metricDef = (climateMetrics as Record<string, unknown>)[metric];
  const metricLabel = metricDef && typeof metricDef === "object" && "label" in metricDef
    ? (metricDef as { label: string }).label
    : metric;

  return {
    columns: [
      { key: "name", label: "관측소" },
      { key: "value", label: metricLabel, format: (v) => typeof v === "number" ? v.toFixed(1) : String(v) },
      { key: "count", label: "유효 관측일", format: (v) => typeof v === "number" ? v.toLocaleString("ko-KR") : String(v) },
      { key: "coverage", label: "유효범위", format: (v) => typeof v === "number" ? `${(v * 100).toFixed(1)}%` : String(v) },
      { key: "range", label: "실제 자료 범위" },
    ],
    records: records.map((record) => ({
      ...record,
      metadata: {
        ...record.metadata,
        value: record.value,
        count: record.metadata.observationCount,
        coverage: record.metadata.coverageRatio,
        range: `${record.metadata.firstDate} ~ ${record.metadata.lastDate}`,
      },
    })),
  };
}

export function toProvenance(
  summaries: ClimateSummary[],
  query: DatasetQuery,
  actualFrom: string | null,
  actualTo: string | null,
): Provenance {
  const coverages = summaries.map((s) => s.coverageRatio).filter(Number.isFinite);
  const averageCoverage = coverages.length ? coverages.reduce((a, b) => a + b, 0) / coverages.length : 0;
  const missingRatio = 1 - averageCoverage;

  return {
    datasetTitle: "주요 도시 최근 10년 기후",
    provider: "기상청 ASOS",
    sourceUrl: "https://apihub.kma.go.kr/",
    snapshotId: "kma-asos-10y",
    requestedPeriod: {
      from: query.from,
      to: query.to,
    },
    actualPeriod: {
      from: actualFrom ?? query.from,
      to: actualTo ?? query.to,
    },
    unit: summaries[0]?.unit ?? "°C",
    missingRatio: missingRatio > 0 ? missingRatio : undefined,
    observationCount: summaries.reduce((sum, s) => sum + s.observationCount, 0),
  };
}
