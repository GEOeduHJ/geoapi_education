import { hasSupabaseClientConfig } from "./env";

export type ClimateMetric = "ta_avg" | "ta_max" | "ta_min" | "rn_day" | "ws_avg" | "hm_avg" | "ss_day" | "si_day";

export interface ClimateMetricDefinition {
  label: string;
  unit: string;
  description: string;
}

export const climateMetrics: Record<ClimateMetric, ClimateMetricDefinition> = {
  ta_avg: { label: "일 평균기온", unit: "°C", description: "하루 평균 기온의 기간 평균" },
  ta_max: { label: "일 최고기온", unit: "°C", description: "일 최고기온의 기간 평균" },
  ta_min: { label: "일 최저기온", unit: "°C", description: "일 최저기온의 기간 평균" },
  rn_day: { label: "일 강수량", unit: "mm", description: "일 강수량의 기간 평균" },
  ws_avg: { label: "일 평균풍속", unit: "m/s", description: "일 평균풍속의 기간 평균" },
  hm_avg: { label: "일 평균습도", unit: "%", description: "일 평균 상대습도의 기간 평균" },
  ss_day: { label: "일조시간", unit: "hr", description: "일조시간의 기간 평균" },
  si_day: { label: "일사량", unit: "MJ/m²", description: "일사합의 기간 평균" },
};

export interface ClimateStation {
  station_id: string;
  name_ko: string;
  name_en: string | null;
  longitude: number;
  latitude: number;
  altitude_m: number | null;
  law_code: string | null;
  address: string | null;
}

export interface ClimateDailyObservation {
  station_id: string;
  observation_date: string;
  ta_avg: number | null;
  ta_max: number | null;
  ta_min: number | null;
  rn_day: number | null;
  ws_avg: number | null;
  hm_avg: number | null;
  ss_day: number | null;
  si_day: number | null;
  snapshot_id: string;
  quality_flags: string[];
}

export interface ClimatePeriodSummary {
  station_id: string;
  period_type: "month";
  period_start: string;
  period_end: string;
  expected_observation_count: number;
  ta_avg: number | null;
  ta_avg_valid_count: number;
  ta_max: number | null;
  ta_max_valid_count: number;
  ta_min: number | null;
  ta_min_valid_count: number;
  rn_day: number | null;
  rn_day_valid_count: number;
  ws_avg: number | null;
  ws_avg_valid_count: number;
  hm_avg: number | null;
  hm_avg_valid_count: number;
  ss_day: number | null;
  ss_day_valid_count: number;
  si_day: number | null;
  si_day_valid_count: number;
}

export interface ClimateSummary {
  stationId: string;
  stationName: string;
  metric: ClimateMetric;
  value: number;
  unit: string;
  observationCount: number;
  expectedObservationCount: number;
  coverageRatio: number;
  firstDate: string;
  lastDate: string;
}

export const DEFAULT_CLIMATE_STATION_IDS = ["101", "105", "108", "112", "133", "143", "146", "156", "159", "184"];

// climate_stations.law_code(법정동코드, 10자리)의 앞 2자리 → SGIS adm_cd(들) 매핑.
// 두 코드 체계가 서로 다른 순번을 쓴다(예: 법정동코드는 부산=26, SGIS adm_cd는 부산=21).
// https://geoapieducation.vercel.app/api/sgis-boundary?year=2025&admCd=non&lowSearch=1 실측으로 검증함.
// 대부분 1:1이지만 "12"(전남광주통합특별시, 2026-07-01 출범)는 1:N이다 — SGIS가 아직
// 통합 후 경계 polygon을 발행하지 않아(/api/sgis-years의 tboudary_yr가 2025까지만 있음),
// 옛 광주(24)·옛 전남(36) 두 도형 모두에 같은 값을 칠해야 실제와 맞다.
export const LAW_CODE_PREFIX_TO_SGIS_ADM_CD: Record<string, string[]> = {
  "11": ["11"], // 서울특별시
  "12": ["24", "36"], // 전남광주통합특별시(2026 개편) → 옛 SGIS 경계인 광주(24)+전남(36) 둘 다
  "26": ["21"], // 부산광역시
  "27": ["22"], // 대구광역시
  "28": ["23"], // 인천광역시
  "29": ["24"], // 광주광역시(2026 개편 전 law_code)
  "30": ["25"], // 대전광역시
  "31": ["26"], // 울산광역시
  "36": ["29"], // 세종특별자치시
  "41": ["31"], // 경기도
  "42": ["32"], // 강원도(2023 개편 전 law_code)
  "51": ["32"], // 강원특별자치도(2023 개편 후 law_code)
  "43": ["33"], // 충청북도
  "44": ["34"], // 충청남도
  "45": ["35"], // 전라북도(2024 개편 전 law_code)
  "52": ["35"], // 전북특별자치도(2024 개편 후 law_code)
  "46": ["36"], // 전라남도(2026 개편 전 law_code)
  "47": ["37"], // 경상북도
  "48": ["38"], // 경상남도
  "50": ["39"], // 제주특별자치도
};

