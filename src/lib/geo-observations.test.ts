import { describe, expect, it } from "vitest";
import {
  aggregateObservationsByRegion,
  filterObservationsByClassification,
  filterObservationsByYear,
  listObservationYears,
  normalizePublicObservation,
  normalizePublicSnapshot,
  type PublicGeoObservation,
} from "./geo-observations";

describe("public geo observation normalization", () => {
  it("normalizes Postgres numeric strings without exposing raw payload fields", () => {
    expect(normalizePublicSnapshot({
      id: "snapshot-1",
      data_source_id: "source-1",
      fetched_at: "2026-09-17T01:02:03Z",
      valid_from: "2024-01-01",
      valid_to: "2024-04-01",
      request_fingerprint: "kosis-statistics-v1:abc",
      schema_version: "kosis-statistics-v1",
      row_count: "8",
      checksum: "abc123",
      is_public: true,
      raw_payload: { rows: ["should not be selected"] },
    })).toEqual({
      id: "snapshot-1",
      data_source_id: "source-1",
      fetched_at: "2026-09-17T01:02:03Z",
      valid_from: "2024-01-01",
      valid_to: "2024-04-01",
      request_fingerprint: "kosis-statistics-v1:abc",
      schema_version: "kosis-statistics-v1",
      row_count: 8,
      checksum: "abc123",
      is_public: true,
    });
  });

  it("keeps symbolic values and classification metadata when value is not numeric", () => {
    expect(normalizePublicObservation({
      id: "observation-1",
      snapshot_id: "snapshot-1",
      observed_at: "2024-01-01T00:00:00Z",
      region_code: "11",
      label: "서울",
      value: "-",
      unit: "명",
      category: "총인구",
      attributes: { value_text: "-", value_symbol: "-", classifications: [{ level: 1, code: "11" }] },
    })).toEqual({
      id: "observation-1",
      snapshot_id: "snapshot-1",
      observed_at: "2024-01-01T00:00:00Z",
      region_code: "11",
      label: "서울",
      value: null,
      unit: "명",
      category: "총인구",
      attributes: { value_text: "-", value_symbol: "-", classifications: [{ level: 1, code: "11" }] },
    });
  });

  it("rejects rows without database identity fields", () => {
    expect(normalizePublicSnapshot({ data_source_id: "source-1" })).toBeNull();
    expect(normalizePublicObservation({ snapshot_id: "snapshot-1", value: 12 })).toBeNull();
  });
});

function yearObservation(id: string, observedAt: string | null): PublicGeoObservation {
  return {
    id,
    snapshot_id: "snapshot-1",
    observed_at: observedAt,
    region_code: "11",
    label: "서울",
    value: 1,
    unit: "천㎡",
    category: null,
    attributes: {},
  };
}

describe("observation year selection", () => {
  const observations = [
    yearObservation("o-1", "2025-01-01T00:00:00+00:00"),
    yearObservation("o-2", "2024-01-01T00:00:00+00:00"),
    yearObservation("o-3", "2025-01-01T00:00:00+00:00"),
    yearObservation("o-4", null),
  ];

  it("lists distinct years in descending order, skipping timeless rows", () => {
    expect(listObservationYears(observations)).toEqual(["2025", "2024"]);
    expect(listObservationYears([])).toEqual([]);
  });

  it("filters to a single year so the join never sees mixed periods", () => {
    expect(filterObservationsByYear(observations, "2025").map((o) => o.id)).toEqual(["o-1", "o-3"]);
    expect(filterObservationsByYear(observations, "1999")).toEqual([]);
    expect(filterObservationsByYear(observations, "")).toEqual([]);
  });
});

function monthlyObservation(id: string, regionCode: string, observedAt: string, value: number | null): PublicGeoObservation {
  return {
    id,
    snapshot_id: "snapshot-1",
    observed_at: observedAt,
    region_code: regionCode,
    label: `지역 ${regionCode}`,
    value,
    unit: "대",
    category: null,
    attributes: {},
  };
}

describe("regional yearly aggregation", () => {  it("returns yearly rows untouched", () => {
    const rows = [
      monthlyObservation("y-11", "11", "2024-01-01", 100),
      monthlyObservation("y-21", "21", "2024-01-01", 200),
    ];
    expect(aggregateObservationsByRegion(rows)).toBe(rows);
  });

  it("averages monthly rows into one value per region", () => {
    const rows = [
      monthlyObservation("m-11-a", "11", "2024-01-01", 100),
      monthlyObservation("m-11-b", "11", "2024-02-01", 200),
      monthlyObservation("m-11-c", "11", "2024-03-01", null),
      monthlyObservation("m-21-a", "21", "2024-01-01", 50),
    ];
    const aggregated = aggregateObservationsByRegion(rows);
    expect(aggregated).toHaveLength(2);
    expect(aggregated.find((row) => row.region_code === "11")).toMatchObject({
      value: 150,
      observed_at: "2024-01-01",
      attributes: expect.objectContaining({ aggregated: "year-mean", source_count: 2 }),
    });
    expect(aggregated.find((row) => row.region_code === "21")).toMatchObject({ value: 50 });
  });
});

function classifiedObservation(id: string, classifications: unknown): PublicGeoObservation {
  return {
    id,
    snapshot_id: "snapshot-1",
    observed_at: "2024-01-01",
    region_code: "11",
    label: "서울",
    value: 1,
    unit: "개",
    category: null,
    attributes: { classifications },
  };
}

describe("classification filtering", () => {
  const rows = [
    classifiedObservation("r-1", [{ level: 1, code: "11" }, { level: 2, code: "C" }]),
    classifiedObservation("r-2", [{ level: 1, code: "11" }, { level: 2, code: "G" }]),
    classifiedObservation("r-3", [{ level: 1, code: "11" }]),
  ];

  it("keeps rows matching the classification code at the given level", () => {
    expect(filterObservationsByClassification(rows, 2, "C").map((row) => row.id)).toEqual(["r-1"]);
    expect(filterObservationsByClassification(rows, 1, "11").map((row) => row.id)).toEqual(["r-1", "r-2", "r-3"]);
  });

  it("treats a blank code as no filtering and never matches malformed rows", () => {
    expect(filterObservationsByClassification(rows, 2, "  ")).toBe(rows);
    expect(filterObservationsByClassification(rows, 2, "Z")).toEqual([]);
  });
});
