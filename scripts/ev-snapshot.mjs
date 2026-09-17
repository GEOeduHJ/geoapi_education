#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const envPath = path.join(projectRoot, ".env.local");
const EV_ENDPOINT = "https://apis.data.go.kr/B552584/EvCharger/getChargerInfo";
const SUPABASE_SOURCE_KEY = "ev-sido-chargers";
const SCHEMA_VERSION = "ev-sido-v1";
// 제공기관 zcode → 이름. 광주·전남은 zcode 체계 미확인으로 제외한다.
const ZCODE_NAMES = {
  11: "서울", 26: "부산", 27: "대구", 28: "인천", 30: "대전", 31: "울산", 36: "세종",
  41: "경기", 51: "강원", 43: "충북", 44: "충남", 52: "전북", 47: "경북", 48: "경남", 50: "제주",
};
// 제공기관 zcode → SGIS adm_cd.
const ZCODE_TO_SGIS = {
  11: "11", 26: "21", 27: "22", 28: "23", 30: "25", 31: "26", 36: "29",
  41: "31", 51: "32", 43: "33", 44: "34", 52: "35", 47: "37", 48: "38", 50: "39",
};
const ITEMS = {
  STATIONS: { label: "충전소 수", unit: "곳" },
  CHARGERS: { label: "충전기 수", unit: "기" },
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
  const options = { write: false, public: false, maxPages: 120 };
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
    throw new Error(`알 수 없는 옵션: ${argument}`);
  }
  return options;
}

function field(item, name) {
  const value = item[name];
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return null;
  return String(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url, serviceKey, label) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: "application/xml", "User-Agent": "GeoLab-Classroom/0.1" } });
    if (response.status === 429 && attempt < 6) {
      await sleep(30_000 * attempt);
      continue;
    }
    const body = await response.text();
    if (!response.ok) throw new Error(`EV HTTP ${response.status} (${label})`);
    return body;
  }
  throw new Error(`EV HTTP 429 반복 (${label}) — 일일 한도 가능, 시간 후 재실행`);
}

async function fetchSido(serviceKey, zcode, maxPages) {
  const rows = [];
  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const url = new URL(EV_ENDPOINT);
    url.searchParams.set("serviceKey", decodeOnce(serviceKey));
    url.searchParams.set("numOfRows", "1000");
    url.searchParams.set("pageNo", String(pageNo));
    url.searchParams.set("zcode", zcode);
    const body = await fetchPage(url, serviceKey, `zcode=${zcode} p${pageNo}`);
    await sleep(300);
    // XML을 직접 파싱하지 않고 반복 블록만 추출한다.
    const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    if (items.length === 0) break;
    for (const raw of items) {
      const pick = (tag) => {
        const found = raw.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
        return found ? found[1] : null;
      };
      rows.push({
        statId: pick("statId"),
        chgerId: pick("chgerId"),
        statNm: pick("statNm"),
        addr: pick("addr"),
        lat: pick("lat"),
        lng: pick("lng"),
        stat: pick("stat"),
        zcode,
        zscode: pick("zscode"),
      });
    }
    if (items.length < 1000) break;
  }
  return rows;
}

export function aggregateSido(rows) {
  const stations = new Map();
  const statCounts = {};
  for (const row of rows) {
    if (!row.statId) continue;
    if (!stations.has(row.statId)) {
      stations.set(row.statId, { name: row.statNm, addr: row.addr, lat: row.lat, lng: row.lng, zscode: row.zscode, chargers: 0 });
    }
    stations.get(row.statId).chargers += 1;
    if (row.stat) statCounts[row.stat] = (statCounts[row.stat] ?? 0) + 1;
  }
  return { stationCount: stations.size, chargerCount: rows.length, statCounts };
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
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
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

async function writeSnapshot(config, itemKey, perSido, collectedDate, isPublic) {
  await upsertRows(config, "data_sources", [{
    provider: "환경부",
    source_key: SUPABASE_SOURCE_KEY,
    title: "전기차 충전소 시도별 집계",
    official_url: "https://www.data.go.kr/data/15076352/openapi.do",
    auth_type: "API 키",
    terms_summary: "공공누리 제1유형(출처 표시). 충전기 단위를 충전소 단위로 집계해 교육자료에 출처를 표시. 상태코드 해석은 하지 않고 원시 분포만 보존.",
  }], "source_key");
  const dataSourceId = await findOne(config, "data_sources", { source_key: SUPABASE_SOURCE_KEY });
  const query = { item: itemKey, collectedDate };
  const requestFingerprint = `${SCHEMA_VERSION}:${sha256(JSON.stringify(query)).slice(0, 32)}`;
  const observations = perSido.map(({ zcode, sidoName, aggregate }) => ({
    external_id: `ev:${zcode}:${itemKey}:${collectedDate}`.slice(0, 500),
    observed_at: `${collectedDate}`,
    region_code: zcode,
    label: sidoName,
    value: itemKey === "STATIONS" ? aggregate.stationCount : aggregate.chargerCount,
    unit: ITEMS[itemKey].unit,
    category: ITEMS[itemKey].label,
    attributes: {
      provider: "EV",
      item: itemKey,
      collected_date: collectedDate,
      station_count: aggregate.stationCount,
      charger_count: aggregate.chargerCount,
      stat_counts: aggregate.statCounts,
    },
  }));
  await upsertRows(config, "source_snapshots", [{
    data_source_id: dataSourceId,
    valid_from: collectedDate,
    valid_to: collectedDate,
    request_fingerprint: requestFingerprint,
    schema_version: SCHEMA_VERSION,
    raw_payload: {
      provider: "EV",
      endpoint: EV_ENDPOINT,
      query,
      normalized: { observation_count: observations.length, region_rule: "zcode별 충전소 집계" },
    },
    row_count: observations.length,
    checksum: sha256(JSON.stringify({ query, observations })),
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
  console.log(`EV 충전소 시도별 집계 snapshot 수집기

기본 동작은 DRY-RUN이며, --write를 붙여야 Supabase에 저장합니다.
광주·전남은 제공기관 zcode 체계 미확인으로 제외된다.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const serviceKey = env("DATA_GO_KR_SERVICE_KEY");
  if (!serviceKey) throw new Error("DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.");

  const perSido = [];
  let totalChargers = 0;
  for (const zcode of Object.keys(ZCODE_TO_SGIS)) {
    const rows = await fetchSido(serviceKey, zcode, options.maxPages);
    const aggregate = aggregateSido(rows);
    totalChargers += rows.length;
    perSido.push({ zcode, sidoName: ZCODE_NAMES[zcode], aggregate });
    console.log(`EV zcode=${zcode} · 충전기 ${rows.length}행 → 충전소 ${aggregate.stationCount}곳 · ${options.write ? "WRITE" : "DRY-RUN"}`);
  }
  console.log(`합계 충전기 ${totalChargers.toLocaleString("ko-KR")}행 → ${perSido.length}개 시도`);

  if (!options.write) {
    console.log("검증만 완료했습니다. Supabase 적재는 같은 명령에 --write를 추가하세요.");
    return;
  }
  const collectedDate = new Date().toISOString().slice(0, 10);
  const config = supabaseConfig();
  for (const itemKey of Object.keys(ITEMS)) {
    const { snapshotId, count } = await writeSnapshot(config, itemKey, perSido, collectedDate, options.public);
    console.log(`완료: ${itemKey} snapshot ${snapshotId} · ${count}행 저장${options.public ? " · 공개 읽기 허용" : " · 비공개"}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`FAIL  ${error instanceof Error ? error.message : "EV snapshot 수집 실패"}`);
    process.exitCode = 1;
  });
}
