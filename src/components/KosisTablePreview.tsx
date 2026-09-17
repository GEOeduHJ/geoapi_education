import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchKosisTable, type KosisTablePreviewQuery } from "../lib/kosis-client";
import type { KosisMetadataRecord, KosisRecord, KosisSearchResult, KosisTableMetadata } from "../lib/kosis";
import { formatKosisPeriod, getKosisDatasetPeriodRange, getKosisPeriodLabel } from "../lib/kosis-periods";

type PreviewStatus = "idle" | "loading" | "ready" | "error";

interface KosisTablePreviewProps {
  selected: KosisSearchResult;
  metadata: KosisMetadataRecord[];
}

interface MetadataGroup {
  objectId: string | null;
  objectName: string | null;
  records: KosisMetadataRecord[];
}

function groupMetadata(records: KosisMetadataRecord[]): MetadataGroup[] {
  const groups = new Map<string, MetadataGroup>();
  records.forEach((record) => {
    const key = record.objectId ?? "unknown";
    const group = groups.get(key) ?? { objectId: record.objectId, objectName: record.objectName, records: [] };
    group.records.push(record);
    groups.set(key, group);
  });
  return [...groups.values()];
}

function valueLabel(record: KosisRecord): string {
  if (record.value !== null) return new Intl.NumberFormat("ko-KR").format(record.value);
  return record.valueText ?? "-";
}

function classificationLabel(record: KosisRecord): string {
  const label = record.classifications.map((classification) => classification.name).filter(Boolean).join(" / ");
  return label || "분류값 없음";
}

function previewCodes(records: KosisMetadataRecord[]): string {
  const topLevel = records.filter((record) => !record.parentItemId);
  const candidates = topLevel.length > 0 ? topLevel : records;
  return candidates.slice(0, 3).map((record) => record.itemId).filter(Boolean).join(" ");
}

function dimensionKey(group: MetadataGroup, index: number): string {
  return group.objectId ?? `dimension-${index}`;
}

function dimensionRecords(group: MetadataGroup): KosisMetadataRecord[] {
  return group.records.filter((record) => Boolean(record.itemId));
}

function defaultDimensionValue(group: MetadataGroup, index: number): string {
  const records = dimensionRecords(group);
  if (index === 0) return previewCodes(records) || "ALL";
  if (records.length <= 20) return records.map((record) => record.itemId).filter(Boolean).join(" ") || "ALL";
  return "ALL";
}

function codeCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

