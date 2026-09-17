import { useEffect, useMemo, useState } from "react";
import type { BoundaryLevel } from "./data-contract";
import { hasSupabaseClientConfig } from "./env";

export type DatasetScope = "domestic" | "world";
export type DatasetStatus = "ready" | "planned";
export type DatasetCapability = "map" | "chart" | "table";

export interface DatasetDefinition {
  key: string;
  scope: DatasetScope;
  title: string;
  provider: string;
  topic: string;
  space: string;
  coverage: string;
  period: { min: string; max: string; label: string };
  capabilities: DatasetCapability[];
  status: DatasetStatus;
  description: string;
  sourceUrl: string;
  storage: "supabase" | "server-cache" | "planned";
  /**
   * 이 데이터셋을 국내 행정경계 choropleth로 그릴 수 있는 수준.
   * 2026-09-17 결정: 값 원천이 시도 단위까지만 검증됐으므로 domestic은
   * ["sido"]로 고정하고, 세계 dataset은 국내 경계를 쓰지 않아 []이다.
   */
  supportedLevels: BoundaryLevel[];
  /**
   * 공간 표현 방식. polygon=행정경계 단계구분도, point=위치 점분포.
   * DB `dataset_catalog.metadata.kind`와 연결되며 기본값은 polygon이다.
   */
  kind: "polygon" | "point";
  /**
   * Phase A 다중화: 이 dataset이 읽을 공개 snapshot ID.
   * DB `dataset_catalog.snapshot_id`와 연결되며, 정적 카탈로그는 null이다.
   * null이면 기존처럼 최신 공개 snapshot을 읽는다.
   */
  snapshotId: string | null;
  /**
   * Phase C 지표 선택지. DB `dataset_catalog.metadata.indicators`와 연결되며,
   * 빈 배열이면 단일 지표 dataset으로 취급한다. 정적 카탈로그는 항상 빈 배열이다.
   */
  indicators: DatasetIndicator[];
}

/** 한 dataset 안의 지표 선택지. 각 지표는 자체 공개 snapshot을 가리킨다. */
export interface DatasetIndicator {
  key: string;
  label: string;
  snapshotId: string | null;
  unit: string;
}

/**
 * Public learner choices are intentionally curated. Provider search APIs stay
 * in the controlled-ingest/admin path so an arbitrary table or query cannot
 * become an unverified learning material.
 */
