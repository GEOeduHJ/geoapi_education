#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const envPath = path.join(projectRoot, ".env.local");
const KOSIS_TABLE_ENDPOINT = "https://kosis.kr/openapi/Param/statisticsParameterData.do";
const KOSIS_METADATA_ENDPOINT = "https://kosis.kr/openapi/statisticsData.do";
const SUPABASE_SOURCE_KEY = "kosis-statistics-table";
const MAX_SNAPSHOT_ROWS = 2_000;
const CODE_FIELDS = new Set(["objL1", "objL2", "objL3", "objL4", "objL5", "objL6", "objL7", "objL8", "itmId"]);
const PERIODS = new Set(["Y", "Q", "M", "S", "D", "F", "IR"]);

function loadLocalEnv() {
  if (!fs.existsSync(envPath)) return {};
  const values = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    values[key] = value;
  }
  return values;
}

const localEnv = loadLocalEnv();
const env = (key) => process.env[key] || localEnv[key] || "";

export function normalizeCodeList(value) {
  return String(value ?? "").split(/[,\s]+/).filter(Boolean).join(" ");
}

function parseArgs(argv) {
  const options = { write: false, public: false, maxRows: MAX_SNAPSHOT_ROWS, smblChk: "Y" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--write") {
      options.write = true;
      continue;
    }
    if (argument === "--public") {
      options.public = true;
      continue;
    }
    const separator = argument.indexOf("=");
    const rawKey = separator >= 0 ? argument.slice(2, separator) : argument.slice(2);
    const rawValue = separator >= 0 ? argument.slice(separator + 1) : argv[++index];
    if (!rawValue) throw new Error(`알 수 없거나 값이 없는 옵션: ${argument}`);
    const key = rawKey.replaceAll("-", "");
    if (["orgid", "tblid", "objl1", "objl2", "objl3", "objl4", "objl5", "objl6", "objl7", "objl8", "itmid"].includes(key)) {
      options[rawKey] = rawValue;
      continue;
    }
    if (["prdse", "startprdde", "endprdde", "smblchk"].includes(key)) {
      options[rawKey] = rawValue;
      continue;
    }
    if (rawKey === "max-rows") {
      const parsed = Number(rawValue);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SNAPSHOT_ROWS) throw new Error(`max-rows는 1~${MAX_SNAPSHOT_ROWS} 범위여야 합니다.`);
      options.maxRows = parsed;
      continue;
    }
    throw new Error(`알 수 없는 옵션: ${argument}`);
  }
  return options;
}

function required(options, name) {
  const value = options[name]?.trim();
  if (!value) throw new Error(`${name} 값이 필요합니다.`);
  return value;
}

function buildQuery(options) {
  const query = {
    orgId: required(options, "org-id"),
    tblId: required(options, "tbl-id"),
    objL1: normalizeCodeList(required(options, "obj-l1")),
    itmId: normalizeCodeList(required(options, "itm-id")),
    prdSe: required(options, "prd-se").toUpperCase(),
    ...(options["obj-l2"]?.trim() ? { objL2: normalizeCodeList(options["obj-l2"]) } : {}),
  };
  for (const level of [3, 4, 5, 6, 7, 8]) {
    const value = normalizeCodeList(options[`obj-l${level}`]);
    if (value) query[`objL${level}`] = value;
  }
  if (options["start-prd-de"]) query.startPrdDe = options["start-prd-de"].trim();
  if (options["end-prd-de"]) query.endPrdDe = options["end-prd-de"].trim();
  if (options["smbl-chk"]) query.smblChk = options["smbl-chk"].toUpperCase();
  else query.smblChk = options.smblChk;
  if (!PERIODS.has(query.prdSe)) throw new Error(`지원하지 않는 prd-se입니다: ${query.prdSe}`);
  if ((query.startPrdDe && !query.endPrdDe) || (!query.startPrdDe && query.endPrdDe)) throw new Error("start-prd-de와 end-prd-de는 함께 지정해야 합니다.");
  if (!query.startPrdDe) throw new Error("스냅샷은 재현 가능한 기간을 위해 start-prd-de/end-prd-de가 필요합니다.");
  if (query.startPrdDe.length !== query.endPrdDe.length || query.startPrdDe > query.endPrdDe) throw new Error("기간 범위가 올바르지 않습니다.");
  if (query.smblChk !== "Y" && query.smblChk !== "N") throw new Error("smbl-chk는 Y 또는 N이어야 합니다.");
  return query;
}

