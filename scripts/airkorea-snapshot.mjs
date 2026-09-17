#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const envPath = path.join(projectRoot, ".env.local");
const AIRKOREA_ENDPOINT = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";
const SUPABASE_SOURCE_KEY = "airkorea-sido-realtime";
const SCHEMA_VERSION = "airkorea-sido-v1";
const ITEMS = {
  PM10: { label: "미세먼지(PM10)", unit: "㎍/m³", field: "pm10Value" },
  PM25: { label: "초미세먼지(PM2.5)", unit: "㎍/m³", field: "pm25Value" },
};

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
function decodeOnce(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseArgs(argv) {
  const options = { item: "all", write: false, public: false };
  for (const argument of argv) {
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
    const rawValue = separator >= 0 ? argument.slice(separator + 1) : "";
    if (rawKey === "item" && (rawValue === "all" || ITEMS[rawValue])) {
      options.item = rawValue;
      continue;
    }
    throw new Error(`알 수 없는 옵션: ${argument}`);
  }
  return options;
}

function safeBody(body, secrets = []) {
  let value = body.replace(/\s+/g, " ").trim();
  for (const secret of secrets) if (secret) value = value.split(secret).join("[redacted]");
  return value.slice(0, 240);
}

async function fetchAllStations(serviceKey) {
  const rows = [];
  for (const pageNo of [1, 2, 3]) {
    const url = new URL(AIRKOREA_ENDPOINT);
    url.searchParams.set("serviceKey", decodeOnce(serviceKey));
    url.searchParams.set("returnType", "json");
    url.searchParams.set("numOfRows", "500");
    url.searchParams.set("pageNo", String(pageNo));
    url.searchParams.set("sidoName", "전국");
    url.searchParams.set("ver", "1.0");
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GeoLab-Classroom/0.1" } });
    const body = await response.text();
    if (!response.ok) throw new Error(`AirKorea HTTP ${response.status}: ${safeBody(body, [serviceKey])}`);
    const payload = JSON.parse(body);
    if (payload?.response?.header?.resultCode !== "00") {
      throw new Error(`AirKorea 요청 거부: ${payload?.response?.header?.resultMsg ?? "제공기관 오류"}`);
    }
    const items = payload?.response?.body?.items ?? [];
    rows.push(...items);
    if (items.length < 500) break;
  }
  return rows;
}

function parsedNumber(raw) {
  if (raw === null || raw === undefined) return { value: null, symbol: null };
  const text = String(raw).trim();
  if (!text || text === "-" || text.toLowerCase() === "null") return { value: null, symbol: text || null };
  const value = Number(text.replaceAll(",", ""));
  return Number.isFinite(value) ? { value, symbol: null } : { value: null, symbol: text };
}

function modalDataTime(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (typeof row.dataTime === "string" && row.dataTime) {
      counts.set(row.dataTime, (counts.get(row.dataTime) ?? 0) + 1);
    }
  }
  let best = null;
  let bestCount = -1;
  for (const [time, count] of counts) {
    if (count > bestCount) {
      best = time;
      bestCount = count;
    }
  }
  return best;
}

