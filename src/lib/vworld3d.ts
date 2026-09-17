/**
 * VWorld WebGL 3D (Cesium 기반) 최소 어댑터.
 * 2D 번들과 분리되며, 로더 스크립트 실행 전까지 어떤 3D 코드도 로드되지 않는다.
 * 좌표는 WGS84 경위도를 쓰고, SGIS EPSG:5179는 기존 2D 헬퍼로 변환한다.
 */

import { buildVWorld3DLoaderUrl } from "./api/requests";
import { publicEnv, resolveVWorldDomain } from "./env";
import { epsg5179ToWebMercator, extractVWorldScriptUrls, webMercatorToLonLat } from "./vworld2d";

export interface PrismInput {
  code: string;
  name: string;
  /** EPSG:5179 좌표 트리 (Polygon nesting 유지). */
  rings: unknown;
  type: "Polygon" | "MultiPolygon";
  value: number;
}

export interface PrismHeight {
  min: number;
  max: number;
  maxHeightMeters: number;
}

interface CesiumNamespace {
  Cartesian3: {
    fromDegreesArray(coordinates: number[]): unknown;
    fromDegrees(lon: number, lat: number, height?: number): unknown;
    new (x: number, y: number, z: number): unknown;
  };
  Color: {
    fromCssColorString(css: string): { withAlpha(alpha: number): unknown };
  };
  Math: { toRadians(degrees: number): number };
}

interface Ws3dViewer {
  entities: {
    add(options: Record<string, unknown>): unknown;
    removeAll(): void;
  };
  camera: {
    flyTo(options: Record<string, unknown>): void;
  };
  scene: { globe?: unknown };
  resize?(): void;
}

interface VwMap3D {
  setOption?(options: Record<string, unknown>): void;
  setMapId?(id: string): void;
  setInitPosition?(position: unknown): void;
  setLogoVisible?(visible: boolean): void;
  setNavigationZoomVisible?(visible: boolean): void;
  start?(): void;
  destroy?(): void;
  /** 엔진 native 리사이즈. 너비·높이를 직접 넘겨야 컨테이너를 채운다. */
  updateSize?(width: number, height: number): void;
}

interface VwNamespace3D {
  Map: new () => VwMap3D;
  CameraPosition: new (coord: unknown, direction: unknown) => unknown;
  CoordZ: new (lon: number, lat: number, height: number) => unknown;
  Direction: new (heading: number, pitch: number, roll: number) => unknown;
}

declare global {
  interface Window {
    Cesium?: CesiumNamespace;
    ws3d?: { viewer?: Ws3dViewer };
    vw3dReady?: boolean;
  }
}

function getVw3D(): VwNamespace3D | null {
  const vw = (window as unknown as { vw?: VwNamespace3D }).vw;
  // 2D 로더와 같은 vw 네임스페이스를 공유하므로 3D 전용 생성자로 구분한다.
  // 인스턴스를 만들지 않고 존재 여부만 확인한다 (부작용 방지).
  if (!vw || typeof vw.Map !== "function") return null;
  const candidate = vw as unknown as Record<string, unknown>;
  if (typeof candidate["CameraPosition"] !== "function") return null;
  if (typeof candidate["CoordZ"] !== "function") return null;
  if (typeof candidate["Direction"] !== "function") return null;
  return vw;
}

/** 3D 엔진이 요구하는 jQuery (VWorld 2D와 동일한 배포본). */
const VWORLD_JQUERY_URL = "https://map.vworld.kr/jquery/ol3/jquery-1.11.3.min.js";

