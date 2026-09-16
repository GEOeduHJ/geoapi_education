import type { KosisMetadataRecord, KosisSearchResult } from "./kosis";

interface KosisApiResponse<T> {
  data?: T[];
  error?: unknown;
}

function responseError(error: unknown, status: number): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `KOSIS 검색 HTTP ${status}`;
}

async function requestKosis<T>(path: string, params: URLSearchParams, label: string): Promise<{ data: T[]; error: string | null }> {
  try {
    const response = await fetch(`${path}?${params.toString()}`, { headers: { Accept: "application/json" } });
    const payload = (await response.json()) as KosisApiResponse<T>;
    if (!response.ok) return { data: [], error: responseError(payload.error, response.status).replace("KOSIS 검색", label) };
    return { data: Array.isArray(payload.data) ? payload.data : [], error: null };
  } catch {
    return { data: [], error: `${label} 서버에 연결하지 못했습니다.` };
  }
}

export function searchKosisTables(searchNm: string): Promise<{ data: KosisSearchResult[]; error: string | null }> {
  const params = new URLSearchParams({ searchNm, sort: "RANK", startCount: "1", resultCount: "20" });
  return requestKosis<KosisSearchResult>("/api/kosis-search", params, "KOSIS 검색");
}

export function fetchKosisMetadata(orgId: string, tblId: string): Promise<{ data: KosisMetadataRecord[]; error: string | null }> {
  const params = new URLSearchParams({ orgId, tblId });
  return requestKosis<KosisMetadataRecord>("/api/kosis-meta", params, "KOSIS 메타데이터");
}