function setQueryValue(url, key, value) {
  if (value !== undefined && value !== "") {
    const normalized = CODE_FIELDS.has(key) ? normalizeCodeList(value) : String(value);
    url.searchParams.set(key, normalized);
  }
}

export function buildKosisTableUrl(apiKey, query) {
  const url = new URL(KOSIS_TABLE_ENDPOINT);
  url.searchParams.set("method", "getList");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("jsonVD", "Y");
  for (const [key, value] of Object.entries(query)) setQueryValue(url, key, value);
  return url;
}

function buildKosisMetadataUrl(apiKey, query) {
  const url = new URL(KOSIS_METADATA_ENDPOINT);
  url.searchParams.set("method", "getMeta");
  url.searchParams.set("type", "ITM");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("orgId", query.orgId);
  url.searchParams.set("tblId", query.tblId);
  return url;
}

function skipWhitespace(text, start) {
  let index = start;
  while (/\s/.test(text[index] ?? "")) index += 1;
  return index;
}

function looksLikeObjectKey(text, start) {
  let index = skipWhitespace(text, start);
  if (text[index] === '"') {
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") {
        index += 2;
        continue;
      }
      if (text[index] === '"') return text[skipWhitespace(text, index + 1)] === ":";
      index += 1;
    }
    return false;
  }
  const match = text.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
  return Boolean(match && text[skipWhitespace(text, index + match[0].length)] === ":");
}

/**
 * KOSIS occasionally returns JavaScript-like JSON with bare property names
 * or an unescaped quote in a text value. This is a data-only parser; it never
 * evaluates upstream text.
 */
function parseJsonLike(text) {
  let index = 0;

  function parseString(mode) {
    index += 1;
    let value = "";
    while (index < text.length) {
      const character = text[index];
      index += 1;
      if (character === "\\") {
        const escaped = text[index];
        index += 1;
        if (escaped === "u") {
          const hex = text.slice(index, index + 4);
          if (!/^[0-9A-Fa-f]{4}$/.test(hex)) throw new Error("Invalid unicode escape");
          value += String.fromCharCode(Number.parseInt(hex, 16));
          index += 4;
        } else {
          value += ({ b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" })[escaped] ?? escaped;
        }
        continue;
      }
      if (character !== '"') {
        value += character;
        continue;
      }
      const next = skipWhitespace(text, index);
      const closesKey = mode === "key" && text[next] === ":";
      const closesValue = mode === "array-value"
        ? [",", "]", "}"].includes(text[next] ?? "")
        : text[next] === "}" || text[next] === "]" || (text[next] === "," && looksLikeObjectKey(text, next + 1));
      if (closesKey || closesValue || next >= text.length) return value;
      value += '"';
    }
    throw new Error("Unterminated string");
  }

  function parseBareKey() {
    const start = index;
    while (index < text.length && !/[:\s]/.test(text[index])) index += 1;
    const key = text.slice(start, index).trim();
    if (!key) throw new Error("Empty object key");
    return key;
  }

  function parseBareValue() {
    const start = index;
    while (index < text.length && !/[,}\]]/.test(text[index])) index += 1;
    const token = text.slice(start, index).trim();
    if (!token || token === "null" || token === "undefined" || token === "NaN") return null;
    if (token === "true") return true;
    if (token === "false") return false;
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token)) return Number(token);
    return token;
  }

  function parseValue(mode = "array-value") {
    index = skipWhitespace(text, index);
    if (text[index] === "{") return parseObject();
    if (text[index] === "[") return parseArray();
    if (text[index] === '"') return parseString(mode);
    return parseBareValue();
  }

  function parseObject() {
    index += 1;
    const object = {};
    index = skipWhitespace(text, index);
    if (text[index] === "}") {
      index += 1;
      return object;
    }
    while (index < text.length) {
      index = skipWhitespace(text, index);
      const key = text[index] === '"' ? parseString("key") : parseBareKey();
      index = skipWhitespace(text, index);
      if (text[index] !== ":") throw new Error("Expected object colon");
      index += 1;
      object[key] = parseValue("object-value");
      index = skipWhitespace(text, index);
      if (text[index] === "}") {
        index += 1;
        return object;
      }
      if (text[index] !== ",") throw new Error("Expected object comma");
      index += 1;
    }
    throw new Error("Unterminated object");
  }

  function parseArray() {
    index += 1;
    const array = [];
    index = skipWhitespace(text, index);
    if (text[index] === "]") {
      index += 1;
      return array;
    }
    while (index < text.length) {
      array.push(parseValue("array-value"));
      index = skipWhitespace(text, index);
      if (text[index] === "]") {
        index += 1;
        return array;
      }
      if (text[index] !== ",") throw new Error("Expected array comma");
      index += 1;
    }
    throw new Error("Unterminated array");
  }

  const result = parseValue();
  index = skipWhitespace(text, index);
  if (index !== text.length) throw new Error("Unexpected trailing data");
  return result;
}

