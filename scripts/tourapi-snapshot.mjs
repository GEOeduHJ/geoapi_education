#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const envPath = path.join(projectRoot, ".env.local");
const TOURAPI_ENDPOINT = "http://apis.data.go.kr/B551011/KorService2/areaBasedList2";
const SUPABASE_SOURCE_KEY = "tourapi-area-attractions";
const SCHEMA_VERSION = "tourapi-poi-v1";
const MAX_SNAPSHOT_ROWS = 2_000;
const CONTENT_TYPES = {
  12: "관광지",
  14: "문화시설",
  15: "축제공연행사",
  28: "레포츠",
  32: "숙박",
  38: "쇼핑",
  39: "음식점",
};
// TourAPI areaCode → 이름. SGIS 결합은 앱의 공식 대응표가 담당한다.
const AREAS = {
  1: "서울", 2: "인천", 3: "대전", 4: "대구", 5: "광주", 6: "부산", 7: "울산",
  8: "세종", 31: "경기", 32: "강원", 33: "충북", 34: "충남", 35: "경북",
  36: "경남", 37: "전북", 38: "전남", 39: "제주",
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
  const options = { area: "all", contentType: "12", write: false, public: false };
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
    if (rawKey === "area" && (rawValue === "all" || AREAS[rawValue])) {
      options.area = rawValue;
      continue;
    }
    if (rawKey === "content-type" && CONTENT_TYPES[rawValue]) {
      options.contentType = rawValue;
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

async function fetchArea(serviceKey, areaCode, contentType) {
  const rows = [];
  for (let pageNo = 1; pageNo <= 10; pageNo += 1) {
    const url = new URL(TOURAPI_ENDPOINT);
    url.searchParams.set("serviceKey", decodeOnce(serviceKey));
    url.searchParams.set("MobileOS", "ETC");
    url.searchParams.set("MobileApp", "GeoLab-Classroom");
    url.searchParams.set("_type", "json");
    url.searchParams.set("numOfRows", "1000");
    url.searchParams.set("pageNo", String(pageNo));
    url.searchParams.set("areaCode", areaCode);
    url.searchParams.set("contentTypeId", contentType);
    url.searchParams.set("arrange", "A");
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GeoLab-Classroom/0.1" } });
    const body = await response.text();
    if (!response.ok) throw new Error(`TourAPI HTTP ${response.status}: ${safeBody(body, [serviceKey])}`);
    const payload = JSON.parse(body);
    if (payload?.response?.header?.resultCode !== "0000") {
      throw new Error(`TourAPI 요청 거부: ${payload?.response?.header?.resultMsg ?? "제공기관 오류"}`);
    }
    const items = payload?.response?.body?.items?.item ?? [];
    rows.push(...items);
    if (items.length < 1000) break;
  }
  return rows;
}

function finiteNumber(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(String(raw).trim());
  return Number.isFinite(value) ? value : null;
}

export function normalizeTourPoi(item, areaCode, contentType) {
  const mapx = finiteNumber(item.mapx);
  const mapy = finiteNumber(item.mapy);
  return {
    external_id: `tourapi:${contentType}:${item.contentid ?? "unknown"}`.slice(0, 500),
    observed_at: null,
    region_code: String(areaCode),
    label: typeof item.title === "string" && item.title.trim() ? item.title.trim() : "이름 없음",
    value: null,
    unit: null,
    category: CONTENT_TYPES[contentType] ?? contentType,
    attributes: {
      provider: "TourAPI",
      content_id: item.contentid ?? null,
      content_type_id: contentType,
      area_code: String(areaCode),
      area_name: AREAS[areaCode] ?? null,
      sigungu_code: item.sigungucode ?? null,
      address: item.addr1 ?? null,
      address_detail: item.addr2 ?? null,
      longitude: mapx,
      latitude: mapy,
      has_coordinates: mapx !== null && mapy !== null,
      image_url: item.firstimage ?? null,
      image_license: item.cpyrhtDivCd ?? null,
      tel: item.tel ?? null,
      zipcode: item.zipcode ?? null,
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

async function writeSnapshot(config, areaCode, contentType, items, observations, isPublic) {
  await upsertRows(config, "data_sources", [{
    provider: "한국관광공사",
    source_key: SUPABASE_SOURCE_KEY,
    title: "TourAPI 지역 기반 관광정보",
    official_url: "https://www.data.go.kr/data/15101578/openapi.do",
    auth_type: "API 키",
    terms_summary: "이미지는 URL·라이선스(cpyrhtDivCd)만 보관하고 미러링하지 않음. 텍스트·이미지별 이용허락범위를 레코드와 함께 보존.",
  }], "source_key");
  const dataSourceId = await findOne(config, "data_sources", { source_key: SUPABASE_SOURCE_KEY });
  const fetchedAt = new Date().toISOString();
  const query = { areaCode, contentType, fetchedAt: fetchedAt.slice(0, 10) };
  const requestFingerprint = `${SCHEMA_VERSION}:${sha256(JSON.stringify({ areaCode, contentType })).slice(0, 32)}`;
  await upsertRows(config, "source_snapshots", [{
    data_source_id: dataSourceId,
    valid_from: null,
    valid_to: null,
    request_fingerprint: requestFingerprint,
    schema_version: SCHEMA_VERSION,
    raw_payload: {
      provider: "TourAPI",
      endpoint: TOURAPI_ENDPOINT,
      query,
      rows: items,
      normalized: { row_count: items.length, observation_count: observations.length },
    },
    row_count: items.length,
    checksum: sha256(JSON.stringify({ query: { areaCode, contentType }, rows: items })),
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
  console.log(`TourAPI 지역 관광정보 snapshot 수집기

기본 동작은 DRY-RUN이며, --write를 붙여야 Supabase에 저장합니다.

사용법:
  node scripts/tourapi-snapshot.mjs [--area=1|all] [--content-type=12] [--write] [--public]

지역별 snapshot 상한은 ${MAX_SNAPSHOT_ROWS.toLocaleString("ko-KR")}행이며, 이미지는 URL·라이선스만 보관합니다.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const serviceKey = env("DATA_GO_KR_SERVICE_KEY");
  if (!serviceKey) throw new Error("DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.");

  const areaCodes = options.area === "all" ? Object.keys(AREAS) : [options.area];
  const results = [];
  for (const areaCode of areaCodes) {
    const items = await fetchArea(serviceKey, areaCode, options.contentType);
    if (items.length > MAX_SNAPSHOT_ROWS) {
      throw new Error(`${AREAS[areaCode]} ${items.length.toLocaleString("ko-KR")}행이 상한을 초과했습니다. 지역·유형을 나눠 실행하세요.`);
    }
    const observations = items.map((item) => normalizeTourPoi(item, areaCode, options.contentType));
    const withCoords = observations.filter((o) => o.attributes.has_coordinates).length;
    console.log(`TourAPI ${areaCode} ${AREAS[areaCode]} · ${items.length}행(좌표 ${withCoords}) · ${options.write ? "WRITE" : "DRY-RUN"}`);
    results.push({ areaCode, items, observations });
  }

  if (!options.write) {
    console.log("검증만 완료했습니다. Supabase 적재는 같은 명령에 --write를 추가하세요.");
    return;
  }
  const config = supabaseConfig();
  for (const { areaCode, items, observations } of results) {
    const snapshotId = await writeSnapshot(config, areaCode, options.contentType, items, observations, options.public);
    console.log(`완료: ${areaCode} snapshot ${snapshotId} · ${observations.length}행 저장${options.public ? " · 공개 읽기 허용" : " · 비공개"}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`FAIL  ${error instanceof Error ? error.message : "TourAPI snapshot 수집 실패"}`);
    process.exitCode = 1;
  });
}
