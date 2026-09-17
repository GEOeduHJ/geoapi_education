import { buildEsriCanvasTileUrl, buildVWorldLoaderUrl } from "./api/requests";
import { hasVWorldClientConfig, publicEnv, resolveVWorldDomain } from "./env";
import type { ClimateStation } from "./climate";
import type { BoundaryJoinValue } from "./geo-join";
import type { SgisBoundaryFeature, SgisBoundaryResponse } from "./sgis";

type Coordinate = [number, number];
type Extent = [number, number, number, number];

interface VWorldMapEvent {
  pixel: number[];
}

interface VWorldFeature {
  get(property: string): unknown;
  setStyle(style: unknown): void;
}

interface VWorldVectorSource {
  getExtent(): Extent;
}

interface VWorldLayer {
  set(property: string, value: unknown): void;
}

interface VWorldMapView {
  fit(extent: Extent, options?: { padding?: number[]; maxZoom?: number }): void;
}

interface VWorldMap {
  addLayer(layer: VWorldLayer): void;
  removeLayer(layer: VWorldLayer): void;
  getView(): VWorldMapView;
  forEachFeatureAtPixel(
    pixel: number[],
    callback: (feature: VWorldFeature) => VWorldFeature | false,
  ): VWorldFeature | false;
  getCoordinateFromPixel?(pixel: number[]): Coordinate | null;
  on(event: string, listener: (event: VWorldMapEvent) => void): void;
  setBasemapType?(basemapType: string): void;
  setTarget(target: string | HTMLElement | null): void;
  updateSize(): void;
  dispose?(): void;
}

interface OpenLayersNamespace {
  Feature: new (properties?: Record<string, unknown>) => VWorldFeature;
  geom: {
    Point: new (coordinates: Coordinate) => unknown;
    Polygon: new (coordinates: unknown) => unknown;
    MultiPolygon: new (coordinates: unknown) => unknown;
  };
  layer: {
    Vector: new (options: { source: VWorldVectorSource }) => VWorldLayer;
    Tile: new (options: { source: unknown }) => VWorldLayer;
  };
  source: {
    Vector: new (options: { features: VWorldFeature[] }) => VWorldVectorSource;
    XYZ: new (options: { url: string; crossOrigin?: string }) => VWorldVectorSource;
  };
  style: {
    Circle: new (options: { radius: number; fill: unknown; stroke: unknown }) => unknown;
    Fill: new (options: { color: string }) => unknown;
    Stroke: new (options: { color: string; width: number }) => unknown;
    Style: new (options: { image?: unknown; fill?: unknown; stroke?: unknown }) => unknown;
  };
  proj: {
    fromLonLat(coordinate: Coordinate, projection?: string): Coordinate;
  };
}

interface VWorldOl3Namespace {
  BasemapType: {
    GRAPHIC: string;
    GRAPHIC_WHITE?: string;
    GRAPHIC_NIGHT?: string;
    PHOTO?: string;
    PHOTO_HYBRID?: string;
    [key: string]: string | undefined;
  };
  DensityType: { BASIC: string };
  Map: new (container: string, options: Record<string, unknown>) => VWorldMap;
  CameraPosition: Record<string, unknown>;
}

interface VWorldNamespace {
  _vmap?: VWorldMap;
  ol3: VWorldOl3Namespace;
}

export interface VWorld2DRuntime {
  ol: OpenLayersNamespace;
  vw: VWorldNamespace;
}

/** Official VWorld 2D basemap choices exposed by the map runtime. */
export const VWORLD_BASEMAP_OPTIONS = [
  {
    key: "GRAPHIC_WHITE",
    label: "백지도",
    description: "색상과 도로 정보를 최소화해 주제 레이어를 읽기 쉬운 배경",
  },
  {
    key: "GRAPHIC",
    label: "기본도(도로)",
    description: "도로·지명 중심의 일반 참조 배경",
  },
  {
    key: "GRAPHIC_NIGHT",
    label: "야간지도",
    description: "어두운 배경에서 밝은 주제 레이어를 비교하는 배경",
  },
  {
    key: "PHOTO",
    label: "항공사진",
    description: "항공 영상 위에 관측소와 경계를 겹쳐 보는 배경",
  },
  {
    key: "PHOTO_HYBRID",
    label: "항공사진+표시",
    description: "항공 영상과 주요 지명·도로 표시를 함께 제공하는 배경",
  },
  {
    key: "ESRI_GRAY",
    label: "밝은 회색지도",
    description: "Esri 밝은 회색 캔버스(OSM 기반) · 주제 레이어용 최소 배경",
  },
] as const;

