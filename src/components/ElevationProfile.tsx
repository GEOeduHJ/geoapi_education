import { useMemo, useRef } from "react";
import { MaterialExportActions } from "./MaterialExportActions";
import { ProvenancePanel } from "./ProvenancePanel";
import type { KosisPanelStatus } from "./KosisPublicSnapshotPanel";
import type { PublicSourceSnapshot } from "../lib/geo-observations";
import { toProfilePoints, toTopoProvenance, toTopoTableModel } from "../lib/topo-adapter";
import { exportTableAsCsv } from "../lib/material-export";
import type { PublicGeoObservation } from "../lib/geo-observations";

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = 34;

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function ElevationProfile({
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
  const points = useMemo(() => toProfilePoints(observations), [observations]);
  const tableModel = useMemo(() => toTopoTableModel(points), [points]);
  const provenance = useMemo(
    () => toTopoProvenance(snapshot, points.length, datasetTitle, sourceUrl),
    [snapshot, points.length, datasetTitle, sourceUrl],
  );

  const elevations = points.map((point) => point.elevation);
  const min = elevations.length ? Math.min(...elevations) : 0;
  const max = elevations.length ? Math.max(...elevations) : 0;
  const mean = elevations.length ? elevations.reduce((sum, value) => sum + value, 0) / elevations.length : 0;
  const span = max - min || 1;
  const path = points
    .map((point, index) => {
      const x = PADDING + (index / Math.max(1, points.length - 1)) * (WIDTH - PADDING * 2);
      const y = HEIGHT - PADDING - ((point.elevation - min) / span) * (HEIGHT - PADDING * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  async function handleExportCsv() {
    await exportTableAsCsv(tableModel, `geolab-2d-${exportSlug}`);
  }

  const showResults = status === "ready" && points.length > 0;

  return (
    <section className="climate-2d-workspace" ref={exportRef} aria-labelledby="topo-title">
      <div className="climate-2d-workspace__heading">
        <div>
          <p className="eyebrow">TERRAIN PROFILE · 2D DATA VIEW</p>
          <h2 id="topo-title">{datasetTitle} 고도 단면</h2>
          <p>횡단면 25지점의 SRTM 고도를 단면 그래프와 목록으로 표시합니다. 지도 위 점과 같은 집합입니다.</p>
        </div>
        <span className="climate-badge">{status === "ready" ? "공개 snapshot" : "DB 조회"}</span>
      </div>

      <MaterialExportActions targetRef={exportRef} fileName={`geolab-2d-${exportSlug}`} onExportCsv={showResults ? handleExportCsv : undefined} />

      {status === "loading" && <div className="climate-message" role="status">저장된 고도자료를 불러오는 중입니다…</div>}
      {status === "error" && <div className="climate-message climate-message--error" role="alert"><strong>자료를 불러오지 못했습니다.</strong><span>공개 snapshot 읽기 상태를 확인하세요.</span>{error && <small>{error}</small>}</div>}
      {(status === "empty" || (status === "ready" && !snapshot)) && <div className="climate-message" role="status"><strong>공개 snapshot이 아직 없습니다.</strong></div>}

      {showResults && (
        <>
          <div className="climate-2d-result-heading">
            <div><strong>고도 단면</strong><span>최저 {min.toLocaleString("ko-KR")}m · 최고 {max.toLocaleString("ko-KR")}m · 평균 {Math.round(mean).toLocaleString("ko-KR")}m</span></div>
            <span>{points.length}개 지점</span>
          </div>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="고도 단면 그래프" style={{ width: "100%", height: "auto" }}>
            <path d={`${path} L${WIDTH - PADDING},${HEIGHT - PADDING} L${PADDING},${HEIGHT - PADDING} Z`} fill="rgba(15, 139, 141, 0.14)" stroke="none" />
            <path d={path} fill="none" stroke="rgba(15, 78, 78, 0.9)" strokeWidth="2" />
            {points.map((point, index) => {
              if (index % 4 !== 0 && index !== points.length - 1) return null;
              const x = PADDING + (index / Math.max(1, points.length - 1)) * (WIDTH - PADDING * 2);
              const y = HEIGHT - PADDING - ((point.elevation - min) / span) * (HEIGHT - PADDING * 2);
              return <g key={point.sequence}><circle cx={x} cy={y} r="3" fill="rgba(15, 139, 141, 0.95)" /><text x={x} y={HEIGHT - 12} fontSize="9" textAnchor="middle" fill="#58747a">{point.sequence}</text></g>;
            })}
          </svg>
          <div className="climate-table-wrap"><table className="climate-table"><thead><tr>{tableModel.columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{tableModel.records.map((record) => <tr key={record.id}>{tableModel.columns.map((column) => <td key={column.key}>{cellText(record.metadata[column.key])}</td>)}</tr>)}</tbody></table></div>
          <ProvenancePanel provenance={provenance} />
        </>
      )}
    </section>
  );
}
