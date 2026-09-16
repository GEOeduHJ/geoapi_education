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
