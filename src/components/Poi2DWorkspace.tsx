import { useMemo, useRef, useState } from "react";
import { MaterialExportActions } from "./MaterialExportActions";
import { ProvenancePanel } from "./ProvenancePanel";
import type { KosisPanelStatus } from "./KosisPublicSnapshotPanel";
import type { PublicGeoObservation, PublicSourceSnapshot } from "../lib/geo-observations";
import { toPoiProvenance, toPoiTableModel } from "../lib/tourapi-adapter";
import { exportTableAsCsv } from "../lib/material-export";

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function Poi2DWorkspace({
  datasetTitle,
  sourceUrl,
  status,
  snapshot,
  observations,
  error,
  exportSlug,
}: {
  datasetTitle: string;
  sourceUrl: string;
  status: KosisPanelStatus;
  snapshot: PublicSourceSnapshot | null;
  observations: PublicGeoObservation[];
  error: string | null;
  exportSlug: string;
}) {
  const exportRef = useRef<HTMLElement | null>(null);
  const tableModel = useMemo(() => toPoiTableModel(observations), [observations]);
  const provenance = useMemo(
    () => toPoiProvenance(snapshot, observations.length, datasetTitle, sourceUrl),
    [snapshot, observations.length, datasetTitle, sourceUrl],
  );
  const [query, setQuery] = useState("");

  const filteredRecords = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) return tableModel.records;
    return tableModel.records.filter((record) =>
      String(record.metadata.title ?? "").includes(keyword)
      || String(record.metadata.address ?? "").includes(keyword),
    );
  }, [tableModel.records, query]);

  async function handleExportCsv() {
    await exportTableAsCsv({ columns: tableModel.columns, records: filteredRecords }, `geolab-2d-${exportSlug}`);
  }

  const showResults = status === "ready" && observations.length > 0;

  return (
    <section className="climate-2d-workspace" ref={exportRef} aria-labelledby="poi-2d-title">
      <div className="climate-2d-workspace__heading">
        <div>
          <p className="eyebrow">POI · 2D DATA VIEW</p>
          <h2 id="poi-2d-title">관심지점 분포·목록</h2>
          <p>지도와 같은 조회 조건(공개 snapshot·선택 지역)의 지점을 지도 위에 표시하고 목록으로 제공합니다. 이미지는 URL만 보관하고 라이선스 유형을 함께 기록합니다.</p>
        </div>
        <span className="climate-badge">{status === "ready" ? "공개 snapshot" : "DB 조회"}</span>
      </div>

      <div className="climate-2d-controls" data-export-ignore="true" aria-label="2D 관심지점 검색">
        <label><span>이름·주소 검색</span><input type="search" value={query} placeholder="예: 경복궁" onChange={(event) => setQuery(event.target.value)} /></label>
      </div>

      <MaterialExportActions targetRef={exportRef} fileName={`geolab-2d-${exportSlug}`} onExportCsv={showResults ? handleExportCsv : undefined} />

      {status === "loading" && <div className="climate-message" role="status">저장된 관심지점을 불러오는 중입니다…</div>}
      {status === "error" && <div className="climate-message climate-message--error" role="alert"><strong>자료를 불러오지 못했습니다.</strong><span>공개 snapshot 읽기 상태를 확인하세요.</span>{error && <small>{error}</small>}</div>}
      {(status === "empty" || (status === "ready" && !snapshot)) && <div className="climate-message" role="status"><strong>공개 snapshot이 아직 없습니다.</strong><span>관리자가 원자료 범위·코드·출처를 확인하고 snapshot을 공개하면 목록이 활성화됩니다.</span></div>}

      {showResults && (
        <>
          <div className="climate-2d-result-heading">
            <div><strong>{datasetTitle}</strong><span>관심지점 {observations.length.toLocaleString("ko-KR")}곳</span></div>
            <span>검색 {filteredRecords.length.toLocaleString("ko-KR")}곳</span>
          </div>
          <div className="climate-table-wrap"><table className="climate-table"><thead><tr>{tableModel.columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{filteredRecords.slice(0, 500).map((record) => <tr key={record.id}>{tableModel.columns.map((column) => <td key={column.key}>{cellText(record.metadata[column.key])}</td>)}</tr>)}</tbody></table></div>
          {filteredRecords.length > 500 && <p className="field-help">표에는 상위 500곳만 표시합니다. 전체는 CSV로 내려받으세요.</p>}
          <ProvenancePanel provenance={provenance} />
        </>
      )}
    </section>
  );
}
