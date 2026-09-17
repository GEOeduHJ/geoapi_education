#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const envPath = path.join(projectRoot, ".env.local");
const OPENTOPO_ENDPOINT = "https://api.opentopodata.org/v1/srtm90m";
const SUPABASE_SOURCE_KEY = "opentopo-transect";
const SCHEMA_VERSION = "opentopo-profile-v1";
// 서울→부산 직선 횡단면. 수업용 고정 경로이며 요청할 때마다 같은 좌표를 쓴다.
const TRANSECT = { name: "서울-부산 횡단면", from: [37.56, 126.97], to: [35.18, 129.08], points: 25 };

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
  const options = { write: false, public: false };
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

export function transectPoints() {
  const { from, to, points } = TRANSECT;
  return Array.from({ length: points }, (_, index) => {
    const ratio = points === 1 ? 0 : index / (points - 1);
    return {
      sequence: index + 1,
      lat: Math.round((from[0] + (to[0] - from[0]) * ratio) * 1e6) / 1e6,
      lon: Math.round((from[1] + (to[1] - from[1]) * ratio) * 1e6) / 1e6,
    };
  });
}

export function normalizeElevations(points, results) {
  return points.map((point, index) => {
    const result = results[index];
    const elevation = typeof result?.elevation === "number" && Number.isFinite(result.elevation)
      ? Math.round(result.elevation * 10) / 10
      : null;
    return {
      external_id: `opentopo:seoul-busan:${String(point.sequence).padStart(2, "0")}`,
      observed_at: null,
      region_code: null,
      label: `지점 ${point.sequence}`,
      value: elevation,
      unit: "m",
      category: "고도",
      attributes: {
        provider: "OpenTopoData",
        dataset: "SRTM 90m",
        sequence: point.sequence,
        longitude: point.lon,
        latitude: point.lat,
        elevation: elevation,
        has_coordinates: elevation !== null,
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
  console.log(`OpenTopoData 횡단면 snapshot 수집기 (SRTM 90m, 공개 API 제한 준수)

기본 동작은 DRY-RUN이며, --write를 붙여야 Supabase에 저장합니다.
서울→부산 직선 25지점을 1회 호출로 조회한다(일 1,000회 제한 내).`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();

  const points = transectPoints();
  const url = new URL(OPENTOPO_ENDPOINT);
  url.searchParams.set("locations", points.map((p) => `${p.lat},${p.lon}`).join("|"));
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GeoLab-Classroom/0.1" } });
  if (!response.ok) throw new Error(`OpenTopoData HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.status !== "OK") throw new Error(`OpenTopoData 요청 거부: ${payload?.error ?? "제공기관 오류"}`);
  const observations = normalizeElevations(points, payload?.results ?? []);
  const missing = observations.filter((o) => o.value === null).length;
  console.log(`OpenTopo ${TRANSECT.name} · ${observations.length}지점(결측 ${missing}) · ${options.write ? "WRITE" : "DRY-RUN"}`);

  if (!options.write) {
    console.log("검증만 완료했습니다. Supabase 적재는 같은 명령에 --write를 추가하세요.");
    return;
  }
  const config = supabaseConfig();
  await upsertRows(config, "data_sources", [{
    provider: "OpenTopoData",
    source_key: SUPABASE_SOURCE_KEY,
    title: "OpenTopoData 고도 횡단면",
    official_url: "https://www.opentopodata.org/",
    auth_type: "없음",
    terms_summary: "SRTM 90m 공개 API. dataset별 출처 표시. 동일 경로 재사용으로 호출량을 절약.",
  }], "source_key");
  const dataSourceId = await findOne(config, "data_sources", { source_key: SUPABASE_SOURCE_KEY });
  const query = { transect: "seoul-busan", points: points.length };
  const requestFingerprint = `${SCHEMA_VERSION}:${sha256(JSON.stringify(query)).slice(0, 32)}`;
  await upsertRows(config, "source_snapshots", [{
    data_source_id: dataSourceId,
    valid_from: null,
    valid_to: null,
    request_fingerprint: requestFingerprint,
    schema_version: SCHEMA_VERSION,
    raw_payload: {
      provider: "OpenTopoData",
      endpoint: OPENTOPO_ENDPOINT,
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
    console.error(`FAIL  ${error instanceof Error ? error.message : "OpenTopoData snapshot 수집 실패"}`);
    process.exitCode = 1;
  });
}
