import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Climate2DWorkspace, DEFAULT_CLIMATE_FROM, DEFAULT_CLIMATE_TO, useClimateDataset } from "../components/Climate2DWorkspace";
import { ClimateComparison } from "../components/ClimateComparison";
import { DatasetSelector } from "../components/DatasetSelector";
import { MaterialExportActions } from "../components/MaterialExportActions";
import { KosisPublicSnapshotPanel, type KosisPanelStatus } from "../components/KosisPublicSnapshotPanel";
import { KosisBoundaryJoinStatusPanel } from "../components/KosisBoundaryJoinStatusPanel";
import { SgisBoundaryStatusPanel, type SgisBoundaryPanelStatus } from "../components/SgisBoundaryStatusPanel";
import { VWorld2DMap } from "../components/VWorld2DMap";
import { useDatasetCatalog, type DatasetScope } from "../lib/dataset-catalog";
import { lawCodeToSgisAdmCds, type ClimateMetric } from "../lib/climate";
import { fetchLatestPublicKosisDataset, type PublicKosisDataset } from "../lib/geo-observations";
import { joinKosisObservationsToSgisBoundaries, type BoundaryJoinValue } from "../lib/geo-join";
import { KOSIS_SGG_TO_SGIS_ADM_CD } from "../lib/kosis-crosswalk";
import { fetchSgisBoundaries, buildDomesticSidoBoundaryQuery, type SgisBoundaryResponse } from "../lib/sgis";
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
  const [kosisStatus, setKosisStatus] = useState<KosisPanelStatus>("idle");
  const [kosisDataset, setKosisDataset] = useState<PublicKosisDataset>(EMPTY_PUBLIC_KOSIS_DATASET);
  const mapExportRef = useRef<HTMLDivElement | null>(null);
  const datasets = useDatasetCatalog(scope);
  const dataset = datasets.find((entry) => entry.key === datasetKey) ?? null;
  const isKma = datasetKey === "kma-asos-climate-10y";
  const isKosis = datasetKey === "kosis-sido-city-park-per-capita";
  const climateState = useClimateDataset(metric, from, to, undefined, isKma && !isThreeD);

  useEffect(() => {
    setDatasetKey(isDomestic ? "kma-asos-climate-10y" : "world-bank-population-density");
    setBoundaryCode("");
  }, [isDomestic]);

  useEffect(() => {
    if (isThreeD || !isDomestic) {
      setSgisBoundaryStatus("idle");
      setSgisBoundaries(null);
      setSgisBoundaryError(null);
      setKosisStatus("idle");
      setKosisDataset(EMPTY_PUBLIC_KOSIS_DATASET);
      return;
    }

    let cancelled = false;
    setSgisBoundaryStatus("loading");
    setSgisBoundaries(null);
    setSgisBoundaryError(null);
    if (isKosis) {
      setKosisStatus("loading");
      setKosisDataset(EMPTY_PUBLIC_KOSIS_DATASET);
    } else {
      setKosisStatus("idle");
      setKosisDataset(EMPTY_PUBLIC_KOSIS_DATASET);
    }

    const load = async () => {
      const boundaryResult = await fetchSgisBoundaries(buildDomesticSidoBoundaryQuery());
      if (cancelled) return;
      setSgisBoundaries(boundaryResult.data);
      setSgisBoundaryError(boundaryResult.error);
      setSgisBoundaryStatus(boundaryResult.error ? "error" : "ready");
      if (!isKosis) return;
      const kosisResult = await fetchLatestPublicKosisDataset();
      if (cancelled) return;
      setKosisDataset(kosisResult);
      setKosisStatus(kosisResult.error ? "error" : kosisResult.snapshot ? "ready" : "empty");
    };
    load().catch(() => {
      if (cancelled) return;
      setSgisBoundaryStatus("error");
      setSgisBoundaryError("SGIS_BOUNDARY_REQUEST_FAILED");
      if (isKosis) {
        setKosisStatus("error");
        setKosisDataset({ ...EMPTY_PUBLIC_KOSIS_DATASET, error: "PUBLIC_KOSIS_READ_FAILED" });
      }
    });
    return () => { cancelled = true; };
  }, [isDomestic, isKosis, isThreeD]);

  const visibleBoundaries = useMemo<SgisBoundaryResponse | null>(() => {
    if (!sgisBoundaries || !boundaryCode) return sgisBoundaries;
    return {
      ...sgisBoundaries,
      data: {
        ...sgisBoundaries.data,
        features: sgisBoundaries.data.features.filter((feature) => feature.properties.adm_cd === boundaryCode),
      },
    };
  }, [boundaryCode, sgisBoundaries]);

  const boundaryJoin = useMemo(
    () => joinKosisObservationsToSgisBoundaries(visibleBoundaries, kosisDataset.observations, { codeMap: KOSIS_SGG_TO_SGIS_ADM_CD }),
    [kosisDataset.observations, visibleBoundaries],
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
    for (const feature of sgisBoundaries?.data.features ?? []) {
      const code = feature.properties.adm_cd?.trim();
      if (code && feature.properties.adm_nm) names[code] = feature.properties.adm_nm;
    }
    return names;
  }, [sgisBoundaries]);

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

  const boundaryOptions = sgisBoundaries?.data.features ?? [];
  const selectedBoundaryName = boundaryOptions.find((feature) => feature.properties.adm_cd === boundaryCode)?.properties.adm_nm;

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
          <div className="map-stage map-stage--empty">
            <div className="map-stage__grid" />
            <div className="map-stage__center"><span className="map-stage__pin">＋</span><strong>3D 렌더러 연결 대기</strong><p>2D 국내·세계 지도에서 실제 자료의 지도·그래프·표 계약을 먼저 완성합니다.</p></div>
            <div className="map-controls"><button type="button">＋</button><button type="button">−</button><button type="button">⌖</button></div>
          </div>
        ) : isDomestic ? (
          <div className="map-stage map-stage--live" ref={mapExportRef}>
            <VWorld2DMap
              boundaries={visibleBoundaries}
              boundaryValues={
                isKosis && boundaryJoin.status === "ready" ? boundaryJoin.values :
                isKma && kmaAggregatedBoundaryValues ? kmaAggregatedBoundaryValues :
                null
              }
              boundaryValueLabel={isKosis ? "KOSIS 값" : isKma ? "KMA 경계별 평균" : "경계값"}
              stationValues={null}
              visibleStationIds={[]}
              showStations={false}
            />
          </div>
        ) : (
          <div className="map-stage map-stage--empty map-stage--planned"><div className="map-stage__grid" /><div className="map-stage__center"><span className="map-stage__pin">◎</span><strong>세계 2D 데이터셋 준비 중</strong><p>World Bank 국가 geometry와 지표 snapshot을 연결하면 이 공간에서 단계구분도를 제공합니다.</p></div></div>
        )}
        <aside className="workspace-sidebar">
          <div className="sidebar-section">
            <p className="eyebrow">01 · DATASET</p>
            <h3>{scope === "domestic" ? "국내 자료 선택" : "세계 자료 선택"}</h3>
            <DatasetSelector scope={scope} value={datasetKey} onChange={(next) => { setDatasetKey(next); setBoundaryCode(""); }} />
            {dataset?.status === "planned" && <div className="dataset-planned-message" role="status"><strong>이 데이터셋은 아직 공개 자료로 전환되지 않았습니다.</strong><span>관리자가 원자료 범위·코드·출처를 확인하고 snapshot을 공개하면 지도·그래프·표가 활성화됩니다.</span></div>}
            {!isThreeD && isKosis && <KosisPublicSnapshotPanel status={kosisStatus} dataset={kosisDataset} />}
            {!isThreeD && isKosis && <SgisBoundaryStatusPanel status={sgisBoundaryStatus} data={sgisBoundaries} error={sgisBoundaryError} />}
            {!isThreeD && isKosis && <KosisBoundaryJoinStatusPanel result={boundaryJoin} loading={kosisStatus === "loading" || sgisBoundaryStatus === "loading"} error={kosisDataset.error ?? sgisBoundaryError} />}
          </div>
          {!isThreeD && isDomestic && (
            <div className="sidebar-section">
              <p className="eyebrow">02 · GEOGRAPHY FILTER</p>
              <h3>시도 경계 범위</h3>
              <label className="field-label" htmlFor="boundary-filter">지도에 표시할 시도</label>
              <select id="boundary-filter" value={boundaryCode} onChange={(event) => setBoundaryCode(event.target.value)} disabled={sgisBoundaryStatus !== "ready"}>
                <option value="">전체 시도 · {boundaryOptions.length || "-"}개</option>
                {boundaryOptions.map((feature) => <option key={feature.properties.adm_cd ?? feature.properties.adm_nm} value={feature.properties.adm_cd ?? ""}>{feature.properties.adm_nm ?? feature.properties.adm_cd ?? "이름 없음"}</option>)}
              </select>
              <small className="field-help">{boundaryCode ? `${selectedBoundaryName ?? boundaryCode}만 지도·범례·자료표 범위에 반영합니다.` : "전체 시도를 표시합니다. 특정 시도를 고르면 KMA 지점과 KOSIS 값도 같은 범위로 제한합니다."}</small>
              <small className="field-help">국내 2D는 시도 단위로 고정합니다. 시군구·행정동은 값 원천과 코드 대응표가 확보될 때까지 지원하지 않습니다.</small>
              {sgisBoundaryStatus === "loading" && <small className="field-help">SGIS 경계 목록을 불러오는 중입니다…</small>}
              {sgisBoundaryError && <small className="field-help field-help--error">경계 목록을 읽지 못했습니다.</small>}
            </div>
          )}
          <div className="sidebar-section">
            <p className="eyebrow">03 · REPRESENTATION</p>
            <h3>표현 규칙</h3>
            <div className="control-row"><span>범례 자동 제안</span><button className="toggle is-on" type="button" aria-label="범례 자동 제안 켜짐"><i /></button></div>
            <div className="control-row"><span>학습자 조작 허용</span><button className="toggle is-on" type="button" aria-label="학습자 조작 허용 켜짐"><i /></button></div>
            <div className="control-row"><span>출처 패널 표시</span><button className="toggle is-on" type="button" aria-label="출처 패널 표시 켜짐"><i /></button></div>
          </div>
          <div className="sidebar-section sidebar-section--last">
            <p className="eyebrow">04 · INQUIRY LINK</p>
            <h3>활동 연결</h3>
            <p className="muted-copy">자료 저장 후 관찰·비교·설명·일반화 질문을 연결할 수 있습니다.</p>
            <button className="button button-primary button-full" type="button">자료 저장 준비</button>
          </div>
        </aside>
      </section>
      {!isThreeD && isDomestic && isKma && <Climate2DWorkspace metric={metric} from={from} to={to} onMetricChange={setMetric} onFromChange={setFrom} onToChange={setTo} state={climateViewState} />}
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
