import { hasSupabaseClientConfig } from "./env";

export const KOSIS_SNAPSHOT_SCHEMA = "kosis-statistics-v1";
export const MAX_PUBLIC_KOSIS_OBSERVATIONS = 2_000;

export interface PublicSourceSnapshot {
  id: string;
  data_source_id: string;
  fetched_at: string;
  valid_from: string | null;
  valid_to: string | null;
  request_fingerprint: string;
  schema_version: string;
  row_count: number | null;
  checksum: string | null;
  is_public: boolean;
}

export interface PublicGeoObservation {
  id: string;
  snapshot_id: string;
  observed_at: string | null;
  region_code: string | null;
  label: string | null;
  value: number | null;
  unit: string | null;
  category: string | null;
  attributes: Record<string, unknown>;
}

export interface PublicKosisDataset {
  snapshot: PublicSourceSnapshot | null;
  observations: PublicGeoObservation[];
  truncated: boolean;
  error: string | null;
}

const SNAPSHOT_COLUMNS = "id,data_source_id,fetched_at,valid_from,valid_to,request_fingerprint,schema_version,row_count,checksum,is_public";
const OBSERVATION_COLUMNS = "id,snapshot_id,observed_at,region_code,label,value,unit,category,attributes";

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

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function attributes(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function normalizePublicSnapshot(value: unknown): PublicSourceSnapshot | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.data_source_id !== "string") return null;
  return {
    id: value.id,
    data_source_id: value.data_source_id,
    fetched_at: String(value.fetched_at ?? ""),
    valid_from: nullableString(value.valid_from),
    valid_to: nullableString(value.valid_to),
    request_fingerprint: String(value.request_fingerprint ?? ""),
    schema_version: String(value.schema_version ?? ""),
    row_count: nullableNumber(value.row_count),
    checksum: nullableString(value.checksum),
    is_public: value.is_public === true,
  };
}

export function normalizePublicObservation(value: unknown): PublicGeoObservation | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.snapshot_id !== "string") return null;
  return {
    id: value.id,
    snapshot_id: value.snapshot_id,
    observed_at: nullableString(value.observed_at),
    region_code: nullableString(value.region_code),
    label: nullableString(value.label),
    value: nullableNumber(value.value),
    unit: nullableString(value.unit),
    category: nullableString(value.category),
    attributes: attributes(value.attributes),
  };
}

export async function fetchLatestPublicKosisSnapshot(): Promise<{ data: PublicSourceSnapshot | null; error: string | null }> {
  const supabase = await getSupabaseClient();
  if (!supabase) return { data: null, error: "SUPABASE_NOT_CONFIGURED" };

  const result = await supabase
    .from("source_snapshots")
    .select(SNAPSHOT_COLUMNS)
    .eq("schema_version", KOSIS_SNAPSHOT_SCHEMA)
    .eq("is_public", true)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) return { data: null, error: result.error.message };
  const data = normalizePublicSnapshot(result.data);
  return {
    data,
    error: result.data && !data ? "PUBLIC_KOSIS_SNAPSHOT_INVALID" : null,
  };
}

/** Phase A 다중화: 카탈로그 행이 가리키는 특정 공개 snapshot을 읽는다. */
export async function fetchPublicKosisSnapshotById(
  snapshotId: string,
): Promise<{ data: PublicSourceSnapshot | null; error: string | null }> {
  const supabase = await getSupabaseClient();
  if (!supabase) return { data: null, error: "SUPABASE_NOT_CONFIGURED" };
  if (!snapshotId.trim()) return { data: null, error: "PUBLIC_KOSIS_SNAPSHOT_ID_REQUIRED" };

  const result = await supabase
    .from("source_snapshots")
    .select(SNAPSHOT_COLUMNS)
    .eq("id", snapshotId.trim())
    .eq("schema_version", KOSIS_SNAPSHOT_SCHEMA)
    .eq("is_public", true)
    .maybeSingle();
  if (result.error) return { data: null, error: result.error.message };
  const data = normalizePublicSnapshot(result.data);
  return {
    data,
    error: result.data && !data ? "PUBLIC_KOSIS_SNAPSHOT_INVALID" : null,
  };
}

/** Phase A 다중화: 공개 KOSIS snapshot 목록 (최신순). 카탈로그·연도 선택의 재료다. */
export async function fetchAllPublicKosisSnapshots(): Promise<{ data: PublicSourceSnapshot[]; error: string | null }> {
  const supabase = await getSupabaseClient();
  if (!supabase) return { data: [], error: "SUPABASE_NOT_CONFIGURED" };

  const result = await supabase
    .from("source_snapshots")
    .select(SNAPSHOT_COLUMNS)
    .eq("schema_version", KOSIS_SNAPSHOT_SCHEMA)
    .eq("is_public", true)
    .order("fetched_at", { ascending: false });
  if (result.error) return { data: [], error: result.error.message };
  const rows = Array.isArray(result.data) ? result.data : [];
  return {
    data: rows.map(normalizePublicSnapshot).filter((row): row is PublicSourceSnapshot => row !== null),
    error: null,
  };
}

