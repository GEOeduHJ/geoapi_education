import type { KosisSearchResult } from "./kosis";

interface KosisSearchApiResponse {
  data?: KosisSearchResult[];
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

export async function searchKosisTables(searchNm: string): Promise<{ data: KosisSearchResult[]; error: string | null }> {
  const params = new URLSearchParams({ searchNm, sort: "RANK", startCount: "1", resultCount: "20" });
  try {
    const response = await fetch(`/api/kosis-search?${params.toString()}`, { headers: { Accept: "application/json" } });
    const payload = (await response.json()) as KosisSearchApiResponse;
    if (!response.ok) return { data: [], error: responseError(payload.error, response.status) };
    return { data: Array.isArray(payload.data) ? payload.data : [], error: null };
  } catch {
    return { data: [], error: "KOSIS 검색 서버에 연결하지 못했습니다." };
  }
}