export type VWorldBasemapKey = typeof VWORLD_BASEMAP_OPTIONS[number]["key"];

export function getVWorldBasemapOption(key: VWorldBasemapKey) {
  return VWORLD_BASEMAP_OPTIONS.find((option) => option.key === key) ?? VWORLD_BASEMAP_OPTIONS[0];
}

export const ESRI_GRAY_BASEMAP_KEY = "ESRI_GRAY" as const;
/** Esri Light Gray Canvas attribution (required when these tiles are shown). */
export const ESRI_ATTRIBUTION = "Esri, HERE, Garmin, OpenStreetMap contributors";

declare global {
  interface Window {
    ol?: OpenLayersNamespace;
    vw?: VWorldNamespace;
  }
}

let runtimePromise: Promise<VWorld2DRuntime> | undefined;

/** Extracts the script URLs passed to document.write by the official loader. */
export function extractVWorldScriptUrls(markup: string): string[] {
  return [...markup.matchAll(/<script[^>]+src=['"]([^'"]+)['"][^>]*>/gi)].map((match) => match[1]);
}

function loadExternalScript(url: string): Promise<void> {
  const existing = [...document.scripts].some((script) => script.dataset.vworldSrc === url);
  if (existing) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = false;
    script.dataset.vworldSrc = url;
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("VWorld 2D 의존 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

function isRequired2DScript(url: string): boolean {
  return /jquery|OpenLayers|raphael|2DMapClassInit_v30/i.test(url) && !/sopMapInit|check2DNum/i.test(url);
}

async function loadOfficialVWorldScripts(): Promise<VWorld2DRuntime> {
  if (!hasVWorldClientConfig) throw new Error("VWORLD_NOT_CONFIGURED");
  if (window.vw?.ol3?.Map && window.ol) return { vw: window.vw, ol: window.ol };

  const loaderUrl = buildVWorldLoaderUrl(
    publicEnv.vworldApiKey,
    resolveVWorldDomain(window.location.hostname),
  );
  const scriptUrls: string[] = [];
  const originalWrite = document.write.bind(document);
  const originalWriteln = document.writeln.bind(document);
  const loader = document.createElement("script");
  loader.src = loaderUrl;
  loader.async = false;

  const captureMarkup = (markup: string) => {
    scriptUrls.push(...extractVWorldScriptUrls(markup));
  };

  document.write = captureMarkup;
  document.writeln = captureMarkup;
  try {
    await new Promise<void>((resolve, reject) => {
      loader.onload = () => resolve();
      loader.onerror = () => reject(new Error("VWorld 2D 로더를 불러오지 못했습니다."));
      document.head.appendChild(loader);
    });
  } finally {
    document.write = originalWrite;
    document.writeln = originalWriteln;
  }

  for (const url of [...new Set(scriptUrls.filter(isRequired2DScript))]) {
    await loadExternalScript(url);
  }

  if (!window.vw?.ol3?.Map || !window.ol) throw new Error("VWorld 2D 런타임이 초기화되지 않았습니다.");
  return { vw: window.vw, ol: window.ol };
}

export function loadVWorld2D(): Promise<VWorld2DRuntime> {
  runtimePromise ??= loadOfficialVWorldScripts().catch((error) => {
    runtimePromise = undefined;
    throw error;
  });
  return runtimePromise;
}

function isPosition(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && typeof value[1] === "number"
    && Number.isFinite(value[1]);
}

const GRS80_SEMI_MAJOR = 6378137;
const GRS80_FLATTENING = 1 / 298.257222101;
const GRS80_ECCENTRICITY_SQUARED = GRS80_FLATTENING * (2 - GRS80_FLATTENING);
const GRS80_SECOND_ECCENTRICITY_SQUARED = GRS80_ECCENTRICITY_SQUARED / (1 - GRS80_ECCENTRICITY_SQUARED);
const EPSG_5179_SCALE = 0.9996;
const EPSG_5179_CENTRAL_MERIDIAN = 127.5 * Math.PI / 180;
const EPSG_5179_ORIGIN_LATITUDE = 38 * Math.PI / 180;
const EPSG_5179_FALSE_EASTING = 1000000;
const EPSG_5179_FALSE_NORTHING = 2000000;

function meridianArc(latitude: number): number {
  const e2 = GRS80_ECCENTRICITY_SQUARED;
  return GRS80_SEMI_MAJOR * (
    (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * latitude
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * latitude)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * latitude)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * latitude)
  );
}

