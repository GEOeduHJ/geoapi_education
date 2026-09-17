import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDatasetCatalog } from "../lib/dataset-catalog";
import { getDatasetIndicators } from "../lib/dataset-catalog";
import { fetchPublicKosisDataset, type PublicKosisDataset } from "../lib/geo-observations";
import { joinKosisObservationsToSgisBoundaries } from "../lib/geo-join";
import { KOSIS_SGG_TO_SGIS_ADM_CD } from "../lib/kosis-crosswalk";
import { fetchSgisBoundaries, type SgisBoundaryResponse } from "../lib/sgis";
import {
  addPrisms,
  createVWorld3DMap,
  flyToPreset,
  loadVWorld3D,
  prismColor,
  type PrismInput,
  type VWorld3DMap as VWorld3DMapHandle,
} from "../lib/vworld3d";

type Map3DStatus = "idle" | "loading" | "ready" | "error";

const HEIGHT_SCALES = [
  { key: "compact", label: "낮게 (50km)", maxHeightMeters: 50_000 },
  { key: "standard", label: "표준 (100km)", maxHeightMeters: 100_000 },
  { key: "exaggerated", label: "과장 (200km)", maxHeightMeters: 200_000 },
] as const;

type HeightScaleKey = typeof HEIGHT_SCALES[number]["key"];