function loadExternalScript(url: string): Promise<void> {
  const existing = [...document.scripts].some((script) => script.dataset.vworld3dSrc === url);
  if (existing) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = false;
    script.dataset.vworld3dSrc = url;
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("VWorld 3D 의존 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

let loaderPromise: Promise<void> | undefined;

export function loadVWorld3D(): Promise<void> {
  loaderPromise ??= (async () => {    if (!publicEnv.vworldApiKey) throw new Error("VWORLD_NOT_CONFIGURED");
    if (getVw3D()) return;

    // 3D 로더는 document.write로 엔진 스크립트를 주입한다.
    // 페이지 로드 뒤에는 document.write가 차단되므로 2D와 같이 가로채서 직접 로드한다.
    const loaderUrl = buildVWorld3DLoaderUrl(
      publicEnv.vworldApiKey,
      resolveVWorldDomain(window.location.hostname),
    );
    const scriptUrls: string[] = [];
    const originalWrite = document.write.bind(document);
    const originalWriteln = document.writeln.bind(document);
    const captureMarkup = (markup: string) => {
      scriptUrls.push(...extractVWorldScriptUrls(markup));
    };
    const loader = document.createElement("script");
    loader.src = loaderUrl;
    loader.async = false;

    document.write = captureMarkup;
    document.writeln = captureMarkup;
    try {
      await new Promise<void>((resolve, reject) => {
        loader.onload = () => resolve();
        loader.onerror = () => reject(new Error("VWorld 3D 로더를 불러오지 못했습니다."));
        document.head.appendChild(loader);
      });
    } finally {
      document.write = originalWrite;
      document.writeln = originalWriteln;
    }

    // 엔진은 호스트 페이지의 jQuery($)를 전제로 하므로 엔진보다 먼저 올린다.
    await loadExternalScript(VWORLD_JQUERY_URL);
    for (const url of [...new Set(scriptUrls)]) {
      // 로더는 등록 도메인에 scheme이 없어 http URL을 만들지만,
      // https 페이지에서는 혼합 콘텐츠로 차단되므로 https로 올린다 (서버가 둘 다 지원).
      await loadExternalScript(url.replace(/^http:\/\//i, "https://"));
    }
    if (!getVw3D()) throw new Error("VWorld 3D 런타임이 초기화되지 않았습니다.");
  })().catch((error) => {
    loaderPromise = undefined;
    throw error;
  });
  return loaderPromise;
}

/** EPSG:5179 링 좌표를 WGS84 [lon, lat] 평탄 배열로 변환한다 (Cesium용). */
export function ringsToLonLatFlat(rings: unknown, type: "Polygon" | "MultiPolygon"): number[][] {
  const polygons: unknown[] = type === "Polygon" ? [rings] : Array.isArray(rings) ? rings : [];
  const result: number[][] = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon)) continue;
    for (const ring of polygon) {
      if (!Array.isArray(ring)) continue;
      const flat: number[] = [];
      for (const position of ring) {
        if (!Array.isArray(position) || typeof position[0] !== "number" || typeof position[1] !== "number") continue;
        const mercator = epsg5179ToWebMercator([position[0], position[1]]);
        const { lon, lat } = webMercatorToLonLat(mercator);
        flat.push(lon, lat);
      }
      if (flat.length >= 8) result.push(flat);
    }
  }
  return result;
}

/** 값을 0~maxHeightMeters 범위의 모식 높이로 정규화한다 (실제 지형 높이 아님). */
export function valueToPrismHeight(value: number, range: PrismHeight): number {
  if (!Number.isFinite(value)) return 0;
  const span = range.max - range.min;
  const ratio = span > 0 ? Math.max(0, Math.min(1, (value - range.min) / span)) : 0.5;
  return Math.round(ratio * range.maxHeightMeters);
}

/** 2D 단계구분도와 같은 5단계 팔레트의 RGB (Cesium material용). */
const PRISM_STOPS: Array<[number, number, number]> = [
  [229, 241, 236],
  [167, 218, 198],
  [91, 181, 157],
  [32, 133, 125],
  [15, 78, 78],
];

export function prismColor(value: number, min: number, max: number): { red: number; green: number; blue: number } {
  const ratio = max > min && Number.isFinite(value)
    ? Math.max(0, Math.min(1, (value - min) / (max - min)))
    : 0.5;
  const [red, green, blue] = PRISM_STOPS[Math.round(ratio * (PRISM_STOPS.length - 1))];
  return { red, green, blue };
}

export function getCesium(): CesiumNamespace | null {
  const cesium = window.Cesium;
  if (!cesium || typeof cesium.Cartesian3?.fromDegreesArray !== "function") return null;
  return cesium;
}

export function getViewer(): Ws3dViewer | null {
  const viewer = window.ws3d?.viewer;
  if (!viewer || typeof viewer.entities?.add !== "function") return null;
  return viewer;
}

export interface VWorld3DMap {
  viewer: Ws3dViewer;
  refreshSize(width: number, height: number): void;
  dispose(): void;
}

function waitForViewer(timeoutMs = 15_000): Promise<Ws3dViewer | null> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const poll = () => {
      const viewer = getViewer();
      if (viewer || Date.now() - startedAt > timeoutMs) {
        resolve(viewer);
        return;
      }
      window.setTimeout(poll, 500);
    };
    poll();
  });
}