/** Converts SGIS UTM-K / EPSG:5179 coordinates to VWorld's Web Mercator. */
export function epsg5179ToWebMercator([easting, northing]: [number, number]): Coordinate {
  const e2 = GRS80_ECCENTRICITY_SQUARED;
  const ePrime2 = GRS80_SECOND_ECCENTRICITY_SQUARED;
  const m = (northing - EPSG_5179_FALSE_NORTHING) / EPSG_5179_SCALE
    + meridianArc(EPSG_5179_ORIGIN_LATITUDE);
  const mu = m / (GRS80_SEMI_MAJOR * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const footprintLatitude = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sinFootprint = Math.sin(footprintLatitude);
  const cosFootprint = Math.cos(footprintLatitude);
  const tanFootprint = Math.tan(footprintLatitude);
  const radiusPrimeVertical = GRS80_SEMI_MAJOR / Math.sqrt(1 - e2 * sinFootprint ** 2);
  const radiusMeridian = GRS80_SEMI_MAJOR * (1 - e2) / (1 - e2 * sinFootprint ** 2) ** 1.5;
  const c1 = ePrime2 * cosFootprint ** 2;
  const t1 = tanFootprint ** 2;
  const d = (easting - EPSG_5179_FALSE_EASTING) / (radiusPrimeVertical * EPSG_5179_SCALE);
  const latitude = footprintLatitude - (radiusPrimeVertical * tanFootprint / radiusMeridian) * (
    d ** 2 / 2
    - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ePrime2) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ePrime2 - 3 * c1 ** 2) * d ** 6 / 720
  );
  const longitude = EPSG_5179_CENTRAL_MERIDIAN + (
    d
    - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ePrime2 + 24 * t1 ** 2) * d ** 5 / 120
  ) / cosFootprint;
  const clampedLatitude = Math.max(-85.0511287798, Math.min(85.0511287798, latitude * 180 / Math.PI)) * Math.PI / 180;
  return [
    GRS80_SEMI_MAJOR * longitude,
    GRS80_SEMI_MAJOR * Math.log(Math.tan(Math.PI / 4 + clampedLatitude / 2)),
  ];
}

/** Transforms a GeoJSON coordinate tree while preserving Polygon nesting. */
export function transformNestedCoordinates(
  value: unknown,
  transform: (coordinate: [number, number]) => Coordinate,
): unknown {
  if (isPosition(value)) return transform([value[0], value[1]]);
  if (!Array.isArray(value)) return null;
  return value.map((child) => transformNestedCoordinates(child, transform));
}

function createBoundaryFeature(
  runtime: VWorld2DRuntime,
  boundary: SgisBoundaryFeature,
  style: unknown,
  toWebMercator: (coordinate: [number, number]) => Coordinate,
): VWorldFeature | null {
  const coordinates = transformNestedCoordinates(
    boundary.geometry.coordinates,
    toWebMercator,
  );
  if (!Array.isArray(coordinates)) return null;

  let geometry: unknown;
  try {
    geometry = boundary.geometry.type === "Polygon"
      ? new runtime.ol.geom.Polygon(coordinates)
      : new runtime.ol.geom.MultiPolygon(coordinates);
  } catch {
    return null;
  }

  const feature = new runtime.ol.Feature({
    geometry,
    boundaryCode: boundary.properties.adm_cd,
    boundaryName: boundary.properties.adm_nm,
  });
  feature.setStyle(style);
  return feature;
}

