import { describe, expect, it } from "vitest";
import { buildDomesticSidoBoundaryQuery, DOMESTIC_SIDO_BOUNDARY_QUERY } from "./sgis";

describe("domestic sido boundary query", () => {
  it("locks the domestic 2D boundary request to 2025 nationwide sido", () => {
    expect(DOMESTIC_SIDO_BOUNDARY_QUERY).toEqual({ year: 2025, admCd: "non", lowSearch: 1 });
    expect(buildDomesticSidoBoundaryQuery()).toEqual({ year: 2025, admCd: "non", lowSearch: 1 });
  });

  it("returns a fresh object so callers cannot mutate the shared constant", () => {
    const query = buildDomesticSidoBoundaryQuery();
    query.admCd = "11";
    expect(DOMESTIC_SIDO_BOUNDARY_QUERY.admCd).toBe("non");
  });
});
