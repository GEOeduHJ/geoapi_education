/**
 * VWorld WebGL 3D (Cesium 기반) 최소 어댑터.
 * 2D 번들과 분리되며, 로더 스크립트 실행 전까지 어떤 3D 코드도 로드되지 않는다.
 * 좌표는 WGS84 경위도를 쓰고, SGIS EPSG:5179는 기존 2D 헬퍼로 변환한다.
 */

import { buildVWorld3DLoaderUrl } from "./api/requests";
import { publicEnv, resolveVWorldDomain } from "./env";
import { epsg5179ToWebMercator, webMercatorToLonLat } from "./vworld2d";

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
}

interface VwMap3D {
  setOption?(options: Record<string, unknown>): void;
  setMapId?(id: string): void;
  setInitPosition?(position: unknown): void;
  setLogoVisible?(visible: boolean): void;
  setNavigationZoomVisible?(visible: boolean): void;
  start?(): void;
  destroy?(): void;
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

function vw3d(): VwNamespace3D | null {
  const vw = (window as unknown as { vw?: VwNamespace3D }).vw;
  // 2D 로더와 같은 vw 네임스페이스를 공유하므로 3D 생성자가 있는지 확인한다.
  if (!vw || typeof vw.Map !== "function") return null;
  try {
    // 2D 지도가 쓰는 vw.Map(container, options)과 구분하기 위해 무인자 생성을 시도한다.
    // 실패하면 2D 전용 런타임으로 보고 null을 반환한다.
    const probe = new vw.Map();
    if (typeof probe.setOption !== "function" || typeof probe.start !== "function") return null;
    if (typeof probe.destroy === "function") probe.destroy();
    return vw;
  } catch {
    return null;
  }
}

let loaderPromise: Promise<void> | undefined;

function loadScript(url: string): Promise<void> {
  if ([...document.scripts].some((script) => script.dataset.vworld3dSrc === url)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = false;
    script.dataset.vworld3dSrc = url;
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("VWorld 3D 로더를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

export function loadVWorld3D(): Promise<void> {
  loaderPromise ??= (async () => {
    if (!publicEnv.vworldApiKey) throw new Error("VWORLD_NOT_CONFIGURED");
    await loadScript(buildVWorld3DLoaderUrl(publicEnv.vworldApiKey, resolveVWorldDomain(window.location.hostname)));
    if (!vw3d()) throw new Error("VWorld 3D 런타임이 초기화되지 않았습니다.");
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
  dispose(): void;
}

export function createVWorld3DMap(containerId: string): VWorld3DMap | null {
  const namespace = vw3d();
  const container = document.getElementById(containerId);
  if (!namespace || !container) return null;
  try {
    const map = new namespace.Map();
    map.setOption?.({
      mapId: containerId,
      initPosition: new namespace.CameraPosition(
        new namespace.CoordZ(127.9, 36.3, 1_100_000),
        new namespace.Direction(0, -45, 0),
      ),
      logo: true,
      navigation: true,
    });
    map.setMapId?.(containerId);
    map.start?.();
    const viewer = getViewer();
    if (!viewer) {
      if (typeof map.destroy === "function") map.destroy();
      return null;
    }
    return {
      viewer,
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
  } catch {
    return null;
  }
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
