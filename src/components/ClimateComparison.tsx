import { useEffect, useMemo, useRef, useState } from "react";
import { MaterialExportActions } from "./MaterialExportActions";
import {
  climateMetrics,
  DEFAULT_CLIMATE_STATION_IDS,
  countInclusiveDays,
  fetchClimatePeriodSummaries,
  fetchClimateObservations,
  fetchClimateStations,
  summarizeClimate,
  summarizeClimatePeriods,
  type ClimateMetric,
  type ClimateDailyObservation,
  type ClimatePeriodSummary,
  type ClimateStation,
} from "../lib/climate";

const DEFAULT_FROM = "2016-01-01";
const DEFAULT_TO = "2025-12-31";

function describeClimateError(error: string | null): string {
  if (error && /schema cache|could not find the table|relation .* does not exist/i.test(error)) {
    return "기후자료 저장소가 아직 준비되지 않았습니다.";
  }
  return "공개 기후자료를 불러오는 중 문제가 발생했습니다.";
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

function formatCoverage(ratio: number): string {
  const percent = ratio * 100;
  if (percent > 0 && percent < 1) return "<1%";
  if (percent === 100) return "100%";
  return `${percent.toFixed(1)}%`;
}

export function ClimateComparison() {
  const exportRef = useRef<HTMLElement | null>(null);
  const [metric, setMetric] = useState<ClimateMetric>("ta_avg");
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [stations, setStations] = useState<ClimateStation[]>([]);
  const [observations, setObservations] = useState<ClimateDailyObservation[]>([]);
  const [periods, setPeriods] = useState<ClimatePeriodSummary[]>([]);
  const [dataMode, setDataMode] = useState<"daily" | "monthly">("daily");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const useMonthlySummaries = isMonthAlignedRange(from, to);

  useEffect(() => {
    let cancelled = false;
    if (from > to) {
      setStatus("error");
      setError("시작일은 종료일보다 늦을 수 없습니다.");
      return () => { cancelled = true; };
    }

    setStatus("loading");
    setError(null);
    const load = async () => {
      const stationResult = await fetchClimateStations(DEFAULT_CLIMATE_STATION_IDS);
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
        const periodResult = await fetchClimatePeriodSummaries(DEFAULT_CLIMATE_STATION_IDS, from, to);
        if (cancelled) return;
        if (!periodResult.error && periodResult.data.length) {
          setDataMode("monthly");
          setPeriods(periodResult.data);
          setStatus("ready");
          return;
        }
      }

      const observationResult = await fetchClimateObservations(DEFAULT_CLIMATE_STATION_IDS, from, to);
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
  }, [from, to, useMonthlySummaries]);

  const summaries = useMemo(() => dataMode === "monthly"
    ? summarizeClimatePeriods(stations, periods, metric)
    : summarizeClimate(stations, observations, metric, countInclusiveDays(from, to)),
  [dataMode, from, to, metric, observations, periods, stations]);
  const metricDefinition = climateMetrics[metric];
  const maxValue = Math.max(...summaries.map((summary) => summary.value), 0);
  const minValue = Math.min(...summaries.map((summary) => summary.value), 0);
  const span = maxValue - minValue || 1;
  const actualFrom = summaries[0]?.firstDate;
  const actualTo = summaries[0]?.lastDate;
  const isPartialRange = Boolean(actualFrom && actualTo && (actualFrom !== from || actualTo !== to))
    || summaries.some((summary) => summary.coverageRatio < 1);
  const averageCoverage = summaries.length
    ? summaries.reduce((total, summary) => total + summary.coverageRatio, 0) / summaries.length
    : 0;
  const dataCountLabel = dataMode === "monthly"
    ? `${periods.length.toLocaleString("ko-KR")}개 월별 요약`
    : `${observations.length.toLocaleString("ko-KR")}개 일자료`;

  return (
    <section className="climate-workspace" ref={exportRef} aria-labelledby="climate-comparison-title">
      <div className="climate-workspace__header">
        <div>
          <p className="eyebrow">KMA ASOS · SUPABASE SNAPSHOT</p>
          <h2 id="climate-comparison-title">최근 10년 기후 비교 실험</h2>
          <p>기상청 ASOS 일자료를 저장된 스냅샷에서 읽어 관측소별 평균을 비교합니다. 장기 범위는 월별 요약을, 짧은 범위는 일자료를 사용하며 자료의 범위와 결측을 함께 확인하세요.</p>
        </div>
        <span className="climate-badge">로그인 없이 공개 조회</span>
      </div>

      <div className="climate-controls" data-export-ignore="true" aria-label="기후자료 조건">
        <label>
          <span>비교 지표</span>
          <select value={metric} onChange={(event) => setMetric(event.target.value as ClimateMetric)}>
            {Object.entries(climateMetrics).map(([key, definition]) => <option key={key} value={key}>{definition.label} ({definition.unit})</option>)}
          </select>
        </label>
        <label>
          <span>시작일</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          <span>종료일</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>

      <MaterialExportActions targetRef={exportRef} fileName="geolab-climate-comparison" />

      {status === "loading" && <div className="climate-message" role="status">저장된 관측자료를 불러오는 중입니다…</div>}
      {status === "error" && <div className="climate-message climate-message--error" role="alert"><strong>자료를 불러오지 못했습니다.</strong><span>{describeClimateError(error)}</span><small>관리자가 `0003_kma_climate.sql`·`0004_climate_period_summaries.sql`을 실행하고 수집기를 한 번 실행했는지 확인하세요.</small></div>}
      {status === "empty" && <div className="climate-message" role="status"><strong>선택한 기간의 관측자료가 없습니다.</strong><span>기후자료 수집기를 실행하면 이 화면에서 비교할 수 있습니다.</span></div>}

      {status === "ready" && (
        <>
          <div className="climate-result-heading">
            <div><strong>{metricDefinition.label}</strong><span>{metricDefinition.description}</span></div>
            <span>{dataCountLabel} · {summaries.length}개 관측소 · 평균 유효범위 {formatCoverage(averageCoverage)}</span>
          </div>
          <div className="climate-bars" aria-label={`${metricDefinition.label} 관측소별 비교`}>
            {summaries.map((summary) => (
              <div className="climate-bar-row" key={summary.stationId}>
                <div className="climate-bar-label"><strong>{summary.stationName}</strong><span>{summary.observationCount.toLocaleString("ko-KR")}일 · {formatCoverage(summary.coverageRatio)}</span></div>
                <div className="climate-bar-track"><span style={{ width: `${Math.max(4, ((summary.value - minValue) / span) * 100)}%` }} /></div>
                <strong className="climate-bar-value">{summary.value.toFixed(1)} {summary.unit}</strong>
              </div>
            ))}
          </div>
          <div className="climate-footnote">
            <span>{dataMode === "monthly" ? "월별 평균을 유효 관측일수로 가중해 합산했습니다." : "관측값이 존재하는 날만 평균에 포함합니다."}</span>
            <span>현재 값은 선택 기간의 일자료 평균이며, 공식 기후평년값과는 구분합니다.</span>
            <span>실제 적재 범위: {actualFrom} ~ {actualTo}</span>
            {isPartialRange && <strong>현재 DB에 적재된 구간 또는 유효 관측값만 계산했습니다.</strong>}
          </div>
        </>
      )}
    </section>
  );
}
