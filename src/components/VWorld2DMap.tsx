import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CLIMATE_STATION_IDS,
  fetchClimateStations,
  type ClimateStation,
} from "../lib/climate";
import { hasVWorldClientConfig, resolveVWorldDomain } from "../lib/env";
import {
  createVWorld2DMap,
  disposeVWorld2DMap,
  ESRI_ATTRIBUTION,
  ESRI_GRAY_BASEMAP_KEY,
  getVWorldBasemapOption,
  loadVWorld2D,
  setVWorld2DBasemap,
  updateEsriGrayLayer,
  updateVWorld2DBoundaryLayer,
  updateVWorld2DPointLayer,
  updateVWorld2DStationLayer,
  VWORLD_BASEMAP_OPTIONS,
  WORLD_2D_INITIAL_VIEW,
  type PoiPointInput,
  type VWorldBasemapKey,
  type VWorld2DRuntime,
} from "../lib/vworld2d";
import type { BoundaryJoinValue } from "../lib/geo-join";
import type { SgisBoundaryResponse } from "../lib/sgis";

type MapStatus = "idle" | "loading" | "ready" | "error";

type MapFrameSize = "standard" | "large" | "xlarge";

const MAP_FRAME_SIZES: Array<{ key: MapFrameSize; label: string; minHeight: number }> = [
  { key: "standard", label: "기본", minHeight: 432 },
  { key: "large", label: "크게", minHeight: 600 },
  { key: "xlarge", label: "더 크게", minHeight: 780 },
];

const TILE_LAYER_ERROR_MESSAGE = "밝은 회색지도를 표시하지 못했습니다. VWorld 배경으로 되돌려 사용하세요.";

