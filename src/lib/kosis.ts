export const KOSIS_TABLE_ENDPOINT = "https://kosis.kr/openapi/Param/statisticsParameterData.do";
export const KOSIS_SEARCH_ENDPOINT = "https://kosis.kr/openapi/statisticsSearch.do";
export const KOSIS_METADATA_ENDPOINT = "https://kosis.kr/openapi/statisticsData.do";

// KOSIS uses S for half-year, F for multi-year, and IR for irregular periods.
// Keep these provider codes rather than translating them to an application-only
// vocabulary so that a saved query can be reproduced exactly.
export type KosisPeriod = "Y" | "Q" | "M" | "S" | "D" | "F" | "IR";

export interface KosisTableQuery {
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
  startPrdDe?: string;
  endPrdDe?: string;
  newEstPrdCnt?: number;
  prdInterval?: number;
  outputFields?: string;
  smblChk?: "Y" | "N";
}

export interface KosisSearchQuery {
  searchNm: string;
  orgId?: string;
  sort?: "RANK" | "DATE";
  startCount?: number;
  resultCount?: number;
}

export interface KosisMetadataQuery {
  orgId: string;
  tblId: string;
  objId?: string;
  itmId?: string;
}

export interface KosisClassification {
  level: number;
  code: string | null;
  name: string | null;
  nameEn: string | null;
  objectName: string | null;
  objectNameEn: string | null;
}

export interface KosisRecord {
  source: "KOSIS";
  orgId: string | null;
  tblId: string | null;
  tableName: string | null;
  classifications: KosisClassification[];
  itemId: string | null;
  itemName: string | null;
  itemNameEn: string | null;
  unitId: string | null;
  unitName: string | null;
  unitNameEn: string | null;
  periodType: string | null;
  period: string | null;
  value: number | null;
  valueText: string | null;
  valueSymbol: string | null;
  lastChangedDate: string | null;
  raw: Record<string, unknown>;
}

export interface KosisTableMetadata {
  orgId: string | null;
  tblId: string | null;
  tableName: string | null;
  periodTypes: string[];
  periods: string[];
  units: string[];
  classificationLevels: number[];
  rowCount: number;
}

export interface KosisSearchResult {
  organizationId: string | null;
  organizationName: string | null;
  tableId: string | null;
  tableName: string | null;
  statId: string | null;
  statName: string | null;
  contents: string | null;
  startPeriod: string | null;
  endPeriod: string | null;
  tableViewUrl: string | null;
  linkUrl: string | null;
  raw: Record<string, unknown>;
}

export interface KosisMetadataRecord {
  objectId: string | null;
  objectName: string | null;
  objectNameEn: string | null;
  itemId: string | null;
  itemName: string | null;
  itemNameEn: string | null;
  parentItemId: string | null;
  objectSequence: string | null;
  unitId: string | null;
  unitName: string | null;
  unitNameEn: string | null;
  raw: Record<string, unknown>;
}

const KOSIS_CLASSIFICATION_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function setQueryValue(url: URL, key: string, value: string | number | undefined): void {
  if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
}

export function buildKosisTableUrl(apiKey: string, query: KosisTableQuery): string {
  const url = new URL(KOSIS_TABLE_ENDPOINT);
  url.searchParams.set("method", "getList");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("jsonVD", "Y");

  for (const key of ["orgId", "tblId", "objL1", "objL2", "objL3", "objL4", "objL5", "objL6", "objL7", "objL8", "itmId", "prdSe", "startPrdDe", "endPrdDe", "newEstPrdCnt", "prdInterval", "outputFields", "smblChk"] as const) {
    setQueryValue(url, key, query[key]);
  }

  return url.toString();
}

export function buildKosisSearchUrl(apiKey: string, query: KosisSearchQuery): string {
  const url = new URL(KOSIS_SEARCH_ENDPOINT);
  url.searchParams.set("method", "getList");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");
  setQueryValue(url, "searchNm", query.searchNm);
  setQueryValue(url, "orgId", query.orgId);
  setQueryValue(url, "sort", query.sort);
  setQueryValue(url, "startCount", query.startCount);
  setQueryValue(url, "resultCount", query.resultCount);
  return url.toString();
}

export function buildKosisMetadataUrl(apiKey: string, query: KosisMetadataQuery): string {
  const url = new URL(KOSIS_METADATA_ENDPOINT);
  url.searchParams.set("method", "getMeta");
  url.searchParams.set("type", "ITM");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("orgId", query.orgId);
  url.searchParams.set("tblId", query.tblId);
  setQueryValue(url, "objId", query.objId);
  setQueryValue(url, "itmId", query.itmId);
  return url.toString();
}

/**
 * KOSIS may return JavaScript-like JSON with unquoted property names even
 * when format=json is requested. Normalize only object keys and parse it as
 * data; never execute the upstream text as code.
 */