export function parseProviderText(text) {
  const normalized = text.trim().replace(/^\uFEFF/, "");
  if (!normalized || !/^[\[{]/.test(normalized)) return null;
  try {
    return JSON.parse(normalized);
  } catch {
    try {
      return parseJsonLike(normalized);
    } catch {
      return null;
    }
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(row, name) {
  const key = Object.keys(row).find((candidate) => candidate.toUpperCase() === name.toUpperCase());
  if (!key || row[key] === null || row[key] === undefined) return null;
  return String(row[key]);
}

function rowsFrom(payload) {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return null;
  for (const key of ["data", "result", "items", "rows"]) {
    if (Array.isArray(payload[key])) return payload[key].filter(isRecord);
  }
  return null;
}

function providerError(payload) {
  if (!isRecord(payload)) return null;
  const code = field(payload, "ERR") ?? field(payload, "ERR_CD") ?? field(payload, "ERRCD") ?? field(payload, "CODE");
  const message = field(payload, "ERR_MSG") ?? field(payload, "ERRMSG") ?? field(payload, "MESSAGE");
  return code || message ? { code, message } : null;
}

function parsedValue(raw) {
  const text = raw?.trim() || null;
  if (!text) return { value: null, text: null, symbol: null };
  const normalized = text.replaceAll(",", "").replace(/\s+/g, " ").trim();
  if (/^[-.]+$|^(?:na|n\/a|null|없음)$/i.test(normalized)) return { value: null, text, symbol: normalized };
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) {
    const value = Number(normalized);
    if (Number.isFinite(value)) return { value, text, symbol: null };
  }
  return { value: null, text, symbol: normalized };
}

export function parseKosisRecords(payload) {
  return (rowsFrom(payload) ?? []).map((row) => {
    const classifications = [];
    for (let level = 1; level <= 8; level += 1) {
      const code = field(row, `C${level}`);
      const name = field(row, `C${level}_NM`);
      const objectName = field(row, `C${level}_OBJ_NM`);
      if (code || name || objectName || Object.keys(row).some((key) => key.toUpperCase() === `C${level}`)) classifications.push({ level, code, name, objectName });
    }
    const value = parsedValue(field(row, "DT"));
    return {
      orgId: field(row, "ORG_ID"),
      tblId: field(row, "TBL_ID"),
      tableName: field(row, "TBL_NM"),
      classifications,
      itemId: field(row, "ITM_ID"),
      itemName: field(row, "ITM_NM"),
      unitName: field(row, "UNIT_NM"),
      periodType: field(row, "PRD_SE"),
      period: field(row, "PRD_DE"),
      value: value.value,
      valueText: value.text,
      valueSymbol: value.symbol,
      lastChangedDate: field(row, "LST_CHN_DE"),
      raw: row,
    };
  });
}

function periodStart(periodType, period) {
  if (!period) return null;
  const value = period.replace(/[^0-9]/g, "");
  // KOSIS 응답의 PRD_SE는 요청 코드(Y)와 다르게 연간을 "A"로 반환할 수 있다.
  if ((periodType === "Y" || periodType === "F" || periodType === "A") && /^\d{4}$/.test(value)) return `${value}-01-01`;
  if (periodType === "M" && /^\d{6}$/.test(value) && Number(value.slice(4)) >= 1 && Number(value.slice(4)) <= 12) return `${value.slice(0, 4)}-${value.slice(4)}-01`;
  if ((periodType === "Q" || periodType === "S") && /^\d{5,6}$/.test(value)) return `${value.slice(0, 4)}-01-01`;
  if (periodType === "D" && /^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
  return null;
}

function chooseRegion(classifications) {
  return classifications.find((item) => /(지역|행정구역|시도|시군구|읍면동)/.test(`${item.objectName ?? ""} ${item.name ?? ""}`)) ?? classifications[0] ?? null;
}

export function normalizeKosisRecords(records) {
  return records.map((record) => {
    const region = chooseRegion(record.classifications);
    const classificationLabel = record.classifications.map((item) => item.name).filter(Boolean).join(" / ") || "분류값 없음";
    const classificationKey = record.classifications.map((item) => `${item.level}=${item.code ?? item.name ?? ""}`).join("|");
    const externalId = [record.orgId, record.tblId, record.itemId, record.periodType, record.period, classificationKey].join(":");
    return {
      external_id: externalId.slice(0, 500),
      observed_at: periodStart(record.periodType, record.period),
      region_code: region?.code ?? null,
      label: classificationLabel,
      value: record.value,
      unit: record.unitName,
      category: record.itemName,
      attributes: {
        provider: "KOSIS",
        org_id: record.orgId,
        tbl_id: record.tblId,
        table_name: record.tableName,
        item_id: record.itemId,
        item_name: record.itemName,
        period_type: record.periodType,
        period: record.period,
        value_text: record.valueText,
        value_symbol: record.valueSymbol,
        last_changed_date: record.lastChangedDate,
        classifications: record.classifications,
      },
    };
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// DRY-RUN 로그와 source_snapshots.checksum이 같은 값을 가리키도록 직렬화 모양을 고정한다.
export function buildSnapshotChecksum(query, rawPayload, metadataRows) {
  return sha256(JSON.stringify({ query, rawPayload, metadataRows }));
}

function safeBody(body, secrets = []) {
  let value = body.replace(/\s+/g, " ").trim();
  for (const secret of secrets) if (secret) value = value.split(secret).join("[redacted]");
  return value.slice(0, 240);
}

async function fetchProvider(url) {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GeoLab-Classroom/0.1" } });
  const body = await response.text();
  if (!response.ok) throw new Error(`KOSIS HTTP ${response.status}: ${safeBody(body, [env("KOSIS_API_KEY")])}`);
  const payload = parseProviderText(body);
  if (!payload) throw new Error("KOSIS 응답을 JSON 자료로 해석하지 못했습니다.");
  const error = providerError(payload);
  if (error) throw new Error(`KOSIS 요청 거부${error.code ? ` (${error.code})` : ""}: ${error.message ?? "제공기관 오류"}`);
  return { payload, body };
}

function supabaseConfig() {
  const url = (env("SUPABASE_URL") || env("VITE_SUPABASE_URL")).replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("--write에는 SUPABASE_URL(또는 VITE_SUPABASE_URL)와 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  return { url, key };
}

async function supabaseRequest(config, pathname, init = {}) {
  const response = await fetch(`${config.url}${pathname}`, {
    ...init,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}: ${safeBody(body, [config.key])}`);
  return body ? JSON.parse(body) : null;
}

async function upsertRows(config, table, rows, conflict) {
  for (let index = 0; index < rows.length; index += 500) {
    await supabaseRequest(config, `/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(index, index + 500)),
    });
  }
}

async function findOne(config, table, filters) {
  const url = new URL(`${config.url}/rest/v1/${table}`);
  url.searchParams.set("select", "id");
  url.searchParams.set("limit", "1");
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, `eq.${value}`);
  const rows = await supabaseRequest(config, `${url.pathname}${url.search}`);
  if (!rows?.[0]?.id) throw new Error(`${table}에서 대상 id를 찾지 못했습니다.`);
  return rows[0].id;
}

async function writeSnapshot(config, query, rawPayload, metadataRows, records, observations, isPublic) {
  await upsertRows(config, "data_sources", [{
    provider: "KOSIS 공유서비스",
    source_key: SUPABASE_SOURCE_KEY,
    title: "KOSIS 통계표 원자료",
    official_url: "https://kosis.kr/openapi/introduce/introduce_01List.do",
    auth_type: "API 키",
    terms_summary: "KOSIS 통계표의 요청 파라미터·원자료·metadata·checksum을 보존하고 교육자료에 출처를 표시.",
  }], "source_key");
  const dataSourceId = await findOne(config, "data_sources", { source_key: SUPABASE_SOURCE_KEY });
  const requestFingerprint = `kosis-statistics-v1:${sha256(JSON.stringify(query)).slice(0, 32)}`;
  const dates = records.map((record) => periodStart(record.periodType, record.period)).filter(Boolean).sort();
  await upsertRows(config, "source_snapshots", [{
    data_source_id: dataSourceId,
    valid_from: dates[0] ?? null,
    valid_to: dates.at(-1) ?? null,
    request_fingerprint: requestFingerprint,
    schema_version: "kosis-statistics-v1",
    raw_payload: {
      provider: "KOSIS",
      endpoint: KOSIS_TABLE_ENDPOINT,
      metadata_endpoint: KOSIS_METADATA_ENDPOINT,
      query,
      metadata: metadataRows,
      rows: rawPayload,
      normalized: { row_count: records.length, observation_count: observations.length, region_rule: "지역·행정구역 명칭 우선, 없으면 첫 분류" },
    },
    row_count: records.length,
    checksum: buildSnapshotChecksum(query, rawPayload, metadataRows),
    is_public: isPublic,
  }], "data_source_id,request_fingerprint,schema_version");
  const snapshotId = await findOne(config, "source_snapshots", {
    data_source_id: dataSourceId,
    request_fingerprint: requestFingerprint,
    schema_version: "kosis-statistics-v1",
  });
  await upsertRows(config, "geo_observations", observations.map((observation) => ({ ...observation, snapshot_id: snapshotId })), "snapshot_id,external_id");
  return snapshotId;
}

function printHelp() {
  console.log(`KOSIS 통계표 snapshot 수집기

기본 동작은 DRY-RUN이며, --write를 붙여야 Supabase에 저장합니다.
공개 브라우저에서 읽게 하려면 --write --public을 함께 사용합니다.
저장 상한은 ${MAX_SNAPSHOT_ROWS.toLocaleString("ko-KR")}행이며, 먼저 작은 기간·지역으로 검증합니다.

사용법:
  node scripts/kosis-snapshot.mjs --org-id=101 --tbl-id=DT_1YL12001E \\
    --obj-l1=21010,21020 --obj-l2=ALL --itm-id=T001 --prd-se=M \\
    --start-prd-de=202401 --end-prd-de=202404

옵션:
  --org-id, --tbl-id, --obj-l1, --itm-id  KOSIS 표·분류·항목 코드(필수)
  --obj-l2 ... --obj-l8                  추가 분류 코드(단일 분류 표는 생략)
  --prd-se=Y|Q|M|S|D|F|IR                 주기
  --start-prd-de, --end-prd-de            재현 가능한 기간 범위(필수)
  --max-rows=2000                         저장 상한(최대 ${MAX_SNAPSHOT_ROWS})
  --write                                Supabase snapshot·관측값 적재
  --public                               적재한 snapshot·관측값을 공개 읽기 허용
  --help                                 도움말`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const query = buildQuery(options);
  const apiKey = env("KOSIS_API_KEY");
  if (!apiKey) throw new Error("KOSIS_API_KEY가 설정되지 않았습니다.");

  const tableResponse = await fetchProvider(buildKosisTableUrl(apiKey, query));
  const tableRows = rowsFrom(tableResponse.payload) ?? [];
  const records = parseKosisRecords(tableResponse.payload);
  if (records.length === 0) throw new Error("KOSIS 통계값이 없습니다. 코드·기간·승인 상태를 확인하세요.");
  if (records.length > options.maxRows) throw new Error(`응답 ${records.length.toLocaleString("ko-KR")}행이 max-rows ${options.maxRows.toLocaleString("ko-KR")}행을 초과했습니다. 지역·기간을 줄여 다시 실행하세요.`);

  const metadataResponse = await fetchProvider(buildKosisMetadataUrl(apiKey, query));
  const metadataRows = rowsFrom(metadataResponse.payload) ?? [];
  const observations = normalizeKosisRecords(records);
  const periods = [...new Set(records.map((record) => record.period).filter(Boolean))];
  const units = [...new Set(records.map((record) => record.unitName).filter(Boolean))];
  const regionCodes = [...new Set(observations.map((observation) => observation.region_code).filter(Boolean))];
  console.log(`KOSIS ${query.orgId}/${query.tblId} · ${records.length.toLocaleString("ko-KR")}행 · ${options.write ? "WRITE" : "DRY-RUN"}`);
  console.log(`periods: ${periods.slice(0, 8).join(", ")}${periods.length > 8 ? " …" : ""} · units: ${units.join(", ") || "응답 없음"} · region codes: ${regionCodes.length.toLocaleString("ko-KR")}개`);
  console.log(`metadata: ${metadataRows.length.toLocaleString("ko-KR")}개 · checksum: ${buildSnapshotChecksum(query, tableRows, metadataRows).slice(0, 16)}…`);

  if (!options.write) {
    console.log("검증만 완료했습니다. Supabase 적재는 같은 명령에 --write를 추가하세요.");
    return;
  }
  const snapshotId = await writeSnapshot(supabaseConfig(), query, tableRows, metadataRows, records, observations, options.public);
  console.log(`완료: snapshot ${snapshotId} · geo_observations ${observations.length.toLocaleString("ko-KR")}행 저장${options.public ? " · 공개 읽기 허용" : " · 비공개"}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`FAIL  ${error instanceof Error ? error.message : "KOSIS snapshot 수집 실패"}`);
    process.exitCode = 1;
  });
}
