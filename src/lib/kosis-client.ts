import type { KosisSearchResult } from "./kosis";

interface KosisSearchApiResponse {
  data?: KosisSearchResult[];
  error?: string;
}

export async function searchKosisTables(searchNm: string): Promise<{ data: KosisSearchResult[]; error: string | null }> {
  const params = new URLSearchParams({ searchNm, sort: "RANK", startCount: "1", resultCount: "20" });
  try {
    const response = await fetch(`/api/kosis-search?${params.toString()}`, { headers: { Accept: "application/json" } });
    const payload = (await response.json()) as KosisSearchApiResponse;
    if (!response.ok) return { data: [], error: payload.error ?? `KOSIS 검색 HTTP ${response.status}` };
    return { data: Array.isArray(payload.data) ? payload.data : [], error: null };
  } catch {
    return { data: [], error: "KOSIS 검색 서버에 연결하지 못했습니다." };
  }
}
