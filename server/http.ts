export type QueryValue = string | string[] | undefined;

export interface ApiRequest {
  method?: string;
  query: Record<string, QueryValue>;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string | string[]): ApiResponse;
  json(body: unknown): void;
  send(body: string): void;
  end(): void;
}

export function queryParam(request: ApiRequest, name: string): string | undefined {
  const value = request.query[name];
  return Array.isArray(value) ? value[0] : value;
}

export function methodNotAllowed(response: ApiResponse, allowed = "GET"): void {
  response.setHeader("Allow", allowed).status(405).json({
    ok: false,
    error: "METHOD_NOT_ALLOWED",
  });
}

export function upstreamUnavailable(response: ApiResponse, provider: string, status: number): void {
  response.status(status === 403 ? 424 : 502).json({
    ok: false,
    provider,
    error: "UPSTREAM_UNAVAILABLE",
    upstreamStatus: status,
    message: "제공기관의 활용신청·키 상태 또는 일시적 장애를 확인하세요.",
  });
}

