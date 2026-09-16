#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const envPath = path.join(projectRoot, ".env.local");
const KMA_ENDPOINT = "https://apihub.kma.go.kr/api/typ01/url";
const SUPABASE_SOURCE_KEY = "kma-asos-daily";
const DEFAULT_STATIONS = ["101", "105", "108", "112", "133", "143", "146", "156", "159", "184"];
const DEFAULT_FROM = "2024-01-01";
const DEFAULT_TO = "2024-01-03";
const MAX_DAYS_PER_REQUEST = 31;
const REQUEST_DELAY_MS = 250;

// The API uses a fixed-width, whitespace-separated row after the help header.
// Keep every raw column in raw_values even when the UI only needs the selected
// climate metrics below.
export const KMA_DAILY_COLUMNS = [
  "TM", "STN", "WS_AVG", "WR_DAY", "WD_MAX", "WS_MAX", "WS_MAX_TM", "WD_INS", "WS_INS", "WS_INS_TM",
  "TA_AVG", "TA_MAX", "TA_MAX_TM", "TA_MIN", "TA_MIN_TM", "TD_AVG", "TS_AVG", "TG_MIN", "HM_AVG", "HM_MIN",
  "HM_MIN_TM", "PV_AVG", "EV_S", "EV_L", "FG_DUR", "PA_AVG", "PS_AVG", "PS_MAX", "PS_MAX_TM", "PS_MIN",
  "PS_MIN_TM", "CA_TOT", "SS_DAY", "SS_DUR", "SS_CMB", "SI_DAY", "SI_60M_MAX", "SI_60M_MAX_TM", "RN_DAY",
  "RN_D99", "RN_DUR", "RN_60M_MAX", "RN_60M_MAX_TM", "RN_10M_MAX", "RN_10M_MAX_TM", "RN_POW_MAX",
  "RN_POW_MAX_TM", "SD_NEW", "SD_NEW_TM", "SD_MAX", "SD_MAX_TM", "TE_05", "TE_10", "TE_15", "TE_30", "TE_50",
];

const NON_NEGATIVE_FIELDS = new Set([
  "WS_AVG", "WR_DAY", "WS_MAX", "WS_INS", "HM_AVG", "HM_MIN", "PV_AVG", "EV_S", "EV_L", "FG_DUR",
  "PA_AVG", "PS_AVG", "PS_MAX", "PS_MIN", "CA_TOT", "SS_DAY", "SS_DUR", "SS_CMB", "SI_DAY", "SI_60M_MAX",
  "RN_DAY", "RN_D99", "RN_DUR", "RN_60M_MAX", "RN_10M_MAX", "RN_POW_MAX", "SD_NEW", "SD_MAX",
  "TE_05", "TE_10", "TE_15", "TE_30", "TE_50",
]);

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

function parseArgs(argv) {
  const options = { from: DEFAULT_FROM, to: DEFAULT_TO, stations: DEFAULT_STATIONS, write: false, delayMs: REQUEST_DELAY_MS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--write") {
      options.write = true;
      continue;
    }
    const equals = argument.indexOf("=");
    const key = equals >= 0 ? argument.slice(2, equals) : argument.slice(2);
    const value = equals >= 0 ? argument.slice(equals + 1) : argv[++index];
    if (!["from", "to", "stations", "delay-ms"].includes(key) || !value) {
      throw new Error(`알 수 없거나 값이 없는 옵션: ${argument}`);
    }
    if (key === "stations") options.stations = value.split(",").map((station) => station.trim()).filter(Boolean);
    else if (key === "delay-ms") options.delayMs = Number(value);
    else options[key] = value;
  }
  return options;
}

export function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`날짜 형식은 YYYY-MM-DD여야 합니다: ${value}`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`유효하지 않은 날짜입니다: ${value}`);
  return date;
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function splitDateRange(from, to, maxDays = MAX_DAYS_PER_REQUEST) {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (start > end) throw new Error("from 날짜가 to 날짜보다 늦습니다.");
  const ranges = [];
  let cursor = start;
  while (cursor <= end) {
    const chunkEnd = addDays(cursor, maxDays - 1);
    const boundedEnd = chunkEnd < end ? chunkEnd : end;
    ranges.push({ from: formatIsoDate(cursor), to: formatIsoDate(boundedEnd) });
    cursor = addDays(boundedEnd, 1);
  }
  return ranges;
}

function dateToKma(value) {
  return value.replaceAll("-", "");
}

function decodeKma(buffer) {
  return new TextDecoder("euc-kr").decode(buffer);
}

function isDataLine(line) {
  return /^\d{8}\s+\d+\s/.test(line.trim());
}

function parseNumeric(raw, field) {
  if (raw === undefined || raw === null || raw === "" || raw === "-") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  // KMA uses negative sentinels for unavailable non-negative observations.
  // Negative temperatures remain valid; extremely low sentinels are still
  // treated as missing for temperature fields.
  if ((NON_NEGATIVE_FIELDS.has(field) && value <= -9) || (!NON_NEGATIVE_FIELDS.has(field) && value <= -90)) return null;
  return value;
}

