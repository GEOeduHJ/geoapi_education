export type SgisBoundaryGeometryType = "Polygon" | "MultiPolygon";

export interface SgisBoundaryGeometry {
  type: SgisBoundaryGeometryType;
  coordinates: unknown;
}

export interface SgisBoundaryProperties {
  adm_cd: string | null;
  adm_nm: string | null;
  addr_en: string | null;
  x: string | null;
  y: string | null;
}

export interface SgisBoundaryFeature {
  type: "Feature";
  geometry: SgisBoundaryGeometry;
  properties: SgisBoundaryProperties;
}

export interface SgisBoundaryCollection {
  type: "FeatureCollection";
  features: SgisBoundaryFeature[];
}

export interface SgisBoundaryQuery {
  year?: number;
  admCd?: string;
  lowSearch?: 0 | 1 | 2;
}

/**
 * domestic 2D의 고정 경계 조회. 2026-09-17 결정: 값 원천이 시도 단위까지만
 * 검증됐으므로 기준연도 2025·전국 시도(`non` + `lowSearch: 1`)로 고정한다.
 * 시군구·읍면동 조회를 추가하려면 crosswalk·snapshot 검증이 선행되어야 하며,
 * 이 상수를 직접 바꾸는 대신 level별 builder를 새로 만든다.
 */
export const DOMESTIC_SIDO_BOUNDARY_QUERY: Required<SgisBoundaryQuery> = {
  year: 2025,
  admCd: "non",
  lowSearch: 1,
};

export function buildDomesticSidoBoundaryQuery(): SgisBoundaryQuery {
  return { ...DOMESTIC_SIDO_BOUNDARY_QUERY };
}

export interface SgisBoundaryResponse {
  query: { year: number; admCd: string; lowSearch: number };
  sourceCrs: string;
  data: SgisBoundaryCollection;
  fetchedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGeometry(value: unknown): value is SgisBoundaryGeometry {
  if (!isRecord(value) || (value.type !== "Polygon" && value.type !== "MultiPolygon")) return false;
  return "coordinates" in value;
}

function normalizeFeature(value: unknown): SgisBoundaryFeature | null {
  if (!isRecord(value) || value.type !== "Feature" || !isGeometry(value.geometry)) return null;
  const properties = isRecord(value.properties) ? value.properties : {};
  return {
    type: "Feature",
    geometry: value.geometry,
    properties: {
      adm_cd: typeof properties.adm_cd === "string" ? properties.adm_cd : null,
      adm_nm: typeof properties.adm_nm === "string" ? properties.adm_nm : null,
      addr_en: typeof properties.addr_en === "string" ? properties.addr_en : null,
      x: properties.x === null || properties.x === undefined ? null : String(properties.x),
      y: properties.y === null || properties.y === undefined ? null : String(properties.y),
    },
  };
}

function normalizeCollection(value: unknown): SgisBoundaryCollection | null {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) return null;
  return {
    type: "FeatureCollection",
    features: value.features.map(normalizeFeature).filter((feature): feature is SgisBoundaryFeature => feature !== null),
  };
}

export async function fetchSgisBoundaries(query: SgisBoundaryQuery = {}): Promise<{ data: SgisBoundaryResponse | null; error: string | null }> {
  const params = new URLSearchParams({
    year: String(query.year ?? 2025),
    admCd: query.admCd ?? "non",
    lowSearch: String(query.lowSearch ?? 1),
  });
  try {
    const response = await fetch(`/api/sgis-boundary?${params.toString()}`, { headers: { Accept: "application/json" } });
    const payload = await response.json() as { ok?: boolean; error?: string; query?: unknown; sourceCrs?: unknown; data?: unknown; fetchedAt?: unknown };
    if (!response.ok || !payload.ok) return { data: null, error: payload.error ?? "SGIS_BOUNDARY_REQUEST_FAILED" };
    const collection = normalizeCollection(payload.data);
    if (!collection || !isRecord(payload.query) || typeof payload.query.year !== "number" || typeof payload.query.admCd !== "string" || typeof payload.query.lowSearch !== "number" || typeof payload.sourceCrs !== "string" || typeof payload.fetchedAt !== "string") {
      return { data: null, error: "SGIS_BOUNDARY_INVALID_RESPONSE" };
    }
    return {
      data: {
        query: { year: payload.query.year, admCd: payload.query.admCd, lowSearch: payload.query.lowSearch },
        sourceCrs: payload.sourceCrs,
        data: collection,
        fetchedAt: payload.fetchedAt,
      },
      error: null,
    };
  } catch {
    return { data: null, error: "SGIS_BOUNDARY_REQUEST_FAILED" };
  }
}
