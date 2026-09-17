/**
 * 기상청 단기예보 격자 조회 헬퍼.
 * 좌표→격자 변환은 기상청 공개 DFS 공식, 예보값은 서버 프록시(`/api/short-forecast`)로 읽는다.
 */

const RE = 6371.00877;
const GRID = 5.0;
const SLAT1 = 30.0;
const SLAT2 = 60.0;
const OLON = 126.0;
const OLAT = 38.0;
const XO = 43;
const YO = 136;
const DEGRAD = Math.PI / 180.0;

export interface GridCoordinate {
  nx: number;
  ny: number;
}

/** WGS84 위경도를 기상청 단기예보 격자(nx, ny)로 변환한다. */
export function toForecastGrid(lat: number, lon: number): GridCoordinate {
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;
  const sn = Math.log(Math.cos(slat1) / Math.cos(slat2))
    / Math.log(Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5));
  const sf = Math.pow(Math.tan(Math.PI * 0.25 + slat1 * 0.5), sn) * Math.cos(slat1) / sn;
  const ro = re * sf / Math.pow(Math.tan(Math.PI * 0.25 + olat * 0.5), sn);
  const ra = re * sf / Math.pow(Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5), sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  const angle = theta * sn;
  return {
    nx: Math.floor(ra * Math.sin(angle) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(angle) + YO + 0.5),
  };
}

export interface ForecastBase {
  baseDate: string;
  baseTime: string;
}

const RELEASE_TIMES = ["0200", "0500", "0800", "1100", "1400", "1700", "2000", "2300"];

/**
 * 요청 시각(KST) 기준 가장 최근 발표 회차를 구한다. 발표 후 10분 유예를 둔다.
 * (기상청 단기예보 3시간 간격 발표).
 */
export function resolveForecastBase(now: Date = new Date()): ForecastBase {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const shifted = new Date(kst.getTime() - 10 * 60_000);
  const hhmm = `${String(shifted.getUTCHours()).padStart(2, "0")}${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
  let slot = RELEASE_TIMES[0];
  for (const release of RELEASE_TIMES) {
    if (release <= hhmm) slot = release;
  }
  let date = shifted;
  if (slot === RELEASE_TIMES[0] && hhmm < RELEASE_TIMES[0]) {
    date = new Date(shifted.getTime() - 86_400_000);
  }
  const baseDate = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  return { baseDate, baseTime: slot };
}

export interface ForecastItem {
  category: string;
  fcstDate: string;
  fcstTime: string;
  value: string;
}

export interface ForecastSlot {
  date: string;
  time: string;
  temperature: string | null;
  rainProbability: string | null;
  rainType: string | null;
  sky: string | null;
}

const SKY_LABELS: Record<string, string> = { 1: "맑음", 3: "구름많음", 4: "흐림" };
const PTY_LABELS: Record<string, string> = {
  0: "없음", 1: "비", 2: "비/눈", 3: "눈", 4: "소나기", 5: "빗방울", 6: "빗방울눈날림", 7: "눈날림",
};

export function skyLabel(code: string | null): string {
  if (!code) return "-";
  return SKY_LABELS[code.trim()] ?? code;
}

export function rainTypeLabel(code: string | null): string {
  if (!code) return "-";
  return PTY_LABELS[code.trim()] ?? code;
}

function pick(items: ForecastItem[], date: string, time: string, category: string): string | null {
  return items.find((item) => item.fcstDate === date && item.fcstTime === time && item.category === category)?.value ?? null;
}

/** 원시 예보 항목을 시각별 묶음으로 정규화한다 (최대 12개 시각). */
export function groupForecastByTime(items: ForecastItem[], limit = 12): ForecastSlot[] {
  const keys = [...new Set(items.map((item) => `${item.fcstDate} ${item.fcstTime}`))].sort();
  return keys.slice(0, limit).map((key) => {
    const [date, time] = key.split(" ");
    return {
      date,
      time,
      temperature: pick(items, date, time, "TMP"),
      rainProbability: pick(items, date, time, "POP"),
      rainType: pick(items, date, time, "PTY"),
      sky: pick(items, date, time, "SKY"),
    };
  });
}

export async function fetchForecast(
  nx: number,
  ny: number,
  base?: ForecastBase,
): Promise<{ data: ForecastItem[]; totalCount: number; error: string | null }> {
  const resolved = base ?? resolveForecastBase();
  try {
    const params = new URLSearchParams({
      baseDate: resolved.baseDate,
      baseTime: resolved.baseTime,
      nx: String(nx),
      ny: String(ny),
    });
    const response = await fetch(`/api/short-forecast?${params.toString()}`, { headers: { Accept: "application/json" } });
    const payload = (await response.json()) as { ok?: boolean; error?: string; data?: unknown[]; totalCount?: number };
    if (!response.ok || !payload.ok) return { data: [], totalCount: 0, error: payload.error ?? "FORECAST_REQUEST_FAILED" };
    const data = (Array.isArray(payload.data) ? payload.data : []).flatMap((row): ForecastItem[] => {
      if (typeof row !== "object" || row === null) return [];
      const record = row as Record<string, unknown>;
      const { category, fcstDate, fcstTime, fcstValue } = record;
      if (typeof category !== "string" || typeof fcstDate !== "string" || typeof fcstTime !== "string") return [];
      return [{ category, fcstDate, fcstTime, value: String(fcstValue ?? "") }];
    });
    return { data, totalCount: typeof payload.totalCount === "number" ? payload.totalCount : data.length, error: null };
  } catch {
    return { data: [], totalCount: 0, error: "FORECAST_REQUEST_FAILED" };
  }
}
