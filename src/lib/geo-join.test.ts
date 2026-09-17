import { describe, expect, it } from "vitest";
import type { PublicGeoObservation } from "./geo-observations";
import { joinKosisObservationsToSgisBoundaries } from "./geo-join";
import type { SgisBoundaryResponse } from "./sgis";

function boundaries(codes: string[]): SgisBoundaryResponse {
  return {
    query: { year: 2025, admCd: "non", lowSearch: 1 },
    sourceCrs: "EPSG:5179",
    fetchedAt: "2026-09-17T00:00:00.000Z",
    data: {
      type: "FeatureCollection",
      features: codes.map((code) => ({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [] },
        properties: { adm_cd: code, adm_nm: `지역 ${code}`, addr_en: null, x: null, y: null },
      })),
    },
  };
}

function observation(
  id: string,
  regionCode: string,
  value: number,
  overrides: Partial<PublicGeoObservation> = {},
): PublicGeoObservation {
  return {
    id,
    snapshot_id: "snapshot-1",
    observed_at: "2024-01-01",
    region_code: regionCode,
    label: `지역 ${regionCode}`,
    value,
    unit: "명",
    category: null,
    attributes: {},
    ...overrides,
  };
}

describe("KOSIS to SGIS boundary join", () => {
  it("accepts exact region-code matches as ready", () => {
    const result = joinKosisObservationsToSgisBoundaries(
      boundaries(["11", "21", "22"]),
      [observation("o-11", "11", 100), observation("o-21", "21", 200)],
    );

    expect(result.status).toBe("ready");
    expect(result.matchedCount).toBe(2);
    expect(result.missingBoundaryCount).toBe(1);
    expect(result.values).toEqual(expect.objectContaining({
      "11": expect.objectContaining({ value: 100, observationId: "o-11" }),
      "21": expect.objectContaining({ value: 200, observationId: "o-21" }),
    }));
  });

  it("blocks coloring when a region has multiple period values", () => {
    const result = joinKosisObservationsToSgisBoundaries(
      boundaries(["11", "21"]),
      [
        observation("o-11-a", "11", 100, { observed_at: "2024-01-01" }),
        observation("o-11-b", "11", 110, { observed_at: "2024-02-01" }),
        observation("o-21", "21", 200, { observed_at: "2024-01-01" }),
      ],
    );

    expect(result.status).toBe("ambiguous-values");
    expect(result.ambiguousCodes).toEqual(["11"]);
    expect(result.values).toEqual({});
  });

  it("does not infer a match from a different code system", () => {
    const result = joinKosisObservationsToSgisBoundaries(
      boundaries(["11", "21"]),
      [observation("o-1", "21010", 100), observation("o-2", "21020", 200)],
    );

    expect(result.status).toBe("no-code-matches");
    expect(result.matchedCount).toBe(0);
    expect(result.unmatchedObservationCodes).toEqual(["21010", "21020"]);
  });

  it("reports the normal pre-ingest state without public numeric values", () => {
    const result = joinKosisObservationsToSgisBoundaries(boundaries(["11"]), []);

    expect(result.status).toBe("no-public-values");
    expect(result.numericObservationCount).toBe(0);
    expect(result.values).toEqual({});
  });

  it("reports missing boundaries before attempting a value join", () => {
    const result = joinKosisObservationsToSgisBoundaries(null, [observation("o-11", "11", 100)]);

    expect(result.status).toBe("no-boundaries");
    expect(result.values).toEqual({});
  });

  it("applies an official crosswalk before matching and reports it", () => {
    const result = joinKosisObservationsToSgisBoundaries(
      boundaries(["11", "24", "36"]),
      [observation("o-11", "11", 100), observation("o-gj", "1224", 200), observation("o-jn", "1236", 300)],
      { codeMap: { "1224": "24", "1236": "36" } },
    );

    expect(result.status).toBe("ready");
    expect(result.matchedCount).toBe(3);
    expect(result.missingBoundaryCount).toBe(0);
    expect(result.crosswalk).toEqual([{ from: "1224", to: "24" }, { from: "1236", to: "36" }]);
    expect(result.values["24"]).toEqual(expect.objectContaining({ value: 200, observationId: "o-gj" }));
    expect(result.values["36"]).toEqual(expect.objectContaining({ value: 300, observationId: "o-jn" }));
  });

  it("leaves codes untouched when no crosswalk entry exists", () => {
    const result = joinKosisObservationsToSgisBoundaries(
      boundaries(["11", "21"]),
      [observation("o-11", "11", 100)],
      { codeMap: { "1224": "24" } },
    );

    expect(result.status).toBe("ready");
    expect(result.crosswalk).toEqual([]);
    expect(result.matchedCount).toBe(1);
  });

  it("fans out one observation to several boundaries for integrated regions", () => {
    const result = joinKosisObservationsToSgisBoundaries(
      boundaries(["11", "24", "36"]),
      [observation("o-11", "11", 100), observation("o-jg", "전남광주", 50)],
      { codeMap: { "전남광주": ["24", "36"] } },
    );

    expect(result.status).toBe("ready");
    expect(result.matchedCount).toBe(3);
    expect(result.missingBoundaryCount).toBe(0);
    expect(result.crosswalk).toEqual([{ from: "전남광주", to: "24" }, { from: "전남광주", to: "36" }]);
    expect(result.values["24"]).toEqual(expect.objectContaining({ value: 50, observationId: "o-jg" }));
    expect(result.values["36"]).toEqual(expect.objectContaining({ value: 50, observationId: "o-jg" }));
  });
});
