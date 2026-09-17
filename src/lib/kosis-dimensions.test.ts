import { describe, expect, it } from "vitest";
import { getKosisDimensions } from "./kosis-dimensions";

describe("KOSIS sub-dimension registry", () => {
  it("offers the 19-industry selector for industry indicator snapshots", () => {
    for (const indicatorKey of ["ind-T1", "ind-T2"]) {
      const dimensions = getKosisDimensions("kosis-sido-business-count", indicatorKey);
      expect(dimensions).toHaveLength(1);
      expect(dimensions[0]).toMatchObject({ key: "industry", label: "산업", level: 2 });
      expect(dimensions[0].options).toHaveLength(19);
      expect(dimensions[0].options.find((option) => option.code === "C")?.label).toBe("제조업");
    }
  });

  it("hides the industry selector for whole-industry indicators and other datasets", () => {
    expect(getKosisDimensions("kosis-sido-business-count", "T1")).toEqual([]);
    expect(getKosisDimensions("kosis-sido-grdp-per-capita", "T1")).toEqual([]);
    expect(getKosisDimensions("unknown", "")).toEqual([]);
  });
});