export function aggregateSidoMeans(rows, itemKey) {
  const field = ITEMS[itemKey].field;
  const groups = new Map();
  for (const row of rows) {
    const sido = typeof row.sidoName === "string" ? row.sidoName.trim() : "";
    if (!sido) continue;
    const parsed = parsedNumber(row[field]);
    if (parsed.value === null) continue;
    const group = groups.get(sido) ?? { values: [], time: row.dataTime };
    group.values.push(parsed.value);
    groups.set(sido, group);
  }
  return [...groups.entries()].map(([sido, group]) => ({
    sido,
    value: group.values.reduce((sum, v) => sum + v, 0) / group.values.length,
    stationCount: group.values.length,
    dataTime: group.time,
  }));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

function toObservedAt(dataTime) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(dataTime ?? "");
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

async function writeSnapshot(config, itemKey, stationRows, means, dataTime, isPublic) {
  await upsertRows(config, "data_sources", [{
    provider: "에어코리아",
    source_key: SUPABASE_SOURCE_KEY,
    title: "에어코리아 시도별 실시간 대기질",
    official_url: "https://www.data.go.kr/data/15073861/openapi.do",
    auth_type: "API 키",
    terms_summary: "공공누리 제3유형(출처 표시·변경 금지). 측정소 실시간값을 시도 평균으로 집계해 교육자료에 출처를 표시.",
  }], "source_key");
  const dataSourceId = await findOne(config, "data_sources", { source_key: SUPABASE_SOURCE_KEY });
  const query = { sido: "전국", item: itemKey, dataTime };
  const requestFingerprint = `${SCHEMA_VERSION}:${sha256(JSON.stringify(query)).slice(0, 32)}`;
  const observations = means.map((mean) => ({
    external_id: `airkorea:${mean.sido}:${itemKey}:${dataTime}`.slice(0, 500),
    observed_at: toObservedAt(mean.dataTime),
    region_code: mean.sido,
    label: mean.sido,
    value: Math.round(mean.value * 10) / 10,
    unit: ITEMS[itemKey].unit,
    category: ITEMS[itemKey].label,
    attributes: {
      provider: "AirKorea",
      item: itemKey,
      data_time: mean.dataTime,
      station_count: mean.stationCount,
    },
  }));
  await upsertRows(config, "source_snapshots", [{
    data_source_id: dataSourceId,
    valid_from: toObservedAt(dataTime),
    valid_to: toObservedAt(dataTime),
    request_fingerprint: requestFingerprint,
    schema_version: SCHEMA_VERSION,
    raw_payload: {
      provider: "AirKorea",
      endpoint: AIRKOREA_ENDPOINT,
      query,
      rows: stationRows,
      normalized: { row_count: stationRows.length, observation_count: observations.length, region_rule: "시도별 측정소 평균" },
    },
    row_count: stationRows.length,
    checksum: crypto.createHash("sha256").update(JSON.stringify({ query, rows: stationRows })).digest("hex"),
    is_public: isPublic,
  }], "data_source_id,request_fingerprint,schema_version");
  const snapshotId = await findOne(config, "source_snapshots", {
    data_source_id: dataSourceId,
    request_fingerprint: requestFingerprint,
    schema_version: SCHEMA_VERSION,
  });
  await upsertRows(config, "geo_observations", observations.map((observation) => ({ ...observation, snapshot_id: snapshotId })), "snapshot_id,external_id");
  return { snapshotId, count: observations.length };
}

function printHelp() {
  console.log(`에어코리아 시도별 실시간 snapshot 수집기

기본 동작은 DRY-RUN이며, --write를 붙여야 Supabase에 저장합니다.
공개 브라우저에서 읽게 하려면 --write --public을 함께 사용합니다.

사용법:
  node scripts/airkorea-snapshot.mjs [--item=PM10|PM25|all] [--write] [--public]

실시간값을 최다관측시각 기준으로 시도 평균하고, 전남광주는 광주·전남 경계에 함께 결합합니다.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const serviceKey = env("DATA_GO_KR_SERVICE_KEY");
  if (!serviceKey) throw new Error("DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.");

  const stationRows = await fetchAllStations(serviceKey);
  const dataTime = modalDataTime(stationRows);
  if (!dataTime) throw new Error("관측시각을 확인하지 못했습니다.");
  const hourRows = stationRows.filter((row) => row.dataTime === dataTime);
  const itemKeys = options.item === "all" ? Object.keys(ITEMS) : [options.item];
  console.log(`AirKorea 시도 실시간 · ${stationRows.length}행 중 ${dataTime} ${hourRows.length}행 · ${options.write ? "WRITE" : "DRY-RUN"}`);
  for (const itemKey of itemKeys) {
    const means = aggregateSidoMeans(hourRows, itemKey);
    console.log(`  ${itemKey}: ${means.length}개 시도 · 단위 ${ITEMS[itemKey].unit}`);
  }

  if (!options.write) {
    console.log("검증만 완료했습니다. Supabase 적재는 같은 명령에 --write를 추가하세요.");
    return;
  }
  const config = supabaseConfig();
  for (const itemKey of itemKeys) {
    const means = aggregateSidoMeans(hourRows, itemKey);
    const { snapshotId, count } = await writeSnapshot(config, itemKey, hourRows, means, dataTime, options.public);
    console.log(`완료: ${itemKey} snapshot ${snapshotId} · geo_observations ${count}행 저장${options.public ? " · 공개 읽기 허용" : " · 비공개"}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`FAIL  ${error instanceof Error ? error.message : "AirKorea snapshot 수집 실패"}`);
    process.exitCode = 1;
  });
}
