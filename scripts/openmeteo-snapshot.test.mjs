import { describe, expect, it } from "vitest";
import { normalizeCityDaily } from "./openmeteo-snapshot.mjs";

describe("Open-Meteo normalization", () => {
  it("creates one observation per day with city coordinates", () => {
    const observations = normalizeCityDaily("SEL", ["2024-01-01", "2024-01-02"], [-2.5, null], "TEMP", "2024");
    expect(observations).toHaveLength(2);
    expect(observations[0]).toMatchObject({
      external_id: "openmeteo:SEL:TEMP:2024-01-01",
      observed_at: "2024-01-01",
      region_code: "SEL",
      label: "서울",
      value: -2.5,
      unit: "°C",
    });
    expect(observations[0].attributes).toMatchObject({ longitude: 126.97, latitude: 37.56 });
    expect(observations[1].value).toBeNull();
  });
});
