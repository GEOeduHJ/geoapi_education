import {
  type PublicKosisDataset,
  type PublicGeoObservation,
  type PublicSourceSnapshot,
} from "../lib/geo-observations";

export type KosisPanelStatus = "idle" | "loading" | "ready" | "empty" | "error";

function formatDate(value: string | null): string {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatValue(observation: PublicGeoObservation): string {
  if (observation.value !== null) {
    return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(observation.value);
  }
  const valueText = observation.attributes.value_text;
  return typeof valueText === "string" && valueText ? valueText : "-";
}

function observationLabel(observation: PublicGeoObservation): string {
  return observation.label || observation.region_code || "분류값 없음";
}

function snapshotRange(snapshot: PublicSourceSnapshot): string {
  if (snapshot.valid_from && snapshot.valid_to) return `${snapshot.valid_from} ~ ${snapshot.valid_to}`;
  return snapshot.valid_from || snapshot.valid_to || "기간 정보 없음";
}

function describeError(error: string | null): string {
  if (!error) return "공개 KOSIS snapshot을 불러오지 못했습니다.";
  if (error === "SUPABASE_NOT_CONFIGURED") return "브라우저용 Supabase 환경변수가 아직 연결되지 않았습니다.";
  if (/schema cache|relation .* does not exist|column .* does not exist/i.test(error)) {
    return "Supabase의 KOSIS 공개 읽기 구조가 아직 적용되지 않았습니다.";
  }
  return "공개 KOSIS snapshot을 읽는 중 문제가 발생했습니다.";
}

export function KosisPublicSnapshotPanel({
  status,
  dataset,
}: {
  status: KosisPanelStatus;
  dataset: PublicKosisDataset;
}) {
  const { snapshot, observations, truncated, error } = dataset;

  return (
    <section className="kosis-public-panel" aria-labelledby="kosis-public-snapshot-title">
      <div className="kosis-public-panel__heading">
        <div>
          <p className="eyebrow">PUBLIC SNAPSHOT / SUPABASE</p>
          <h4 id="kosis-public-snapshot-title">승인된 통계자료 상태</h4>
        </div>
        <span>읽기 전용</span>
      </div>

      {status === "idle" && <p className="kosis-public-panel__message" role="status">공개 snapshot 요청을 준비하는 중입니다…</p>}
      {status === "loading" && <p className="kosis-public-panel__message" role="status">공개 snapshot을 확인하는 중입니다…</p>}
      {status === "error" && (
        <div className="kosis-public-panel__message kosis-public-panel__message--error" role="alert">
          <strong>공개 자료를 준비하지 못했습니다.</strong>
          <span>{describeError(error)}</span>
          <small>`0005_kosis_observation_access.sql` 실행 여부와 `is_public=true` 적재 상태를 확인하세요.</small>
        </div>
      )}
      {status === "empty" && (
        <div className="kosis-public-panel__message" role="status">
          <strong>공개 snapshot이 아직 없습니다.</strong>
          <span>관리자가 표·범위·출처를 확인한 뒤 controlled ingest를 실행하면 이곳에 표시됩니다.</span>
        </div>
      )}
      {status === "ready" && snapshot && (
        <>
          <dl className="kosis-public-panel__meta">
            <div><dt>저장 행</dt><dd>{(snapshot.row_count ?? observations.length).toLocaleString("ko-KR")}개</dd></div>
            <div><dt>자료 기간</dt><dd>{snapshotRange(snapshot)}</dd></div>
            <div><dt>수집 시각</dt><dd>{formatDate(snapshot.fetched_at)}</dd></div>
            <div><dt>검증 checksum</dt><dd>{snapshot.checksum ? `${snapshot.checksum.slice(0, 12)}…` : "없음"}</dd></div>
          </dl>
          <div className="kosis-public-panel__rows" aria-label="공개 KOSIS 관측값 일부">
            <div className="kosis-public-panel__rows-heading"><strong>공개값 일부</strong><span>{observations.length.toLocaleString("ko-KR")}개 읽음</span></div>
            {observations.slice(0, 6).map((observation) => (
              <div className="kosis-public-panel__row" key={observation.id}>
                <span>{observationLabel(observation)}</span>
                <small>{observation.observed_at ? formatDate(observation.observed_at) : "시점 없음"}</small>
                <strong>{formatValue(observation)}{observation.unit ? ` ${observation.unit}` : ""}</strong>
              </div>
            ))}
            {observations.length === 0 && <p className="kosis-public-panel__message">snapshot 메타데이터는 있으나 관측값이 없습니다.</p>}
            {truncated && <small className="kosis-public-panel__notice">공개 읽기 상한 {observations.length.toLocaleString("ko-KR")}개까지만 표시합니다.</small>}
          </div>
          <div className="kosis-public-panel__note">
            <strong>2D 경계 연결 대기</strong>
            <span>KOSIS 값에는 geometry가 없으므로 지역코드를 SGIS/VWorld 행정구역 경계와 조인한 뒤 단계구분도로 표현합니다.</span>
          </div>
        </>
      )}
    </section>
  );
}
