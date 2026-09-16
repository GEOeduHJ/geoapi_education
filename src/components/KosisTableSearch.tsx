import { FormEvent, useState } from "react";
import { searchKosisTables } from "../lib/kosis-client";
import type { KosisSearchResult } from "../lib/kosis";

type SearchStatus = "idle" | "loading" | "ready" | "error";

export function KosisTableSearch() {
  const [term, setTerm] = useState("지역별 인구");
  const [results, setResults] = useState<KosisSearchResult[]>([]);
  const [selected, setSelected] = useState<KosisSearchResult | null>(null);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = term.trim();
    if (!query) return;
    setStatus("loading");
    setError(null);
    setSelected(null);
    const result = await searchKosisTables(query);
    setResults(result.data);
    setError(result.error);
    setStatus(result.error ? "error" : "ready");
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
          <small>다음 단계: `/api/kosis-meta`로 분류·항목 코드 확인</small>
        </div>
      )}
      {results.length > 0 && (
        <div className="kosis-search-results" aria-label="KOSIS 통계표 검색 결과">
          {results.map((result, index) => (
            <button className={`kosis-result${selected === result ? " is-selected" : ""}`} key={`${result.organizationId ?? "org"}-${result.tableId ?? index}`} type="button" onClick={() => setSelected(result)}>
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
