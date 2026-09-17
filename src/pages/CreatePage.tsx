import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Climate2DWorkspace, DEFAULT_CLIMATE_FROM, DEFAULT_CLIMATE_TO, useClimateDataset } from "../components/Climate2DWorkspace";
import { ClimateComparison } from "../components/ClimateComparison";
import { DatasetSelector } from "../components/DatasetSelector";
import { ForecastPanel, type ForecastResult } from "../components/ForecastPanel";
import { VWorld3DMap } from "../components/VWorld3DMap";
import { MaterialExportActions } from "../components/MaterialExportActions";
import { KosisPublicSnapshotPanel, type KosisPanelStatus } from "../components/KosisPublicSnapshotPanel";
import { Snapshot2DWorkspace } from "../components/Snapshot2DWorkspace";
import { KosisBoundaryJoinStatusPanel } from "../components/KosisBoundaryJoinStatusPanel";
import { SgisBoundaryStatusPanel, type SgisBoundaryPanelStatus } from "../components/SgisBoundaryStatusPanel";
import { VWorld2DMap } from "../components/VWorld2DMap";
import { useDatasetCatalog, getDatasetIndicators, type DatasetScope } from "../lib/dataset-catalog";
import { getKosisDimensions } from "../lib/kosis-dimensions";
import { lawCodeToSgisAdmCds, climateMetrics, type ClimateMetric } from "../lib/climate";
import { fetchForecast, groupForecastByTime, resolveForecastBase, toForecastGrid } from "../lib/forecast";
import { fetchLatestPublicKosisDataset, fetchPublicKosisDataset, aggregateObservationsByRegion, filterObservationsByClassification, filterObservationsByYear, listObservationYears, AIRKOREA_SNAPSHOT_SCHEMA, GBIF_SNAPSHOT_SCHEMA, KOSIS_SNAPSHOT_SCHEMA, OPENMETEO_SNAPSHOT_SCHEMA, OPENTOPO_SNAPSHOT_SCHEMA, USGS_SNAPSHOT_SCHEMA, WORLD_BANK_SNAPSHOT_SCHEMA, type PublicKosisDataset } from "../lib/geo-observations";
import { ISO_ALPHA3_TO_M49 } from "../lib/iso-codes";
import { joinKosisObservationsToSgisBoundaries, type BoundaryJoinValue } from "../lib/geo-join";
import { AIRKOREA_SIDO_TO_SGIS_ADM_CD, KOSIS_SGG_TO_SGIS_ADM_CD, TOUR_AREA_TO_SGIS_ADM_CD } from "../lib/kosis-crosswalk";
import { toPoiPoints } from "../lib/tourapi-adapter";
import { toMeteoProvenance, toMeteoTableModel } from "../lib/meteo-adapter";
import { toGbifProvenance, toGbifTableModel } from "../lib/gbif-adapter";
import { ElevationProfile } from "../components/ElevationProfile";
import { toQuakePoints, toQuakeProvenance, toQuakeTableModel, QUAKE_COLOR_MAJOR, QUAKE_COLOR_MODERATE, QUAKE_COLOR_STRONG } from "../lib/quake-adapter";
import { Poi2DWorkspace } from "../components/Poi2DWorkspace";
import { fetchSgisBoundaries, buildDomesticSidoBoundaryQuery, type SgisBoundaryResponse } from "../lib/sgis";
import { fetchWorldBoundaries } from "../lib/world-boundaries";
import { toNormalizedRecords, toMapLayerSpec } from "../lib/kma-adapter";

const EMPTY_PUBLIC_KOSIS_DATASET: PublicKosisDataset = {
  snapshot: null,
  observations: [],
  truncated: false,
  error: null,
};

const recipes = [
  { label: "관계형", title: "2D 지도자료", description: "분포·밀도·접근성·변화를 평면 지도와 레이어로 구성", to: "/create/2d", accent: "teal" },
  { label: "지형형", title: "3D 공간자료", description: "고도·경관·재해·도시 구조를 입체적으로 조작", to: "/create/3d", accent: "blue" },
  { label: "비교형", title: "통계·차트자료", description: "시계열·지역 비교·상관관계를 설명 가능한 그래프로 제작", to: "/create/chart", accent: "amber" },
];