export async function fetchPublicKosisObservations(
  snapshotId: string,
): Promise<{ data: PublicGeoObservation[]; truncated: boolean; error: string | null }> {
  const supabase = await getSupabaseClient();
  if (!supabase) return { data: [], truncated: false, error: "SUPABASE_NOT_CONFIGURED" };
  if (!snapshotId.trim()) return { data: [], truncated: false, error: "PUBLIC_KOSIS_SNAPSHOT_ID_REQUIRED" };

  const result = await supabase
    .from("geo_observations")
    .select(OBSERVATION_COLUMNS)
    .eq("snapshot_id", snapshotId)
    .order("observed_at", { ascending: true })
    .order("region_code", { ascending: true })
    .range(0, MAX_PUBLIC_KOSIS_OBSERVATIONS - 1);
  if (result.error) return { data: [], truncated: false, error: result.error.message };

  const rows = Array.isArray(result.data) ? result.data : [];
  return {
    data: rows.map(normalizePublicObservation).filter((row): row is PublicGeoObservation => row !== null),
    truncated: rows.length >= MAX_PUBLIC_KOSIS_OBSERVATIONS,
    error: null,
  };
}

export async function fetchLatestPublicKosisDataset(): Promise<PublicKosisDataset> {
  const snapshotResult = await fetchLatestPublicKosisSnapshot();
  if (snapshotResult.error || !snapshotResult.data) {
    return { snapshot: snapshotResult.data, observations: [], truncated: false, error: snapshotResult.error };
  }

  const observationResult = await fetchPublicKosisObservations(snapshotResult.data.id);
  return {
    snapshot: snapshotResult.data,
    observations: observationResult.data,
    truncated: observationResult.truncated,
    error: observationResult.error,
  };
}

/** Phase A 다중화: 특정 공개 snapshot의 dataset을 읽는다. */
export async function fetchPublicKosisDataset(snapshotId: string): Promise<PublicKosisDataset> {
  const snapshotResult = await fetchPublicKosisSnapshotById(snapshotId);
  if (snapshotResult.error || !snapshotResult.data) {
    return { snapshot: snapshotResult.data, observations: [], truncated: false, error: snapshotResult.error };
  }

  const observationResult = await fetchPublicKosisObservations(snapshotResult.data.id);
  return {
    snapshot: snapshotResult.data,
    observations: observationResult.data,
    truncated: observationResult.truncated,
    error: observationResult.error,
  };
}

/** 관측값에 들어있는 연도(observed_at 앞 4자리) 목록. 내림차순. */
export function listObservationYears(observations: PublicGeoObservation[]): string[] {
  const years = new Set<string>();
  for (const observation of observations) {
    const stamped = observation.observed_at?.slice(0, 4) ?? "";
    if (/^\d{4}$/.test(stamped)) years.add(stamped);
  }
  return [...years].sort().reverse();
}

/**
 * 연도 선택용 필터. 조인 전에 단일 시점으로 좁혀 `ambiguous-values`를
 * 원천 차단한다. 시점이 없는 행은 어떤 연도에도 포함하지 않는다.
 */
export function filterObservationsByYear(
  observations: PublicGeoObservation[],
  year: string,
): PublicGeoObservation[] {
  if (!/^\d{4}$/.test(year)) return [];
  return observations.filter((observation) => observation.observed_at?.slice(0, 4) === year);
}

/**
 * 연도 필터 뒤에 남은 복수 시점 행(월별 등)을 지역별 연평균 하나로 합친다.
 * 이미 지역당 1행이면 입력을 그대로 반환해 연간 표의 동작을 바꾸지 않는다.
 * 합산 결과의 observed_at은 해당 연도 1월 1일로 정규화한다.
 */
export function aggregateObservationsByRegion(
  observations: PublicGeoObservation[],
): PublicGeoObservation[] {
  const groups = new Map<string, PublicGeoObservation[]>();
  for (const observation of observations) {
    const code = observation.region_code?.trim() || "(코드 없음)";
    const rows = groups.get(code) ?? [];
    rows.push(observation);
    groups.set(code, rows);
  }

  let needsAggregation = false;
  for (const rows of groups.values()) {
    if (rows.length > 1) {
      needsAggregation = true;
      break;
    }
  }
  if (!needsAggregation) return observations;

  const aggregated: PublicGeoObservation[] = [];
  for (const rows of groups.values()) {
    const first = rows[0];
    const numeric = rows.filter(
      (row) => typeof row.value === "number" && Number.isFinite(row.value),
    );
    if (numeric.length === 0) continue;
    const mean = numeric.reduce((total, row) => total + (row.value as number), 0) / numeric.length;
    const year = (first.observed_at ?? "").slice(0, 4);
    aggregated.push({
      ...first,
      id: `${first.id}#year-avg`,
      observed_at: /^\d{4}$/.test(year) ? `${year}-01-01` : first.observed_at,
      value: mean,
      attributes: { ...first.attributes, aggregated: "year-mean", source_count: numeric.length },
    });
  }
  return aggregated;
}