const boundaryLayerByMap = new WeakMap<VWorldMap, VWorldLayer>();
const stationLayerByMap = new WeakMap<VWorldMap, VWorldLayer>();
const esriLayerByMap = new WeakMap<VWorldMap, VWorldLayer[]>();
const poiLayerByMap = new WeakMap<VWorldMap, VWorldLayer>();
const CHOROPLETH_COLORS = [
  "rgba(229, 241, 236, 0.76)",
  "rgba(167, 218, 198, 0.78)",
  "rgba(91, 181, 157, 0.80)",
  "rgba(32, 133, 125, 0.82)",
  "rgba(15, 78, 78, 0.84)",
] as const;

/** Returns a five-step sequential color for a finite numeric value. */
export function getChoroplethColor(value: number, min: number, max: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return "rgba(15, 139, 141, 0.08)";
  }
  const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.5;
  return CHOROPLETH_COLORS[Math.round(ratio * (CHOROPLETH_COLORS.length - 1))];
}

/** Returns a darker point color for a finite station value. */
export function getStationThematicColor(value: number, min: number, max: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return "rgba(15, 139, 141, 0.95)";
  const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.5;
  const red = Math.round(15 + ratio * 20);
  const green = Math.round(139 - ratio * 70);
  const blue = Math.round(141 - ratio * 70);
  return `rgba(${red}, ${green}, ${blue}, 0.96)`;
}

function createBoundaryLayer(
  runtime: VWorld2DRuntime,
  boundaries: SgisBoundaryResponse,
  values: Record<string, BoundaryJoinValue> | null,
): VWorldLayer | null {
  const crs = boundaries.sourceCrs.toUpperCase();
  if (crs !== "EPSG:5179" && crs !== "EPSG:4326") return null;
  // SGIS는 UTM-K, 세계 경계는 WGS84 경위도로 온다. 렌더 전에 WebMercator로 통일한다.
  const toWebMercator: (coordinate: [number, number]) => Coordinate = crs === "EPSG:5179"
    ? epsg5179ToWebMercator
    : ([lon, lat]) => runtime.ol.proj.fromLonLat([lon, lat], "EPSG:900913");
  const isWorld = crs !== "EPSG:5179";
  const numericValues = Object.values(values ?? {})
    .map((entry) => entry.value)
    .filter((value) => Number.isFinite(value));
  const min = numericValues.length ? Math.min(...numericValues) : null;
  const max = numericValues.length ? Math.max(...numericValues) : null;
  const stylesByFill = new Map<string, unknown>();
  const getStyle = (fillColor: string) => {
    const cached = stylesByFill.get(fillColor);
    if (cached) return cached;
    const style = new runtime.ol.style.Style({
      fill: new runtime.ol.style.Fill({ color: fillColor }),
      stroke: new runtime.ol.style.Stroke({ color: "rgba(15, 91, 96, 0.8)", width: 1.5 }),
    });
    stylesByFill.set(fillColor, style);
    return style;
  };
  const boundaryFeatures = boundaries.data.features
    .map((boundary) => {
      const code = boundary.properties.adm_cd?.trim() ?? "";
      const value = values?.[code]?.value;
      const fillColor = min !== null && max !== null && typeof value === "number"
        ? getChoroplethColor(value, min, max)
        : "rgba(15, 139, 141, 0.08)";
      return createBoundaryFeature(runtime, boundary, getStyle(fillColor), toWebMercator);
    })
    .filter((feature): feature is VWorldFeature => feature !== null);
  if (!boundaryFeatures.length) return null;

  const boundarySource = new runtime.ol.source.Vector({ features: boundaryFeatures });
  const boundaryLayer = new runtime.ol.layer.Vector({ source: boundarySource });
  boundaryLayer.set("name", min !== null
    ? (isWorld ? "세계 국가 경계 · 단계구분도" : "SGIS 시도 행정구역 · KOSIS 단계구분도")
    : (isWorld ? "세계 국가 경계" : "SGIS 시도 행정구역 경계"));
  boundaryLayer.set("sourceCrs", boundaries.sourceCrs);
  boundaryLayer.set("joinStatus", min !== null ? "ready" : "reference");
  if (min !== null && max !== null) {
    boundaryLayer.set("valueMin", min);
    boundaryLayer.set("valueMax", max);
    boundaryLayer.set("valueCount", numericValues.length);
  }
  return boundaryLayer;
}

