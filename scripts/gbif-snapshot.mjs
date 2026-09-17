#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const envPath = path.join(projectRoot, ".env.local");
const GBIF_ENDPOINT = "https://api.gbif.org/v1/occurrence/search";
const SUPABASE_SOURCE_KEY = "gbif-flagship-species";
const SCHEMA_VERSION = "gbif-occurrence-v1";
const MAX_SNAPSHOT_ROWS = 1_000;
const PAGE_SIZE = 300;
// 수업용 상징종. 레코드별 라이선스·제공자를 함께 보존한다(GBIF 이용약관).
const SPECIES = {
  crane: { name: "두루미", scientificName: "Grus japonensis", from: 2015, to: 2026 },
  spoonbill: { name: "저어새", scientificName: "Platalea minor", from: 2025, to: 2026 },
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
  const options = { species: "all", write: false, public: false };
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
    if (rawKey === "species" && (rawValue === "all" || SPECIES[rawValue])) {
      options.species = rawValue;
      continue;
    }
    throw new Error(`알 수 없는 옵션: ${argument}`);
  }
  return options;
}

export function normalizeOccurrence(item, speciesKey) {
  const species = SPECIES[speciesKey];
  const lat = typeof item.decimalLatitude === "number" && Number.isFinite(item.decimalLatitude) ? item.decimalLatitude : null;
  const lon = typeof item.decimalLongitude === "number" && Number.isFinite(item.decimalLongitude) ? item.decimalLongitude : null;
  const eventDate = typeof item.eventDate === "string" ? item.eventDate.slice(0, 10) : null;
  return {
    external_id: `gbif:${speciesKey}:${item.key ?? `${lat}:${lon}:${eventDate}`}`.slice(0, 500),
    observed_at: /^\d{4}-\d{2}-\d{2}$/.test(eventDate ?? "") ? eventDate : null,
    region_code: null,
    label: species.name,
    value: null,
    unit: null,
    category: species.name,
    attributes: {
      provider: "GBIF",
      species_key: speciesKey,
      scientific_name: species.scientificName,
      gbif_key: item.key ?? null,
      longitude: lon,
      latitude: lat,
      has_coordinates: lon !== null && lat !== null,
      event_date: eventDate,
      locality: item.locality ?? null,
      license: item.license ?? null,
      publisher: item.publishingOrg ?? null,
      dataset_key: item.datasetKey ?? null,
    },
  };
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
  console.log(`GBIF 상징종 snapshot 수집기 (레코드별 라이선스 보존)

기본 동작은 DRY-RUN이며, --write를 붙여야 Supabase에 저장합니다.

사용법:
  node scripts/gbif-snapshot.mjs [--species=crane|spoonbill|all] [--write] [--public]`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const speciesKeys = options.species === "all" ? Object.keys(SPECIES) : [options.species];

  const collected = [];
  for (const speciesKey of speciesKeys) {
    const species = SPECIES[speciesKey];
    const items = [];
    for (let offset = 0; items.length < MAX_SNAPSHOT_ROWS; offset += PAGE_SIZE) {
      const url = new URL(GBIF_ENDPOINT);
      url.searchParams.set("scientificName", species.scientificName);
      url.searchParams.set("country", "KR");
      url.searchParams.set("hasCoordinate", "true");
      url.searchParams.set("year", `${species.from},${species.to}`);
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(offset));
      const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GeoLab-Classroom/0.1" } });
      if (!response.ok) throw new Error(`GBIF HTTP ${response.status} (${speciesKey})`);
      const payload = await response.json();
      const results = Array.isArray(payload?.results) ? payload.results : [];
      items.push(...results);
      if (results.length < PAGE_SIZE || payload?.endOfRecords) break;
    }
    if (items.length > MAX_SNAPSHOT_ROWS) throw new Error(`${species.name} 상한 초과. 기간을 좁히세요.`);
    const observations = items.map((item) => normalizeOccurrence(item, speciesKey));
    const withCoords = observations.filter((o) => o.attributes.has_coordinates).length;
    const licenses = [...new Set(observations.map((o) => o.attributes.license).filter(Boolean))];
    console.log(`GBIF ${species.name} · ${observations.length}행(좌표 ${withCoords}, 라이선스 ${licenses.join("/") || "없음"}) · ${options.write ? "WRITE" : "DRY-RUN"}`);
    collected.push({ speciesKey, observations });
  }

  if (!options.write) {
    console.log("검증만 완료했습니다. Supabase 적재는 같은 명령에 --write를 추가하세요.");
    return;
  }
  const config = supabaseConfig();
  await upsertRows(config, "data_sources", [{
    provider: "GBIF",
    source_key: SUPABASE_SOURCE_KEY,
    title: "GBIF 상징종 분포",
    official_url: "https://www.gbif.org/",
    auth_type: "없음",
    terms_summary: "레코드별 라이선스·제공자·DOI 보존. 대량 다운로드는 등록 계정 필요하므로 snapshot 단위로 수집.",
  }], "source_key");
  const dataSourceId = await findOne(config, "data_sources", { source_key: SUPABASE_SOURCE_KEY });
  for (const { speciesKey, observations } of collected) {
    const query = { species: speciesKey, from: SPECIES[speciesKey].from, to: SPECIES[speciesKey].to };
    const requestFingerprint = `${SCHEMA_VERSION}:${sha256(JSON.stringify(query)).slice(0, 32)}`;
    await upsertRows(config, "source_snapshots", [{
      data_source_id: dataSourceId,
      valid_from: `${SPECIES[speciesKey].from}-01-01`,
      valid_to: `${SPECIES[speciesKey].to}-12-31`,
      request_fingerprint: requestFingerprint,
      schema_version: SCHEMA_VERSION,
      raw_payload: {
        provider: "GBIF",
        endpoint: GBIF_ENDPOINT,
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
    console.log(`완료: ${speciesKey} snapshot ${snapshotId} · ${observations.length}행 저장${options.public ? " · 공개 읽기 허용" : " · 비공개"}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`FAIL  ${error instanceof Error ? error.message : "GBIF snapshot 수집 실패"}`);
    process.exitCode = 1;
  });
}
