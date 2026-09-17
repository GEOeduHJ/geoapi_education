import type { Provenance } from "../lib/data-contract";

function formatPercent(ratio: number): string {
  const percent = ratio * 100;
  if (percent > 0 && percent < 1) return "<1%";
  return `${percent.toFixed(percent === 100 ? 0 : 1)}%`;
}

export function ProvenancePanel({ provenance }: { provenance: Provenance }) {
  const isPartialPeriod = provenance.actualPeriod.from !== provenance.requestedPeriod.from
    || provenance.actualPeriod.to !== provenance.requestedPeriod.to;

  return (
    <section className="provenance-panel" aria-labelledby="provenance-panel-title">
      <div className="provenance-panel__heading">
        <div>
          <p className="eyebrow">PROVENANCE</p>
          <h4 id="provenance-panel-title">{provenance.datasetTitle}</h4>
        </div>
        <span>{provenance.provider}</span>
      </div>
      <div className="provenance-panel__grid">
        <div>
          <span>신청 기간</span>
          <strong>{provenance.requestedPeriod.from} ~ {provenance.requestedPeriod.to}</strong>
        </div>
        <div>
          <span>실제 자료 범위</span>
          <strong>{provenance.actualPeriod.from} ~ {provenance.actualPeriod.to}</strong>
        </div>
        <div>
          <span>단위</span>
          <strong>{provenance.unit}</strong>
        </div>
        <div>
          <span>관측치 수</span>
          <strong>{provenance.observationCount !== undefined ? provenance.observationCount.toLocaleString("ko-KR") : "-"}</strong>
        </div>
        <div>
          <span>결측률</span>
          <strong>{provenance.missingRatio !== undefined ? formatPercent(provenance.missingRatio) : "결측 없음"}</strong>
        </div>
        <div>
          <span>snapshot ID</span>
          <strong>{provenance.snapshotId ?? "-"}</strong>
        </div>
      </div>
      {isPartialPeriod && <p className="provenance-panel__notice"><strong>선택한 기간과 실제 자료 범위가 다릅니다.</strong> 위 "실제 자료 범위"를 기준으로 값이 계산되었습니다.</p>}
      <p className="provenance-panel__source">출처: <a href={provenance.sourceUrl} target="_blank" rel="noreferrer">{provenance.sourceUrl}</a></p>
    </section>
  );
}
