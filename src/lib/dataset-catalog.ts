import { useEffect, useMemo, useState } from "react";
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
  },
  {
    key: "kosis-sido-city-park-per-capita",
    scope: "domestic",
    title: "시도별 인구 천 명당 도시공원 조성면적",
    provider: "KOSIS",
    topic: "도시·환경",
    space: "시도",
    coverage: "코드·경계 기준 확인 중",
    period: { min: "2025", max: "2025", label: "2025" },
    capabilities: ["map", "chart", "table"],
    status: "planned",
    description: "KOSIS T10 후보는 확인했지만 통합지역 코드와 2025 SGIS 경계 기준을 확정한 뒤 공개합니다.",
    sourceUrl: "https://kosis.kr/",
    storage: "planned",
  },
  {
    key: "airkorea-station-daily",
    scope: "domestic",
    title: "지역별 대기질 관측",
    provider: "에어코리아",
    topic: "환경·대기",
    space: "측정소",
    coverage: "수집 주기 확정 후 공개",
    period: { min: "-", max: "-", label: "snapshot 기준" },
    capabilities: ["map", "chart", "table"],
    status: "planned",
    description: "측정소별 PM10·PM2.5·오존과 지역 차이를 snapshot으로 제공합니다.",
    sourceUrl: "https://www.data.go.kr/data/15073861/openapi.do",
    storage: "planned",
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
  },
];

export function getDatasets(scope: DatasetScope): DatasetDefinition[] {
  return DATASET_CATALOG.filter((dataset) => dataset.scope === scope);
}

export function getDataset(datasetKey: string): DatasetDefinition | null {
  return DATASET_CATALOG.find((dataset) => dataset.key === datasetKey) ?? null;
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
  "dataset_key,scope,title,provider,topic,space_label,coverage_label,period_min,period_max,period_label,capabilities,status,storage_mode,description,source_url";

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
  };
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

