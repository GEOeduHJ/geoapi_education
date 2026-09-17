import type { BoundaryJoinResult } from "../lib/geo-join";

function describeError(error: string | null): string {
  if (error === "SUPABASE_NOT_CONFIGURED") return "브라우저용 Supabase 환경변수가 아직 연결되지 않았습니다.";
  if (error === "SGIS_BOUNDARY_REQUEST_FAILED" || error === "SGIS_NOT_CONFIGURED") {
    return "SGIS 행정구역 경계를 읽지 못해 지역코드 결합을 판단할 수 없습니다.";
  }
  if (error && /schema cache|relation .* does not exist|column .* does not exist/i.test(error)) {
    return "Supabase의 KOSIS 공개 읽기 구조가 아직 적용되지 않았습니다.";
  }
  return "공개값 또는 행정경계를 읽지 못해 결합을 판단할 수 없습니다.";
}

export function KosisBoundaryJoinStatusPanel({
  result,
  loading,
  error,
  providerLabel = "KOSIS",
}: {
  result: BoundaryJoinResult;
  loading: boolean;
  error: string | null;
  providerLabel?: string;
}) {
  return (
    <section className="kosis-join-panel" aria-labelledby="kosis-join-panel-title">
      <div className="kosis-join-panel__heading">
        <div>
          <p className="eyebrow">{providerLabel} × BOUNDARY / EXACT CODE JOIN</p>
          <h4 id="kosis-join-panel-title">지도값 결합 상태</h4>
        </div>
        <span>{result.status === "ready" ? "색상 표시" : "색상 보류"}</span>
      </div>

      {loading && <p className="kosis-join-panel__message" role="status">공개값과 행정경계를 함께 확인하는 중입니다…</p>}
      {!loading && error && (
        <div className="kosis-join-panel__message kosis-join-panel__message--error" role="alert">
          <strong>값 결합을 판단하지 못했습니다.</strong>
          <span>{describeError(error)}</span>
        </div>
      )}
      {!loading && !error && result.status === "no-boundaries" && (
        <p className="kosis-join-panel__message" role="status">SGIS 경계가 준비되면 지역코드 결합을 시작합니다.</p>
      )}
      {!loading && !error && result.status === "no-public-values" && (
        <div className="kosis-join-panel__message" role="status">
          <strong>공개 통계값이 없어 기준경계만 표시합니다.</strong>
          <span>Supabase에 공개된 KOSIS snapshot이 적재되면 정확한 지역코드 결합을 다시 검사합니다.</span>
        </div>
      )}
      {!loading && !error && result.status === "ambiguous-values" && (
        <div className="kosis-join-panel__message kosis-join-panel__message--warning" role="status">
          <strong>지역별 값이 하나로 확정되지 않아 색채지도를 보류합니다.</strong>
          <span>기간·단위가 섞였거나 한 지역에 여러 숫자값이 있습니다. 먼저 표의 분류·항목·시점을 하나로 고정하세요.</span>
          {result.ambiguousCodes.length > 0 && <small>중복 지역코드: {result.ambiguousCodes.slice(0, 6).join(", ")}</small>}
          {result.periods.length > 1 && <small>확인된 시점: {result.periods.slice(0, 4).join(", ")}</small>}
          {result.units.length > 1 && <small>확인된 단위: {result.units.slice(0, 4).join(", ")}</small>}
        </div>
      )}
      {!loading && !error && result.status === "no-code-matches" && (
        <div className="kosis-join-panel__message kosis-join-panel__message--warning" role="status">
          <strong>{providerLabel} 지역코드와 경계코드가 일치하지 않습니다.</strong>
          <span>지역명으로 추정해 연결하지 않습니다. {providerLabel} 분류코드와 경계 `adm_cd` 대응표를 먼저 확인하세요.</span>
          {result.unmatchedObservationCodes.length > 0 && <small>일치하지 않은 코드: {result.unmatchedObservationCodes.slice(0, 6).join(", ")}</small>}
        </div>
      )}
      {!loading && !error && result.status === "ready" && (
        <div className="kosis-join-panel__message kosis-join-panel__message--ready" role="status">
          <strong>정확히 일치한 지역 {result.matchedCount}개 — 단계구분도 표시 조건 충족</strong>
          <span>코드가 같은 값만 결합했습니다. 경계가 비어 있는 지역은 {result.missingBoundaryCount}개입니다.</span>
          <small>{result.periods.join(", ")} · {result.units.join(", ")}</small>
          {result.crosswalk.length > 0 && <small>공식 대응표 적용: {result.crosswalk.map((entry) => `${entry.from}→${entry.to}`).join(", ")}</small>}
        </div>
      )}

      <p className="kosis-join-panel__notice">행정구역 이름으로 추정하지 않고, {providerLabel} `region_code`와 경계 `adm_cd`가 정확히 같거나 공식 대응표로 확인된 경우만 결합합니다.</p>
    </section>
  );
}
