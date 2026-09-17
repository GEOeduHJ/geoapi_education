import { describe, expect, it } from "vitest";
import { aggregateSidoMeans } from "./airkorea-snapshot.mjs";

describe("AirKorea sido aggregation", () => {
  it("averages station readings per sido and skips missing values", () => {
    const means = aggregateSidoMeans([
      { sidoName: "서울", pm10Value: "10", dataTime: "2026-09-17 22:00" },
      { sidoName: "서울", pm10Value: "20", dataTime: "2026-09-17 22:00" },
      { sidoName: "서울", pm10Value: "-", dataTime: "2026-09-17 22:00" },
      { sidoName: "전남광주", pm10Value: "30", dataTime: "2026-09-17 22:00" },
    ], "PM10");

    expect(means).toHaveLength(2);
    expect(means.find((mean) => mean.sido === "서울")).toMatchObject({
      value: 15,
      stationCount: 2,
      dataTime: "2026-09-17 22:00",
    });
    expect(means.find((mean) => mean.sido === "전남광주")).toMatchObject({ value: 30 });
  });

  it("returns no rows when every reading is missing", () => {
    expect(aggregateSidoMeans([{ sidoName: "서울", pm10Value: "-", dataTime: "t" }], "PM10")).toEqual([]);
  });
});
