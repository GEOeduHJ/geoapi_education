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
