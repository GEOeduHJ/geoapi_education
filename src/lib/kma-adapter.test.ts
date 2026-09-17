import { describe, expect, it } from "vitest";
import { toMapLayerSpec, toNormalizedRecords } from "./kma-adapter";
import type { ClimateStation, ClimateSummary } from "./climate";

const stations: ClimateStation[] = [
  { station_id: "101", name_ko: "춘천", name_en: null, longitude: 127.7, latitude: 37.9, altitude_m: null, law_code: "5111011800", address: null },
  { station_id: "105", name_ko: "강릉", name_en: null, longitude: 128.9, latitude: 37.75, altitude_m: null, law_code: "5115010700", address: null },
  { station_id: "108", name_ko: "서울", name_en: null, longitude: 126.96, latitude: 37.57, altitude_m: null, law_code: "1111017800", address: null },
  { station_id: "156", name_ko: "광주", name_en: null, longitude: 126.89, latitude: 35.17, altitude_m: null, law_code: "1230010900", address: "전남광주통합특별시 북구 운암동" },
  { station_id: "159", name_ko: "부산", name_en: null, longitude: 129.03, latitude: 35.10, altitude_m: null, law_code: "2611011600", address: null },
];

const makeSummary = (overrides: Partial<ClimateSummary>): ClimateSummary => ({
  stationId: "101",
  stationName: "춘천",
  metric: "ta_avg",
  value: 0,
  unit: "°C",
  observationCount: 100,
  expectedObservationCount: 100,
  coverageRatio: 1,
  firstDate: "2024-01-01",
  lastDate: "2024-12-31",
  ...overrides,
});

describe("toNormalizedRecords", () => {
  it("resolves each record's adm_cd from the station's law_code, not the raw law_code prefix", () => {
    const summaries = [
      makeSummary({ stationId: "108", stationName: "서울", value: 13.7 }),
      makeSummary({ stationId: "159", stationName: "부산", value: 15.7 }),
    ];
    const records = toNormalizedRecords(summaries, "ta_avg", stations);
    expect(records.find((r) => r.id === "108")?.location.adm_cd).toBe("11");
    expect(records.find((r) => r.id === "159")?.location.adm_cd).toBe("21");
  });

  it("leaves adm_cd undefined when the station is unknown", () => {
    const records = toNormalizedRecords([makeSummary({ stationId: "999", stationName: "미상" })], "ta_avg", stations);
    expect(records[0].location.adm_cd).toBeUndefined();
  });

  it("resolves 전남광주통합특별시 stations to both legacy SGIS boundaries via admCds", () => {
    const records = toNormalizedRecords([makeSummary({ stationId: "156", stationName: "광주", value: 15.0 })], "ta_avg", stations);
    const gwangju = records[0];
    expect(gwangju.location.admCds).toEqual(["24", "36"]);
    expect(gwangju.location.adm_cd).toBe("24"); // 대표값은 첫 코드
  });
});

describe("toMapLayerSpec", () => {
  it("aggregates stations sharing an adm_cd into a single boundary record with the mean value", () => {
    const summaries = [
      makeSummary({ stationId: "101", stationName: "춘천", value: 12 }),
      makeSummary({ stationId: "105", stationName: "강릉", value: 16 }),
      makeSummary({ stationId: "108", stationName: "서울", value: 13.7 }),
    ];
    const records = toNormalizedRecords(summaries, "ta_avg", stations);
    const spec = toMapLayerSpec(records, "ta_avg", { "32": "강원특별자치도", "11": "서울특별시" });

    expect(spec.type).toBe("polygon");
    expect(spec.records).toHaveLength(2);

    const gangwon = spec.records.find((r) => r.location.adm_cd === "32");
    expect(gangwon?.value).toBe(14); // (12 + 16) / 2
    expect(gangwon?.location.name).toBe("강원특별자치도");
    expect(gangwon?.metadata.observationStationCount).toBe(2);

    const seoul = spec.records.find((r) => r.location.adm_cd === "11");
    expect(seoul?.value).toBe(13.7);
    expect(seoul?.metadata.observationStationCount).toBe(1);
  });

  it("drops records with no resolvable adm_cd instead of miscoloring a boundary", () => {
    const summaries = [makeSummary({ stationId: "999", stationName: "미상", value: 99 })];
    const records = toNormalizedRecords(summaries, "ta_avg", stations);
    const spec = toMapLayerSpec(records, "ta_avg");
    expect(spec.records).toHaveLength(0);
  });

  it("falls back to the adm_cd itself as the label when no boundary name is supplied", () => {
    const summaries = [makeSummary({ stationId: "108", stationName: "서울", value: 13.7 })];
    const records = toNormalizedRecords(summaries, "ta_avg", stations);
    const spec = toMapLayerSpec(records, "ta_avg");
    expect(spec.records[0].location.name).toBe("11");
  });

  it("fans a 전남광주통합특별시 station's value out to both legacy SGIS boundaries (24, 36)", () => {
    const summaries = [makeSummary({ stationId: "156", stationName: "광주", value: 15.0 })];
    const records = toNormalizedRecords(summaries, "ta_avg", stations);
    const spec = toMapLayerSpec(records, "ta_avg", { "24": "광주광역시", "36": "전라남도" });

    expect(spec.records).toHaveLength(2);
    const oldGwangju = spec.records.find((r) => r.location.adm_cd === "24");
    const oldJeonnam = spec.records.find((r) => r.location.adm_cd === "36");
    expect(oldGwangju?.value).toBe(15.0);
    expect(oldJeonnam?.value).toBe(15.0);
    expect(oldGwangju?.location.name).toBe("광주광역시");
    expect(oldJeonnam?.location.name).toBe("전라남도");
  });
});
