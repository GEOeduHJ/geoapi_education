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

export interface ClimateSummary {
  stationId: string;
  stationName: string;
  metric: ClimateMetric;
  value: number;
  unit: string;
  observationCount: number;
  firstDate: string;
  lastDate: string;
}

export const DEFAULT_CLIMATE_STATION_IDS = ["101", "105", "108", "112", "133", "143", "146", "156", "159", "184"];

const STATION_COLUMNS = "station_id,name_ko,name_en,longitude,latitude,altitude_m,law_code,address";
const OBSERVATION_COLUMNS = "station_id,observation_date,ta_avg,ta_max,ta_min,rn_day,ws_avg,hm_avg,ss_day,si_day,snapshot_id,quality_flags";
const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;

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

export function summarizeClimate(
  stations: ClimateStation[],
  observations: ClimateDailyObservation[],
  metric: ClimateMetric,
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
    return [{
      stationId: station.station_id,
      stationName: station.name_ko,
      metric,
      value,
      unit: definition.unit,
      observationCount: group.values.length,
      firstDate: group.dates[0],
      lastDate: group.dates[group.dates.length - 1],
    }];
  });
}
