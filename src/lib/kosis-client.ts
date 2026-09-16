import type { KosisMetadataRecord, KosisPeriod, KosisRecord, KosisSearchResult, KosisTableMetadata } from "./kosis";

interface KosisApiResponse<T> {
  data?: T[];
  error?: unknown;
  message?: unknown;
}

function responseError(error: unknown, status: number, message: unknown): string {
  if (typeof message === "string" && message.trim()) return message;
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
    if (!response.ok) return { data: [], error: responseError(payload.error, response.status, payload.message).replace("KOSIS 검색", label) };
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

export interface KosisTablePreviewQuery {
  orgId: string;
  tblId: string;
  objL1: string;
  objL2?: string;
  objL3?: string;
  objL4?: string;
  objL5?: string;
  objL6?: string;
  objL7?: string;
  objL8?: string;
  itmId: string;
  prdSe: KosisPeriod;
  startPrdDe: string;
  endPrdDe: string;
  smblChk?: "Y" | "N";
}

interface KosisTableApiResponse extends KosisApiResponse<KosisRecord> {
  metadata?: KosisTableMetadata;
}

export async function fetchKosisTable(query: KosisTablePreviewQuery): Promise<{ data: KosisRecord[]; metadata: KosisTableMetadata | null; error: string | null }> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([name, value]) => params.set(name, String(value)));
  try {
    const response = await fetch(`/api/kosis-table?${params.toString()}`, { headers: { Accept: "application/json" } });
    const payload = (await response.json()) as KosisTableApiResponse;
    if (!response.ok) return { data: [], metadata: null, error: responseError(payload.error, response.status, payload.message).replace("KOSIS 검색", "KOSIS 통계값") };
    return { data: Array.isArray(payload.data) ? payload.data : [], metadata: payload.metadata ?? null, error: null };
  } catch {
    return { data: [], metadata: null, error: "KOSIS 통계값 서버에 연결하지 못했습니다." };
  }
}