export function parseKosisResponseText(text: string): unknown {
  const normalized = text.trim().replace(/^\uFEFF/, "");
  if (!normalized) return null;
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    const jsonLike = normalized
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
      .replace(/:\s*undefined\b/g, ":null")
      .replace(/:\s*NaN\b/g, ":null");
    try {
      return JSON.parse(jsonLike) as unknown;
    } catch {
      return null;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(row: Record<string, unknown>, name: string): string | null {
  const key = Object.keys(row).find((candidate) => candidate.toUpperCase() === name.toUpperCase());
  if (!key || row[key] === null || row[key] === undefined) return null;
  return String(row[key]);
}

function hasField(row: Record<string, unknown>, name: string): boolean {
  return Object.keys(row).some((candidate) => candidate.toUpperCase() === name.toUpperCase());
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function extractKosisRows(payload: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return null;

  for (const key of ["data", "result", "items", "rows"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return null;
}

export interface KosisParsedValue {
  value: number | null;
  text: string | null;
  symbol: string | null;
}

export function parseKosisValue(raw: string | null | undefined): KosisParsedValue {
  const text = raw?.trim() || null;
  if (!text) return { value: null, text: null, symbol: null };

  const normalized = text.replaceAll(",", "").replace(/\s+/g, " ").trim();
  if (/^[-.]+$|^(?:na|n\/a|null|없음)$/i.test(normalized)) {
    return { value: null, text, symbol: normalized };
  }

  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) {
    const value = Number(normalized);
    return Number.isFinite(value) ? { value, text, symbol: null } : { value: null, text, symbol: normalized };
  }

  return { value: null, text, symbol: normalized };
}

function parseClassification(row: Record<string, unknown>): KosisClassification[] {
  return KOSIS_CLASSIFICATION_LEVELS.flatMap((level) => {
    const code = field(row, `C${level}`);
    const name = field(row, `C${level}_NM`);
    const nameEn = field(row, `C${level}_NM_ENG`);
    const objectName = field(row, `C${level}_OBJ_NM`);
    const objectNameEn = field(row, `C${level}_OBJ_NM_ENG`);
    if (!code && !name && !objectName && !hasField(row, `C${level}`)) return [];
    return [{ level, code, name, nameEn, objectName, objectNameEn }];
  });
}

function cloneRaw(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row));
}

export function parseKosisStatisticsResponse(payload: unknown): KosisRecord[] {
  const rows = extractKosisRows(payload) ?? [];
  return rows.map((row) => {
    const parsedValue = parseKosisValue(field(row, "DT"));
    return {
      source: "KOSIS",
      orgId: field(row, "ORG_ID"),
      tblId: field(row, "TBL_ID"),
      tableName: field(row, "TBL_NM"),
      classifications: parseClassification(row),
      itemId: field(row, "ITM_ID"),
      itemName: field(row, "ITM_NM"),
      itemNameEn: field(row, "ITM_NM_ENG"),
      unitId: field(row, "UNIT_ID"),
      unitName: field(row, "UNIT_NM"),
      unitNameEn: field(row, "UNIT_NM_ENG"),
      periodType: field(row, "PRD_SE"),
      period: field(row, "PRD_DE"),
      value: parsedValue.value,
      valueText: parsedValue.text,
      valueSymbol: parsedValue.symbol,
      lastChangedDate: field(row, "LST_CHN_DE"),
      raw: cloneRaw(row),
    } satisfies KosisRecord;
  });
}

export function summarizeKosisRecords(records: KosisRecord[]): KosisTableMetadata {
  return {
    orgId: records[0]?.orgId ?? null,
    tblId: records[0]?.tblId ?? null,
    tableName: records[0]?.tableName ?? null,
    periodTypes: unique(records.map((record) => record.periodType)),
    periods: unique(records.map((record) => record.period)),
    units: unique(records.map((record) => record.unitName)),
    classificationLevels: [...new Set(records.flatMap((record) => record.classifications.map((classification) => classification.level)))].sort((a, b) => a - b),
    rowCount: records.length,
  };
}

export function parseKosisSearchResponse(payload: unknown): KosisSearchResult[] {
  const rows = extractKosisRows(payload) ?? [];
  return rows.map((row) => ({
    organizationId: field(row, "ORG_ID"),
    organizationName: field(row, "ORG_NM"),
    tableId: field(row, "TBL_ID"),
    tableName: field(row, "TBL_NM"),
    statId: field(row, "STAT_ID"),
    statName: field(row, "STAT_NM"),
    contents: field(row, "CONTENTS"),
    startPeriod: field(row, "STRT_PRD_DE"),
    endPeriod: field(row, "END_PRD_DE"),
    tableViewUrl: field(row, "TBL_VIEW_URL"),
    linkUrl: field(row, "LINK_URL"),
    raw: cloneRaw(row),
  }));
}

export function parseKosisMetadataResponse(payload: unknown): KosisMetadataRecord[] {
  const rows = extractKosisRows(payload) ?? [];
  return rows.map((row) => ({
    objectId: field(row, "OBJ_ID"),
    objectName: field(row, "OBJ_NM"),
    objectNameEn: field(row, "OBJ_NM_ENG"),
    itemId: field(row, "ITM_ID"),
    itemName: field(row, "ITM_NM"),
    itemNameEn: field(row, "ITM_NM_ENG"),
    parentItemId: field(row, "UP_ITM_ID"),
    objectSequence: field(row, "OBJ_ID_SN"),
    unitId: field(row, "UNIT_ID"),
    unitName: field(row, "UNIT_NM"),
    unitNameEn: field(row, "UNIT_ENG_NM"),
    raw: cloneRaw(row),
  }));
}
