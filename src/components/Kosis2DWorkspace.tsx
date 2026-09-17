import { useMemo, useRef, useState } from "react";
import { MaterialExportActions } from "./MaterialExportActions";
import { ProvenancePanel } from "./ProvenancePanel";
import type { KosisPanelStatus } from "./KosisPublicSnapshotPanel";
import type { BoundaryJoinResult } from "../lib/geo-join";
import type { PublicSourceSnapshot } from "../lib/geo-observations";
import {
  toKosisChartSpec,
  toKosisNormalizedRecords,
  toKosisProvenance,
  toKosisTableModel,
} from "../lib/kosis-adapter";
import { exportTableAsCsv } from "../lib/material-export";

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function Kosis2DWorkspace({
  datasetTitle,
  sourceUrl,
  status,
  snapshot,
  joinResult,
  boundaryNames,
  error,
  availableYears,
  selectedYear,
  onYearChange,
  exportSlug,
}: {
  datasetTitle: string;
  sourceUrl: string;
  status: KosisPanelStatus;
  snapshot: PublicSourceSnapshot | null;
  joinResult: BoundaryJoinResult;
  boundaryNames: Record<string, string>;
  error: string | null;
  availableYears: string[];
  selectedYear: string;
  onYearChange: (year: string) => void;
  exportSlug: string;
}) {
  const exportRef = useRef<HTMLElement | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");

  const records = useMemo(
    () => (joinResult.status === "ready" ? toKosisNormalizedRecords(joinResult.values, boundaryNames) : []),
    [joinResult, boundaryNames],
  );
  const chartSpec = useMemo(() => toKosisChartSpec(records), [records]);
  const tableModel = useMemo(() => toKosisTableModel(records), [records]);
  const provenance = useMemo(
    () => toKosisProvenance(snapshot, records, datasetTitle, sourceUrl, selectedYear || undefined),
    [snapshot, records, datasetTitle, sourceUrl, selectedYear],
  );

  const values = chartSpec.records.map((record) => chartSpec.yField(record));
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const span = maxValue - minValue || 1;
  const unit = records[0]?.unit ?? "";

  async function handleExportCsv() {
    await exportTableAsCsv(tableModel, `geolab-2d-${exportSlug}`);
  }

  const showResults = status === "ready" && joinResult.status === "ready" && records.length > 0;

  return (
    <section className="climate-2d-workspace" ref={exportRef} aria-labelledby="kosis-2d-title">
      <div className="climate-2d-workspace__heading">
        <div>
          <p className="eyebrow">KOSIS · 2D DATA VIEW</p>
          <h2 id="kosis-2d-title">시도별 통계자료 표현</h2>
          <p>지도와 같은 조회 조건(공개 snapshot·시도 경계)을 순위 그래프·자료표에 적용합니다. 단일 지표·단일 시점 snapshot만 사용합니다.</p>
        </div>
        <span className="climate-badge">{status === "ready" ? "공개 snapshot" : "DB 조회"}</span>
      </div>

      <div className="climate-2d-controls" data-export-ignore="true" aria-label="2D 통계자료 보기 방식">
        <label><span>연도</span><select value={selectedYear} onChange={(event) => onYearChange(event.target.value)} disabled={availableYears.length === 0}>{availableYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        <label><span>보조 표현</span><select value={view} onChange={(event) => setView(event.target.value as "chart" | "table")}><option value="chart">그래프</option><option value="table">표</option></select></label>
      </div>

      <MaterialExportActions targetRef={exportRef} fileName={`geolab-2d-${exportSlug}`} onExportCsv={showResults ? handleExportCsv : undefined} />

      {status === "loading" && <div className="climate-message" role="status">저장된 통계자료를 불러오는 중입니다…</div>}
      {status === "error" && <div className="climate-message climate-message--error" role="alert"><strong>자료를 불러오지 못했습니다.</strong><span>공개 KOSIS snapshot 읽기 상태를 확인하세요.</span>{error && <small>{error}</small>}</div>}
      {(status === "empty" || (status === "ready" && !snapshot)) && <div className="climate-message" role="status"><strong>공개 snapshot이 아직 없습니다.</strong><span>관리자가 원자료 범위·코드·출처를 확인하고 snapshot을 공개하면 그래프·표가 활성화됩니다.</span></div>}
      {status === "ready" && snapshot && joinResult.status !== "ready" && (
        <div className="climate-message climate-message--error" role="alert">
          <strong>지역 결합 조건을 만족하지 않아 그래프·표를 보류합니다.</strong>
          <span>
            {joinResult.status === "ambiguous-values" && "기간·단위가 섞였거나 한 지역에 여러 숫자값이 있습니다."}
            {joinResult.status === "no-code-matches" && "KOSIS 지역코드와 SGIS 경계코드가 일치하지 않습니다."}
            {joinResult.status === "no-boundaries" && "SGIS 경계가 준비되지 않았습니다."}
            {joinResult.status === "no-public-values" && "결합할 숫자값이 없습니다."}
          </span>
          {joinResult.unmatchedObservationCodes.length > 0 && <small>일치하지 않은 코드: {joinResult.unmatchedObservationCodes.slice(0, 6).join(", ")}</small>}
        </div>
      )}

      {showResults && (
        <>
          <div className="climate-2d-result-heading">
            <div><strong>{datasetTitle}</strong><span>{joinResult.periods.join(", ")} · {unit}</span></div>
            <span>{records.length}개 시도 · 순위 순</span>
          </div>
          {view === "chart" ? (
            <div className="climate-bars" aria-label={`${datasetTitle} 시도별 비교`}>
              {chartSpec.records.map((record) => (
                <div className="climate-bar-row" key={record.id}>
                  <div className="climate-bar-label"><strong>{chartSpec.xField(record)}</strong><span>순위 {String(record.metadata.rank ?? "-")}위</span></div>
                  <div className="climate-bar-track"><span style={{ width: `${Math.max(4, ((chartSpec.yField(record) - minValue) / span) * 100)}%` }} /></div>
                  <strong className="climate-bar-value">{chartSpec.yField(record).toLocaleString("ko-KR")} {unit}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="climate-table-wrap"><table className="climate-table"><thead><tr>{tableModel.columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{tableModel.records.map((record) => <tr key={record.id}>{tableModel.columns.map((column) => <td key={column.key}>{column.format ? column.format(record.metadata[column.key]) : cellText(record.metadata[column.key])}</td>)}</tr>)}</tbody></table></div>
          )}
          <ProvenancePanel provenance={provenance} />
        </>
      )}
    </section>
  );
}
