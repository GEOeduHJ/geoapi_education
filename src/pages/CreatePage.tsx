import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClimateComparison } from "../components/ClimateComparison";
import { KosisPublicSnapshotPanel } from "../components/KosisPublicSnapshotPanel";
import { KosisTableSearch } from "../components/KosisTableSearch";
import { SgisBoundaryStatusPanel, type SgisBoundaryPanelStatus } from "../components/SgisBoundaryStatusPanel";
import { VWorld2DMap } from "../components/VWorld2DMap";
import { fetchSgisBoundaries, type SgisBoundaryResponse } from "../lib/sgis";

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

export function MapCreatePage({ dimension }: { dimension: "2D" | "3D" }) {
  const isThreeD = dimension === "3D";
  const [source, setSource] = useState("kma-hub");
  const [sgisBoundaryStatus, setSgisBoundaryStatus] = useState<SgisBoundaryPanelStatus>("idle");
  const [sgisBoundaries, setSgisBoundaries] = useState<SgisBoundaryResponse | null>(null);
  const [sgisBoundaryError, setSgisBoundaryError] = useState<string | null>(null);

  useEffect(() => {
    if (isThreeD || source !== "kosis") {
      setSgisBoundaryStatus("idle");
      setSgisBoundaries(null);
      setSgisBoundaryError(null);
      return;
    }

    let cancelled = false;
    setSgisBoundaryStatus("loading");
    setSgisBoundaries(null);
    setSgisBoundaryError(null);

    fetchSgisBoundaries({ year: 2025, admCd: "non", lowSearch: 1 }).then((result) => {
      if (cancelled) return;
      setSgisBoundaries(result.data);
      setSgisBoundaryError(result.error);
      setSgisBoundaryStatus(result.error ? "error" : "ready");
    }).catch(() => {
      if (cancelled) return;
      setSgisBoundaryStatus("error");
      setSgisBoundaryError("SGIS_BOUNDARY_REQUEST_FAILED");
    });

    return () => { cancelled = true; };
  }, [isThreeD, source]);

  return (
    <div className="page-stack">
      <section className="page-intro page-intro--with-back">
        <div>
          <Link className="back-link" to="/create">← 자료 유형 선택</Link>
          <p className="eyebrow">MATERIAL STUDIO / {dimension}</p>
          <h1>{dimension} 지도자료 제작</h1>
          <p>{isThreeD ? "지형·고도·도시 경관을 입체적으로 배치하고 관찰 가능한 질문을 설계합니다." : "분포·밀도·접근성·변화를 레이어와 범례로 표현하고 설명 가능한 지도를 설계합니다."}</p>
        </div>
        <span className={`dimension-mark dimension-mark--${dimension.toLowerCase()}`}>{dimension}</span>
      </section>

      <WorkspaceNotice
        dimension={dimension}
        description={isThreeD ? "VWorld WebGL 3D 초기화 계약과 고도 데이터 어댑터를 연결할 자리입니다." : "VWorld 2D 배경에 KMA ASOS 관측소와 SGIS 기준경계를 올려 공간 기준을 확인합니다. KOSIS 지역코드 대응표를 검증한 뒤 값 기반 주제 레이어를 연결합니다."}
      />

      <section className="workspace-grid">
        {isThreeD ? (
          <div className="map-stage map-stage--empty">
            <div className="map-stage__grid" />
            <div className="map-stage__center">
              <span className="map-stage__pin">＋</span>
              <strong>3D 렌더러 연결 대기</strong>
              <p>다음 단계에서 VWorld WebGL 3D와 고도 데이터 어댑터를 연결합니다.</p>
            </div>
            <div className="map-controls"><button type="button">＋</button><button type="button">−</button><button type="button">⌖</button></div>
          </div>
        ) : (
          <div className="map-stage map-stage--live">
            <VWorld2DMap boundaries={source === "kosis" ? sgisBoundaries : null} />
          </div>
        )}
        <aside className="workspace-sidebar">
          <div className="sidebar-section">
            <p className="eyebrow">01 · DATA SOURCE</p>
            <h3>자료 소스 선택</h3>
            <label className="field-label" htmlFor="source-select">기본 데이터</label>
            <select id="source-select" value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="kosis">KOSIS 통계</option>
              <option value="sgis-data">SGIS 공간통계</option>
              <option value="kma-hub">기상청 ASOS</option>
              <option value="world-bank">World Bank</option>
              <option value="opentopodata">OpenTopoData 고도</option>
            </select>
            {source === "kosis" && <KosisTableSearch />}
            {!isThreeD && source === "kosis" && <KosisPublicSnapshotPanel />}
            {!isThreeD && source === "kosis" && <SgisBoundaryStatusPanel status={sgisBoundaryStatus} data={sgisBoundaries} error={sgisBoundaryError} />}
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