export function VWorld2DMap({
  boundaries = null,
  boundaryValues = null,
  boundaryValueLabel = "경계값",
  stationValues = null,
  visibleStationIds = null,
  showStations = true,
  poiPoints = null,
  onSelectPoi = null,
  selectedPoi = null,
  poiLegend = null,
  forecastMode = false,
  onForecastClick = null,
  worldView = false,
  boundaryScopeLabel = "SGIS 시도 경계",
  boundaryCaptionTag = "SGIS BOUNDARY",
}: {
  boundaries?: SgisBoundaryResponse | null;
  boundaryValues?: Record<string, BoundaryJoinValue> | null;
  boundaryValueLabel?: string;
  stationValues?: Record<string, number | null> | null;
  visibleStationIds?: string[] | null;
  showStations?: boolean;
  poiPoints?: PoiPointInput[] | null;
  onSelectPoi?: ((poiId: string | null) => void) | null;
  selectedPoi?: { title: string; address: string } | null;
  poiLegend?: Array<{ color: string; label: string }> | null;
  forecastMode?: boolean;
  onForecastClick?: ((lon: number, lat: number) => void) | null;
  worldView?: boolean;
  boundaryScopeLabel?: string;
  boundaryCaptionTag?: string;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ runtime: VWorld2DRuntime; map: ReturnType<typeof createVWorld2DMap> } | null>(null);
  const rawId = useId();
  const mapId = `vworld-map-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const boundariesRef = useRef(boundaries);
  const boundaryValuesRef = useRef(boundaryValues);
  const stationValuesRef = useRef(stationValues);
  const poiPointsRef = useRef(poiPoints);
  const onSelectPoiRef = useRef(onSelectPoi);
  const worldViewRef = useRef(worldView);
  const forecastModeRef = useRef(forecastMode);
  const onForecastClickRef = useRef(onForecastClick);
  const [stations, setStations] = useState<ClimateStation[]>([]);
  const [stationStatus, setStationStatus] = useState<"loading" | "ready">("loading");
  const [stationError, setStationError] = useState<string | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>("idle");
  const [mapError, setMapError] = useState<string | null>(null);
  const [tileLayerError, setTileLayerError] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [basemapType, setBasemapType] = useState<VWorldBasemapKey>("GRAPHIC_WHITE");
  const [mapFrameSize, setMapFrameSize] = useState<MapFrameSize>("standard");
  const basemapTypeRef = useRef<VWorldBasemapKey>("GRAPHIC_WHITE");

  const displayStations = useMemo(
    () => visibleStationIds ? stations.filter((station) => visibleStationIds.includes(station.station_id)) : stations,
    [stations, visibleStationIds],
  );

  useEffect(() => {
    if (!showStations) {
      setStations([]);
      setStationError(null);
      setStationStatus("ready");
      return () => undefined;
    }
    let cancelled = false;
    fetchClimateStations(DEFAULT_CLIMATE_STATION_IDS).then((result) => {
      if (cancelled) return;
      setStations(result.data);
      setStationError(result.error);
      setStationStatus("ready");
    }).catch(() => {
      if (cancelled) return;
      setStationStatus("ready");
      setStationError("KMA 관측소 정보를 읽지 못했습니다.");
    });
    return () => { cancelled = true; };
  }, [showStations]);

  useEffect(() => {
    boundariesRef.current = boundaries;
    boundaryValuesRef.current = boundaryValues;
    stationValuesRef.current = stationValues;
    poiPointsRef.current = poiPoints;
    onSelectPoiRef.current = onSelectPoi;
    forecastModeRef.current = forecastMode;
    onForecastClickRef.current = onForecastClick;
    const currentMap = mapRef.current;
    if (currentMap) {
      updateVWorld2DBoundaryLayer(currentMap.runtime, currentMap.map, boundaries, boundaryValues);
      updateVWorld2DStationLayer(currentMap.runtime, currentMap.map, displayStations, stationValues);
      updateVWorld2DPointLayer(currentMap.runtime, currentMap.map, poiPoints);
    }
  }, [boundaries, boundaryValues, displayStations, stationValues, poiPoints, onSelectPoi]);

  useEffect(() => {
    if (stationStatus !== "ready" || !mapElementRef.current) return;
    let cancelled = false;
    setMapStatus("loading");
    setMapError(null);

    loadVWorld2D().then((runtime) => {
      if (cancelled || !mapElementRef.current) return;
      const map = createVWorld2DMap(
        runtime,
        mapId,
        displayStations,
        setSelectedStationId,
        basemapTypeRef.current,
        stationValuesRef.current,
        (poiId) => onSelectPoiRef.current?.(poiId),
        (lon, lat) => {
          if (forecastModeRef.current) onForecastClickRef.current?.(lon, lat);
        },
        worldViewRef.current ? WORLD_2D_INITIAL_VIEW : undefined,
      );
      mapRef.current = { runtime, map };
      updateVWorld2DBoundaryLayer(runtime, map, boundariesRef.current, boundaryValuesRef.current);
      updateVWorld2DPointLayer(runtime, map, poiPointsRef.current);
      if (basemapTypeRef.current === ESRI_GRAY_BASEMAP_KEY) {
        setTileLayerError(updateEsriGrayLayer(runtime, map, true) ? null : TILE_LAYER_ERROR_MESSAGE);
      }
      setMapStatus("ready");
    }).catch((error) => {
      if (cancelled) return;
      setMapStatus("error");
      setMapError(error instanceof Error ? error.message : "VWorld 2D 지도를 초기화하지 못했습니다.");
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        disposeVWorld2DMap(mapRef.current.runtime, mapRef.current.map);
        mapRef.current = null;
      }
    };
  }, [displayStations, mapId, stationStatus]);

  useEffect(() => {
    basemapTypeRef.current = basemapType;
    const currentMap = mapRef.current;
    if (!currentMap) return;
    setTileLayerError(
      !setVWorld2DBasemap(currentMap.runtime, currentMap.map, basemapType) && basemapType === ESRI_GRAY_BASEMAP_KEY
        ? TILE_LAYER_ERROR_MESSAGE
        : null,
    );
  }, [basemapType]);

  useEffect(() => {
    mapRef.current?.map.updateSize();
  }, [mapFrameSize]);

  const thematicSummary = useMemo(() => {
    const entries = Object.values(boundaryValues ?? {});
    if (!entries.length) return null;
    const numericValues = entries.map((entry) => entry.value).filter((value) => Number.isFinite(value));
    if (!numericValues.length) return null;
    return {
      count: numericValues.length,
      min: Math.min(...numericValues),
      max: Math.max(...numericValues),
      unit: entries.find((entry) => entry.unit)?.unit ?? null,
    };
  }, [boundaryValues]);
  const stationThematicSummary = useMemo(() => {
    const values = Object.values(stationValues ?? {}).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!values.length) return null;
    return { count: values.length, min: Math.min(...values), max: Math.max(...values) };
  }, [stationValues]);
  const selectedStation = stations.find((station) => station.station_id === selectedStationId);
  const basemapOption = getVWorldBasemapOption(basemapType);
  const domain = resolveVWorldDomain();
  const fallbackMessage = !hasVWorldClientConfig
    ? "브라우저용 VWorld 키와 등록 domain을 설정하면 지도를 표시할 수 있습니다."
    : stationError
      ? "관측소 목록을 읽지 못해 배경지도만 표시합니다."
      : null;

  return (
    <div className="vworld-map-workspace">
      <div
        className="vworld-map-frame"
        style={{ minHeight: MAP_FRAME_SIZES.find((size) => size.key === mapFrameSize)?.minHeight ?? 432 }}
      >
        <div
          id={mapId}
          ref={mapElementRef}
          className="vworld-map"
          role="application"
          aria-label={`VWorld 2D 지도${showStations ? "와 KMA ASOS 관측소" : "와 행정경계"} · ${basemapOption.label}`}
        />
        <div className="vworld-map-caption">
          <span>VWORLD 2D · {showStations ? "KMA ASOS" : boundaryCaptionTag}</span>
          {basemapType === ESRI_GRAY_BASEMAP_KEY && <span>배경 출처: {ESRI_ATTRIBUTION}</span>}
          {showStations && <span>{displayStations.length ? `${displayStations.length}개 관측소` : "관측소 불러오는 중"}</span>}
          {boundaries && <span>{boundaries.data.features.length}개 경계</span>}
          {thematicSummary && <span>{thematicSummary.count}개 경계값</span>}
          {stationThematicSummary && <span>{stationThematicSummary.count}개 지점값</span>}
          {poiPoints && poiPoints.length > 0 && <span>{poiPoints.length}개 지점</span>}
        </div>
        <div className="vworld-map-legend" aria-label="지도 범례">
          {showStations && <span><i className="vworld-map-legend__dot" />KMA ASOS 관측소</span>}
          {boundaries && <span><i className={`vworld-map-legend__area${thematicSummary ? " vworld-map-legend__area--thematic" : ""}`} />{boundaryScopeLabel}{thematicSummary ? ` · ${boundaryValueLabel}` : ""}</span>}
          {poiPoints && poiPoints.length > 0 && <span><i className="vworld-map-legend__dot" />관심지점 분포</span>}
          {poiLegend?.map((entry) => <span key={entry.label}><i className="vworld-map-legend__dot" style={{ background: entry.color, boxShadow: `0 0 0 1px ${entry.color}` }} />{entry.label}</span>)}
          {thematicSummary && <span><i className="vworld-map-legend__gradient" />{thematicSummary.min.toLocaleString("ko-KR")}–{thematicSummary.max.toLocaleString("ko-KR")} {thematicSummary.unit ?? "값"}</span>}
          {stationThematicSummary && <span><i className="vworld-map-legend__gradient vworld-map-legend__gradient--point" />지점값 {stationThematicSummary.min.toFixed(1)}–{stationThematicSummary.max.toFixed(1)}</span>}
          <span>배경: {basemapOption.label}</span>
        </div>
        <div className="vworld-map-basemap-control" data-export-ignore="true">
          <label htmlFor={`${mapId}-basemap`}>지도 배경</label>
          <select
            id={`${mapId}-basemap`}
            aria-label="지도 배경 유형"
            value={basemapType}
            onChange={(event) => setBasemapType(event.target.value as VWorldBasemapKey)}
          >
            {VWORLD_BASEMAP_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
          <small>{basemapOption.description}</small>
          <div className="vworld-map-size" role="group" aria-label="지도 출력 크기">
            <span>지도 크기</span>
            {MAP_FRAME_SIZES.map((size) => (
              <button
                key={size.key}
                type="button"
                className={mapFrameSize === size.key ? "is-active" : ""}
                aria-pressed={mapFrameSize === size.key}
                onClick={() => setMapFrameSize(size.key)}
              >
                {size.label}
              </button>
            ))}
          </div>
          {tileLayerError && <small className="field-help field-help--error" role="alert">{tileLayerError}</small>}
        </div>
        {mapStatus === "loading" && <div className="vworld-map-message" role="status">VWorld 2D 지도를 준비하는 중입니다…</div>}
        {mapStatus === "error" && <div className="vworld-map-message vworld-map-message--error" role="alert"><strong>지도를 불러오지 못했습니다.</strong><span>{fallbackMessage ?? mapError ?? "VWorld 등록 domain과 브라우저 키를 확인하세요."}</span><small>현재 domain: {domain || "미설정"}</small></div>}
      </div>
      <div className="vworld-map-detail" aria-live="polite">
        <div>
          <p className="eyebrow">{selectedPoi ? "POINT OF INTEREST" : "OBSERVATION STATION"}</p>
          <h3>{selectedPoi ? selectedPoi.title : selectedStation ? selectedStation.name_ko : showStations ? "관측소를 선택하세요" : "행정경계를 확인하세요"}</h3>
        </div>
        {selectedPoi ? (
          <dl className="vworld-map-detail__list">
            <div><dt>주소</dt><dd>{selectedPoi.address || "-"}</dd></div>
          </dl>
        ) : selectedStation ? (
          <dl className="vworld-map-detail__list">
            <div><dt>지점번호</dt><dd>{selectedStation.station_id}</dd></div>
            <div><dt>좌표</dt><dd>{selectedStation.latitude.toFixed(4)}, {selectedStation.longitude.toFixed(4)}</dd></div>
            <div><dt>고도</dt><dd>{selectedStation.altitude_m ?? "-"} m</dd></div>
          </dl>
        ) : (
          <p>{showStations ? "지도 위 점을 클릭하면 관측소 위치와 좌표를 확인할 수 있습니다. 차트자료와 같은 KMA 관측소 집합을 사용합니다." : "선택한 데이터셋의 행정경계와 범례를 확인합니다. 값이 공개된 경우 경계 면에 주제값을 결합합니다."}</p>
        )}
        {stationError && <small className="vworld-map-detail__notice">{fallbackMessage}</small>}
      </div>
    </div>
  );
}
