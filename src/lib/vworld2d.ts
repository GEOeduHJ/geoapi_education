import { buildVWorldLoaderUrl } from "./api/requests";
import { hasVWorldClientConfig, publicEnv, resolveVWorldDomain } from "./env";
import type { ClimateStation } from "./climate";

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
  getView(): VWorldMapView;
  forEachFeatureAtPixel(
    pixel: number[],
    callback: (feature: VWorldFeature) => VWorldFeature | false,
  ): VWorldFeature | false;
  on(event: string, listener: (event: VWorldMapEvent) => void): void;
  setTarget(target: string | HTMLElement | null): void;
  updateSize(): void;
  dispose?(): void;
}

interface OpenLayersNamespace {
  Feature: new (properties?: Record<string, unknown>) => VWorldFeature;
  geom: {
    Point: new (coordinates: Coordinate) => unknown;
  };
  layer: {
    Vector: new (options: { source: VWorldVectorSource }) => VWorldLayer;
  };
  source: {
    Vector: new (options: { features: VWorldFeature[] }) => VWorldVectorSource;
  };
  style: {
    Circle: new (options: { radius: number; fill: unknown; stroke: unknown }) => unknown;
    Fill: new (options: { color: string }) => unknown;
    Stroke: new (options: { color: string; width: number }) => unknown;
    Style: new (options: { image: unknown }) => unknown;
  };
  proj: {
    fromLonLat(coordinate: Coordinate, projection?: string): Coordinate;
  };
}

interface VWorldOl3Namespace {
  BasemapType: { GRAPHIC: string };
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

export function createVWorld2DMap(
  runtime: VWorld2DRuntime,
  containerId: string,
  stations: ClimateStation[],
  onSelectStation: (stationId: string | null) => void,
): VWorldMap {
  const center = runtime.ol.proj.fromLonLat([127.5, 36.5], "EPSG:900913");
  const position = { center, zoom: 7, rotation: 0 };
  const map = new runtime.vw.ol3.Map(containerId, {
    basemapType: runtime.vw.ol3.BasemapType.GRAPHIC,
    controlDensity: runtime.vw.ol3.DensityType.BASIC,
    interactionDensity: runtime.vw.ol3.DensityType.BASIC,
    controlsAutoArrange: true,
    homePosition: position,
    initPosition: position,
  });

  const fill = new runtime.ol.style.Fill({ color: "rgba(15, 139, 141, 0.95)" });
  const stroke = new runtime.ol.style.Stroke({ color: "#ffffff", width: 2 });
  const markerStyle = new runtime.ol.style.Style({
    image: new runtime.ol.style.Circle({ radius: 6, fill, stroke }),
  });
  const features = stations.map((station) => {
    const feature = new runtime.ol.Feature({
      geometry: new runtime.ol.geom.Point(
        runtime.ol.proj.fromLonLat([station.longitude, station.latitude], "EPSG:900913"),
      ),
      stationId: station.station_id,
    });
    feature.setStyle(markerStyle);
    return feature;
  });
  const source = new runtime.ol.source.Vector({ features });
  const stationLayer = new runtime.ol.layer.Vector({ source });
  stationLayer.set("name", "KMA ASOS 관측소");
  map.addLayer(stationLayer);

  if (features.length) {
    map.getView().fit(source.getExtent(), { padding: [60, 60, 60, 60], maxZoom: 8 });
  }
  map.on("singleclick", (event) => {
    const feature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate);
    const stationId = feature === false ? null : feature?.get("stationId");
    onSelectStation(typeof stationId === "string" ? stationId : null);
  });
  map.updateSize();
  runtime.vw._vmap = map;
  return map;
}

export function disposeVWorld2DMap(runtime: VWorld2DRuntime, map: VWorldMap): void {
  map.setTarget(null);
  map.dispose?.();
  if (runtime.vw._vmap === map) runtime.vw._vmap = undefined;
}
