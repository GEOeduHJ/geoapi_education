import { Link } from "react-router-dom";
import { ApiBadge } from "../components/ApiBadge";
import { SourceCard } from "../components/SourceCard";
import { apiRegistry } from "../lib/api/registry";

export function HomePage() {
  const p0 = apiRegistry.filter((api) => api.priority === "P0");
  const dbFirst = apiRegistry.filter((api) => api.storage === "DB화");

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">GEOLAB CLASSROOM · PHASE 0</p>
          <h1>지리 자료를 만들고,<br />자료로 다시 질문합니다.</h1>
          <p className="hero-description">
            공공 API를 그대로 소비하는 데서 멈추지 않고, 출처가 보존된 자료를 제작한 뒤
            지도·통계·기후 자료를 근거로 탐구하는 수업 플랫폼입니다.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/create">자료 제작 시작</Link>
            <Link className="button button-secondary" to="/inquiry">탐구 학습 보기</Link>
          </div>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit orbit-one"><span>DATA</span></div>
          <div className="orbit orbit-two"><span>PLACE</span></div>
          <div className="orbit orbit-three"><span>QUESTION</span></div>
          <div className="orbit-core">G</div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TWO LEARNING MODES</p>
            <h2>하나의 데이터 기반, 두 개의 학습 세션</h2>
          </div>
          <p>제작자는 자료의 구조를 설계하고, 학습자는 자료의 의미와 한계를 탐구합니다.</p>
        </div>
        <div className="mode-grid">
          <Link className="mode-card mode-card--create" to="/create">
            <span className="mode-number">01</span>
            <div>
              <p className="eyebrow">MATERIAL STUDIO</p>
              <h3>자료 제작 세션</h3>
              <p>2D 지도, 3D 지형, 통계 차트를 수업 목표와 함께 설계합니다.</p>
            </div>
            <span className="card-arrow">↗</span>
          </Link>
          <Link className="mode-card mode-card--inquiry" to="/inquiry">
            <span className="mode-number">02</span>
            <div>
              <p className="eyebrow">INQUIRY FIELD</p>
              <h3>자료 활용·탐구 학습</h3>
              <p>관계 맺기부터 전이하기까지, 자료를 근거로 질문을 발전시킵니다.</p>
            </div>
            <span className="card-arrow">↗</span>
          </Link>
        </div>
      </section>

      <section className="stat-strip">
        <div><strong>{p0.length}</strong><span>MVP 핵심 API</span></div>
        <div><strong>{dbFirst.length}</strong><span>사전 DB화 우선</span></div>
        <div><strong>2D / 3D</strong><span>분리된 지도 경로</span></div>
        <div><strong>6단계</strong><span>개념기반 탐구 흐름</span></div>
      </section>

      <section className="section-block">
        <div className="section-heading section-heading--compact">
          <div>
            <p className="eyebrow">DATA POLICY</p>
            <h2>호출보다 먼저, 출처와 저장 전략</h2>
          </div>
          <Link className="text-link" to="/status">환경·API 상태 보기 ↗</Link>
        </div>
        <div className="policy-grid">
          <div className="policy-card">
            <ApiBadge tone="teal">DB화</ApiBadge>
            <h3>축적된 과거 데이터</h3>
            <p>KOSIS, 기상청 ASOS, Open-Meteo, World Bank 자료는 스냅샷·메타데이터와 함께 저장해 재사용합니다.</p>
          </div>
          <div className="policy-card">
            <ApiBadge tone="navy">캐시</ApiBadge>
            <h3>변화가 빠른 자료</h3>
            <p>예보·대기질·지진·주소 검색은 TTL과 호출량을 관리하고 학습 세션 시점의 응답을 고정합니다.</p>
          </div>
          <div className="policy-card">
            <ApiBadge tone="amber">실시간</ApiBadge>
            <h3>지도 인터랙션</h3>
            <p>VWorld 2D와 3D는 각각 독립된 렌더링 경로로 구성해 학습 목적에 맞는 공간 조작을 제공합니다.</p>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading section-heading--compact">
          <div>
            <p className="eyebrow">MVP REGISTRY</p>
            <h2>우선 연결할 데이터 소스</h2>
          </div>
          <ApiBadge>{p0.length} sources</ApiBadge>
        </div>
        <div className="source-grid">
          {p0.slice(0, 6).map((api) => <SourceCard key={api.id} definition={api} />)}
        </div>
      </section>
    </div>
  );
}

