import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchKosisTable, type KosisTablePreviewQuery } from "../lib/kosis-client";
import type { KosisMetadataRecord, KosisPeriod, KosisRecord, KosisSearchResult, KosisTableMetadata } from "../lib/kosis";

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

const PERIOD_OPTIONS: Array<{ value: KosisPeriod; label: string }> = [
  { value: "Y", label: "년 (Y)" },
  { value: "Q", label: "분기 (Q)" },
  { value: "M", label: "월 (M)" },
  { value: "S", label: "반기 (S)" },
];

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

function periodDefaults(selected: KosisSearchResult): { period: KosisPeriod; start: string; end: string } {
  const start = selected.startPeriod ?? "2024";
  const end = selected.endPeriod ?? start;
  if (start.length === 6 && end.length === 6) return { period: "M", start, end: start };
  if (start.length === 8 && end.length === 8) return { period: "D", start, end: start };
  return { period: "Y", start: start.slice(0, 4), end: start.slice(0, 4) };
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

export function KosisTablePreview({ selected, metadata }: KosisTablePreviewProps) {
  const groups = useMemo(() => groupMetadata(metadata), [metadata]);
  const dimensions = useMemo(() => groups.filter((group) => group.objectId !== "ITEM"), [groups]);
  const items = useMemo(() => groups.find((group) => group.objectId === "ITEM")?.records ?? [], [groups]);
  const [itemId, setItemId] = useState("");
  const [period, setPeriod] = useState<KosisPeriod>("Y");
  const [startPeriod, setStartPeriod] = useState("2024");
  const [endPeriod, setEndPeriod] = useState("2024");
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<KosisRecord[]>([]);
  const [tableMetadata, setTableMetadata] = useState<KosisTableMetadata | null>(null);

  useEffect(() => {
    const defaults = periodDefaults(selected);
    setItemId(items[0]?.itemId ?? "");
    setPeriod(defaults.period);
    setStartPeriod(defaults.start);
    setEndPeriod(defaults.end);
    setStatus("idle");
    setError(null);
    setRecords([]);
    setTableMetadata(null);
  }, [items, selected]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const firstDimension = dimensions[0];
    const firstCodes = firstDimension ? previewCodes(firstDimension.records) : "";
    if (!selected.organizationId || !selected.tableId || !firstCodes || !itemId) {
      setStatus("error");
      setError("통계표의 분류 또는 항목 코드가 없어 값을 조회할 수 없습니다.");
      return;
    }

    const query: KosisTablePreviewQuery = {
      orgId: selected.organizationId,
      tblId: selected.tableId,
      objL1: firstCodes,
      itmId: itemId,
      prdSe: period,
      startPrdDe: startPeriod.trim(),
      endPrdDe: endPeriod.trim(),
      smblChk: "Y",
    };
    dimensions.slice(1, 8).forEach((group, index) => {
      const codes = group.records.length <= 20
        ? group.records.map((record) => record.itemId).filter(Boolean).join(" ")
        : "ALL";
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
      <p className="kosis-table-preview__description">첫 분류의 최상위 값 최대 3개와 추가 분류를 사용해 원자료를 확인합니다. 실제 수업 자료로 저장하기 전 단위·주기·지역 범위를 검토하세요.</p>
      <form className="kosis-preview-form" onSubmit={handleSubmit}>
        <label>항목<select value={itemId} onChange={(event) => setItemId(event.target.value)} disabled={items.length === 0}>
          {items.map((item) => <option key={item.itemId ?? item.itemName} value={item.itemId ?? ""}>{item.itemName ?? item.itemId ?? "이름 없음"}</option>)}
        </select></label>
        <label>주기<select value={period} onChange={(event) => setPeriod(event.target.value as KosisPeriod)}>
          {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <label>시작 시점<input value={startPeriod} onChange={(event) => setStartPeriod(event.target.value)} placeholder="예: 2024" /></label>
        <label>종료 시점<input value={endPeriod} onChange={(event) => setEndPeriod(event.target.value)} placeholder="예: 2024" /></label>
        <button className="button button-dark" type="submit" disabled={status === "loading"}>{status === "loading" ? "조회 중…" : "값 확인"}</button>
      </form>
      {status === "error" && <p className="kosis-search-message kosis-search-message--error" role="alert">{error}</p>}
      {status === "ready" && tableMetadata && (
        <div className="kosis-preview-result" role="status">
          <div className="kosis-preview-result__heading"><strong>{tableMetadata.rowCount}개 원자료 확인</strong><span>{tableMetadata.periodTypes.join(", ") || period} · {tableMetadata.units.join(", ") || "단위 응답 없음"}</span></div>
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
