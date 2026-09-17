#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const envPath = path.join(projectRoot, ".env.local");
const USGS_ENDPOINT = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const SUPABASE_SOURCE_KEY = "usgs-earthquake-history";
const SCHEMA_VERSION = "usgs-earthquake-v1";
const MAX_SNAPSHOT_ROWS = 2_000;

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
  const options = { from: "2020-01-01", to: null, minMagnitude: "6", write: false, public: false };
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
    if ((rawKey === "from" || rawKey === "to") && /^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
      options[rawKey] = rawValue;
      continue;
    }
    if (rawKey === "min-magnitude" && /^[0-9]+(\.[0-9]+)?$/.test(rawValue)) {
      options.minMagnitude = rawValue;
      continue;
    }
    throw new Error(`알 수 없는 옵션: ${argument}`);
  }
  if (!options.to) options.to = new Date().toISOString().slice(0, 10);
  return options;
}

export function normalizeQuakeFeatures(features) {
  return (Array.isArray(features) ? features : []).flatMap((item) => {
    if (!item || item.type !== "Feature") return [];
    const props = item.properties ?? {};
    const coords = item.geometry?.coordinates;
    if (!Array.isArray(coords) || typeof coords[0] !== "number" || typeof coords[1] !== "number") return [];
    const mag = typeof props.mag === "number" && Number.isFinite(props.mag) ? props.mag : null;
    const time = typeof props.time === "number" ? new Date(props.time).toISOString() : null;
    return [{
      external_id: `usgs:${item.id ?? `${coords[0]}:${coords[1]}:${props.time ?? ""}`}`.slice(0, 500),
      observed_at: time,
      region_code: null,
      label: typeof props.place === "string" && props.place ? props.place : "위치 미상",
      value: mag,
      unit: "M",
      category: "지진",
      attributes: {
        provider: "USGS",
        event_id: item.id ?? null,
        longitude: coords[0],
        latitude: coords[1],
        depth_km: typeof coords[2] === "number" ? coords[2] : null,
        magnitude: mag,
        magnitude_type: props.magType ?? null,
        event_url: props.url ?? null,
        has_coordinates: true,
      },
    }];
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
  console.log(`USGS 지진 이력 snapshot 수집기

기본 동작은 DRY-RUN이며, --write를 붙여야 Supabase에 저장합니다.

사용법:
  node scripts/usgs-snapshot.mjs [--from=2020-01-01] [--to=2026-09-18] [--min-magnitude=6] [--write] [--public]`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();

  const url = new URL(USGS_ENDPOINT);
  url.searchParams.set("format", "geojson");
  url.searchParams.set("starttime", options.from);
  url.searchParams.set("endtime", options.to);
  url.searchParams.set("minmagnitude", options.minMagnitude);
  url.searchParams.set("limit", String(MAX_SNAPSHOT_ROWS));
  url.searchParams.set("orderby", "time");
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GeoLab-Classroom/0.1" } });
  if (response.status === 429) throw new Error("USGS가 요청을 제한했습니다(429). 60초 캐시 후 재실행하세요.");
  if (!response.ok) throw new Error(`USGS HTTP ${response.status}`);
  const payload = await response.json();
  const observations = normalizeQuakeFeatures(payload?.features);
  if (observations.length === 0) throw new Error("USGS 지진 기록이 없습니다.");
  if (observations.length >= MAX_SNAPSHOT_ROWS) throw new Error("상한에 도달했습니다. 기간·규모를 좁혀 다시 실행하세요.");
  console.log(`USGS M${options.minMagnitude}+ ${options.from}~${options.to} · ${observations.length}건 · ${options.write ? "WRITE" : "DRY-RUN"}`);

  if (!options.write) {
    console.log("검증만 완료했습니다. Supabase 적재는 같은 명령에 --write를 추가하세요.");
    return;
  }
  const config = supabaseConfig();
  await upsertRows(config, "data_sources", [{
    provider: "USGS",
    source_key: SUPABASE_SOURCE_KEY,
    title: "USGS 지진 카탈로그",
    official_url: "https://earthquake.usgs.gov/fdsnws/event/1/",
    auth_type: "없음",
    terms_summary: "실시간 피드·카탈로그 이용. 자동화 호출량을 절제하고 출처·시각을 보존. 교육용 스냅샷이며 안전 알림이 아님.",
  }], "source_key");
  const dataSourceId = await findOne(config, "data_sources", { source_key: SUPABASE_SOURCE_KEY });
  const query = { from: options.from, to: options.to, minMagnitude: options.minMagnitude };
  const requestFingerprint = `${SCHEMA_VERSION}:${sha256(JSON.stringify(query)).slice(0, 32)}`;
  await upsertRows(config, "source_snapshots", [{
    data_source_id: dataSourceId,
    valid_from: options.from,
    valid_to: options.to,
    request_fingerprint: requestFingerprint,
    schema_version: SCHEMA_VERSION,
    raw_payload: {
      provider: "USGS",
      endpoint: USGS_ENDPOINT,
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
    console.error(`FAIL  ${error instanceof Error ? error.message : "USGS snapshot 수집 실패"}`);
    process.exitCode = 1;
  });
}
