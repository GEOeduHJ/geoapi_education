#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const envPath = path.join(projectRoot, ".env.local");
const WB_ENDPOINT = "https://api.worldbank.org/v2/country/all/indicator";
const SUPABASE_SOURCE_KEY = "worldbank-indicator";
const SCHEMA_VERSION = "worldbank-indicator-v1";
const MAX_SNAPSHOT_ROWS = 2_000;
// 지표별 표시 단위. 원천 unit 필드가 비어 있어 지표 정의에서 옮긴다.
const INDICATORS = {
  "EN.POP.DNST": { label: "인구밀도", unit: "명/km²" },
  "SP.POP.TOTL": { label: "총인구", unit: "명" },
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
  const options = { indicator: "EN.POP.DNST", from: "2016", to: "2024", write: false, public: false };
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
    if ((rawKey === "from" || rawKey === "to") && /^\d{4}$/.test(rawValue)) {
      options[rawKey] = rawValue;
      continue;
    }
    throw new Error(`알 수 없는 옵션: ${argument}`);
  }
  if (options.from > options.to) throw new Error("기간 범위가 올바르지 않습니다.");
  return options;
}

export function isCountryRecord(row) {
  const iso3 = row?.countryiso3code;
  return typeof iso3 === "string" && /^[A-Z]{3}$/.test(iso3);
}

export function normalizeWorldBankRecords(rows, indicator) {
  return rows.filter(isCountryRecord).map((row) => {
    const iso3 = row.countryiso3code;
    const rawValue = row.value;
    const value = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null;
    return {
      external_id: `wb:${indicator}:${iso3}:${row.date}`.slice(0, 500),
      observed_at: /^\d{4}$/.test(String(row.date ?? "")) ? `${row.date}-01-01` : null,
      region_code: iso3,
      label: typeof row.country?.value === "string" ? row.country.value : iso3,
      value,
      unit: INDICATORS[indicator].unit,
      category: INDICATORS[indicator].label,
      attributes: {
        provider: "WorldBank",
        indicator,
        date: row.date ?? null,
        value_symbol: value === null ? "nodata" : null,
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

async function writeSnapshot(config, indicator, from, to, rawRows, observations, isPublic) {
  await upsertRows(config, "data_sources", [{
    provider: "World Bank",
    source_key: SUPABASE_SOURCE_KEY,
    title: "World Bank 세계개발지표",
    official_url: "https://data.worldbank.org/",
    auth_type: "없음",
    terms_summary: "CC BY 4.0. 지표 코드·단위·연도·결측을 함께 저장하고 출처를 표시.",
  }], "source_key");
  const dataSourceId = await findOne(config, "data_sources", { source_key: SUPABASE_SOURCE_KEY });
  const query = { indicator, from, to };
  const requestFingerprint = `${SCHEMA_VERSION}:${sha256(JSON.stringify(query)).slice(0, 32)}`;
  const dates = observations.map((o) => o.observed_at).filter(Boolean).sort();
  await upsertRows(config, "source_snapshots", [{
    data_source_id: dataSourceId,
    valid_from: dates[0] ?? null,
    valid_to: dates.at(-1) ?? null,
    request_fingerprint: requestFingerprint,
    schema_version: SCHEMA_VERSION,
    raw_payload: {
      provider: "WorldBank",
      endpoint: `${WB_ENDPOINT}/${indicator}`,
      query,
      normalized: { row_count: rawRows.length, observation_count: observations.length },
    },
    row_count: rawRows.length,
    checksum: sha256(JSON.stringify({ query, count: rawRows.length })),
    is_public: isPublic,
  }], "data_source_id,request_fingerprint,schema_version");
  const snapshotId = await findOne(config, "source_snapshots", {
    data_source_id: dataSourceId,
    request_fingerprint: requestFingerprint,
    schema_version: SCHEMA_VERSION,
  });
  await upsertRows(config, "geo_observations", observations.map((observation) => ({ ...observation, snapshot_id: snapshotId })), "snapshot_id,external_id");
  return snapshotId;
}

function printHelp() {
  console.log(`World Bank 지표 snapshot 수집기

기본 동작은 DRY-RUN이며, --write를 붙여야 Supabase에 저장합니다.
집계 지역(iso3 3자리가 아닌 코드)은 제외하고 국가만 적재한다.

사용법:
  node scripts/worldbank-snapshot.mjs [--indicator=EN.POP.DNST] [--from=2016] [--to=2024] [--write] [--public]`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();

  const url = new URL(`${WB_ENDPOINT}/${options.indicator}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("per_page", "20000");
  url.searchParams.set("date", `${options.from}:${options.to}`);
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GeoLab-Classroom/0.1" } });
  if (!response.ok) throw new Error(`World Bank HTTP ${response.status}`);
  const payload = await response.json();
  const rawRows = Array.isArray(payload?.[1]) ? payload[1] : [];
  const observations = normalizeWorldBankRecords(rawRows, options.indicator);
  if (observations.length === 0) throw new Error("World Bank 지표값이 없습니다.");
  if (observations.length > MAX_SNAPSHOT_ROWS) {
    throw new Error(`응답 ${observations.length.toLocaleString("ko-KR")}행이 상한을 초과했습니다. 기간을 줄여 다시 실행하세요.`);
  }
  const nulls = observations.filter((o) => o.value === null).length;
  const countries = new Set(observations.map((o) => o.region_code)).size;
  console.log(`WorldBank ${options.indicator} · ${observations.length}행(${countries}개국, 결측 ${nulls}) · ${options.write ? "WRITE" : "DRY-RUN"}`);

  if (!options.write) {
    console.log("검증만 완료했습니다. Supabase 적재는 같은 명령에 --write를 추가하세요.");
    return;
  }
  const snapshotId = await writeSnapshot(supabaseConfig(), options.indicator, options.from, options.to, rawRows, observations, options.public);
  console.log(`완료: snapshot ${snapshotId} · ${observations.length}행 저장${options.public ? " · 공개 읽기 허용" : " · 비공개"}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`FAIL  ${error instanceof Error ? error.message : "World Bank snapshot 수집 실패"}`);
    process.exitCode = 1;
  });
}
