import { FormEvent, useMemo, useState } from "react";
import { fetchKosisMetadata, searchKosisTables } from "../lib/kosis-client";
import type { KosisMetadataRecord, KosisSearchResult } from "../lib/kosis";
import { KosisTablePreview } from "./KosisTablePreview";

type SearchStatus = "idle" | "loading" | "ready" | "error";
type MetadataStatus = "idle" | "loading" | "ready" | "error";

export function KosisTableSearch() {
  const [term, setTerm] = useState("지역별 인구");
  const [results, setResults] = useState<KosisSearchResult[]>([]);
  const [selected, setSelected] = useState<KosisSearchResult | null>(null);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<KosisMetadataRecord[]>([]);
  const [metadataStatus, setMetadataStatus] = useState<MetadataStatus>("idle");
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const metadataGroups = useMemo(() => {
    const groups = new Map<string, { objectId: string | null; objectName: string | null; records: KosisMetadataRecord[] }>();
    metadata.forEach((record) => {
      const key = record.objectId ?? "unknown";
      const group = groups.get(key) ?? { objectId: record.objectId, objectName: record.objectName, records: [] };
      group.records.push(record);
      groups.set(key, group);
    });
    return [...groups.values()];
  }, [metadata]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = term.trim();
    if (!query) return;
    setStatus("loading");
    setError(null);
    setSelected(null);
    setMetadata([]);
    setMetadataStatus("idle");
    setMetadataError(null);
    const result = await searchKosisTables(query);
    setResults(result.data);
    setError(result.error);
    setStatus(result.error ? "error" : "ready");
  }

  async function handleSelect(result: KosisSearchResult) {
    setSelected(result);
    setMetadata([]);
    setMetadataError(null);
    if (!result.organizationId || !result.tableId) {
      setMetadataStatus("error");
      setMetadataError("선택한 결과에 기관 코드 또는 통계표 코드가 없습니다.");
      return;
    }
    setMetadataStatus("loading");
    const response = await fetchKosisMetadata(result.organizationId, result.tableId);
    setMetadata(response.data);
    setMetadataError(response.error);
    setMetadataStatus(response.error ? "error" : "ready");
  }

  return (
    <div className="kosis-table-search">
      <p className="eyebrow">KOSIS TABLE FINDER</p>
      <h4>통계표 후보 찾기</h4>
      <p className="kosis-table-search__description">검색 결과에서 표를 고르면 다음 단계에서 분류·항목 코드를 확인합니다.</p>
      <form className="kosis-search-form" onSubmit={handleSubmit}>
        <label htmlFor="kosis-search-term">검색어</label>
        <div>
          <input id="kosis-search-term" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="예: 지역별 인구" />
          <button className="button button-dark" type="submit" disabled={status === "loading"}>{status === "loading" ? "검색 중…" : "검색"}</button>
        </div>
      </form>
      {status === "error" && <p className="kosis-search-message kosis-search-message--error" role="alert">{error}</p>}
      {status === "ready" && results.length === 0 && <p className="kosis-search-message" role="status">검색 결과가 없습니다. 다른 주제어로 다시 검색해 보세요.</p>}
      {selected && (
        <div className="kosis-selected-table" role="status">
          <strong>선택한 표</strong>
          <span>{selected.tableName ?? "이름 없는 통계표"}</span>
          <code>{selected.organizationId ?? "?"} / {selected.tableId ?? "?"}</code>
          <small>{metadataStatus === "loading" ? "분류·항목 코드를 불러오는 중…" : "분류·항목 코드 확인"}</small>
        </div>
      )}
      {metadataStatus === "error" && <p className="kosis-search-message kosis-search-message--error" role="alert">{metadataError}</p>}
      {metadataStatus === "ready" && (
        <div className="kosis-metadata" role="status">
          <div className="kosis-metadata__heading">
            <strong>메타데이터 확인 완료</strong>
            <span>{metadata.length}개 코드 · {metadataGroups.length}개 분류</span>
          </div>
          {metadataGroups.map((group) => (
            <div className="kosis-metadata__group" key={group.objectId ?? "unknown"}>
              <div><strong>{group.objectName ?? "이름 없는 분류"}</strong><code>{group.objectId ?? "?"} · {group.records.length}개</code></div>
              <small>{group.records.slice(0, 4).map((record) => `${record.itemName ?? "이름 없음"} (${record.itemId ?? "?"})`).join(" · ")}{group.records.length > 4 ? " · …" : ""}</small>
            </div>
          ))}
          <p>다음 단계에서 지도에 쓸 분류와 항목을 선택하고, 주기·기간을 입력해 제한 조회를 실행합니다.</p>
        </div>
      )}
      {selected && metadataStatus === "ready" && <KosisTablePreview selected={selected} metadata={metadata} />}
      {results.length > 0 && (
        <div className="kosis-search-results" aria-label="KOSIS 통계표 검색 결과">
          {results.map((result, index) => (
            <button className={`kosis-result${selected === result ? " is-selected" : ""}`} key={`${result.organizationId ?? "org"}-${result.tableId ?? index}`} type="button" onClick={() => void handleSelect(result)}>
              <strong>{result.tableName ?? "이름 없는 통계표"}</strong>
              <span>{result.organizationName ?? result.organizationId ?? "기관 미상"}</span>
              <code>{result.organizationId ?? "?"} / {result.tableId ?? "?"}</code>
              {(result.startPeriod || result.endPeriod) && <small>{result.startPeriod ?? "?"} — {result.endPeriod ?? "?"}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