function rawValue(raw) {
  if (raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : raw;
}

export function parseKmaDaily(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!isDataLine(line)) continue;
    const values = line.trim().split(/\s+/);
    if (values.length < KMA_DAILY_COLUMNS.length) {
      throw new Error(`ASOS 일자료 열 수가 예상보다 적습니다: ${values.length}/${KMA_DAILY_COLUMNS.length}`);
    }
    const record = Object.fromEntries(KMA_DAILY_COLUMNS.map((column, index) => [column, values[index]]));
    const rawValues = Object.fromEntries(KMA_DAILY_COLUMNS.map((column) => [column, rawValue(record[column])]));
    const qualityFlags = [];
    for (const column of KMA_DAILY_COLUMNS) {
      if (parseNumeric(record[column], column) === null && record[column] !== undefined && record[column] !== "-") {
        qualityFlags.push(`missing:${column}`);
      }
    }
    rows.push({
      station_id: record.STN,
      observation_date: `${record.TM.slice(0, 4)}-${record.TM.slice(4, 6)}-${record.TM.slice(6, 8)}`,
      ta_avg: parseNumeric(record.TA_AVG, "TA_AVG"),
      ta_max: parseNumeric(record.TA_MAX, "TA_MAX"),
      ta_min: parseNumeric(record.TA_MIN, "TA_MIN"),
      rn_day: parseNumeric(record.RN_DAY, "RN_DAY"),
      ws_avg: parseNumeric(record.WS_AVG, "WS_AVG"),
      hm_avg: parseNumeric(record.HM_AVG, "HM_AVG"),
      ss_day: parseNumeric(record.SS_DAY, "SS_DAY"),
      si_day: parseNumeric(record.SI_DAY, "SI_DAY"),
      raw_values: rawValues,
      quality_flags: qualityFlags,
    });
  }
  return rows;
}

export function parseKmaStations(text) {
  const stations = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^\d+\s+[-\d.]+\s+[-\d.]+\s/.test(trimmed)) continue;
    const values = trimmed.split(/\s+/);
    if (values.length < 15) continue;
    const [stationId, longitude, latitude, stationType, altitude, pressureAltitude, temperatureHeight, windHeight, rainHeight, managingOffice, nameKo, nameEn, forecastZone, lawCode, basin] = values;
    const parsed = {
      station_id: stationId,
      name_ko: nameKo,
      name_en: nameEn,
      longitude: Number(longitude),
      latitude: Number(latitude),
      altitude_m: Number(altitude),
      law_code: lawCode,
      address: values.slice(15).join(" ").trim(),
      metadata: {
        provider: "KMA",
        station_type: stationType,
        pressure_altitude_m: Number(pressureAltitude),
        temperature_height_m: Number(temperatureHeight),
        wind_height_m: Number(windHeight),
        rain_gauge_height_m: Number(rainHeight),
        managing_office: managingOffice,
        forecast_zone: forecastZone,
        basin,
      },
    };
    if (Number.isFinite(parsed.longitude) && Number.isFinite(parsed.latitude) && parsed.name_ko) stations.push(parsed);
  }
  return stations;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildKmaUrl(endpoint, params) {
  const url = new URL(`${KMA_ENDPOINT}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  url.searchParams.set("authKey", env("KMA_AUTH_KEY"));
  return url;
}

async function fetchKma(endpoint, params) {
  const response = await fetch(buildKmaUrl(endpoint, params), {
    headers: { Accept: "text/plain", "User-Agent": "GeoLab-Classroom/0.1" },
  });
  const body = decodeKma(await response.arrayBuffer());
  if (!response.ok) throw new Error(`KMA HTTP ${response.status}: ${body.replace(/\s+/g, " ").slice(0, 160)}`);
  return body;
}

function supabaseConfig() {
  const url = (env("SUPABASE_URL") || env("VITE_SUPABASE_URL")).replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("--write에는 SUPABASE_URL(또는 VITE_SUPABASE_URL)와 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  return { url, key };
}

function safeBody(body, secrets = []) {
  let value = body.replace(/\s+/g, " ").trim();
  for (const secret of secrets) if (secret) value = value.split(secret).join("[redacted]");
  return value.slice(0, 200);
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
  if (rows.length === 0) return;
  const endpoint = new URL(`${config.url}/rest/v1/${table}`);
  endpoint.searchParams.set("on_conflict", conflict);
  for (let index = 0; index < rows.length; index += 500) {
    await supabaseRequest(config, `${endpoint.pathname}${endpoint.search}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(index, index + 500)),
    });
  }
}

async function findOne(config, table, filters) {
  const endpoint = new URL(`${config.url}/rest/v1/${table}`);
  endpoint.searchParams.set("select", "id");
  endpoint.searchParams.set("limit", "1");
  for (const [key, value] of Object.entries(filters)) endpoint.searchParams.set(key, `eq.${value}`);
  const rows = await supabaseRequest(config, `${endpoint.pathname}${endpoint.search}`);
  if (!rows?.[0]?.id) throw new Error(`${table}에서 대상 id를 찾지 못했습니다.`);
  return rows[0].id;
}

