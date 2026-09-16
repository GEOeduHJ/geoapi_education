import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const envPath = path.join(projectRoot, ".env.local");

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

function decodeServiceKey(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function summarizeFailure(body) {
  let safeBody = body.replace(/\s+/g, " ").trim();
  for (const key of [
    env("KOSIS_API_KEY"),
    env("SGIS_CONSUMER_KEY"),
    env("SGIS_CONSUMER_SECRET"),
    env("KMA_AUTH_KEY"),
    env("DATA_GO_KR_SERVICE_KEY"),
    decodeServiceKey(env("DATA_GO_KR_SERVICE_KEY")),
    env("VITE_VWORLD_API_KEY"),
  ]) {
    if (key) safeBody = safeBody.split(key).join("[redacted]");
  }
  safeBody = safeBody.replace(/(authKey|serviceKey|consumer_secret|consumer_key)=?[^&\s<]*/gi, "$1=[redacted]");
  return safeBody.slice(0, 220) || "빈 응답";
}

function kstParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function shortForecastBase() {
  const now = kstParts();
  const currentMinutes = Number(now.hour) * 60 + Number(now.minute);
  const baseTimes = [23, 20, 17, 14, 11, 8, 5, 2].map((hour) => hour * 60);
  const selected = baseTimes.find((time) => time <= currentMinutes - 10);
  if (selected !== undefined) {
    return { baseDate: `${now.year}${now.month}${now.day}`, baseTime: `${String(Math.floor(selected / 60)).padStart(2, "0")}00` };
  }
  const previous = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const previousParts = kstParts(previous);
  return { baseDate: `${previousParts.year}${previousParts.month}${previousParts.day}`, baseTime: "2300" };
}

async function request(label, url, init = {}, inspect = () => "응답 확인") {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
    const body = await response.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = null; }
    const detail = response.ok ? inspect({ response, body, parsed }) : `${inspect({ response, body, parsed })} · ${summarizeFailure(body)}`;
    const deferred = !response.ok && /활용신청|SERVICE_KEY_IS_NOT_REGISTERED|등록되지 않은 서비스키/i.test(body);
    console.log(`${response.ok ? "PASS" : deferred ? "DEFER" : "FAIL"}  ${label}  HTTP ${response.status}  ${detail}`);
    return { passed: response.ok, deferred };
  } catch (error) {
    console.log(`FAIL  ${label}  ${error instanceof Error ? error.message : "네트워크 오류"}`);
    return { passed: false, deferred: false };
  }
}

const results = [];

if (env("SGIS_CONSUMER_KEY") && env("SGIS_CONSUMER_SECRET")) {
  const url = new URL("https://sgisapi.mods.go.kr/OpenAPI3/auth/authentication.json");
  url.searchParams.set("consumer_key", env("SGIS_CONSUMER_KEY"));
  url.searchParams.set("consumer_secret", env("SGIS_CONSUMER_SECRET"));
  results.push(await request("SGIS authentication", url, { headers: { Accept: "application/json" } }, ({ parsed }) => parsed?.errMsg || parsed?.errCd || "인증 응답 확인"));
} else {
  console.log("SKIP  SGIS authentication  키 미설정");
}

if (env("KMA_AUTH_KEY")) {
  const tm = `${kstParts().year}${kstParts().month}${kstParts().day}${kstParts().hour}${kstParts().minute}`;
  const url = new URL("https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php");
  url.searchParams.set("tm", tm);
  url.searchParams.set("stn", "108");
  url.searchParams.set("help", "0");
  url.searchParams.set("authKey", env("KMA_AUTH_KEY"));
  results.push(await request("KMA API Hub ASOS", url, { headers: { "User-Agent": "GeoLab-Classroom-Smoke/0.1" } }, ({ body }) => `${body.length} bytes`));
} else {
  console.log("SKIP  KMA API Hub ASOS  키 미설정");
}

if (env("DATA_GO_KR_SERVICE_KEY")) {
  const { baseDate, baseTime } = shortForecastBase();
  const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst");
  url.searchParams.set("serviceKey", decodeServiceKey(env("DATA_GO_KR_SERVICE_KEY")));
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "1");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", "60");
  url.searchParams.set("ny", "127");
  results.push(await request("Data portal short forecast", url, {}, ({ parsed }) => parsed?.response?.header?.resultMsg || parsed?.response?.header?.resultCode || "응답 확인"));
} else {
  console.log("SKIP  Data portal short forecast  키 미설정");
}

if (env("VITE_VWORLD_API_KEY") && env("VITE_VWORLD_DOMAIN") && env("VITE_VWORLD_DOMAIN") !== "localhost" && env("VITE_VWORLD_DOMAIN") !== "127.0.0.1") {
  const url = new URL("https://map.vworld.kr/js/vworldMapInit.js.do");
  url.searchParams.set("version", "2.0");
  url.searchParams.set("apiKey", env("VITE_VWORLD_API_KEY"));
  url.searchParams.set("domain", env("VITE_VWORLD_DOMAIN"));
  results.push(await request("VWorld 2D loader", url, {}, ({ body }) => `${body.length} bytes`));
} else {
  console.log("DEFER  VWorld 2D loader  등록된 운영 hostname 필요(VITE_VWORLD_DOMAIN)");
}

if (env("KOSIS_API_KEY")) {
  console.log("DEFER  KOSIS  통계표(orgId/tblId) 확정 후 실제 데이터 요청");
} else {
  console.log("SKIP  KOSIS  키 미설정");
}

if (env("VITE_SUPABASE_URL") && env("VITE_SUPABASE_ANON_KEY")) {
  results.push(await request("Supabase REST", `${env("VITE_SUPABASE_URL").replace(/\/$/, "")}/rest/v1/sources?select=id&limit=1`, { headers: { apikey: env("VITE_SUPABASE_ANON_KEY"), Authorization: `Bearer ${env("VITE_SUPABASE_ANON_KEY")}` } }, ({ body }) => `${body.length} bytes`));
} else {
  console.log("SKIP  Supabase REST  프로젝트 URL/Publishable key 미설정");
}

const failures = results.filter((result) => !result.passed && !result.deferred).length;
const passed = results.filter((result) => result.passed).length;
const deferred = results.filter((result) => result.deferred).length;
console.log(`\nSmoke summary: ${passed} passed, ${deferred} deferred by provider activation, ${failures} failed.`);
if (failures > 0) process.exitCode = 1;