function resolveVWorldBasemapType(runtime: VWorld2DRuntime, key: VWorldBasemapKey): string {
  return runtime.vw.ol3.BasemapType[key] ?? runtime.vw.ol3.BasemapType.GRAPHIC;
}

function createStationLayer(
  runtime: VWorld2DRuntime,
  stations: ClimateStation[],
  stationValues: Record<string, number | null> | null,
): VWorldLayer | null {
  if (!stations.length) return null;
  const numericValues = stations
    .map((station) => stationValues?.[station.station_id])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const min = numericValues.length ? Math.min(...numericValues) : null;
  const max = numericValues.length ? Math.max(...numericValues) : null;
  const styles = new Map<string, unknown>();
  const getStyle = (station: ClimateStation) => {
    const value = stationValues?.[station.station_id];
    const fillColor = min !== null && max !== null && typeof value === "number"
      ? getStationThematicColor(value, min, max)
      : "rgba(15, 139, 141, 0.95)";
    const cacheKey = `${fillColor}:${typeof value === "number" ? Math.round(value) : "base"}`;
    const cached = styles.get(cacheKey);
    if (cached) return cached;
    const radius = min !== null && max !== null && typeof value === "number"
      ? 6 + Math.round(((value - min) / (max - min || 1)) * 4)
      : 6;
    const style = new runtime.ol.style.Style({
      image: new runtime.ol.style.Circle({
        radius,
        fill: new runtime.ol.style.Fill({ color: fillColor }),
        stroke: new runtime.ol.style.Stroke({ color: "#ffffff", width: 2 }),
      }),
    });
    styles.set(cacheKey, style);
    return style;
  };
  const features = stations.map((station) => {
    const feature = new runtime.ol.Feature({
      geometry: new runtime.ol.geom.Point(
        runtime.ol.proj.fromLonLat([station.longitude, station.latitude], "EPSG:900913"),
      ),
      stationId: station.station_id,
    });
    feature.setStyle(getStyle(station));
    return feature;
  });
  const source = new runtime.ol.source.Vector({ features });
  const stationLayer = new runtime.ol.layer.Vector({ source });
  stationLayer.set("name", min !== null ? "KMA ASOS 관측소 · 기후 지표" : "KMA ASOS 관측소");
  if (min !== null && max !== null) {
    stationLayer.set("valueMin", min);
    stationLayer.set("valueMax", max);
    stationLayer.set("valueCount", numericValues.length);
  }
  return stationLayer;
}

/** Replaces only the KMA station layer when the selected climate query changes. */
export function updateVWorld2DStationLayer(
  runtime: VWorld2DRuntime,
  map: VWorldMap,
  stations: ClimateStation[],
  stationValues: Record<string, number | null> | null = null,
): void {
  const previousLayer = stationLayerByMap.get(map);
  if (previousLayer) {
    map.removeLayer(previousLayer);
    stationLayerByMap.delete(map);
  }
  const stationLayer = createStationLayer(runtime, stations, stationValues);
  if (!stationLayer) return;
  map.addLayer(stationLayer);
  stationLayerByMap.set(map, stationLayer);
}

export interface PoiPointInput {
  id: string;
  lon: number;
  lat: number;
  title?: string;
  color?: string;
}

const DEFAULT_POI_FILL = "rgba(15, 139, 141, 0.9)";

function createPoiLayer(
  runtime: VWorld2DRuntime,
  points: PoiPointInput[],
): VWorldLayer | null {
  if (!points.length) return null;
  const stylesByFill = new Map<string, unknown>();
  const getStyle = (fillColor: string) => {
    const cached = stylesByFill.get(fillColor);
    if (cached) return cached;
    const style = new runtime.ol.style.Style({
      image: new runtime.ol.style.Circle({
        radius: 5,
        fill: new runtime.ol.style.Fill({ color: fillColor }),
        stroke: new runtime.ol.style.Stroke({ color: "#ffffff", width: 1.5 }),
      }),
    });
    stylesByFill.set(fillColor, style);
    return style;
  };
  const features = points.map((point) => {
    const feature = new runtime.ol.Feature({
      geometry: new runtime.ol.geom.Point(
        runtime.ol.proj.fromLonLat([point.lon, point.lat], "EPSG:900913"),
      ),
      poiId: point.id,
    });
    feature.setStyle(getStyle(point.color ?? DEFAULT_POI_FILL));
    return feature;
  });
  const source = new runtime.ol.source.Vector({ features });
  const poiLayer = new runtime.ol.layer.Vector({ source });
  poiLayer.set("name", "POI 점분포");
  poiLayer.set("valueCount", points.length);
  return poiLayer;
}

