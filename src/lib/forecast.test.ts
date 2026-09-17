import { describe, expect, it } from "vitest";
import {
  groupForecastByTime,
  rainTypeLabel,
  resolveForecastBase,
  skyLabel,
  toForecastGrid,
} from "./forecast";

describe("forecast grid conversion", () => {
  it("converts Seoul City Hall to the documented grid cell", () => {
    expect(toForecastGrid(37.5665, 126.978)).toEqual({ nx: 60, ny: 127 });
  });

  it("converts Busan to its eastern grid cell", () => {
    const { nx, ny } = toForecastGrid(35.1796, 129.0756);
    expect(nx).toBeGreaterThan(90);
    expect(ny).toBeLessThan(110);
  });
});

describe("forecast base time", () => {
  it("picks the latest released slot in KST", () => {
    // 2026-09-17 12:00 KST == 03:00 UTC
    expect(resolveForecastBase(new Date("2026-09-17T03:00:00Z"))).toEqual({
      baseDate: "20260917",
      baseTime: "1100",
    });
  });

  it("rolls back to the previous day before the first release", () => {
    // 2026-09-17 00:05 KST == 2026-09-16 15:05 UTC
    expect(resolveForecastBase(new Date("2026-09-16T15:05:00Z"))).toEqual({
      baseDate: "20260916",
      baseTime: "2300",
    });
  });
});

describe("forecast labels and grouping", () => {
  it("translates sky and rain codes", () => {
    expect(skyLabel("1")).toBe("맑음");
    expect(skyLabel("4")).toBe("흐림");
    expect(rainTypeLabel("0")).toBe("없음");
    expect(rainTypeLabel("3")).toBe("눈");
    expect(skyLabel(null)).toBe("-");
  });

  it("groups items by forecast time", () => {
    const slots = groupForecastByTime([
      { category: "TMP", fcstDate: "20260917", fcstTime: "1200", value: "21" },
      { category: "POP", fcstDate: "20260917", fcstTime: "1200", value: "30" },
      { category: "TMP", fcstDate: "20260917", fcstTime: "1500", value: "23" },
    ]);
    expect(slots).toHaveLength(2);
    expect(slots[0]).toMatchObject({ date: "20260917", time: "1200", temperature: "21", rainProbability: "30" });
    expect(slots[1].temperature).toBe("23");
  });
});
