import { useEffect, useMemo, useRef, useState } from "react";
import { MaterialExportActions } from "./MaterialExportActions";
import { ProvenancePanel } from "./ProvenancePanel";
import {
  climateMetrics,
  countInclusiveDays,
  DEFAULT_CLIMATE_STATION_IDS,
  fetchClimateObservations,
  fetchClimatePeriodSummaries,
  fetchClimateStations,
  summarizeClimate,
  summarizeClimatePeriods,
  type ClimateDailyObservation,
  type ClimateMetric,
  type ClimatePeriodSummary,
  type ClimateStation,
  type ClimateSummary,
} from "../lib/climate";
import { toNormalizedRecords, toProvenance, toTableModel } from "../lib/kma-adapter";
import { exportTableAsCsv } from "../lib/material-export";

export const DEFAULT_CLIMATE_FROM = "2016-01-01";
export const DEFAULT_CLIMATE_TO = "2025-12-31";

type ClimateLoadStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface ClimateDatasetState {
  stations: ClimateStation[];
  observations: ClimateDailyObservation[];
  periods: ClimatePeriodSummary[];
  summaries: ClimateSummary[];
  dataMode: "daily" | "monthly";
  status: ClimateLoadStatus;
  error: string | null;
  actualFrom: string | null;
  actualTo: string | null;
  averageCoverage: number;
  dataCountLabel: string;
}

function isLastDayOfMonth(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const nextDay = new Date(date);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay.getUTCMonth() !== date.getUTCMonth();
}

function isMonthAlignedRange(from: string, to: string): boolean {
  return from.endsWith("-01") && isLastDayOfMonth(to);
}

export function useClimateDataset(
  metric: ClimateMetric,
  from: string,
  to: string,
  stationIds = DEFAULT_CLIMATE_STATION_IDS,
  enabled = true,
): ClimateDatasetState {
  const [stations, setStations] = useState<ClimateStation[]>([]);
  const [observations, setObservations] = useState<ClimateDailyObservation[]>([]);
  const [periods, setPeriods] = useState<ClimatePeriodSummary[]>([]);
  const [dataMode, setDataMode] = useState<"daily" | "monthly">("daily");
  const [status, setStatus] = useState<ClimateLoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const useMonthlySummaries = isMonthAlignedRange(from, to);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setStations([]);
      setObservations([]);
      setPeriods([]);
      setStatus("idle");
      setError(null);
      return () => { cancelled = true; };
    }
    if (from > to) {
      setStatus("error");
      setError("시작일은 종료일보다 늦을 수 없습니다.");
      return () => { cancelled = true; };
    }

    setStatus("loading");
    setError(null);
    const load = async () => {
      const stationResult = await fetchClimateStations(stationIds);
      if (cancelled) return;
      if (stationResult.error) {
        setStatus("error");
        setError(stationResult.error);
        return;
      }

      setStations(stationResult.data);
      setObservations([]);
      setPeriods([]);

      if (useMonthlySummaries) {
        const periodResult = await fetchClimatePeriodSummaries(stationIds, from, to);
        if (cancelled) return;
        if (!periodResult.error && periodResult.data.length) {
          setDataMode("monthly");
          setPeriods(periodResult.data);
          setStatus("ready");
          return;
        }
      }

      const observationResult = await fetchClimateObservations(stationIds, from, to);
      if (cancelled) return;
      if (observationResult.error) {
        setStatus("error");
        setError(observationResult.error);
        return;
      }
      setDataMode("daily");
      setObservations(observationResult.data);
      setStatus(observationResult.data.length ? "ready" : "empty");
    };

    load().catch(() => {
      if (cancelled) return;
      setStatus("error");
      setError("Supabase에서 기후자료를 읽지 못했습니다.");
    });
    return () => { cancelled = true; };
  }, [enabled, from, stationIds, to, useMonthlySummaries]);

  const summaries = useMemo(() => dataMode === "monthly"
    ? summarizeClimatePeriods(stations, periods, metric)
    : summarizeClimate(stations, observations, metric, countInclusiveDays(from, to)),
  [dataMode, from, metric, observations, periods, stations, to]);

  const actualFrom = summaries.length ? summaries.reduce((value, summary) => summary.firstDate < value ? summary.firstDate : value, summaries[0].firstDate) : null;
  const actualTo = summaries.length ? summaries.reduce((value, summary) => summary.lastDate > value ? summary.lastDate : value, summaries[0].lastDate) : null;
  const averageCoverage = summaries.length ? summaries.reduce((total, summary) => total + summary.coverageRatio, 0) / summaries.length : 0;
  const dataCountLabel = dataMode === "monthly"
    ? `${periods.length.toLocaleString("ko-KR")}개 월별 요약`
    : `${observations.length.toLocaleString("ko-KR")}개 일자료`;

  return { stations, observations, periods, summaries, dataMode, status, error, actualFrom, actualTo, averageCoverage, dataCountLabel };
}

function formatCoverage(ratio: number): string {
  const percent = ratio * 100;
  if (percent > 0 && percent < 1) return "<1%";
  return `${percent.toFixed(percent === 100 ? 0 : 1)}%`;
}

