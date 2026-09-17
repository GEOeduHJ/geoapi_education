import type { KosisPeriod, KosisSearchResult } from "./kosis";

const MAX_PERIOD_OPTIONS = 5_000;

export interface KosisDatasetPeriodRange {
  period: KosisPeriod;
  min: string;
  max: string;
  options: string[];
  truncated: boolean;
}

interface PeriodOptionsResult {
  options: string[];
  truncated: boolean;
}

const PERIOD_LABELS: Record<KosisPeriod, string> = {
  Y: "년",
  Q: "분기",
  M: "월",
  S: "반기",
  D: "일",
  F: "다년",
  IR: "비정기",
};

function keepDatasetEndpoints(options: string[], max: string, truncated: boolean): string[] {
  if (!truncated) return options;
  return [...options.slice(0, MAX_PERIOD_OPTIONS - 1), max].filter((value, index, values) => values.indexOf(value) === index);
}

function normalizeBoundary(value: string | null): string | null {
  const normalized = value?.trim().replace(/[^0-9]/g, "") ?? "";
  return [4, 6, 8].includes(normalized.length) ? normalized : null;
}

function normalizePeriodType(value: string | null): KosisPeriod | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "A") return "Y";
  if (["Y", "Q", "M", "S", "D", "F", "IR"].includes(normalized)) return normalized as KosisPeriod;
  return null;
}

function inferPeriod(min: string, max: string): KosisPeriod | null {
  if (min.length !== max.length) return null;
  if (min.length === 4) return "Y";
  if (min.length === 6) return "M";
  if (min.length === 8) return "D";
  return null;
}

function comparePeriodValues(left: string, right: string): number {
  return left.localeCompare(right);
}

function appendYearOptions(min: string, max: string): PeriodOptionsResult {
  const first = Number(min);
  const last = Number(max);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first > last) return { options: [], truncated: false };
  const total = last - first + 1;
  const options = Array.from({ length: Math.min(total, MAX_PERIOD_OPTIONS) }, (_, index) => String(first + index));
  return { options: keepDatasetEndpoints(options, max, total > MAX_PERIOD_OPTIONS), truncated: total > MAX_PERIOD_OPTIONS };
}

function appendSegmentOptions(period: KosisPeriod, min: string, max: string): PeriodOptionsResult {
  const segmentCount = period === "M" ? 12 : period === "Q" ? 4 : 2;
  const firstYear = Number(min.slice(0, 4));
  const firstSegment = Number(min.slice(4));
  const lastYear = Number(max.slice(0, 4));
  const lastSegment = Number(max.slice(4));
  const firstIndex = firstYear * segmentCount + firstSegment - 1;
  const lastIndex = lastYear * segmentCount + lastSegment - 1;
  if (![firstYear, firstSegment, lastYear, lastSegment].every(Number.isInteger) || firstIndex > lastIndex) return { options: [], truncated: false };
  const total = lastIndex - firstIndex + 1;
  const options = Array.from({ length: Math.min(total, MAX_PERIOD_OPTIONS) }, (_, index) => {
    const absolute = firstIndex + index;
    const year = Math.floor(absolute / segmentCount);
    const segment = (absolute % segmentCount) + 1;
    return `${year}${String(segment).padStart(2, "0")}`;
  });
  return { options: keepDatasetEndpoints(options, max, total > MAX_PERIOD_OPTIONS), truncated: total > MAX_PERIOD_OPTIONS };
}

function appendDayOptions(min: string, max: string): PeriodOptionsResult {
  const from = new Date(Date.UTC(Number(min.slice(0, 4)), Number(min.slice(4, 6)) - 1, Number(min.slice(6, 8))));
  const to = new Date(Date.UTC(Number(max.slice(0, 4)), Number(max.slice(4, 6)) - 1, Number(max.slice(6, 8))));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return { options: [], truncated: false };
  const options: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to && options.length < MAX_PERIOD_OPTIONS) {
    options.push([
      cursor.getUTCFullYear().toString().padStart(4, "0"),
      (cursor.getUTCMonth() + 1).toString().padStart(2, "0"),
      cursor.getUTCDate().toString().padStart(2, "0"),
    ].join(""));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { options: keepDatasetEndpoints(options, max, cursor <= to), truncated: cursor <= to };
}

function buildOptions(period: KosisPeriod, min: string, max: string): PeriodOptionsResult {
  if (period === "Y" || period === "F") return appendYearOptions(min, max);
  if (period === "M" || period === "Q" || period === "S") return appendSegmentOptions(period, min, max);
  if (period === "D") return appendDayOptions(min, max);
  return { options: [...new Set([min, max])], truncated: false };
}

export function getKosisPeriodLabel(period: KosisPeriod): string {
  return PERIOD_LABELS[period];
}

export function formatKosisPeriod(value: string, period: KosisPeriod): string {
  if (period === "M" && value.length === 6) return `${value.slice(0, 4)}년 ${Number(value.slice(4))}월`;
  if (period === "Q" && value.length === 6) return `${value.slice(0, 4)}년 ${Number(value.slice(4))}분기`;
  if (period === "S" && value.length === 6) return `${value.slice(0, 4)}년 ${Number(value.slice(4))}반기`;
  if (period === "D" && value.length === 8) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return value;
}

export function getKosisDatasetPeriodRange(selected: KosisSearchResult): KosisDatasetPeriodRange | null {
  const min = normalizeBoundary(selected.startPeriod);
  const max = normalizeBoundary(selected.endPeriod);
  if (!min || !max || min.length !== max.length || comparePeriodValues(min, max) > 0) return null;

  const period = normalizePeriodType(selected.periodType) ?? inferPeriod(min, max);
  if (!period) return null;
  const expectedLength = period === "Y" || period === "F" ? 4 : period === "IR" ? null : period === "D" ? 8 : 6;
  if (expectedLength !== null && (min.length !== expectedLength || max.length !== expectedLength)) return null;

  const optionResult = buildOptions(period, min, max);
  if (!optionResult.options.length) return null;
  return {
    period,
    min,
    max,
    options: optionResult.options,
    truncated: optionResult.truncated,
  };
}
