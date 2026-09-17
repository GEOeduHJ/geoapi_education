/**
 * Unified data contract for all visualization adapters.
 * KMA, KOSIS, World Bank, and future data sources all conform to these types.
 */

/**
 * 국내 행정경계 수준 어휘. 2026-09-17 결정: 실제 값 원천(KOSIS 시도급 표,
 * KMA 10개 관측소)이 시도 단위까지만 뒷받침하므로 domestic 2D는 "sido"로 고정한다.
 * 시군구는 crosswalk·시군구급 snapshot이 없고, 읍면동(행정동/법정동 불일치)은
 * 구현 대상에서 제외한다. 값 원천이 확보되면 이 union을 넓히지 않고
 * SUPPORTED_DOMESTIC_BOUNDARY_LEVELS에 level을 추가한다.
 */
export type BoundaryLevel = "sido" | "sigungu" | "emdong";

/** domestic 2D에서 실제로 지원하는 경계 수준. 현재는 시도만. */
export const SUPPORTED_DOMESTIC_BOUNDARY_LEVELS: readonly BoundaryLevel[] = ["sido"];

export interface DatasetQuery {
  datasetKey: string;
  metric?: string;
  from: string;
  to: string;
  boundaryCode?: string;
  boundaryLevel?: BoundaryLevel;
  stationIds?: string[];
}

export interface NormalizedRecord {
  id: string;
  timestamp: string;
  location: {
    lat?: number;
    lon?: number;
    adm_cd?: string;
    /** 하나의 관측이 여러 경계 도형에 대응할 때(예: 아직 통합 전 옛 경계로 남은 행정통합) 전체 코드 목록. */
    admCds?: string[];
    name: string;
  };
  value: number;
  unit: string;
  metadata: Record<string, unknown>;
}

export interface MapLayerSpec {
  type: "point" | "polygon" | "heatmap";
  records: NormalizedRecord[];
  colorScale?: {
    min: number;
    max: number;
    label: string;
  };
  valueField: (record: NormalizedRecord) => number;
}

export interface ChartSpec {
  type: "bar" | "line" | "scatter";
  records: NormalizedRecord[];
  xField: (record: NormalizedRecord) => string;
  yField: (record: NormalizedRecord) => number;
  groupBy?: (record: NormalizedRecord) => string;
}

export interface TableModel {
  columns: Array<{
    key: string;
    label: string;
    format?: (value: unknown) => string;
  }>;
  records: NormalizedRecord[];
}

export interface Provenance {
  datasetTitle: string;
  provider: string;
  sourceUrl: string;
  snapshotId?: string;
  requestedPeriod: {
    from: string;
    to: string;
  };
  actualPeriod: {
    from: string;
    to: string;
  };
  unit: string;
  missingCount?: number;
  missingRatio?: number;
  observationCount?: number;
}
