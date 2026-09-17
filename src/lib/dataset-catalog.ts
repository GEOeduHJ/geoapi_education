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