export const DATASET_CATALOG: DatasetDefinition[] = [
  {
    key: "kma-asos-climate-10y",
    scope: "domestic",
    title: "주요 도시 최근 10년 기후",
    provider: "기상청 ASOS",
    topic: "기온·강수·바람·습도",
    space: "대표 관측지점",
    coverage: "10개 관측소",
    period: { min: "2016-01-01", max: "2025-12-31", label: "2016~2025" },
    capabilities: ["map", "chart", "table"],
    status: "ready",
    description: "Supabase에 저장한 ASOS 일자료와 월별 요약으로 지점별 기후 차이를 비교합니다.",
    sourceUrl: "https://apihub.kma.go.kr/",
    storage: "supabase",
    supportedLevels: ["sido"],
    kind: "polygon",
    snapshotId: null,
    indicators: [],
  },
  {
    key: "kosis-sido-city-park-per-capita",
    scope: "domestic",
    title: "시도별 인구 천 명당 도시공원 조성면적",
    provider: "KOSIS",
    topic: "도시·환경",
    space: "시도",
    coverage: "17개 시도",
    period: { min: "2025", max: "2025", label: "2025" },
    capabilities: ["map", "chart", "table"],
    status: "ready",
    description: "2025년 시도별 인구 천 명당 도시공원 조성면적을 공개 snapshot의 단계구분도·순위 그래프·자료표로 표시합니다.",
    sourceUrl: "https://kosis.kr/",
    storage: "supabase",
    supportedLevels: ["sido"],
    kind: "polygon",
    snapshotId: null,
    indicators: [],
  },
  {
    key: "kosis-sido-grdp-per-capita",
    scope: "domestic",
    title: "시도별 1인당 지역내총생산",
    provider: "KOSIS",
    topic: "경제·지역격차",
    space: "시도",
    coverage: "17개 시도·1985~2024",
    period: { min: "1985", max: "2024", label: "1985~2024" },
    capabilities: ["map", "chart", "table"],
    status: "ready",
    description: "1985년 이후 시도별 1인당 GRDP를 공개 snapshot의 단계구분도·순위 그래프·자료표로 표시합니다. 연도를 선택하면 같은 조건으로 자동 갱신됩니다.",
    sourceUrl: "https://kosis.kr/",
    storage: "supabase",
    supportedLevels: ["sido"],
    kind: "polygon",
    snapshotId: null,
    indicators: [],
  },
  {
    key: "kosis-sido-private-edu-cost",
    scope: "domestic",
    title: "시도별 학생 1인당 월평균 사교육비",
    provider: "KOSIS",
    topic: "교육",
    space: "시도",
    coverage: "17개 시도·2009~2025",
    period: { min: "2009", max: "2025", label: "2009~2025" },
    capabilities: ["map", "chart", "table"],
    status: "ready",
    description: "2009년 이후 시도별 학생 1인당 월평균 사교육비를 공개 snapshot의 단계구분도·순위 그래프·자료표로 표시합니다.",
    sourceUrl: "https://kosis.kr/",
    storage: "supabase",
    supportedLevels: ["sido"],
    kind: "polygon",
    snapshotId: null,
    indicators: [],
  },
  {
    key: "kosis-sido-vehicle-registrations",
    scope: "domestic",
    title: "시도별 자동차등록대수",
    provider: "KOSIS",
    topic: "교통·생활",
    space: "시도",
    coverage: "17개 시도·2018~2026",
    period: { min: "2018", max: "2026", label: "2018~2026" },
    capabilities: ["map", "chart", "table"],
    status: "ready",
    description: "월별 자동차등록대수를 연평균으로 집계해 시도별 단계구분도·순위 그래프·자료표로 표시합니다.",
    sourceUrl: "https://kosis.kr/",
    storage: "supabase",
    supportedLevels: ["sido"],
    kind: "polygon",
    snapshotId: null,
    indicators: [],
  },
  {
    key: "kosis-sido-birth-sex-ratio",
    scope: "domestic",
    title: "시도별 출생성비",
    provider: "KOSIS",
    topic: "인구·출산",
    space: "시도",
    coverage: "17개 시도·1990~2025",
    period: { min: "1990", max: "2025", label: "1990~2025" },
    capabilities: ["map", "chart", "table"],
    status: "ready",
    description: "1990년 이후 시도별 총출생성비를 공개 snapshot의 단계구분도·순위 그래프·자료표로 표시합니다. 승격 이전 시점의 결측은 비워 둡니다.",
    sourceUrl: "https://kosis.kr/",
    storage: "supabase",
    supportedLevels: ["sido"],
    kind: "polygon",
    snapshotId: null,
    indicators: [],
  },
  {
    key: "kosis-sido-business-count",
    scope: "domestic",
    title: "시도별 사업체수",
    provider: "KOSIS",
    topic: "산업·경제",
    space: "시도",
    coverage: "17개 시도·2020~2024",
    period: { min: "2020", max: "2024", label: "2020~2024" },
    capabilities: ["map", "chart", "table"],
    status: "ready",
    description: "2020년 이후 시도별 전산업 사업체수를 공개 snapshot의 단계구분도·순위 그래프·자료표로 표시합니다.",
    sourceUrl: "https://kosis.kr/",
    storage: "supabase",
    supportedLevels: ["sido"],
    kind: "polygon",
    snapshotId: null,
    indicators: [],
  },
  {
    key: "airkorea-station-daily",
    scope: "domestic",
    title: "시도별 실시간 대기질",
    provider: "에어코리아",
    topic: "환경·대기",
    space: "시도",
    coverage: "16개 시도·수집시각 기준",
    period: { min: "-", max: "-", label: "실시간 snapshot" },
    capabilities: ["map", "chart", "table"],
    status: "ready",
    description: "측정소 실시간값을 시도 평균한 미세먼지·초미세먼지를 단계구분도·순위 그래프·자료표로 표시합니다.",
    sourceUrl: "https://www.data.go.kr/data/15073861/openapi.do",
    storage: "supabase",
    supportedLevels: ["sido"],
    kind: "polygon",
    snapshotId: null,
    indicators: [],
  },
  {
    key: "world-bank-population-density",
    scope: "world",
    title: "국가별 인구밀도 장기 변화",
    provider: "World Bank",
    topic: "인구·도시화",
    space: "국가",
    coverage: "지표 snapshot 준비 중",
    period: { min: "-", max: "-", label: "연도 선택" },
    capabilities: ["map", "chart", "table"],
    status: "planned",
    description: "국가 코드와 지표 metadata를 고정한 뒤 세계 단계구분도·순위·시계열로 제공합니다.",
    sourceUrl: "https://data.worldbank.org/",
    storage: "planned",
    supportedLevels: [],
    kind: "polygon",
    snapshotId: null,
    indicators: [],
  },
  {
    key: "open-meteo-city-climate",
    scope: "world",
    title: "세계 주요 도시 기후 비교",
    provider: "Open-Meteo",
    topic: "기후·계절성",
    space: "도시 좌표",
    coverage: "도시 목록·자료 유형 확정 후 공개",
    period: { min: "-", max: "-", label: "기간 선택" },
    capabilities: ["map", "chart", "table"],
    status: "planned",
    description: "관측값·재분석값·모델값을 구분하여 도시별 기후 차이를 비교합니다.",
    sourceUrl: "https://open-meteo.com/",
    storage: "planned",
    supportedLevels: [],
    kind: "point",
    snapshotId: null,
    indicators: [],
  },
  {
    key: "usgs-earthquake-history",
    scope: "world",
    title: "세계 지진 분포와 규모",
    provider: "USGS",
    topic: "자연재해·판 구조",
    space: "지진 발생점",
    coverage: "교육용 기간·규모 조건 확정 후 공개",
    period: { min: "-", max: "-", label: "기간 선택" },
    capabilities: ["map", "chart", "table"],
    status: "planned",
    description: "지진 위치·규모·깊이·발생 시점을 점 자료와 시간축으로 탐구합니다.",
    sourceUrl: "https://earthquake.usgs.gov/fdsnws/event/1/",
    storage: "planned",
    supportedLevels: [],
    kind: "point",
    snapshotId: null,
    indicators: [],
  },
  {
    key: "tourapi-area-attractions",
    scope: "domestic",
    title: "지역별 관광지 분포",
    provider: "한국관광공사",
    topic: "관광·장소성",
    space: "관광지점",
    coverage: "17개 지역·6,677곳",
    period: { min: "-", max: "-", label: "수집시점 기준" },
    capabilities: ["map", "table"],
    status: "ready",
    description: "지역별 관광지를 점분포와 목록으로 표시합니다. 이미지는 URL만 보관하고 라이선스 유형을 함께 기록합니다.",
    sourceUrl: "https://www.data.go.kr/data/15101578/openapi.do",
    storage: "supabase",
    supportedLevels: ["sido"],
    kind: "point",
    snapshotId: null,
    indicators: [],
  },
];