function describeError(error: string | null): string {
  if (error && /schema cache|could not find the table|relation .* does not exist/i.test(error)) return "기후자료 저장소가 아직 준비되지 않았습니다.";
  return "공개 기후자료를 불러오는 중 문제가 발생했습니다.";
}

export function Climate2DWorkspace({
  metric,
  from,
  to,
  state,
}: {
  metric: ClimateMetric;
  from: string;
  to: string;
  state: ClimateDatasetState;
}) {
  const exportRef = useRef<HTMLElement | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const metricDefinition = climateMetrics[metric];
  const numericValues = state.summaries.map((summary) => summary.value).filter(Number.isFinite);
  const minValue = numericValues.length ? Math.min(...numericValues) : 0;
  const maxValue = numericValues.length ? Math.max(...numericValues) : 0;
  const span = maxValue - minValue || 1;
  const provenance = useMemo(
    () => toProvenance(state.summaries, { datasetKey: "kma-asos-climate-10y", metric, from, to }, state.actualFrom, state.actualTo),
    [state.summaries, state.actualFrom, state.actualTo, metric, from, to],
  );

  async function handleExportCsv() {
    const records = toNormalizedRecords(state.summaries, metric, state.stations);
    const table = toTableModel(records, metric);
    await exportTableAsCsv(table, "geolab-2d-kma-climate");
  }

  return (
    <section className="climate-2d-workspace" ref={exportRef} aria-labelledby="climate-2d-title">
      <div className="climate-2d-workspace__heading">
        <div><p className="eyebrow">KMA ASOS · 2D DATA VIEW</p><h2 id="climate-2d-title">관측소별 기후 자료 표현</h2><p>같은 조회 조건을 지점 지도·비교 그래프·자료표에 적용합니다. 장기 범위는 월 요약, 월 중간 범위는 일자료에서 계산합니다.</p></div>
        <span className="climate-badge">{state.status === "ready" ? "공개 snapshot" : "DB 조회"}</span>
      </div>

      <div className="climate-2d-controls" data-export-ignore="true" aria-label="2D 기후자료 보기 방식">
        <label><span>보조 표현</span><select value={view} onChange={(event) => setView(event.target.value as "chart" | "table")}><option value="chart">그래프</option><option value="table">표</option></select></label>
      </div>

      <MaterialExportActions targetRef={exportRef} fileName="geolab-2d-kma-climate" onExportCsv={state.status === "ready" ? handleExportCsv : undefined} />

      {state.status === "loading" && <div className="climate-message" role="status">저장된 관측자료를 불러오는 중입니다…</div>}
      {state.status === "error" && <div className="climate-message climate-message--error" role="alert"><strong>자료를 불러오지 못했습니다.</strong><span>{describeError(state.error)}</span><small>Supabase 공개 읽기 정책과 KMA snapshot 적재 상태를 확인하세요.</small></div>}
      {state.status === "empty" && <div className="climate-message" role="status"><strong>선택한 기간의 관측자료가 없습니다.</strong><span>데이터셋의 실제 적재 범위 안에서 기간을 다시 선택하세요.</span></div>}

      {state.status === "ready" && (
        <>
          <div className="climate-2d-result-heading"><div><strong>{metricDefinition.label}</strong><span>{metricDefinition.description}</span></div><span>{state.dataCountLabel} · {state.summaries.length}개 관측소 · 평균 유효범위 {formatCoverage(state.averageCoverage)}</span></div>
          {view === "chart" ? (
            <div className="climate-bars" aria-label={`${metricDefinition.label} 관측소별 비교`}>
              {state.summaries.map((summary) => <div className="climate-bar-row" key={summary.stationId}><div className="climate-bar-label"><strong>{summary.stationName}</strong><span>{summary.observationCount.toLocaleString("ko-KR")}일 · {formatCoverage(summary.coverageRatio)}</span></div><div className="climate-bar-track"><span style={{ width: `${Math.max(4, ((summary.value - minValue) / span) * 100)}%` }} /></div><strong className="climate-bar-value">{summary.value.toFixed(1)} {summary.unit}</strong></div>)}
            </div>
          ) : (
            <div className="climate-table-wrap"><table className="climate-table"><thead><tr><th>관측소</th><th>값</th><th>유효 관측일</th><th>유효범위</th><th>실제 자료 범위</th></tr></thead><tbody>{state.summaries.map((summary) => <tr key={summary.stationId}><th scope="row">{summary.stationName} <small>{summary.stationId}</small></th><td>{summary.value.toFixed(1)} {summary.unit}</td><td>{summary.observationCount.toLocaleString("ko-KR")} / {summary.expectedObservationCount.toLocaleString("ko-KR")}</td><td>{formatCoverage(summary.coverageRatio)}</td><td>{summary.firstDate} ~ {summary.lastDate}</td></tr>)}</tbody></table></div>
          )}
          <ProvenancePanel provenance={provenance} />
        </>
      )}
    </section>
  );
}
