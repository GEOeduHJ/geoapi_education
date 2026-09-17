/**
 * Unified data contract for all visualization adapters.
 * KMA, KOSIS, World Bank, and future data sources all conform to these types.
 */

export interface DatasetQuery {
  datasetKey: string;
  metric?: string;
  from: string;
  to: string;
  boundaryCode?: string;
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