export function CreatePage() {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <p className="eyebrow">MATERIAL STUDIO</p>
        <h1>수업에서 쓸 자료를<br />질문과 함께 설계합니다.</h1>
        <p>데이터 소스를 고르고, 변환 규칙과 표현 방식을 기록한 뒤 학습용 자료로 저장합니다.</p>
      </section>

      <section className="workflow-line" aria-label="자료 제작 단계">
        {[
          ["01", "목표 설정"],
          ["02", "자료 선택"],
          ["03", "표현 설계"],
          ["04", "활동 연결"],
        ].map(([number, label], index) => (
          <div className="workflow-step" key={number}>
            <span>{number}</span><strong>{label}</strong>{index < 3 && <i>→</i>}
          </div>
        ))}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CHOOSE A MATERIAL TYPE</p>
            <h2>어떤 자료를 제작할까요?</h2>
          </div>
          <p>2D와 3D는 조작 방식과 관찰 질문이 다르므로 별도 작업공간으로 관리합니다.</p>
        </div>
        <div className="recipe-grid">
          {recipes.map((recipe) => (
            <Link className={`recipe-card recipe-card--${recipe.accent}`} to={recipe.to} key={recipe.to}>
              <div className="recipe-card__visual"><span>{recipe.label}</span></div>
              <div className="recipe-card__body">
                <h3>{recipe.title}</h3>
                <p>{recipe.description}</p>
                <span className="text-link">작업공간 열기 ↗</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="callout callout--warm">
        <div>
          <p className="eyebrow">DESIGN PRINCIPLE</p>
          <h2>자료는 결과물이 아니라 탐구의 발판입니다.</h2>
          <p>제작 과정에서 사용한 출처, 필터, 단위, 결측 처리, 시점을 함께 기록해 학습자가 자료를 비판적으로 읽을 수 있게 합니다.</p>
        </div>
        <Link className="button button-dark" to="/status">연결 상태 확인</Link>
      </section>
    </div>
  );
}

function WorkspaceNotice({ dimension, description }: { dimension: "2D" | "3D"; description: string }) {
  return (
    <div className="workspace-notice">
      <div className="workspace-notice__icon">{dimension}</div>
      <div>
        <p className="eyebrow">{dimension} WORKSPACE CONTRACT</p>
        <h3>{dimension === "2D" ? "레이어와 범례를 조합하는 평면 지도" : "고도와 경관을 탐색하는 입체 지도"}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function MapCreatePage({ dimension, scope = "domestic" }: { dimension: "2D" | "3D"; scope?: DatasetScope }) {
  const isThreeD = dimension === "3D";
  const isDomestic = scope === "domestic";
  const [datasetKey, setDatasetKey] = useState(isDomestic ? "kma-asos-climate-10y" : "world-bank-population-density");
  const [metric, setMetric] = useState<ClimateMetric>("ta_avg");
  const [from, setFrom] = useState(DEFAULT_CLIMATE_FROM);
  const [to, setTo] = useState(DEFAULT_CLIMATE_TO);
  const [boundaryCode, setBoundaryCode] = useState("");
  const [sgisBoundaryStatus, setSgisBoundaryStatus] = useState<SgisBoundaryPanelStatus>("idle");
  const [sgisBoundaries, setSgisBoundaries] = useState<SgisBoundaryResponse | null>(null);
  const [sgisBoundaryError, setSgisBoundaryError] = useState<string | null>(null);
  const [worldBoundaries, setWorldBoundaries] = useState<SgisBoundaryResponse | null>(null);
  const [worldBoundaryStatus, setWorldBoundaryStatus] = useState<SgisBoundaryPanelStatus>("idle");
  const [worldBoundaryError, setWorldBoundaryError] = useState<string | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<KosisPanelStatus>("idle");
  const [snapshotDataset, setSnapshotDataset] = useState<PublicKosisDataset>(EMPTY_PUBLIC_KOSIS_DATASET);
  const [snapshotYear, setSnapshotYear] = useState("");
  const [indicatorKey, setIndicatorKey] = useState("");
  const [dimSelections, setDimSelections] = useState<Record<string, string>>({});
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [forecastMode, setForecastMode] = useState(false);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const mapExportRef = useRef<HTMLDivElement | null>(null);
  const datasets = useDatasetCatalog(scope);
  const dataset = datasets.find((entry) => entry.key === datasetKey) ?? null;
  const isKma = datasetKey === "kma-asos-climate-10y";
  const isSnapshotDataset = !isThreeD && dataset?.status === "ready" && dataset?.storage === "supabase" && dataset?.kind === "polygon" && !isKma;
  const isPoiDataset = !isThreeD && dataset?.kind === "point";
  const snapshotSchema = dataset?.provider === "에어코리아"
    ? AIRKOREA_SNAPSHOT_SCHEMA
    : dataset?.provider === "World Bank"
      ? WORLD_BANK_SNAPSHOT_SCHEMA
      : dataset?.provider === "USGS"
        ? USGS_SNAPSHOT_SCHEMA
        : dataset?.provider === "Open-Meteo"
          ? OPENMETEO_SNAPSHOT_SCHEMA
          : dataset?.provider === "OpenTopoData"
            ? OPENTOPO_SNAPSHOT_SCHEMA
            : dataset?.provider === "GBIF"
              ? GBIF_SNAPSHOT_SCHEMA
              : KOSIS_SNAPSHOT_SCHEMA;
  const isProfileDataset = datasetKey === "opentopo-seoul-busan-profile";
  const climateState = useClimateDataset(metric, from, to, undefined, isKma && !isThreeD);
  const snapshotIndicators = useMemo(() => (dataset ? getDatasetIndicators(dataset) : []), [dataset]);
  const effectiveIndicator = snapshotIndicators.find((entry) => entry.key === indicatorKey) ?? snapshotIndicators[0] ?? null;
  const indicatorSnapshotId = effectiveIndicator?.snapshotId ?? dataset?.snapshotId ?? null;
  const kosisDimensions = useMemo(
    () => getKosisDimensions(datasetKey, effectiveIndicator?.key ?? ""),
    [datasetKey, effectiveIndicator],
  );

  useEffect(() => {
    setDatasetKey(isDomestic ? "kma-asos-climate-10y" : "world-bank-population-density");
    setBoundaryCode("");
    setSnapshotYear("");
    setIndicatorKey("");
    setDimSelections({});
    setSelectedPoiId(null);
  }, [isDomestic]);

  useEffect(() => {
    if (isThreeD) {
      setSgisBoundaryStatus("idle");
      setSgisBoundaries(null);
      setSgisBoundaryError(null);
      setWorldBoundaryStatus("idle");
      setWorldBoundaries(null);
      setWorldBoundaryError(null);
      setSnapshotStatus("idle");
      setSnapshotDataset(EMPTY_PUBLIC_KOSIS_DATASET);
      return;
    }

    let cancelled = false;
    if (isDomestic) {
      setSgisBoundaryStatus("loading");
      setSgisBoundaries(null);
      setSgisBoundaryError(null);
      setWorldBoundaryStatus("idle");
      setWorldBoundaries(null);
      setWorldBoundaryError(null);
    } else {
      setWorldBoundaryStatus("loading");
      setWorldBoundaries(null);
      setWorldBoundaryError(null);
      setSgisBoundaryStatus("idle");
      setSgisBoundaries(null);
      setSgisBoundaryError(null);
    }
    if (isSnapshotDataset || isPoiDataset) {
      setSnapshotStatus("loading");
      setSnapshotDataset(EMPTY_PUBLIC_KOSIS_DATASET);
    } else {
      setSnapshotStatus("idle");
      setSnapshotDataset(EMPTY_PUBLIC_KOSIS_DATASET);
    }

    const load = async () => {
      if (isDomestic) {
        const boundaryResult = await fetchSgisBoundaries(buildDomesticSidoBoundaryQuery());
        if (cancelled) return;
        setSgisBoundaries(boundaryResult.data);
        setSgisBoundaryError(boundaryResult.error);
        setSgisBoundaryStatus(boundaryResult.error ? "error" : "ready");
      } else {
        const boundaryResult = await fetchWorldBoundaries();
        if (cancelled) return;
        setWorldBoundaries(boundaryResult.data);
        setWorldBoundaryError(boundaryResult.error);
        setWorldBoundaryStatus(boundaryResult.error ? "error" : "ready");
      }
      if (!isSnapshotDataset && !isPoiDataset) return;
      const kosisResult = indicatorSnapshotId
        ? await fetchPublicKosisDataset(indicatorSnapshotId, snapshotSchema)
        : await fetchLatestPublicKosisDataset(snapshotSchema);
      if (cancelled) return;
      setSnapshotDataset(kosisResult);
      setSnapshotStatus(kosisResult.error ? "error" : kosisResult.snapshot ? "ready" : "empty");
    };
    load().catch(() => {
      if (cancelled) return;
      if (isDomestic) {
        setSgisBoundaryStatus("error");
        setSgisBoundaryError("SGIS_BOUNDARY_REQUEST_FAILED");
      } else {
        setWorldBoundaryStatus("error");
        setWorldBoundaryError("WORLD_BOUNDARY_REQUEST_FAILED");
      }
      if (isSnapshotDataset || isPoiDataset) {
        setSnapshotStatus("error");
        setSnapshotDataset({ ...EMPTY_PUBLIC_KOSIS_DATASET, error: "PUBLIC_KOSIS_READ_FAILED" });
      }
    });
    return () => { cancelled = true; };
  }, [isDomestic, isSnapshotDataset, isPoiDataset, isThreeD, indicatorSnapshotId, snapshotSchema]);

  const activeBoundaries = isDomestic ? sgisBoundaries : worldBoundaries;
  const activeBoundaryStatus = isDomestic ? sgisBoundaryStatus : worldBoundaryStatus;
  const activeBoundaryError = isDomestic ? sgisBoundaryError : worldBoundaryError;

  const visibleBoundaries = useMemo<SgisBoundaryResponse | null>(() => {
    if (!activeBoundaries || !boundaryCode) return activeBoundaries;
    return {
      ...activeBoundaries,
      data: {
        ...activeBoundaries.data,
        features: activeBoundaries.data.features.filter((feature) => feature.properties.adm_cd === boundaryCode),
      },
    };
  }, [boundaryCode, activeBoundaries]);

  const dimFilteredSnapshotObservations = useMemo(() => {
    let rows = snapshotDataset.observations;
    for (const dimension of kosisDimensions) {
      rows = filterObservationsByClassification(rows, dimension.level, dimSelections[dimension.key] ?? "");
    }
    return rows;
  }, [snapshotDataset.observations, kosisDimensions, dimSelections]);

  const availableSnapshotYears = useMemo(
    () => listObservationYears(dimFilteredSnapshotObservations),
    [dimFilteredSnapshotObservations],
  );
  const effectiveSnapshotYear = availableSnapshotYears.includes(snapshotYear) ? snapshotYear : (availableSnapshotYears[0] ?? "");
  const filteredSnapshotObservations = useMemo(
    () => aggregateObservationsByRegion(effectiveSnapshotYear ? filterObservationsByYear(dimFilteredSnapshotObservations, effectiveSnapshotYear) : dimFilteredSnapshotObservations),
    [dimFilteredSnapshotObservations, effectiveSnapshotYear],
  );

  const boundaryJoin = useMemo(
    () => joinKosisObservationsToSgisBoundaries(visibleBoundaries, filteredSnapshotObservations, { codeMap: { ...KOSIS_SGG_TO_SGIS_ADM_CD, ...AIRKOREA_SIDO_TO_SGIS_ADM_CD, ...ISO_ALPHA3_TO_M49 } }),
    [filteredSnapshotObservations, visibleBoundaries],
  );

  const poiObservations = useMemo(() => {
    if (!isPoiDataset) return [];
    if (!boundaryCode) return snapshotDataset.observations;
    return snapshotDataset.observations.filter((observation) => {
      const areaCode = typeof observation.attributes.area_code === "string" ? observation.attributes.area_code : "";
      // 지역 코드가 없는 세계 POI(지진 등)는 경계 필터를 적용하지 않는다.
      if (!areaCode) return true;
      return (TOUR_AREA_TO_SGIS_ADM_CD[areaCode] ?? "") === boundaryCode;
    });
  }, [isPoiDataset, snapshotDataset.observations, boundaryCode]);

  const poiPoints = useMemo(
    () => {
      if (!isPoiDataset) return null;
      return datasetKey === "usgs-earthquake-history"
        ? toQuakePoints(poiObservations)
        : toPoiPoints(poiObservations);
    },
    [isPoiDataset, poiObservations, datasetKey],
  );

  const selectedPoiDetail = useMemo(() => {
    if (!selectedPoiId) return null;
    const found = poiObservations.find((observation) => observation.id === selectedPoiId);
    if (!found) return null;
    const address = typeof found.attributes.address === "string" ? found.attributes.address : "";
    return { title: found.label ?? "", address };
  }, [selectedPoiId, poiObservations]);

  const isQuakeDataset = datasetKey === "usgs-earthquake-history";
  const isMeteoDataset = datasetKey === "open-meteo-city-climate";
  const isGbifDataset = datasetKey === "gbif-flagship-species";
  const meteoTableModel = useMemo(
    () => (isMeteoDataset ? toMeteoTableModel(poiObservations) : null),
    [isMeteoDataset, poiObservations],
  );
  const meteoProvenance = useMemo(
    () => (isMeteoDataset
      ? toMeteoProvenance(snapshotDataset.snapshot, poiObservations.length, dataset?.title ?? "", dataset?.sourceUrl ?? "")
      : null),
    [isMeteoDataset, snapshotDataset.snapshot, poiObservations.length, dataset?.title, dataset?.sourceUrl],
  );
  const gbifTableModel = useMemo(
    () => (isGbifDataset ? toGbifTableModel(poiObservations) : null),
    [isGbifDataset, poiObservations],
  );
  const gbifProvenance = useMemo(
    () => (isGbifDataset
      ? toGbifProvenance(snapshotDataset.snapshot, poiObservations.length, dataset?.title ?? "", dataset?.sourceUrl ?? "")
      : null),
    [isGbifDataset, snapshotDataset.snapshot, poiObservations.length, dataset?.title, dataset?.sourceUrl],
  );
  const quakeTableModel = useMemo(
    () => (isQuakeDataset ? toQuakeTableModel(poiObservations) : null),
    [isQuakeDataset, poiObservations],
  );
  const quakeProvenance = useMemo(
    () => (isQuakeDataset
      ? toQuakeProvenance(snapshotDataset.snapshot, poiObservations.length, dataset?.title ?? "", dataset?.sourceUrl ?? "")
      : null),
    [isQuakeDataset, snapshotDataset.snapshot, poiObservations.length, dataset?.title, dataset?.sourceUrl],
  );

  const visibleStationIds = useMemo(() => {
    if (!boundaryCode) return climateState.stations.map((station) => station.station_id);
    return climateState.stations
      .filter((station) => lawCodeToSgisAdmCds(station.law_code).includes(boundaryCode))
      .map((station) => station.station_id);
  }, [boundaryCode, climateState.stations]);

  const stationValues = useMemo(
    () => Object.fromEntries(climateState.summaries.filter((summary) => visibleStationIds.includes(summary.stationId)).map((summary) => [summary.stationId, summary.value])),
    [climateState.summaries, visibleStationIds],
  );

  const boundaryNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const feature of activeBoundaries?.data.features ?? []) {
      const code = feature.properties.adm_cd?.trim();
      if (code && feature.properties.adm_nm) names[code] = feature.properties.adm_nm;
    }
    return names;
  }, [activeBoundaries]);

  // KMA 데이터를 행정경계별로 집계해서 choropleth 데이터 생성
  const kmaAggregatedBoundaryValues = useMemo<Record<string, BoundaryJoinValue> | null>(() => {
    if (!isKma) return null;
    const filteredSummaries = climateState.summaries.filter((summary) => visibleStationIds.includes(summary.stationId));
    if (filteredSummaries.length === 0) return null;

    // NormalizedRecord로 변환 (adm_cd 포함)
    const records = toNormalizedRecords(filteredSummaries, metric, climateState.stations);
    // 행정경계별 집계
    const mapSpec = toMapLayerSpec(records, metric, boundaryNames);

    // MapLayerSpec의 aggregated records를 BoundaryJoinValue 형식으로 변환
    const result: Record<string, BoundaryJoinValue> = {};
    for (const record of mapSpec.records) {
      const admCd = record.location.adm_cd;
      if (!admCd) continue;
      result[admCd] = {
        code: admCd,
        value: record.value,
        label: record.location.name ?? null,
        unit: record.unit ?? null,
        observationId: `kma-boundary-${admCd}`,
        observedAt: record.timestamp ?? null,
      };
    }
    return Object.keys(result).length > 0 ? result : null;
  }, [climateState.summaries, visibleStationIds, climateState.stations, isKma, metric, boundaryNames]);

  const climateViewState = useMemo(
    () => ({ ...climateState, summaries: climateState.summaries.filter((summary) => visibleStationIds.includes(summary.stationId)) }),
    [climateState, visibleStationIds],
  );

  const boundaryOptions = activeBoundaries?.data.features ?? [];
  const selectedBoundaryName = boundaryOptions.find((feature) => feature.properties.adm_cd === boundaryCode)?.properties.adm_nm;

  async function handleForecastClick(lon: number, lat: number) {
    const { nx, ny } = toForecastGrid(lat, lon);
    const base = resolveForecastBase();
    setForecast({ lon, lat, nx, ny, baseDate: base.baseDate, baseTime: base.baseTime, slots: [], status: "loading", error: null });
    const result = await fetchForecast(nx, ny, base);
    setForecast((prev) => {
      if (!prev || prev.nx !== nx || prev.ny !== ny || prev.baseTime !== base.baseTime) return prev;
      if (result.error) return { ...prev, status: "error", error: result.error };
      return { ...prev, slots: groupForecastByTime(result.data), status: "ready" };
    });
  }

  return (
    <div className="page-stack">
      <section className="page-intro page-intro--with-back">
        <div>
          <Link className="back-link" to="/create">← 자료 유형 선택</Link>
          <p className="eyebrow">MATERIAL STUDIO / {dimension} / {scope.toUpperCase()}</p>
          <h1>{dimension} {scope === "domestic" ? "국내" : "세계"} 지도자료 제작</h1>
          <p>{isThreeD ? "지형·고도·도시 경관을 입체적으로 배치하고 관찰 가능한 질문을 설계합니다." : "자료셋을 고르고 동일한 조건을 지도·그래프·표에 적용해 설명 가능한 2D 자료를 설계합니다."}</p>
        </div>
        <span className={`dimension-mark dimension-mark--${dimension.toLowerCase()}`}>{dimension}</span>
      </section>

      <WorkspaceNotice
        dimension={dimension}
        description={isThreeD ? "VWorld WebGL 3D 초기화 계약과 고도 데이터 어댑터를 연결할 자리입니다." : `${scope === "domestic" ? "국내 행정경계·관측지점" : "세계 국가·도시"} 자료를 하나의 필터로 지도·그래프·표에 연결합니다. 3D는 2D 데이터 계약이 완성된 뒤 확장합니다.`}
      />

      {!isThreeD && <nav className="workspace-mode-nav" aria-label="2D 지도 범위"><Link className={scope === "domestic" ? "is-active" : ""} to="/create/2d/domestic">국내 2D</Link><Link className={scope === "world" ? "is-active" : ""} to="/create/2d/world">세계 2D</Link></nav>}

      <section className="workspace-grid">
        {isThreeD ? (
          <div className="map-stage map-stage--live" ref={mapExportRef}>
            <VWorld3DMap />
          </div>
        ) : (
          <div className="map-stage map-stage--live" ref={mapExportRef}>
            <VWorld2DMap
              boundaries={visibleBoundaries}
              boundaryValues={
                isSnapshotDataset && boundaryJoin.status === "ready" ? boundaryJoin.values :
                isKma && kmaAggregatedBoundaryValues ? kmaAggregatedBoundaryValues :
                null
              }
              boundaryValueLabel={isSnapshotDataset ? (effectiveIndicator && effectiveIndicator.key !== "default" ? effectiveIndicator.label : "공개값") : isKma ? "KMA 경계별 평균" : "경계값"}
              stationValues={null}
              visibleStationIds={[]}
              showStations={false}
              poiPoints={poiPoints}
              onSelectPoi={setSelectedPoiId}
              selectedPoi={selectedPoiDetail}
              poiLegend={isQuakeDataset ? [{ color: QUAKE_COLOR_MODERATE, label: "M6대" }, { color: QUAKE_COLOR_STRONG, label: "M7대" }, { color: QUAKE_COLOR_MAJOR, label: "M8 이상" }] : null}
              forecastMode={forecastMode}
              onForecastClick={handleForecastClick}
              worldView={!isDomestic}
              boundaryScopeLabel={isDomestic ? "SGIS 시도 경계" : "세계 국가 경계"}
              boundaryCaptionTag={isDomestic ? "SGIS BOUNDARY" : "WORLD BOUNDARIES"}
            />
          </div>
        )}
        <aside className="workspace-sidebar">
          <div className="sidebar-section">
            <p className="eyebrow">01 · QUERY</p>
            <h3>{scope === "domestic" ? "자료·조건 선택" : "세계 자료 선택"}</h3>
            <DatasetSelector scope={scope} value={datasetKey} onChange={(next) => { setDatasetKey(next); setBoundaryCode(""); setSnapshotYear(""); setIndicatorKey(""); setDimSelections({}); setSelectedPoiId(null); }} />
            {dataset?.status === "planned" && <div className="dataset-planned-message" role="status"><strong>이 데이터셋은 아직 공개 자료로 전환되지 않았습니다.</strong><span>관리자가 원자료 범위·코드·출처를 확인하고 snapshot을 공개하면 지도·그래프·표가 활성화됩니다.</span></div>}
            {!isThreeD && isDomestic && isKma && (
              <>
                <label className="field-label" htmlFor="kma-metric">지표</label>
                <select id="kma-metric" value={metric} onChange={(event) => setMetric(event.target.value as ClimateMetric)}>{Object.entries(climateMetrics).map(([key, definition]) => <option key={key} value={key}>{definition.label} ({definition.unit})</option>)}</select>
                <label className="field-label" htmlFor="kma-from">시작일</label>
                <input id="kma-from" type="date" min={DEFAULT_CLIMATE_FROM} max={DEFAULT_CLIMATE_TO} value={from} onChange={(event) => setFrom(event.target.value)} />
                <label className="field-label" htmlFor="kma-to">종료일</label>
                <input id="kma-to" type="date" min={DEFAULT_CLIMATE_FROM} max={DEFAULT_CLIMATE_TO} value={to} onChange={(event) => setTo(event.target.value)} />
                <small className="field-help">지표·기간 조건이 지도·그래프·자료표에 함께 적용됩니다.</small>
              </>
            )}
            {(isSnapshotDataset || isPoiDataset) && (
              <>
                {snapshotIndicators.length > 1 && (
                  <>
                    <label className="field-label" htmlFor="query-indicator">{isPoiDataset ? "지역" : "지표"}</label>
                    <select id="query-indicator" value={effectiveIndicator?.key ?? ""} onChange={(event) => { setIndicatorKey(event.target.value); setSnapshotYear(""); setDimSelections({}); setSelectedPoiId(null); setSelectedPoiId(null); }}>
                      {snapshotIndicators.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}{entry.unit ? ` (${entry.unit})` : ""}</option>)}
                    </select>
                  </>
                )}
                {kosisDimensions.map((dimension) => (
                  <span key={dimension.key}>
                    <label className="field-label" htmlFor={`kosis-dim-${dimension.key}`}>{dimension.label}</label>
                    <select
                      id={`kosis-dim-${dimension.key}`}
                      value={dimSelections[dimension.key] ?? ""}
                      onChange={(event) => setDimSelections((prev) => ({ ...prev, [dimension.key]: event.target.value }))}
                    >
                      <option value="">전체 {dimension.label}</option>
                      {dimension.options.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                    </select>
                  </span>
                ))}
                {isSnapshotDataset && (
                  <>
                    <label className="field-label" htmlFor="kosis-year">연도</label>
                    <select id="kosis-year" value={effectiveSnapshotYear} onChange={(event) => setSnapshotYear(event.target.value)} disabled={availableSnapshotYears.length === 0}>
                      {availableSnapshotYears.length === 0
                        ? <option value="">연도 불러오는 중…</option>
                        : availableSnapshotYears.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                    <small className="field-help">선택한 연도의 값으로 지도·그래프·자료표가 함께 갱신됩니다.</small>
                  </>
                )}
                {isPoiDataset && (
                  <small className="field-help">선택한 지역의 관심지점이 지도와 목록에 함께 표시됩니다. 점을 클릭하면 이름·주소를 확인합니다.</small>
                )}
              </>
            )}
            {!isThreeD && (
              <>
                {isDomestic && (
                  <>
                    <div className="control-row"><span>지도 클릭 예보 조회</span><button className={`toggle${forecastMode ? " is-on" : ""}`} type="button" aria-pressed={forecastMode} aria-label="지도 클릭 예보 조회" onClick={() => setForecastMode((value) => !value)}><i /></button></div>
                    {forecastMode && <small className="field-help">지도의 빈 곳을 클릭하면 5km 격자 단기예보를 조회합니다.</small>}
                  </>
                )}
                <label className="field-label" htmlFor="boundary-filter">{isDomestic ? "지도에 표시할 시도" : "지도에 표시할 국가"}</label>
                <select id="boundary-filter" value={boundaryCode} onChange={(event) => setBoundaryCode(event.target.value)} disabled={activeBoundaryStatus !== "ready"}>
                  <option value="">{isDomestic ? `전체 시도 · ${boundaryOptions.length || "-"}개` : `전체 국가 · ${boundaryOptions.length || "-"}개`}</option>
                  {boundaryOptions.map((feature) => <option key={feature.properties.adm_cd ?? feature.properties.adm_nm} value={feature.properties.adm_cd ?? ""}>{feature.properties.adm_nm ?? feature.properties.adm_cd ?? "이름 없음"}</option>)}
                </select>
                {isDomestic ? (
                  <>
                    <small className="field-help">{boundaryCode ? `${selectedBoundaryName ?? boundaryCode}만 지도·범례·자료표 범위에 반영합니다.` : "전체 시도를 표시합니다. 특정 시도를 고르면 KMA 지점과 공개값도 같은 범위로 제한합니다."}</small>
                    <small className="field-help">국내 2D는 시도 단위로 고정합니다. 시군구·행정동은 값 원천과 코드 대응표가 확보될 때까지 지원하지 않습니다.</small>
                  </>
                ) : (
                  <small className="field-help">{boundaryCode ? `${selectedBoundaryName ?? boundaryCode}만 지도·범례·자료표 범위에 반영합니다.` : "전체 국가를 표시합니다. 특정 국가를 고르면 그래프·자료표도 같은 범위로 제한합니다."}</small>
                )}
                {!isDomestic && <small className="field-help">세계 경계: Natural Earth 50m (world-atlas v2, public domain).</small>}
                {activeBoundaryStatus === "loading" && <small className="field-help">경계 목록을 불러오는 중입니다…</small>}
                {activeBoundaryError && <small className="field-help field-help--error">경계 목록을 읽지 못했습니다.</small>}
              </>
            )}
            {!isThreeD && (isSnapshotDataset || isPoiDataset) && <KosisPublicSnapshotPanel status={snapshotStatus} dataset={snapshotDataset} providerLabel={dataset?.provider} />}
            {!isThreeD && isDomestic && <SgisBoundaryStatusPanel status={sgisBoundaryStatus} data={sgisBoundaries} error={sgisBoundaryError} />}
            {!isThreeD && isSnapshotDataset && <KosisBoundaryJoinStatusPanel result={boundaryJoin} loading={snapshotStatus === "loading" || activeBoundaryStatus === "loading"} error={snapshotDataset.error ?? activeBoundaryError} providerLabel={dataset?.provider} />}
          </div>
          <div className="sidebar-section">
            <p className="eyebrow">02 · REPRESENTATION</p>
            <h3>표현 규칙</h3>
            <div className="control-row"><span>범례 자동 제안</span><button className="toggle is-on" type="button" aria-label="범례 자동 제안 켜짐"><i /></button></div>
            <div className="control-row"><span>학습자 조작 허용</span><button className="toggle is-on" type="button" aria-label="학습자 조작 허용 켜짐"><i /></button></div>
            <div className="control-row"><span>출처 패널 표시</span><button className="toggle is-on" type="button" aria-label="출처 패널 표시 켜짐"><i /></button></div>
          </div>
          <div className="sidebar-section sidebar-section--last">
            <p className="eyebrow">03 · INQUIRY LINK</p>
            <h3>활동 연결</h3>
            <p className="muted-copy">자료 저장 후 관찰·비교·설명·일반화 질문을 연결할 수 있습니다.</p>
            <button className="button button-primary button-full" type="button">자료 저장 준비</button>
          </div>
        </aside>
      </section>
      {!isThreeD && isDomestic && isKma && <Climate2DWorkspace metric={metric} from={from} to={to} state={climateViewState} />}
      {isSnapshotDataset && <Snapshot2DWorkspace datasetTitle={effectiveIndicator && effectiveIndicator.key !== "default" ? `${dataset?.title ?? ""} · ${effectiveIndicator.label}` : (dataset?.title ?? "")} sourceUrl={dataset?.sourceUrl ?? ""} providerLabel={dataset?.provider ?? ""} status={snapshotStatus} snapshot={snapshotDataset.snapshot} joinResult={boundaryJoin} boundaryNames={boundaryNames} error={snapshotDataset.error ?? activeBoundaryError} selectedYear={effectiveSnapshotYear} exportSlug={datasetKey} />}
      {isPoiDataset && !isProfileDataset && <Poi2DWorkspace datasetTitle={effectiveIndicator && effectiveIndicator.key !== "default" ? `${dataset?.title ?? ""} · ${effectiveIndicator.label}` : (dataset?.title ?? "")} sourceUrl={dataset?.sourceUrl ?? ""} status={snapshotStatus} snapshot={snapshotDataset.snapshot} observations={poiObservations} error={snapshotDataset.error ?? activeBoundaryError} exportSlug={datasetKey} eyebrow={isQuakeDataset ? "EARTHQUAKE · 2D DATA VIEW" : isMeteoDataset ? "CITY CLIMATE · 2D DATA VIEW" : isGbifDataset ? "SPECIES · 2D DATA VIEW" : undefined} heading={isQuakeDataset ? "지진 분포·목록" : isMeteoDataset ? "도시 기후 비교" : isGbifDataset ? "상징종 분포·목록" : undefined} description={isQuakeDataset ? "규모 6.0 이상 지진을 규모 색상으로 표시합니다. 안전 알림이 아니라 과거 기록 탐구용입니다." : isMeteoDataset ? "5개 도시의 일자료를 점분포와 목록으로 비교합니다. 재분석 자료이며 관측소 공식값과 구분합니다." : isGbifDataset ? "국내 발생 기록을 점분포와 목록으로 표시합니다. 레코드별 라이선스·제공자를 함께 기록합니다." : undefined} searchPlaceholder={isQuakeDataset ? "예: Japan" : isMeteoDataset ? "예: 서울" : isGbifDataset ? "예: 2024" : undefined} countUnit={isQuakeDataset ? "건" : isMeteoDataset ? "행" : isGbifDataset ? "건" : undefined} tableOverride={quakeTableModel ?? meteoTableModel ?? gbifTableModel} provenanceOverride={quakeProvenance ?? meteoProvenance ?? gbifProvenance} />}
      {isProfileDataset && <ElevationProfile datasetTitle={dataset?.title ?? ""} sourceUrl={dataset?.sourceUrl ?? ""} status={snapshotStatus} snapshot={snapshotDataset.snapshot} observations={poiObservations} error={snapshotDataset.error ?? activeBoundaryError} exportSlug={datasetKey} />}
      {!isThreeD && isDomestic && forecast && <ForecastPanel result={forecast} onClose={() => setForecast(null)} />}
      {!isThreeD && isDomestic && <MaterialExportActions targetRef={mapExportRef} fileName="geolab-2d-map" />}
    </div>
  );
}

export function ChartCreatePage() {
  return (
    <div className="page-stack">
      <section className="page-intro page-intro--with-back">
        <div><Link className="back-link" to="/create">← 자료 유형 선택</Link><p className="eyebrow">MATERIAL STUDIO / CHART</p><h1>통계·차트자료 제작</h1><p>시계열·지역 비교·지표 간 관계를 학습자가 읽고 설명할 수 있도록 구성합니다.</p></div>
        <span className="dimension-mark dimension-mark--chart">CHART</span>
      </section>
      <ClimateComparison />
    </div>
  );
}