export async function createVWorld3DMap(containerId: string): Promise<VWorld3DMap> {
  const namespace = getVw3D();
  const container = document.getElementById(containerId);
  if (!namespace || !container) throw new Error("3D 네임스페이스(vw.Map·CameraPosition 등)가 없습니다.");
  let map: VwMap3D;
  try {
    map = new namespace.Map();
  } catch {
    throw new Error("지도를 생성하지 못했습니다(new vw.Map).");
  }
  try {
    const initPosition = new namespace.CameraPosition(
      new namespace.CoordZ(127.9, 36.4, 1_500_000),
      new namespace.Direction(0, -50, 0),
    );
    map.setOption?.({
      mapId: containerId,
      initPosition,
      logo: false,
      navigation: false,
    });
    map.setMapId?.(containerId);
    // 문서 순서대로 초기 위치·표시를 setter로도 확정한다 (start() 선행 조건).
    map.setInitPosition?.(initPosition);
    map.setLogoVisible?.(false);
    map.setNavigationZoomVisible?.(false);
  } catch {
    throw new Error("초기 위치 설정에 실패했습니다.");
  }
  try {
    map.start?.();
  } catch (failure) {
    const reason = failure instanceof Error && failure.message ? `: ${failure.message}` : "";
    throw new Error(`지도 시작(start)에 실패했습니다${reason.slice(0, 200)}`);
  }
  // start() 뒤 viewer가 비동기로 붙으므로 폴링으로 기다린다.
  const viewer = await waitForViewer();
  if (!viewer) {
    if (typeof map.destroy === "function") {
      try {
        map.destroy();
      } catch {
        /* ignore */
      }
    }
    throw new Error("viewer가 준비되지 않았습니다(15초 초과).");
  }
    return {
      viewer,
      refreshSize(width: number, height: number) {
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
        try {
          map.updateSize?.(Math.round(width), Math.round(height));
        } catch {
          /* ignore */
        }
        try {
          viewer.resize?.();
        } catch {
          /* ignore */
        }
      },
      dispose() {
        try {
          viewer.entities.removeAll();
        } catch {
          /* ignore */
        }
        if (typeof map.destroy === "function") {
          try {
            map.destroy();
          } catch {
            /* ignore */
          }
        }
      },
    };
}

/** 시도 폴리곤을 값 비례 모식 기둥으로 쌓는다. 색상은 2D와 같은 5단계. */
export function addPrisms(
  map: VWorld3DMap,
  prisms: PrismInput[],
  range: PrismHeight,
  colorFor: (value: number, min: number, max: number) => { red: number; green: number; blue: number },
): number {
  const cesium = getCesium();
  if (!cesium) return 0;
  map.viewer.entities.removeAll();
  let added = 0;
  for (const prism of prisms) {
    if (!Number.isFinite(prism.value)) continue;
    const height = valueToPrismHeight(prism.value, range);
    const { red, green, blue } = colorFor(prism.value, range.min, range.max);
    const css = `rgb(${red}, ${green}, ${blue})`;
    for (const flat of ringsToLonLatFlat(prism.rings, prism.type)) {
      try {
        map.viewer.entities.add({
          name: `${prism.name} · ${prism.value}`,
          polygon: {
            hierarchy: cesium.Cartesian3.fromDegreesArray(flat),
            height: 0,
            extrudedHeight: Math.max(height, 2000),
            material: cesium.Color.fromCssColorString(css).withAlpha(0.75),
            outline: true,
            outlineColor: cesium.Color.fromCssColorString(css).withAlpha(0.95),
          },
        });
        added += 1;
      } catch {
        /* skip broken rings */
      }
    }
  }
  return added;
}

/** 지진 진앙 등 점 자료를 세로 막대로 세운다. 높이는 값 상대 비교용 모식도다. */
export interface PillarInput {
  id: string;
  lon: number;
  lat: number;
  value: number;
  label: string;
}

export function addPillars(
  map: VWorld3DMap,
  points: PillarInput[],
  range: PrismHeight,
  colorFor: (value: number, min: number, max: number) => string,
  widthMeters = 9000,
): number {
  const cesium = getCesium();
  if (!cesium) return 0;
  map.viewer.entities.removeAll();
  let added = 0;
  for (const point of points) {
    if (!Number.isFinite(point.value)) continue;
    const height = Math.max(valueToPrismHeight(point.value, range), 5000);
    const css = colorFor(point.value, range.min, range.max);
    try {
      map.viewer.entities.add({
        name: `${point.label} · ${point.value}`,
        position: cesium.Cartesian3.fromDegrees(point.lon, point.lat, height / 2),
        box: {
          dimensions: new cesium.Cartesian3(widthMeters, widthMeters, height),
          material: cesium.Color.fromCssColorString(css).withAlpha(0.85),
          outline: true,
          outlineColor: cesium.Color.fromCssColorString(css).withAlpha(0.95),
        },
      });
      added += 1;
    } catch {
      /* skip broken points */
    }
  }
  return added;
}

/** 카메라 프리셋: 조감도 ↔ 수직보기. */
export function flyToPreset(map: VWorld3DMap, preset: "overview" | "topdown"): boolean {
  const cesium = getCesium();
  if (!cesium || typeof map.viewer.camera?.flyTo !== "function") return false;
  const views = {
    overview: { lon: 127.9, lat: 34.8, height: 1_100_000, pitch: -45 },
    topdown: { lon: 127.9, lat: 36.3, height: 1_400_000, pitch: -90 },
  } as const;
  const view = views[preset];
  try {
    map.viewer.camera.flyTo({
      destination: cesium.Cartesian3.fromDegrees(view.lon, view.lat, view.height),
      orientation: {
        heading: cesium.Math.toRadians(0),
        pitch: cesium.Math.toRadians(view.pitch),
        roll: 0,
      },
    });
    return true;
  } catch {
    return false;
  }
}