/** ClimateStation.law_code(법정동코드)를 SGIS adm_cd 목록으로 변환한다. 알 수 없는 접두사는 빈 배열. */
export function lawCodeToSgisAdmCds(lawCode: string | null): string[] {
  if (!lawCode) return [];
  return LAW_CODE_PREFIX_TO_SGIS_ADM_CD[lawCode.slice(0, 2)] ?? [];
}

const STATION_COLUMNS = "station_id,name_ko,name_en,longitude,latitude,altitude_m,law_code,address";
const OBSERVATION_COLUMNS = "station_id,observation_date,ta_avg,ta_max,ta_min,rn_day,ws_avg,hm_avg,ss_day,si_day,snapshot_id,quality_flags";
const PERIOD_COLUMNS = "station_id,period_type,period_start,period_end,expected_observation_count,ta_avg,ta_avg_valid_count,ta_max,ta_max_valid_count,ta_min,ta_min_valid_count,rn_day,rn_day_valid_count,ws_avg,ws_avg_valid_count,hm_avg,hm_avg_valid_count,ss_day,ss_day_valid_count,si_day,si_day_valid_count";
const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;
const MAX_PERIOD_ROWS = 10_000;

type BrowserSupabaseClient = NonNullable<typeof import("./supabase").supabase>;
let supabasePromise: Promise<BrowserSupabaseClient | null> | undefined;

async function getSupabaseClient(): Promise<BrowserSupabaseClient | null> {
  if (!hasSupabaseClientConfig) return null;
  supabasePromise ??= import("./supabase").then(({ supabase: client }) => client);
  return supabasePromise;
}

export async function fetchClimateStations(stationIds = DEFAULT_CLIMATE_STATION_IDS): Promise<{ data: ClimateStation[]; error: string | null }> {
  const supabase = await getSupabaseClient();
  if (!supabase) return { data: [], error: "SUPABASE_NOT_CONFIGURED" };
  if (stationIds.length === 0) return { data: [], error: null };

  const result = await supabase
    .from("climate_stations")
    .select(STATION_COLUMNS)
    .in("station_id", stationIds)
    .order("station_id");
  if (result.error) return { data: [], error: result.error.message };
  return { data: (result.data ?? []) as ClimateStation[], error: null };
}