export function KosisTablePreview({ selected, metadata }: KosisTablePreviewProps) {
  const groups = useMemo(() => groupMetadata(metadata), [metadata]);
  const dimensions = useMemo(() => groups.filter((group) => group.objectId !== "ITEM"), [groups]);
  const items = useMemo(() => groups.find((group) => group.objectId === "ITEM")?.records ?? [], [groups]);
  const periodRange = useMemo(() => getKosisDatasetPeriodRange(selected), [selected]);
  const [itemId, setItemId] = useState("");
  const [dimensionSelections, setDimensionSelections] = useState<Record<string, string>>({});
  const [startPeriod, setStartPeriod] = useState("");
  const [endPeriod, setEndPeriod] = useState("");
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<KosisRecord[]>([]);
  const [tableMetadata, setTableMetadata] = useState<KosisTableMetadata | null>(null);

  useEffect(() => {
    setItemId(items[0]?.itemId ?? "");
    setStartPeriod(periodRange?.min ?? "");
    setEndPeriod(periodRange?.max ?? "");
    setDimensionSelections(Object.fromEntries(dimensions.map((group, index) => [dimensionKey(group, index), defaultDimensionValue(group, index)])));
    setStatus("idle");
    setError(null);
    setRecords([]);
    setTableMetadata(null);
  }, [dimensions, items, periodRange, selected]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedDimensionValues = dimensions.map((group, index) => dimensionSelections[dimensionKey(group, index)] ?? defaultDimensionValue(group, index));
    const firstCodes = selectedDimensionValues[0] ?? "";
    if (!selected.organizationId || !selected.tableId || !firstCodes || !itemId || !periodRange) {
      setStatus("error");
      setError(!periodRange ? "선택한 통계표의 제공 기간을 확인할 수 없어 값을 조회할 수 없습니다." : "통계표의 분류 또는 항목 코드가 없어 값을 조회할 수 없습니다.");
      return;
    }

    const query: KosisTablePreviewQuery = {
      orgId: selected.organizationId,
      tblId: selected.tableId,
      objL1: firstCodes,
      itmId: itemId,
      prdSe: periodRange.period,
      startPrdDe: startPeriod.trim(),
      endPrdDe: endPeriod.trim(),
      smblChk: "Y",
    };
    dimensions.slice(1, 8).forEach((group, index) => {
      const codes = selectedDimensionValues[index + 1] ?? defaultDimensionValue(group, index + 1);
      if (codes) (query as unknown as Record<string, string>)[`objL${index + 2}`] = codes;
    });

    setStatus("loading");
    setError(null);
    const response = await fetchKosisTable(query);
    setRecords(response.data);
    setTableMetadata(response.metadata);
    setError(response.error);
    setStatus(response.error ? "error" : "ready");
  }

  return (
    <div className="kosis-table-preview">
      <div className="kosis-table-preview__heading">
        <div>
          <p className="eyebrow">LIMITED VALUE PREVIEW</p>
          <strong>소규모 통계값 확인</strong>
        </div>
        <span>저장 전 확인</span>
      </div>
      <p className="kosis-table-preview__description">선택한 표의 실제 분류·항목과 제공 기간 안에서 값을 고릅니다. 기본값은 전체 기간이지만 요청은 서버 제한 안의 소규모 미리보기로만 실행됩니다.</p>
      {periodRange ? (
        <div className="kosis-period-range" role="note">
          <strong>데이터셋 제공 범위</strong>
          <span>{formatKosisPeriod(periodRange.min, periodRange.period)} ~ {formatKosisPeriod(periodRange.max, periodRange.period)}</span>
          <small>{periodRange.options.length.toLocaleString("ko-KR")}개 시점 선택 가능 · 주기 {getKosisPeriodLabel(periodRange.period)} ({periodRange.period}){periodRange.truncated ? " · 너무 긴 범위는 일부 시점만 표시" : ""}</small>
        </div>
      ) : (
        <p className="kosis-search-message kosis-search-message--error" role="alert">검색 결과에 제공 기간이 없어 시작·종료 시점을 만들 수 없습니다.</p>
      )}
      <form className="kosis-preview-form" onSubmit={handleSubmit}>
        {dimensions.map((group, index) => {
          const records = dimensionRecords(group);
          const key = dimensionKey(group, index);
          const defaultValue = defaultDimensionValue(group, index);
          const value = dimensionSelections[key] ?? defaultValue;
          const presetCodeCount = codeCount(defaultValue);
          return (
            <label key={key}>{group.objectName ?? `분류 ${index + 1}`}<select value={value} onChange={(event) => setDimensionSelections((current) => ({ ...current, [key]: event.target.value }))} disabled={records.length === 0}>
              {presetCodeCount > 1 && <option value={defaultValue}>{index === 0 ? `추천: 상위 ${Math.min(3, records.length)}개` : `기본: 전체 ${presetCodeCount}개`}</option>}
              <option value="ALL">전체 선택 (ALL)</option>
              {records.slice(0, 100).map((record) => <option key={record.itemId} value={record.itemId ?? ""}>{record.itemName ?? record.itemId ?? "이름 없음"}</option>)}
            </select></label>
          );
        })}
        <label>항목<select value={itemId} onChange={(event) => setItemId(event.target.value)} disabled={items.length === 0}>
          {items.map((item) => <option key={item.itemId ?? item.itemName} value={item.itemId ?? ""}>{item.itemName ?? item.itemId ?? "이름 없음"}</option>)}
        </select></label>
        <label>주기<select value={periodRange?.period ?? ""} disabled>
          {periodRange ? <option value={periodRange.period}>{getKosisPeriodLabel(periodRange.period)} ({periodRange.period}) · 데이터셋 기준</option> : <option value="">기간 정보 없음</option>}
        </select></label>
        <label>시작 시점<select value={startPeriod} onChange={(event) => { const next = event.target.value; setStartPeriod(next); if (endPeriod && next > endPeriod) setEndPeriod(next); }} disabled={!periodRange}>
          {periodRange?.options.map((option) => <option key={option} value={option}>{formatKosisPeriod(option, periodRange.period)}</option>)}
        </select></label>
        <label>종료 시점<select value={endPeriod} onChange={(event) => { const next = event.target.value; setEndPeriod(next); if (startPeriod && next < startPeriod) setStartPeriod(next); }} disabled={!periodRange}>
          {periodRange?.options.map((option) => <option key={option} value={option}>{formatKosisPeriod(option, periodRange.period)}</option>)}
        </select></label>
        <button className="button button-dark" type="submit" disabled={status === "loading"}>{status === "loading" ? "조회 중…" : "값 확인"}</button>
      </form>
      {status === "error" && <p className="kosis-search-message kosis-search-message--error" role="alert">{error}</p>}
      {status === "ready" && tableMetadata && (
        <div className="kosis-preview-result" role="status">
          <div className="kosis-preview-result__heading"><strong>{tableMetadata.rowCount}개 원자료 확인</strong><span>{tableMetadata.periodTypes.join(", ") || periodRange?.period || "주기 응답 없음"} · {tableMetadata.units.join(", ") || "단위 응답 없음"}</span></div>
          <div className="kosis-preview-rows" aria-label="KOSIS 통계값 미리보기">
            {records.slice(0, 8).map((record, index) => <div className="kosis-preview-row" key={`${record.period}-${record.itemId}-${index}`}><span>{classificationLabel(record)}</span><small>{record.period ?? "시점 없음"}</small><strong>{valueLabel(record)}</strong></div>)}
          </div>
          {records.length > 8 && <small className="kosis-preview-result__notice">전체 {records.length}개 중 처음 8개만 표시합니다.</small>}
          <small className="kosis-preview-result__notice">이 값은 아직 Supabase에 저장하지 않았습니다. 출처·범위 확인 후 snapshot 적재 단계로 이동합니다.</small>
        </div>
      )}
    </div>
  );
}
