import { Link, useLocation } from "react-router-dom";

const stages = [
  ["01", "관계 맺기", "나의 장소 경험과 자료를 연결"],
  ["02", "질문 초점화", "관찰을 탐구 가능한 질문으로 전환"],
  ["03", "조사하기", "필터·비교·측정으로 근거 수집"],
  ["04", "조직화", "지도·표·차트로 패턴 구조화"],
  ["05", "일반화하기", "공간적 관계와 조건 설명"],
  ["06", "전이하기", "새 장소·새 자료에 적용"],
];

const activityTypes = [
  { label: "지도 읽기", text: "분포·밀도·경계를 관찰하고 패턴을 말하기", to: "/inquiry/2d/map-reading" },
  { label: "공간 비교", text: "두 지역 또는 두 시점을 레이어로 비교하기", to: "/inquiry/2d/compare" },
  { label: "지형 탐색", text: "고도·경사·경관을 입체적으로 해석하기", to: "/inquiry/3d/terrain" },
  { label: "자료 제작 비평", text: "자료의 출처·단위·표현 한계를 검토하기", to: "/inquiry/chart/data-critique" },
];

export function InquiryPage() {
  const location = useLocation();
  const hasActivity = location.pathname !== "/inquiry";
  const dimension = location.pathname.includes("/3d") ? "3D" : location.pathname.includes("/2d") ? "2D" : "CHART";

  return (
    <div className="page-stack">
      <section className="page-intro">
        <p className="eyebrow">INQUIRY FIELD{hasActivity ? ` / ${dimension}` : ""}</p>
        <h1>{hasActivity ? `${dimension} 자료로 탐구하기` : "자료를 보고, 질문을 키웁니다."}</h1>
        <p>{hasActivity ? "정답을 찾는 대신 관찰한 근거와 설명의 범위를 기록합니다." : "자료의 패턴을 발견하고, 근거를 조직하고, 다른 장소에 적용하는 학습 흐름입니다."}</p>
      </section>

      {!hasActivity ? (
        <>
          <section className="stage-grid">
            {stages.map(([number, title, description], index) => (
              <div className={`stage-card ${index === 0 ? "is-current" : ""}`} key={number}>
                <span>{number}</span><h3>{title}</h3><p>{description}</p>
              </div>
            ))}
          </section>
          <section className="section-block">
            <div className="section-heading section-heading--compact"><div><p className="eyebrow">ACTIVITY LIBRARY</p><h2>탐구 유형을 선택하세요.</h2></div><span className="muted-copy">자료 유형과 질문 유형은 독립적으로 조합됩니다.</span></div>
            <div className="activity-list">
              {activityTypes.map((activity, index) => <Link className="activity-row" to={activity.to} key={activity.to}><span className="activity-index">0{index + 1}</span><div><strong>{activity.label}</strong><p>{activity.text}</p></div><span className="card-arrow">↗</span></Link>)}
            </div>
          </section>
        </>
      ) : (
        <ActivityWorkspace dimension={dimension} />
      )}
    </div>
  );
}

function ActivityWorkspace({ dimension }: { dimension: "2D" | "3D" | "CHART" }) {
  const questions = dimension === "3D"
    ? ["어떤 지형 요소가 시야와 이동 경로를 바꾸는가?", "입체 표현이 평면 지도보다 잘 보여주는 관계는 무엇인가?", "이 설명을 다른 도시의 지형에도 적용할 수 있는가?"]
    : dimension === "2D"
      ? ["어디에 집중 또는 공백이 나타나는가?", "두 레이어의 분포가 함께 변하는 장소는 어디인가?", "이 패턴을 만든 자연·사회적 조건은 무엇인가?"]
      : ["지표의 단위와 시간 범위는 무엇인가?", "표현 방식이 해석에 어떤 영향을 주는가?", "이 자료로 말할 수 없는 것은 무엇인가?"];

  return (
    <>
      <div className="activity-banner"><div><p className="eyebrow">ACTIVITY IN PROGRESS</p><h2>{dimension} 자료 관찰 카드</h2><p>관찰 → 근거 표시 → 설명 → 전이의 순서로 응답을 남겨보세요.</p></div><span className={`dimension-mark dimension-mark--${dimension.toLowerCase()}`}>{dimension}</span></div>
      <section className="inquiry-workspace">
        <div className={`inquiry-visual inquiry-visual--${dimension.toLowerCase()}`}><div className="map-stage__grid" /><div className="visual-label">{dimension} DATA SNAPSHOT</div><div className="visual-crosshair">＋</div></div>
        <div className="question-panel"><p className="eyebrow">03 · 조사하기</p><h3>자료에서 근거를 찾아보세요.</h3>{questions.map((question, index) => <label className="question-item" key={question}><input type="checkbox" /><span><b>Q{index + 1}</b>{question}</span></label>)}<textarea placeholder="관찰한 위치·값·패턴과 그 근거를 기록하세요." rows={5} /><button className="button button-primary button-full" type="button">관찰 기록 저장</button></div>
      </section>
      <Link className="back-link" to="/inquiry">← 다른 탐구 유형 선택</Link>
    </>
  );
}