async function writeChunk(config, dataSourceId, range, stations, body, rows) {
  const requestFingerprint = `kma-sfcdd3:${range.from}:${range.to}:stn=${stations.join(":")}`;
  await upsertRows(config, "source_snapshots", [{
    data_source_id: dataSourceId,
    valid_from: range.from,
    valid_to: range.to,
    request_fingerprint: requestFingerprint,
    schema_version: "v1",
    raw_payload: {
      encoding: "EUC-KR",
      endpoint: "https://apihub.kma.go.kr/api/typ01/url/kma_sfcdd3.php",
      params: { tm1: dateToKma(range.from), tm2: dateToKma(range.to), stn: stations.join(":"), help: 0, mode: 0 },
      checksum: sha256(body),
      row_count: rows.length,
    },
    row_count: rows.length,
    checksum: sha256(body),
    is_public: true,
  }], "data_source_id,request_fingerprint,schema_version");
  const snapshotId = await findOne(config, "source_snapshots", {
    data_source_id: dataSourceId,
    request_fingerprint: requestFingerprint,
    schema_version: "v1",
  });
  await upsertRows(config, "climate_daily_observations", rows.map((row) => ({ ...row, snapshot_id: snapshotId })), "station_id,observation_date");
  return snapshotId;
}

function printHelp() {
  console.log(`KMA ASOS 기후자료 수집기

사용법:
  node scripts/kma-climate.mjs [옵션]

옵션:
  --from=YYYY-MM-DD       시작일 (기본: ${DEFAULT_FROM})
  --to=YYYY-MM-DD         종료일 (기본: ${DEFAULT_TO})
  --stations=108,133,159  ASOS 지점번호 (기본: ${DEFAULT_STATIONS.join(",")})
  --write                 Supabase에 적재. 생략하면 API 조회·파싱만 수행
  --delay-ms=250          KMA 요청 사이 대기시간

예시:
  node scripts/kma-climate.mjs --from=2024-01-01 --to=2024-01-03 --stations=108,133,159
  node scripts/kma-climate.mjs --from=2016-01-01 --to=2025-12-31 --stations=101,105,108,112,133,143,146,156,159,184 --write`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  if (!env("KMA_AUTH_KEY")) throw new Error("KMA_AUTH_KEY가 설정되지 않았습니다.");
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) throw new Error("delay-ms는 0 이상의 숫자여야 합니다.");
  const ranges = splitDateRange(options.from, options.to);
  const stations = options.stations;
  if (stations.length === 0 || stations.some((station) => !/^\d+$/.test(station))) throw new Error("stations는 숫자 지점번호를 쉼표로 구분해야 합니다.");

  console.log(`KMA ASOS daily ${options.from}..${options.to} · ${stations.join(",")} · ${options.write ? "WRITE" : "DRY-RUN"}`);
  const stationText = await fetchKma("stn_inf.php", { inf: "SFC", help: 0 });
  const stationCatalog = parseKmaStations(stationText);
  const stationById = new Map(stationCatalog.map((station) => [station.station_id, station]));
  const selectedStations = stations.map((station) => stationById.get(station)).filter(Boolean);
  const missingStations = stations.filter((station) => !stationById.has(station));
  if (missingStations.length) throw new Error(`ASOS 관측소 목록에서 찾지 못한 지점: ${missingStations.join(",")}`);
  console.log(`station metadata: ${selectedStations.length} matched / ${stationCatalog.length} catalog rows`);

  const config = options.write ? supabaseConfig() : null;
  let dataSourceId = null;
  if (config) {
    await upsertRows(config, "data_sources", [{
      provider: "기상청 API허브",
      source_key: SUPABASE_SOURCE_KEY,
      title: "종관기상관측(ASOS) 일자료",
      official_url: "https://apihub.kma.go.kr/apiList.do",
      auth_type: "API 키",
      terms_summary: "기상청 API허브 ASOS 일자료. 원자료 요청정보·checksum·정규화 규칙을 함께 보존.",
    }], "source_key");
    dataSourceId = await findOne(config, "data_sources", { source_key: SUPABASE_SOURCE_KEY });
    await upsertRows(config, "climate_stations", selectedStations, "station_id");
  }

  let totalRows = 0;
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    const body = await fetchKma("kma_sfcdd3.php", {
      tm1: dateToKma(range.from),
      tm2: dateToKma(range.to),
      stn: stations.join(":"),
      help: 0,
      mode: 0,
    });
    const rows = parseKmaDaily(body);
    totalRows += rows.length;
    if (config) await writeChunk(config, dataSourceId, range, stations, body, rows);
    console.log(`chunk ${index + 1}/${ranges.length}: ${range.from}..${range.to} · ${rows.length} rows${config ? " · saved" : ""}`);
    if (index < ranges.length - 1 && options.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
  }
  console.log(`완료: ${totalRows} rows${config ? "가 Supabase에 저장되었습니다." : " 파싱(적재하지 않음). --write를 붙이면 Supabase에 적재합니다."}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`FAIL  ${error instanceof Error ? error.message : "수집 실패"}`);
    process.exitCode = 1;
  });
}

