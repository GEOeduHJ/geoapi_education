import { describe, expect, it } from "vitest";
import {
  countInclusiveDays,
  summarizeClimate,
  summarizeClimatePeriods,
  type ClimateDailyObservation,
  type ClimatePeriodSummary,
  type ClimateStation,
} from "./climate";

const stations: ClimateStation[] = [
  { station_id: "108", name_ko: "서울", name_en: "Seoul", longitude: 126.96, latitude: 37.57, altitude_m: 85, law_code: null, address: null },
  { station_id: "159", name_ko: "부산", name_en: "Busan", longitude: 129.03, latitude: 35.10, altitude_m: 70, law_code: null, address: null },
];

const observations: ClimateDailyObservation[] = [
  { station_id: "108", observation_date: "2024-01-01", ta_avg: 2, ta_max: 7, ta_min: -2, rn_day: 0, ws_avg: 1, hm_avg: 60, ss_day: 5, si_day: 2, snapshot_id: "snapshot-1", quality_flags: [] },
  { station_id: "108", observation_date: "2024-01-02", ta_avg: 4, ta_max: 8, ta_min: 0, rn_day: 1, ws_avg: 2, hm_avg: 70, ss_day: 4, si_day: 3, snapshot_id: "snapshot-1", quality_flags: [] },
  { station_id: "159", observation_date: "2024-01-01", ta_avg: 8, ta_max: 12, ta_min: 4, rn_day: 0, ws_avg: 3, hm_avg: 65, ss_day: 6, si_day: 4, snapshot_id: "snapshot-1", quality_flags: [] },
];

const makePeriod = (overrides: Partial<ClimatePeriodSummary> = {}): ClimatePeriodSummary => ({
  station_id: "108",
  period_type: "month",
  period_start: "2024-01-01",
  period_end: "2024-01-31",
  expected_observation_count: 31,
  ta_avg: null,
  ta_avg_valid_count: 0,
  ta_max: null,
  ta_max_valid_count: 0,
  ta_min: null,
  ta_min_valid_count: 0,
  rn_day: null,
  rn_day_valid_count: 0,
  ws_avg: null,
  ws_avg_valid_count: 0,
  hm_avg: null,
  hm_avg_valid_count: 0,
  ss_day: null,
  ss_day_valid_count: 0,
  si_day: null,
  si_day_valid_count: 0,
  ...overrides,
});

describe("climate summary", () => {
  it("calculates station averages and keeps coverage counts", () => {
    expect(summarizeClimate(stations, observations, "ta_avg")).toEqual([
      expect.objectContaining({ stationId: "108", stationName: "서울", value: 3, observationCount: 2, expectedObservationCount: 2, coverageRatio: 1, firstDate: "2024-01-01", lastDate: "2024-01-02", unit: "°C" }),
      expect.objectContaining({ stationId: "159", stationName: "부산", value: 8, observationCount: 1, expectedObservationCount: 1, coverageRatio: 1, unit: "°C" }),
    ]);
  });

  it("ignores missing values without inventing a zero", () => {
    const missing = { ...observations[0], station_id: "159", ta_avg: null };
    const summaries = summarizeClimate(stations, [missing], "ta_avg");
    expect(summaries).toEqual([]);
  });

  it("combines monthly means with valid-day weighting", () => {
    const periods = [
      makePeriod({ ta_avg: 2, ta_avg_valid_count: 30 }),
      makePeriod({ period_start: "2024-02-01", period_end: "2024-02-29", expected_observation_count: 29, ta_avg: 4, ta_avg_valid_count: 20 }),
    ];
    expect(summarizeClimatePeriods(stations, periods, "ta_avg")).toEqual([
      expect.objectContaining({ stationId: "108", value: 2.8, observationCount: 50, expectedObservationCount: 60, coverageRatio: 50 / 60, firstDate: "2024-01-01", lastDate: "2024-02-29" }),
    ]);
  });

  it("counts calendar days including leap days", () => {
    expect(countInclusiveDays("2024-02-01", "2024-02-29")).toBe(29);
    expect(countInclusiveDays("2024-02-29", "2024-02-01")).toBe(0);
  });
});
