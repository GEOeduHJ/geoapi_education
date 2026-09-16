import { useEffect, useId, useRef, useState } from "react";
import {
  DEFAULT_CLIMATE_STATION_IDS,
  fetchClimateStations,
  type ClimateStation,
} from "../lib/climate";
import { hasVWorldClientConfig, resolveVWorldDomain } from "../lib/env";
import {
  createVWorld2DMap,
  disposeVWorld2DMap,
  loadVWorld2D,
  updateVWorld2DBoundaryLayer,
  type VWorld2DRuntime,
} from "../lib/vworld2d";
import type { SgisBoundaryResponse } from "../lib/sgis";

type MapStatus = "idle" | "loading" | "ready" | "error";

export function VWorld2DMap({ boundaries = null }: { boundaries?: SgisBoundaryResponse | null }) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ runtime: VWorld2DRuntime; map: ReturnType<typeof createVWorld2DMap> } | null>(null);
  const rawId = useId();
  const mapId = `vworld-map-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const boundariesRef = useRef(boundaries);
  const [stations, setStations] = useState<ClimateStation[]>([]);
  const [stationStatus, setStationStatus] = useState<"loading" | "ready">("loading");
  const [stationError, setStationError] = useState<string | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>("idle");
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    boundariesRef.current = boundaries;
    const currentMap = mapRef.current;
    if (currentMap) updateVWorld2DBoundaryLayer(currentMap.runtime, currentMap.map, boundaries);
  }, [boundaries]);

  useEffect(() => {
    if (stationStatus !== "ready" || !mapElementRef.current) return;
    let cancelled = false;
    setMapStatus("loading");
    setMapError(null);

    loadVWorld2D().then((runtime) => {
      if (cancelled || !mapElementRef.current) return;
      const map = createVWorld2DMap(runtime, mapId, stations, setSelectedStationId);
      mapRef.current = { runtime, map };
      updateVWorld2DBoundaryLayer(runtime, map, boundariesRef.current);
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
  }, [mapId, stationStatus, stations]);

  const selectedStation = stations.find((station) => station.station_id === selectedStationId);
  const domain = resolveVWorldDomain();
  const fallbackMessage = !hasVWorldClientConfig
    ? "브라우저용 VWorld 키와 등록 domain을 설정하면 지도를 표시할 수 있습니다."
    : stationError
      ? "관측소 목록을 읽지 못해 배경지도만 표시합니다."
      : null;

  return (
    <div className="vworld-map-workspace">
      <div className="vworld-map-frame">
        <div
          id={mapId}
          ref={mapElementRef}
          className="vworld-map"
          role="application"
          aria-label="VWorld 2D 지도와 KMA ASOS 관측소"
        />
        <div className="vworld-map-caption">
          <span>VWORLD 2D · KMA ASOS</span>
          <span>{stations.length ? `${stations.length}개 관측소` : "관측소 불러오는 중"}</span>
          {boundaries && <span>{boundaries.data.features.length}개 경계</span>}
        </div>
        <div className="vworld-map-legend" aria-label="지도 범례">
          <span><i className="vworld-map-legend__dot" />KMA ASOS 관측소</span>
          {boundaries && <span><i className="vworld-map-legend__area" />SGIS 시도 경계</span>}
          <span>배경: VWorld Graphic</span>
        </div>
        {mapStatus === "loading" && <div className="vworld-map-message" role="status">VWorld 2D 지도를 준비하는 중입니다…</div>}
        {mapStatus === "error" && <div className="vworld-map-message vworld-map-message--error" role="alert"><strong>지도를 불러오지 못했습니다.</strong><span>{fallbackMessage ?? mapError ?? "VWorld 등록 domain과 브라우저 키를 확인하세요."}</span><small>현재 domain: {domain || "미설정"}</small></div>}
      </div>
      <div className="vworld-map-detail" aria-live="polite">
        <div>
          <p className="eyebrow">OBSERVATION STATION</p>
          <h3>{selectedStation ? selectedStation.name_ko : "관측소를 선택하세요"}</h3>
        </div>
        {selectedStation ? (
          <dl className="vworld-map-detail__list">
            <div><dt>지점번호</dt><dd>{selectedStation.station_id}</dd></div>
            <div><dt>좌표</dt><dd>{selectedStation.latitude.toFixed(4)}, {selectedStation.longitude.toFixed(4)}</dd></div>
            <div><dt>고도</dt><dd>{selectedStation.altitude_m ?? "-"} m</dd></div>
          </dl>
        ) : (
          <p>지도 위 점을 클릭하면 관측소 위치와 좌표를 확인할 수 있습니다. 차트자료와 같은 KMA 관측소 집합을 사용합니다.</p>
        )}
        {stationError && <small className="vworld-map-detail__notice">{fallbackMessage}</small>}
      </div>
    </div>
  );
}