export function getDatasets(scope: DatasetScope): DatasetDefinition[] {
  return DATASET_CATALOG.filter((dataset) => dataset.scope === scope);
}

export function getDataset(datasetKey: string): DatasetDefinition | null {
  return DATASET_CATALOG.find((dataset) => dataset.key === datasetKey) ?? null;
}

/** 이 데이터셋을 해당 경계 수준의 choropleth로 그릴 수 있는지 확인한다. */
export function supportsBoundaryLevel(dataset: DatasetDefinition, level: BoundaryLevel): boolean {
  return dataset.supportedLevels.includes(level);
}

/** 지표 선택지. DB에 없으면 단일 지표(기존 동작)로 폴백한다. */
export function getDatasetIndicators(dataset: DatasetDefinition): DatasetIndicator[] {
  if (dataset.indicators.length > 0) return dataset.indicators;
  return [{ key: "default", label: dataset.title, snapshotId: dataset.snapshotId, unit: "" }];
}

/**
 * Published DB catalog rows are optional. When Supabase is not configured,
 * the `dataset_catalog` table/migration is not yet applied, or the query
 * otherwise fails, callers fall back to the static curated list above.
 */
type BrowserSupabaseClient = NonNullable<typeof import("./supabase").supabase>;
let supabasePromise: Promise<BrowserSupabaseClient | null> | undefined;

