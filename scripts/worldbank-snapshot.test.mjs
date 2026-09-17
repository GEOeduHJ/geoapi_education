import { describe, expect, it } from "vitest";
import { isCountryRecord, normalizeWorldBankRecords } from "./worldbank-snapshot.mjs";

describe("World Bank snapshot normalization", () => {
  it("accepts ISO-shaped codes and rejects malformed rows (aggregates join out later)", () => {
    expect(isCountryRecord({ countryiso3code: "KOR" })).toBe(true);
    expect(isCountryRecord({ countryiso3code: "WLD" })).toBe(true);
    expect(isCountryRecord({ countryiso3code: "ZH" })).toBe(false);
    expect(isCountryRecord({})).toBe(false);
  });

  it("normalizes values with nulls preserved", () => {
    const observations = normalizeWorldBankRecords([
      { countryiso3code: "KOR", country: { value: "Korea, Rep." }, date: "2024", value: 530.5 },
      { countryiso3code: "PRK", country: { value: "Korea, Dem. People's Rep." }, date: "2024", value: null },
    ], "EN.POP.DNST");
    expect(observations).toHaveLength(2);
    expect(observations[0]).toMatchObject({
      region_code: "KOR",
      label: "Korea, Rep.",
      value: 530.5,
      unit: "명/km²",
      category: "인구밀도",
      observed_at: "2024-01-01",
    });
    expect(observations[0].external_id).toBe("wb:EN.POP.DNST:KOR:2024");
    expect(observations[1].value).toBeNull();
  });
});
