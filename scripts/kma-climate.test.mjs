import { describe, expect, it } from "vitest";
import { KMA_DAILY_COLUMNS, parseKmaDaily, parseKmaStations, splitDateRange } from "./kma-climate.mjs";

describe("KMA ASOS climate parser", () => {
  it("splits a period into API-safe inclusive 31-day ranges", () => {
    expect(splitDateRange("2024-01-01", "2024-02-02", 31)).toEqual([
      { from: "2024-01-01", to: "2024-01-31" },
      { from: "2024-02-01", to: "2024-02-02" },
    ]);
  });

  it("parses station metadata and keeps the address tail", () => {
    const text = "  108  126.96580000  37.57140000 11000  85.50  86.20  1.50  10.00  0.60 108 서울 Seoul 11B10101 1111010100 ---- 서울특별시 종로구 송월동";
    expect(parseKmaStations(text)).toEqual([expect.objectContaining({
      station_id: "108",
      name_ko: "서울",
      name_en: "Seoul",
      longitude: 126.9658,
      latitude: 37.5714,
      law_code: "1111010100",
      address: "서울특별시 종로구 송월동",
    })]);
  });

  it("normalizes selected metrics while preserving raw values and valid negative temperatures", () => {
    const values = KMA_DAILY_COLUMNS.map((column, index) => {
      if (column === "TM") return "20240101";
      if (column === "STN") return "108";
      if (column === "TA_AVG") return "3.3";
      if (column === "TA_MIN") return "-9.0";
      if (column === "RN_DAY") return "-9.0";
      return String(index);
    }).join(" ");
    const [row] = parseKmaDaily(`${values}\n`);

    expect(row).toMatchObject({
      station_id: "108",
      observation_date: "2024-01-01",
      ta_avg: 3.3,
      ta_min: -9,
      rn_day: null,
    });
    expect(row.raw_values.TA_MIN).toBe(-9);
    expect(row.raw_values.RN_DAY).toBe(-9);
    expect(row.quality_flags).toContain("missing:RN_DAY");
  });
});