async function getSupabaseClient(): Promise<BrowserSupabaseClient | null> {
  if (!hasSupabaseClientConfig) return null;
  supabasePromise ??= import("./supabase").then(({ supabase: client }) => client);
  return supabasePromise;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CATALOG_COLUMNS =
  "dataset_key,scope,title,provider,topic,space_label,coverage_label,period_min,period_max,period_label,capabilities,status,storage_mode,description,source_url,snapshot_id,metadata";

/**
 * The DB `status` column (draft/published/retired) is a publishing workflow
 * state, not the same thing as this app's ready/planned. A row can be
 * published (safe to list) while `storage_mode` is still "planned" (no real
 * data backing it yet), so both columns must agree before a dataset is
 * treated as "ready".
 */
export function mapDatasetCatalogRow(value: unknown): DatasetDefinition | null {
  if (!isRecord(value)) return null;
  const key = value.dataset_key;
  const scope = value.scope;
  if (typeof key !== "string" || !key.trim()) return null;
  if (scope !== "domestic" && scope !== "world") return null;

  const storage: DatasetDefinition["storage"] =
    value.storage_mode === "supabase" || value.storage_mode === "server-cache" ? value.storage_mode : "planned";
  const capabilities = (Array.isArray(value.capabilities) ? value.capabilities : []).filter(
    (item): item is DatasetCapability => item === "map" || item === "chart" || item === "table",
  );

  return {
    key,
    scope,
    title: typeof value.title === "string" ? value.title : "",
    provider: typeof value.provider === "string" ? value.provider : "",
    topic: typeof value.topic === "string" ? value.topic : "",
    space: typeof value.space_label === "string" ? value.space_label : "",
    coverage: typeof value.coverage_label === "string" ? value.coverage_label : "",
    period: {
      min: typeof value.period_min === "string" ? value.period_min : "-",
      max: typeof value.period_max === "string" ? value.period_max : "-",
      label: typeof value.period_label === "string" ? value.period_label : "",
    },
    capabilities,
    status: value.status === "published" && storage !== "planned" ? "ready" : "planned",
    description: typeof value.description === "string" ? value.description : "",
    sourceUrl: typeof value.source_url === "string" ? value.source_url : "",
    storage,
    // dataset_catalog 테이블에는 level 컬럼이 아직 없어 scope 기준으로 고정한다.
    // domestic published 행은 시도 단위까지만 보장되고, world 행은 국내 경계를 쓰지 않는다.
    supportedLevels: scope === "domestic" ? ["sido"] : [],
    kind: isRecord(value.metadata) && value.metadata["kind"] === "point" ? "point" : "polygon",
    snapshotId: typeof value.snapshot_id === "string" && value.snapshot_id.trim() ? value.snapshot_id : null,
    indicators: parseIndicatorList(isRecord(value.metadata) ? value.metadata["indicators"] : undefined),
  };
}

function parseIndicatorList(value: unknown): DatasetIndicator[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): DatasetIndicator[] => {
    if (!isRecord(entry)) return [];
    const { key, label, snapshotId, unit } = entry as Record<string, unknown>;
    if (typeof key !== "string" || !key.trim()) return [];
    if (typeof label !== "string" || !label.trim()) return [];
    return [{
      key,
      label,
      snapshotId: typeof snapshotId === "string" && snapshotId.trim() ? snapshotId : null,
      unit: typeof unit === "string" ? unit : "",
    }];
  });
}

export async function fetchPublishedDatasetCatalog(): Promise<{ data: DatasetDefinition[]; error: string | null }> {
  const supabase = await getSupabaseClient();
  if (!supabase) return { data: [], error: "SUPABASE_NOT_CONFIGURED" };

  const result = await supabase
    .from("dataset_catalog")
    .select(CATALOG_COLUMNS)
    .eq("status", "published")
    .order("scope")
    .order("title");
  if (result.error) return { data: [], error: result.error.message };

  const rows = Array.isArray(result.data) ? result.data : [];
  return {
    data: rows.map(mapDatasetCatalogRow).filter((row): row is DatasetDefinition => row !== null),
    error: null,
  };
}

/**
 * Static entries stay visible until a published DB row overrides the same
 * key. This lets datasets go live one at a time (KOSIS, World Bank, ...)
 * without the rest of the curated list disappearing.
 */
export function mergeDatasetCatalog(publishedRows: DatasetDefinition[]): DatasetDefinition[] {
  if (publishedRows.length === 0) return DATASET_CATALOG;
  const byKey = new Map(publishedRows.map((row) => [row.key, row]));
  const merged = DATASET_CATALOG.map((entry) => byKey.get(entry.key) ?? entry);
  const knownKeys = new Set(DATASET_CATALOG.map((entry) => entry.key));
  return [...merged, ...publishedRows.filter((row) => !knownKeys.has(row.key))];
}

let publishedCatalogPromise: Promise<{ data: DatasetDefinition[]; error: string | null }> | undefined;

function loadPublishedDatasetCatalogOnce() {
  publishedCatalogPromise ??= fetchPublishedDatasetCatalog();
  return publishedCatalogPromise;
}

export function useDatasetCatalog(scope: DatasetScope): DatasetDefinition[] {
  const [publishedRows, setPublishedRows] = useState<DatasetDefinition[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadPublishedDatasetCatalogOnce().then((result) => {
      if (cancelled || result.error || result.data.length === 0) return;
      setPublishedRows(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(
    () => mergeDatasetCatalog(publishedRows).filter((dataset) => dataset.scope === scope),
    [publishedRows, scope],
  );
}

