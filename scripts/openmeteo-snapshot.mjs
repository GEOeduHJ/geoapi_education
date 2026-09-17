#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const envPath = path.join(projectRoot, ".env.local");
const ARCHIVE_ENDPOINT = "https://archive-api.open-meteo.com/v1/archive";
const SUPABASE_SOURCE_KEY = "openmeteo-city-climate";
const SCHEMA_VERSION = "openmeteo-city-v1";
const MAX_SNAPSHOT_ROWS = 2_000;
const CITIES = {
  SEL: { name: "서울", lat: 37.56, lon: 126.97 },
  TYO: { name: "도쿄", lat: 35.68, lon: 139.69 },
  LON: { name: "런던", lat: 51.5, lon: -0.12 },
  NYC: { name: "뉴욕", lat: 40.71, lon: -74.0 },
  SYD: { name: "시드니", lat: -33.87, lon: 151.21 },
};
const INDICATORS = {
  TEMP: { label: "일평균기온", unit: "°C", field: "temperature_2m_mean" },
  RAIN: { label: "일강수량", unit: "mm", field: "precipitation_sum" },
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

function parseArgs(argv) {
  const options = { indicator: "TEMP", year: "2024", cities: Object.keys(CITIES), write: false, public: false };
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
    if (rawKey === "indicator" && INDICATORS[rawValue]) {
      options.indicator = rawValue;
      continue;
    }
    if (rawKey === "year" && /^\d{4}$/.test(rawValue)) {
      options.year = rawValue;
      continue;
    }
    if (rawKey === "cities") {
      const codes = rawValue.split(",").map((s) => s.trim()).filter((s) => CITIES[s]);
      if (!codes.length) throw new Error(`알 수 없는 도시: ${rawValue}`);
      options.cities = codes;
      continue;
    }
    throw new Error(`알 수 없는 옵션: ${argument}`);
  }
  return options;
}

export function normalizeCityDaily(cityCode, dates, values, indicator, year) {
  const city = CITIES[cityCode];
  return dates.map((date, index) => {
    const raw = values[index];
    const value = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw * 10) / 10 : null;
    return {
      external_id: `openmeteo:${cityCode}:${indicator}:${date}`.slice(0, 500),
      observed_at: date,
      region_code: cityCode,
      label: city.name,
      value,
      unit: INDICATORS[indicator].unit,
      category: INDICATORS[indicator].label,
      attributes: {
        provider: "Open-Meteo",
        city_code: cityCode,
        city_name: city.name,
        longitude: city.lon,
        latitude: city.lat,
        indicator,
        date,
      },
    };
  });
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

function printHelp() {
  console.log(`Open-Meteo 도시 기후 snapshot 수집기 (CC BY 4.0, 관측·재분석 구분 표기)

기본 동작은 DRY-RUN이며, --write를 붙여야 Supabase에 저장합니다.

사용법:
  node scripts/openmeteo-snapshot.mjs [--indicator=TEMP|RAIN] [--year=2024] [--cities=SEL,TYO,LON,NYC,SYD] [--write] [--public]`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const field = INDICATORS[options.indicator].field;

  const observations = [];
  for (const cityCode of options.cities) {
    const city = CITIES[cityCode];
    const url = new URL(ARCHIVE_ENDPOINT);
    url.searchParams.set("latitude", String(city.lat));
    url.searchParams.set("longitude", String(city.lon));
    url.searchParams.set("start_date", `${options.year}-01-01`);
    url.searchParams.set("end_date", `${options.year}-12-31`);
    url.searchParams.set("daily", field);
    url.searchParams.set("timezone", "auto");
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GeoLab-Classroom/0.1" } });
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status} (${cityCode})`);
    const payload = await response.json();
    if (payload?.error) throw new Error(`Open-Meteo 요청 거부 (${cityCode}): ${payload.reason ?? "제공기관 오류"}`);
    observations.push(...normalizeCityDaily(cityCode, payload?.daily?.time ?? [], payload?.daily?.[field] ?? [], options.indicator, options.year));
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (observations.length === 0) throw new Error("Open-Meteo 기후값이 없습니다.");
  if (observations.length > MAX_SNAPSHOT_ROWS) throw new Error("상한 초과. 도시·기간을 줄이세요.");
  const nulls = observations.filter((o) => o.value === null).length;
  console.log(`Open-Meteo ${options.indicator} ${options.year} · ${observations.length}행(결측 ${nulls}) · ${options.write ? "WRITE" : "DRY-RUN"}`);

  if (!options.write) {
    console.log("검증만 완료했습니다. Supabase 적재는 같은 명령에 --write를 추가하세요.");
    return;
  }
  const config = supabaseConfig();
  await upsertRows(config, "data_sources", [{
    provider: "Open-Meteo",
    source_key: SUPABASE_SOURCE_KEY,
    title: "Open-Meteo 도시 기후",
    official_url: "https://open-meteo.com/",
    auth_type: "없음",
    terms_summary: "CC BY 4.0. 무료 비상업·교육 이용. 역사 재분석 자료이며 관측소 공식값과 구분해 표시.",
  }], "source_key");
  const dataSourceId = await findOne(config, "data_sources", { source_key: SUPABASE_SOURCE_KEY });
  const query = { indicator: options.indicator, year: options.year, cities: options.cities };
  const requestFingerprint = `${SCHEMA_VERSION}:${sha256(JSON.stringify(query)).slice(0, 32)}`;
  await upsertRows(config, "source_snapshots", [{
    data_source_id: dataSourceId,
    valid_from: `${options.year}-01-01`,
    valid_to: `${options.year}-12-31`,
    request_fingerprint: requestFingerprint,
    schema_version: SCHEMA_VERSION,
    raw_payload: {
      provider: "Open-Meteo",
      endpoint: ARCHIVE_ENDPOINT,
      query,
      normalized: { observation_count: observations.length },
    },
    row_count: observations.length,
    checksum: sha256(JSON.stringify({ query, count: observations.length })),
    is_public: options.public,
  }], "data_source_id,request_fingerprint,schema_version");
  const snapshotId = await findOne(config, "source_snapshots", {
    data_source_id: dataSourceId,
    request_fingerprint: requestFingerprint,
    schema_version: SCHEMA_VERSION,
  });
  await upsertRows(config, "geo_observations", observations.map((observation) => ({ ...observation, snapshot_id: snapshotId })), "snapshot_id,external_id");
  console.log(`완료: snapshot ${snapshotId} · ${observations.length}행 저장${options.public ? " · 공개 읽기 허용" : " · 비공개"}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`FAIL  ${error instanceof Error ? error.message : "Open-Meteo snapshot 수집 실패"}`);
    process.exitCode = 1;
  });
}
