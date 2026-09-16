import { ApiBadge } from "../components/ApiBadge";
import { apiRegistry } from "../lib/api/registry";
import { hasSupabaseClientConfig, hasVWorldClientConfig, hasVWorldRegisteredDomain, publicEnv, resolveVWorldDomain } from "../lib/env";

export function StatusPage() {
  const p0 = apiRegistry.filter((api) => api.priority === "P0");
  const vworldDomain = resolveVWorldDomain();

  return (
    <div className="page-stack">
      <section className="page-intro">
        <p className="eyebrow">SYSTEM STATUS</p>
        <h1>연결 상태와 이용 조건</h1>
        <p>비밀키 값은 화면에 표시하지 않습니다. 브라우저에서 필요한 VWorld·Supabase 설정과 서버 스모크 테스트 대상을 분리해 관리합니다.</p>
      </section>

      <section className="status-overview">
        <div className="status-card"><span className="status-dot status-dot--green" /><div><p className="eyebrow">RUNTIME MODE</p><strong>{publicEnv.apiMode}</strong><span>현재 프론트엔드 실행 모드</span></div></div>
        <div className="status-card"><span className={`status-dot ${hasVWorldRegisteredDomain ? "status-dot--green" : "status-dot--amber"}`} /><div><p className="eyebrow">VWORLD CLIENT</p><strong>{hasVWorldRegisteredDomain ? "등록 도메인 일치" : hasVWorldClientConfig ? "로컬 호스트 감지" : "추가 설정 필요"}</strong><span>현재 호스트: {vworldDomain || "미설정"}</span></div></div>
        <div className="status-card"><span className={`status-dot ${hasSupabaseClientConfig ? "status-dot--green" : "status-dot--amber"}`} /><div><p className="eyebrow">SUPABASE CLIENT</p><strong>{hasSupabaseClientConfig ? "설정됨" : "연결 대기"}</strong><span>Publishable key + RLS</span></div></div>
      </section>

      <section className="section-block">
        <div className="section-heading section-heading--compact"><div><p className="eyebrow">API REGISTRY</p><h2>MVP 연결 목록</h2></div><ApiBadge tone="teal">{p0.length} P0</ApiBadge></div>
        <div className="registry-table-wrap">
          <table className="registry-table"><thead><tr><th>소스</th><th>세션</th><th>인증</th><th>저장 전략</th><th>제한·조건</th><th>키 위치</th></tr></thead><tbody>{apiRegistry.map((api) => <tr key={api.id}><td><strong>{api.provider}</strong><span>{api.name}</span></td><td>{api.sessionUse.join(" · ")}</td><td>{api.auth}</td><td><ApiBadge tone={api.storage === "DB화" ? "teal" : api.storage === "실시간" ? "amber" : "muted"}>{api.storage}</ApiBadge></td><td className="limit-cell">{api.limit}</td><td><code>{api.keyEnv.length ? api.keyEnv.join(", ") : "키 불필요"}</code></td></tr>)}</tbody></table>
        </div>
      </section>

      <section className="callout callout--cool"><div><p className="eyebrow">NEXT REQUIRED INPUT</p><h2>다음 연결에 필요한 값</h2><p>로컬에서는 현재 브라우저 호스트를 VWorld domain 값으로 자동 사용합니다. Vercel 배포 후에는 등록된 운영 주소를 VITE_VWORLD_DOMAIN에 넣고, Supabase는 Publishable key·RLS로 연결합니다.</p></div><span className="callout-code">.env.local<br />→ Vercel env</span></section>
    </div>
  );
}