export function VWorld3DMap() {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<VWorld3DMapHandle | null>(null);
  const rawId = useId();
  const mapId = `vworld-3d-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [status, setStatus] = useState<Map3DStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [heightScale, setHeightScale] = useState<HeightScaleKey>("standard");
  const [entityCount, setEntityCount] = useState(0);
  const [boundaries, setBoundaries] = useState<SgisBoundaryResponse | null>(null);
  const [dataset, setDataset] = useState<PublicKosisDataset>({ snapshot: null, observations: [], truncated: false, error: null });
  const datasets = useDatasetCatalog("domestic");
  const heightScaleRef = useRef(heightScale);
  heightScaleRef.current = heightScale;

  useEffect(() => {
    let cancelled = false;
    // 카탈로그(DB override 포함)가 도착하기 전에는 대기한다.
    // 마운트 시점의 빈 목록으로 판단하면 정적 fallback의 null snapshotId에 걸려
    // 공개 snapshot이 있는데도 실패로 끝나는 레이스가 발생한다.
    if (datasets.length === 0) {
      setStatus("loading");
      return () => {
        cancelled = true;
      };
    }
    setStatus("loading");
    setError(null);

    const park = datasets.find((entry) => entry.key === "kosis-sido-city-park-per-capita") ?? null;
    const indicator = park ? getDatasetIndicators(park)[0] ?? null : null;
    if (!indicator?.snapshotId) {
      setStatus("error");
      setError("연결된 공개 snapshot이 없습니다.");
      return () => {
        cancelled = true;
      };
    }
    const snapshotId = indicator.snapshotId;

    loadVWorld3D()
      .then(async () => {
        if (cancelled || !mapElementRef.current) return;
        const [boundaryResult, kosisResult] = await Promise.all([
          fetchSgisBoundaries({ year: 2025, admCd: "non", lowSearch: 1 }),
          fetchPublicKosisDataset(snapshotId),
        ]);
        if (cancelled) return;
        if (boundaryResult.error || !boundaryResult.data) throw new Error("SGIS 경계를 읽지 못했습니다.");
        if (kosisResult.error || !kosisResult.snapshot) throw new Error("KOSIS 공개 snapshot을 읽지 못했습니다.");        setBoundaries(boundaryResult.data);
        setDataset(kosisResult);

        const handle = await createVWorld3DMap(mapId);
        if (cancelled) return;
        if (!handle) throw new Error("VWorld 3D 런타임을 초기화하지 못했습니다.");
        mapRef.current = handle;
        renderPrisms(handle, boundaryResult.data, kosisResult, heightScaleRef.current);
        setStatus("ready");
      })
      .catch((failure) => {
        if (cancelled) return;
        setStatus("error");
        setError(failure instanceof Error ? failure.message : "VWorld 3D 지도를 초기화하지 못했습니다.");
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.dispose();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, datasets]);

  function renderPrisms(handle: VWorld3DMapHandle, response: SgisBoundaryResponse, kosis: PublicKosisDataset, scale: HeightScaleKey) {
    const join = joinKosisObservationsToSgisBoundaries(response, kosis.observations, { codeMap: KOSIS_SGG_TO_SGIS_ADM_CD });
    if (join.status !== "ready") {
      setError("17개 시도 결합 조건을 만족하지 않아 기둥을 세우지 않았습니다.");
      setStatus("error");
      return;
    }
    const maxHeightMeters = HEIGHT_SCALES.find((entry) => entry.key === scale)?.maxHeightMeters ?? 100_000;
    const prisms: PrismInput[] = [];
    for (const feature of response.data.features) {
      const code = feature.properties.adm_cd?.trim() ?? "";
      const joined = join.values[code];
      if (!joined) continue;
      prisms.push({
        code,
        name: feature.properties.adm_nm ?? code,
        rings: feature.geometry.coordinates,
        type: feature.geometry.type,
        value: joined.value,
      });
    }
    const values = prisms.map((prism) => prism.value);
    const range = { min: Math.min(...values), max: Math.max(...values), maxHeightMeters };
    setEntityCount(addPrisms(handle, prisms, range, prismColor));
  }

  useEffect(() => {
    const handle = mapRef.current;
    if (!handle || !boundaries) return;
    renderPrisms(handle, boundaries, dataset, heightScale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightScale]);

  const valueRange = useMemo(() => {
    const values = dataset.observations
      .map((observation) => observation.value)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!values.length) return null;
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [dataset.observations]);

  return (
    <div className="vworld-map-workspace">
      <div className="vworld-map-frame" style={{ minHeight: 520 }}>
        <div id={mapId} ref={mapElementRef} className="vworld-map" role="application" aria-label="VWorld 3D 프리즘 지도" />
        <div className="vworld-map-caption">
          <span>VWORLD 3D · PRISM</span>
          {valueRange && <span>{valueRange.min.toLocaleString("ko-KR")}–{valueRange.max.toLocaleString("ko-KR")} 천㎡</span>}
          {entityCount > 0 && <span>{entityCount}개 도형</span>}
        </div>
        <div className="vworld-map-legend" aria-label="3D 범례">
          <span><i className="vworld-map-legend__gradient" />인구 천명당 공원면적 · 높이는 상대 비교용 모식도</span>
          <span>배경: VWorld 3D</span>
        </div>
        <div className="vworld-map-basemap-control" data-export-ignore="true">
          <label htmlFor={`${mapId}-height`}>기둥 높이</label>
          <select
            id={`${mapId}-height`}
            aria-label="기둥 높이 과장"
            value={heightScale}
            onChange={(event) => setHeightScale(event.target.value as HeightScaleKey)}
          >
            {HEIGHT_SCALES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
          <small>실제 지형 높이가 아니라 값 상대 비교용입니다.</small>
        </div>
        <div className="vworld-map-basemap-control" data-export-ignore="true" style={{ top: "auto", bottom: "52px" }}>
          <div className="vworld-map-size" role="group" aria-label="3D 카메라">
            <span>카메라</span>
            <button type="button" onClick={() => mapRef.current && flyToPreset(mapRef.current, "overview")}>조감도</button>
            <button type="button" onClick={() => mapRef.current && flyToPreset(mapRef.current, "topdown")}>수직보기</button>
          </div>
        </div>
        {status === "loading" && <div className="vworld-map-message" role="status">VWorld 3D 지도와 공개값을 불러오는 중입니다…</div>}
        {status === "error" && (
          <div className="vworld-map-message vworld-map-message--error" role="alert">
            <strong>3D 지도를 표시하지 못했습니다.</strong>
            <span>{error ?? "VWorld 등록 domain과 브라우저 키를 확인하세요."}</span>
            <small><Link to="/create/2d/domestic">2D 단계구분도로 보기 →</Link></small>
          </div>
        )}
      </div>
      <div className="vworld-map-detail" aria-live="polite">
        <div>
          <p className="eyebrow">3D PRISM READING</p>
          <h3>높이로 읽는 시도 비교</h3>
        </div>
        <p>같은 2025 도시공원 값을 2D 색상과 3D 높이로 함께 표현합니다. 높이는 순위를 읽기 위한 모식이며, 실제 면적·지형과 비례하지 않습니다. 회전·확대로 가려진 지역을 확인하세요.</p>
      </div>
    </div>
  );
}