/** Adds or replaces the generic POI point layer (e.g. TourAPI attractions). */
export function updateVWorld2DPointLayer(
  runtime: VWorld2DRuntime,
  map: VWorldMap,
  points: PoiPointInput[] | null,
): void {
  const previousLayer = poiLayerByMap.get(map);
  if (previousLayer) {
    map.removeLayer(previousLayer);
    poiLayerByMap.delete(map);
  }
  if (!points || !points.length) return;
  const poiLayer = createPoiLayer(runtime, points);
  if (!poiLayer) return;
  map.addLayer(poiLayer);
  poiLayerByMap.set(map, poiLayer);
}

/** Changes only the VWorld background while preserving user-added vector layers. */
export function setVWorld2DBasemap(
  runtime: VWorld2DRuntime,
  map: VWorldMap,
  key: VWorldBasemapKey,
): boolean {
  const wantEsri = key === ESRI_GRAY_BASEMAP_KEY;
  if (typeof map.setBasemapType === "function") {
    try {
      map.setBasemapType(resolveVWorldBasemapType(runtime, wantEsri ? "GRAPHIC_WHITE" : key));
    } catch {
      if (!wantEsri) return false;
    }
  }
  return updateEsriGrayLayer(runtime, map, wantEsri);
}

/**
 * Adds or removes the Esri Light Gray Canvas raster tiles (base + reference).
 * Vector layers are temporarily lifted so the opaque tiles sit underneath.
 * XYZ raster layers predate modern OpenLayers vector tiles, so this works
 * with the VWorld-bundled runtime. Returns false when unavailable.
 */
export function updateEsriGrayLayer(
  runtime: VWorld2DRuntime,
  map: VWorldMap,
  enabled: boolean,
): boolean {
  const previousLayers = esriLayerByMap.get(map) ?? [];
  for (const layer of previousLayers) map.removeLayer(layer);
  esriLayerByMap.delete(map);
  if (!enabled) return true;
  if (typeof runtime.ol.layer.Tile !== "function"
    || typeof runtime.ol.source.XYZ !== "function") {
    return false;
  }

  try {
    const layers = (["base", "reference"] as const).map((kind) => {
      const source = new runtime.ol.source.XYZ({
        url: buildEsriCanvasTileUrl(kind),
        crossOrigin: "anonymous",
      });
      const layer = new runtime.ol.layer.Tile({ source });
      layer.set("name", `Esri 밝은 회색 캔버스 · ${kind}`);
      return layer;
    });

    const boundaryLayer = boundaryLayerByMap.get(map);
    const stationLayer = stationLayerByMap.get(map);
    const poiLayer = poiLayerByMap.get(map);
    if (boundaryLayer) map.removeLayer(boundaryLayer);
    if (stationLayer) map.removeLayer(stationLayer);
    if (poiLayer) map.removeLayer(poiLayer);
    for (const layer of layers) map.addLayer(layer);
    if (boundaryLayer) map.addLayer(boundaryLayer);
    if (stationLayer) map.addLayer(stationLayer);
    if (poiLayer) map.addLayer(poiLayer);
    esriLayerByMap.set(map, layers);
    return true;
  } catch {
    return false;
  }
}

/** Adds or replaces the SGIS reference/thematic layer without reinitializing VWorld. */
export function updateVWorld2DBoundaryLayer(
  runtime: VWorld2DRuntime,
  map: VWorldMap,
  boundaries: SgisBoundaryResponse | null,
  values: Record<string, BoundaryJoinValue> | null = null,
): void {
  const previousLayer = boundaryLayerByMap.get(map);
  if (previousLayer) {
    map.removeLayer(previousLayer);
    boundaryLayerByMap.delete(map);
  }
  if (!boundaries) return;

  const boundaryLayer = createBoundaryLayer(runtime, boundaries, values);
  if (!boundaryLayer) return;
  map.addLayer(boundaryLayer);
  boundaryLayerByMap.set(map, boundaryLayer);
}

