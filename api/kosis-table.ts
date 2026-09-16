import type { ApiRequest, ApiResponse } from "../server/http.js";
import { methodNotAllowed, queryParam, upstreamUnavailable } from "../server/http.js";
import {
  buildKosisTableUrl,
  parseKosisResponseText,
  parseKosisStatisticsResponse,
  summarizeKosisRecords,
  type KosisPeriod,
  type KosisTableQuery,
} from "../src/lib/kosis.js";

const SAFE_CODE = /^[A-Za-z0-9_.-]{1,40}$/;
const SAFE_CODE_LIST = /^[A-Za-z0-9_.-]+(?:[,\s]+[A-Za-z0-9_.-]+)*$/;
const PERIODS = new Set<KosisPeriod>(["Y", "Q", "M", "S", "D", "F", "IR"]);
const PERIOD_PATTERN = /^\d{4,8}$/;

function code(value: string | undefined, list = false): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !(list ? SAFE_CODE_LIST : SAFE_CODE).test(trimmed)) return undefined;
  return trimmed;
}

function integer(value: string | undefined, minimum: number, maximum: number): number | undefined {
  if (value === undefined || value === "") return undefined;
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

function hasInvalidInteger(value: string | undefined, minimum: number, maximum: number): boolean {
  return Boolean(value && integer(value, minimum, maximum) === undefined);
}

function countCodes(value: string): number {
  return value.split(/[,\s]+/).filter(Boolean).length;
}

function estimatePeriods(period: KosisPeriod, start: string | undefined, end: string | undefined, latest: number | undefined): number {
  if (latest !== undefined) return latest;
  if (!start || !end) return 0;
  if (period === "Y" || period === "F") return Number(end) - Number(start) + 1;
  if (period === "M" && start.length === 6 && end.length === 6) {
    return (Number(end.slice(0, 4)) * 12 + Number(end.slice(4))) - (Number(start.slice(0, 4)) * 12 + Number(start.slice(4))) + 1;
  }
  if (period === "Q" && start.length === 6 && end.length === 6) {
    return (Number(end.slice(0, 4)) * 4 + Number(end.slice(4))) - (Number(start.slice(0, 4)) * 4 + Number(start.slice(4))) + 1;
  }
  if (period === "S" && start.length === 6 && end.length === 6) {
    return (Number(end.slice(0, 4)) * 2 + Number(end.slice(4))) - (Number(start.slice(0, 4)) * 2 + Number(start.slice(4))) + 1;
  }
  if (period === "D" && start.length === 8 && end.length === 8) {
    const from = Date.parse(`${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6)}T00:00:00Z`);
    const to = Date.parse(`${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6)}T00:00:00Z`);
    return Number.isFinite(from) && Number.isFinite(to) ? Math.floor((to - from) / 86_400_000) + 1 : 0;
  }
  return start <= end ? 1 : -1;
}

function isValidPeriodBoundary(period: KosisPeriod, value: string): boolean {
  if (!PERIOD_PATTERN.test(value)) return false;
  if (period === "Y" || period === "F") return value.length === 4;
  if (period === "M") return value.length === 6 && Number(value.slice(4)) >= 1 && Number(value.slice(4)) <= 12;
  if (period === "Q") return value.length === 6 && Number(value.slice(4)) >= 1 && Number(value.slice(4)) <= 4;
  if (period === "S") return value.length === 6 && Number(value.slice(4)) >= 1 && Number(value.slice(4)) <= 2;
  if (period === "D") return value.length === 8 && Number.isFinite(Date.parse(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}T00:00:00Z`));
  return [4, 6, 8].includes(value.length);
}

function readTableQuery(request: ApiRequest): { query: KosisTableQuery } | { error: string } {
  const orgId = code(queryParam(request, "orgId"));
  const tblId = code(queryParam(request, "tblId"));
  const objL1 = code(queryParam(request, "objL1"), true);
  const objL2 = code(queryParam(request, "objL2"), true) ?? "ALL";
  const itmId = code(queryParam(request, "itmId"), true);
  const prdSe = queryParam(request, "prdSe")?.trim().toUpperCase() as KosisPeriod | undefined;
  const startPrdDe = queryParam(request, "startPrdDe")?.trim();
  const endPrdDe = queryParam(request, "endPrdDe")?.trim();
  const rawNewEstPrdCnt = queryParam(request, "newEstPrdCnt")?.trim();
  const rawPrdInterval = queryParam(request, "prdInterval")?.trim();
  const newEstPrdCnt = integer(rawNewEstPrdCnt, 1, 120);
  const prdInterval = integer(rawPrdInterval, 1, 10);
  const outputFields = queryParam(request, "outputFields")?.trim();
  const smblChk = queryParam(request, "smblChk")?.trim().toUpperCase();

  if (!orgId || !tblId || !objL1 || !itmId || !prdSe || !PERIODS.has(prdSe)) return { error: "INVALID_KOSIS_TABLE_PARAMETERS" };
  if ((startPrdDe && !endPrdDe) || (!startPrdDe && endPrdDe) || (startPrdDe && !isValidPeriodBoundary(prdSe, startPrdDe)) || (endPrdDe && !isValidPeriodBoundary(prdSe, endPrdDe))) {
    return { error: "INVALID_KOSIS_PERIOD_PARAMETERS" };
  }
  if (hasInvalidInteger(rawNewEstPrdCnt, 1, 120) || hasInvalidInteger(rawPrdInterval, 1, 10)) return { error: "INVALID_KOSIS_NUMERIC_PARAMETERS" };
  if ((prdSe !== "IR" && startPrdDe && endPrdDe && startPrdDe.length !== endPrdDe.length) || (startPrdDe && endPrdDe && startPrdDe.length === endPrdDe.length && startPrdDe > endPrdDe) || (!startPrdDe && newEstPrdCnt === undefined)) {
    return { error: "KOSIS_PERIOD_RANGE_REQUIRED" };
  }
  if (outputFields && !/^[A-Za-z0-9_,]{1,500}$/.test(outputFields)) return { error: "INVALID_KOSIS_OUTPUT_FIELDS" };
  if (smblChk && smblChk !== "Y" && smblChk !== "N") return { error: "INVALID_KOSIS_SYMBOL_OPTION" };

  const classificationValues = [objL1, objL2];
  for (const level of [2, 3, 4, 5, 6, 7, 8]) {
    const rawValue = queryParam(request, `objL${level}`)?.trim();
    const value = code(rawValue, true);
    if (rawValue && !value) return { error: "INVALID_KOSIS_CLASSIFICATION_PARAMETERS" };
    if (value) classificationValues.push(value);
  }
  const periods = estimatePeriods(prdSe, startPrdDe, endPrdDe, newEstPrdCnt);
  const estimatedCells = classificationValues.reduce((total, value) => total * countCodes(value), 1) * countCodes(itmId) * periods;
  if (!Number.isFinite(periods) || periods < 1 || periods > (prdSe === "D" ? 366 : 120) || estimatedCells > 40_000) return { error: "KOSIS_REQUEST_LIMIT" };

  const query: KosisTableQuery = {
    orgId,
    tblId,
    objL1,
    objL2,
    itmId,
    prdSe,
    ...(startPrdDe ? { startPrdDe, endPrdDe } : {}),
    ...(newEstPrdCnt !== undefined ? { newEstPrdCnt } : {}),
    ...(prdInterval !== undefined ? { prdInterval } : {}),
    ...(outputFields ? { outputFields } : {}),
    ...(smblChk ? { smblChk: smblChk as "Y" | "N" } : {}),
  };
  for (const level of [2, 3, 4, 5, 6, 7, 8] as const) {
    const value = code(queryParam(request, `objL${level}`), true);
    if (value) query[`objL${level}`] = value;
  }
  return { query };
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method && request.method !== "GET") return methodNotAllowed(response);
  const apiKey = process.env.KOSIS_API_KEY?.trim();
  if (!apiKey) return response.status(503).json({ ok: false, error: "KOSIS_NOT_CONFIGURED" });

  const parsed = readTableQuery(request);
  if ("error" in parsed) return response.status(400).json({ ok: false, error: parsed.error });

  try {
    const upstream = await fetch(buildKosisTableUrl(apiKey, parsed.query), { headers: { Accept: "application/json" } });
    if (!upstream.ok) return upstreamUnavailable(response, "kosis", upstream.status);
    const payload = parseKosisResponseText(await upstream.text());
    const records = parseKosisStatisticsResponse(payload);
    if (records.length === 0 && !Array.isArray(payload)) {
      return response.status(502).json({ ok: false, provider: "kosis", error: "KOSIS_UNEXPECTED_RESPONSE" });
    }

    response
      .setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=900")
      .status(200)
      .json({ ok: true, provider: "kosis", query: parsed.query, metadata: summarizeKosisRecords(records), data: records, fetchedAt: new Date().toISOString() });
  } catch {
    response.status(502).json({ ok: false, provider: "kosis", error: "KOSIS_TABLE_REQUEST_FAILED" });
  }
}
