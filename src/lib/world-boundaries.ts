import { feature } from "topojson-client";
import type { SgisBoundaryFeature, SgisBoundaryResponse } from "./sgis";

export const WORLD_BOUNDARY_URL = "/data/world-countries-50m.json";
export const WORLD_BOUNDARY_SOURCE = "Natural Earth 50m (world-atlas v2, public domain)";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toBoundaryFeature(value: unknown): SgisBoundaryFeature | null {
  if (!isRecord(value) || value.type !== "Feature") return null;
  const geometry = value.geometry;
  if (!isRecord(geometry) || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return null;
  if (!Array.isArray(geometry.coordinates)) return null;
  const properties = isRecord(value.properties) ? value.properties : {};
  const id = value.id;
  return {
    type: "Feature",
    geometry: { type: geometry.type, coordinates: geometry.coordinates },
    properties: {
      adm_cd: typeof id === "string" || typeof id === "number" ? String(id) : null,
      adm_nm: typeof properties.name === "string" ? properties.name : null,
      addr_en: typeof properties.name === "string" ? properties.name : null,
      x: null,
      y: null,
    },
  };
}

/** Vendored world-atlas TopoJSON을 SGIS 파이프라인과 같은 경계 응답 모양으로 변환한다. */
export function convertWorldTopoJson(topology: unknown): SgisBoundaryResponse | null {
  if (!isRecord(topology) || !isRecord(topology.objects)) return null;
  const countries = topology.objects["countries"];
  if (!isRecord(countries)) return null;
  let collection: unknown;
  try {
    collection = feature(topology as never, countries as never);
  } catch {
    return null;
  }
  if (!isRecord(collection) || !Array.isArray(collection.features)) return null;
  const features = collection.features
    .map(toBoundaryFeature)
    .filter((item): item is SgisBoundaryFeature => item !== null)
    .filter((item) => item.properties.adm_cd !== null && item.properties.adm_cd !== "undefined");
  return {
    query: { year: 0, admCd: "world", lowSearch: 0 },
    sourceCrs: "EPSG:4326",
    data: { type: "FeatureCollection", features },
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchWorldBoundaries(): Promise<{ data: SgisBoundaryResponse | null; error: string | null }> {
  try {
    const response = await fetch(WORLD_BOUNDARY_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) return { data: null, error: "WORLD_BOUNDARY_REQUEST_FAILED" };
    const data = convertWorldTopoJson(await response.json());
    if (!data) return { data: null, error: "WORLD_BOUNDARY_INVALID_RESPONSE" };
    return { data, error: null };
  } catch {
    return { data: null, error: "WORLD_BOUNDARY_REQUEST_FAILED" };
  }
}