/** Converts VWorld Web Mercator map coordinates back to WGS84 lon/lat. */
export function webMercatorToLonLat([x, y]: [number, number]): { lon: number; lat: number } {
  return {
    lon: (x / GRS80_SEMI_MAJOR) * 180 / Math.PI,
    lat: Math.atan(Math.sinh(y / GRS80_SEMI_MAJOR)) * 180 / Math.PI,
  };
}

export interface VWorld2DInitialView {
  center: [number, number];
  zoom: number;
}

export const WORLD_2D_INITIAL_VIEW: VWorld2DInitialView = { center: [15, 30], zoom: 2 };

export function createVWorld2DMap(
  runtime: VWorld2DRuntime,
  containerId: string,
  stations: ClimateStation[],
  onSelectStation: (stationId: string | null) => void,
  basemapType: VWorldBasemapKey = "GRAPHIC_WHITE",
  stationValues: Record<string, number | null> | null = null,
  onSelectPoi: (poiId: string | null) => void = () => undefined,
  onEmptyClick: (lon: number, lat: number) => void = () => undefined,
  initialView?: VWorld2DInitialView,
): VWorldMap {
  const center = runtime.ol.proj.fromLonLat(
    initialView ? [...initialView.center] as [number, number] : [127.5, 36.5],
    "EPSG:900913",
  );
  const position = { center, zoom: initialView?.zoom ?? 7, rotation: 0 };
  const map = new runtime.vw.ol3.Map(containerId, {
    basemapType: resolveVWorldBasemapType(runtime, basemapType),
    controlDensity: runtime.vw.ol3.DensityType.BASIC,
    interactionDensity: runtime.vw.ol3.DensityType.BASIC,
    controlsAutoArrange: true,
    homePosition: position,
    initPosition: position,
  });

  updateVWorld2DStationLayer(runtime, map, stations, stationValues);

  if (stations.length) {
    const stationLayer = stationLayerByMap.get(map);
    const source = stationLayer ? (stationLayer as unknown as { getSource?: () => VWorldVectorSource }).getSource?.() : null;
    if (source) map.getView().fit(source.getExtent(), { padding: [60, 60, 60, 60], maxZoom: 8 });
  }
  map.on("singleclick", (event) => {
    const feature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate);
    const poiId = feature === false ? null : feature?.get("poiId");
    if (typeof poiId === "string") {
      onSelectPoi(poiId);
      return;
    }
    const stationId = feature === false ? null : feature?.get("stationId");
    if (typeof stationId === "string") {
      onSelectStation(stationId);
      return;
    }
    onSelectStation(null);
    const coordinate = typeof map.getCoordinateFromPixel === "function"
      ? map.getCoordinateFromPixel(event.pixel)
      : null;
    if (coordinate) {
      const { lon, lat } = webMercatorToLonLat(coordinate);
      onEmptyClick(lon, lat);
    }
  });
  map.updateSize();
  runtime.vw._vmap = map;
  return map;
}

export function disposeVWorld2DMap(runtime: VWorld2DRuntime, map: VWorldMap): void {
  const poiLayer = poiLayerByMap.get(map);
  if (poiLayer) {
    map.removeLayer(poiLayer);
    poiLayerByMap.delete(map);
  }
  const esriLayers = esriLayerByMap.get(map) ?? [];
  for (const layer of esriLayers) map.removeLayer(layer);
  esriLayerByMap.delete(map);
  const boundaryLayer = boundaryLayerByMap.get(map);
  if (boundaryLayer) {
    map.removeLayer(boundaryLayer);
    boundaryLayerByMap.delete(map);
  }
  const stationLayer = stationLayerByMap.get(map);
  if (stationLayer) {
    map.removeLayer(stationLayer);
    stationLayerByMap.delete(map);
  }
  map.setTarget(null);
  map.dispose?.();
  if (runtime.vw._vmap === map) runtime.vw._vmap = undefined;
}