export async function fetchClimatePeriodSummaries(
  stationIds: string[],
  from: string,
  to: string,
): Promise<{ data: ClimatePeriodSummary[]; error: string | null }> {
  const supabase = await getSupabaseClient();
  if (!supabase) return { data: [], error: "SUPABASE_NOT_CONFIGURED" };
  if (stationIds.length === 0) return { data: [], error: null };

  const summaries: ClimatePeriodSummary[] = [];
  for (let offset = 0; offset < MAX_PERIOD_ROWS; offset += PAGE_SIZE) {
    const result = await supabase
      .from("climate_period_summaries")
      .select(PERIOD_COLUMNS)
      .in("station_id", stationIds)
      .eq("period_type", "month")
      .gte("period_start", from)
      .lte("period_end", to)
      .order("period_start")
      .order("station_id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) return { data: [], error: result.error.message };
    const page = (result.data ?? []) as ClimatePeriodSummary[];
    summaries.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (summaries.length >= MAX_PERIOD_ROWS) return { data: summaries, error: "CLIMATE_PERIOD_RESULT_LIMIT" };
  return { data: summaries, error: null };
}

export async function fetchClimateObservations(
  stationIds: string[],
  from: string,
  to: string,
): Promise<{ data: ClimateDailyObservation[]; error: string | null }> {
  const supabase = await getSupabaseClient();
  if (!supabase) return { data: [], error: "SUPABASE_NOT_CONFIGURED" };
  if (stationIds.length === 0) return { data: [], error: null };

  const observations: ClimateDailyObservation[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const result = await supabase
      .from("climate_daily_observations")
      .select(OBSERVATION_COLUMNS)
      .in("station_id", stationIds)
      .gte("observation_date", from)
      .lte("observation_date", to)
      .order("observation_date")
      .order("station_id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) return { data: [], error: result.error.message };
    const page = (result.data ?? []) as ClimateDailyObservation[];
    observations.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (observations.length >= MAX_ROWS) return { data: observations, error: "CLIMATE_RESULT_LIMIT" };
  return { data: observations, error: null };
}

export function countInclusiveDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function summarizeClimate(
  stations: ClimateStation[],
  observations: ClimateDailyObservation[],
  metric: ClimateMetric,
  expectedObservationCount?: number,
): ClimateSummary[] {
  const grouped = new Map<string, { values: number[]; dates: string[] }>();
  for (const observation of observations) {
    const value = observation[metric];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const current = grouped.get(observation.station_id) ?? { values: [], dates: [] };
    current.values.push(value);
    current.dates.push(observation.observation_date);
    grouped.set(observation.station_id, current);
  }

  const definition = climateMetrics[metric];
  return stations.flatMap((station) => {
    const group = grouped.get(station.station_id);
    if (!group || group.values.length === 0) return [];
    const value = group.values.reduce((sum, item) => sum + item, 0) / group.values.length;
    const firstDate = group.dates.reduce((first, date) => (date < first ? date : first), group.dates[0]);
    const lastDate = group.dates.reduce((last, date) => (date > last ? date : last), group.dates[0]);
    const expected = expectedObservationCount ?? countInclusiveDays(firstDate, lastDate);
    return [{
      stationId: station.station_id,
      stationName: station.name_ko,
      metric,
      value,
      unit: definition.unit,
      observationCount: group.values.length,
      expectedObservationCount: expected,
      coverageRatio: expected > 0 ? Math.min(1, group.values.length / expected) : 0,
      firstDate,
      lastDate,
    }];
  });
}

export function summarizeClimatePeriods(
  stations: ClimateStation[],
  periods: ClimatePeriodSummary[],
  metric: ClimateMetric,
): ClimateSummary[] {
  const grouped = new Map<string, { weightedSum: number; validCount: number; expectedCount: number; firstDate: string; lastDate: string }>();
  for (const period of periods) {
    const current = grouped.get(period.station_id) ?? {
      weightedSum: 0,
      validCount: 0,
      expectedCount: 0,
      firstDate: period.period_start,
      lastDate: period.period_end,
    };
    current.expectedCount += Number.isFinite(period.expected_observation_count) ? period.expected_observation_count : 0;
    if (period.period_start < current.firstDate) current.firstDate = period.period_start;
    if (period.period_end > current.lastDate) current.lastDate = period.period_end;

    const value = period[metric];
    const countField = `${metric}_valid_count` as keyof ClimatePeriodSummary;
    const validCount = period[countField];
    if (typeof value === "number" && Number.isFinite(value) && typeof validCount === "number" && validCount > 0) {
      current.weightedSum += value * validCount;
      current.validCount += validCount;
    }
    grouped.set(period.station_id, current);
  }

  const definition = climateMetrics[metric];
  return stations.flatMap((station) => {
    const group = grouped.get(station.station_id);
    if (!group || group.validCount === 0) return [];
    return [{
      stationId: station.station_id,
      stationName: station.name_ko,
      metric,
      value: group.weightedSum / group.validCount,
      unit: definition.unit,
      observationCount: group.validCount,
      expectedObservationCount: group.expectedCount,
      coverageRatio: group.expectedCount > 0 ? Math.min(1, group.validCount / group.expectedCount) : 0,
      firstDate: group.firstDate,
      lastDate: group.lastDate,
    }];
  });
}
