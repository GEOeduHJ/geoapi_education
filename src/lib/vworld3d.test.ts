import { describe, expect, it } from "vitest";
import { prismColor, ringsToLonLatFlat, valueToPrismHeight } from "./vworld3d";

describe("3D prism helpers", () => {
  it("normalizes values into schematic heights", () => {
    const range = { min: 0, max: 100, maxHeightMeters: 100_000 };
    expect(valueToPrismHeight(0, range)).toBe(0);
    expect(valueToPrismHeight(100, range)).toBe(100_000);
    expect(valueToPrismHeight(50, range)).toBe(50_000);
    expect(valueToPrismHeight(Number.NaN, range)).toBe(0);
  });

  it("shares the 2D palette stops for prism colors", () => {
    expect(prismColor(0, 0, 100)).toEqual({ red: 229, green: 241, blue: 236 });
    expect(prismColor(100, 0, 100)).toEqual({ red: 15, green: 78, blue: 78 });
  });

  it("converts EPSG:5179 rings to lon/lat flats through WebMercator", () => {
    const flats = ringsToLonLatFlat(
      [[[953932, 1952053], [958712, 1951621], [958801, 1951564], [953932, 1952053]]],
      "Polygon",
    );
    expect(flats).toHaveLength(1);
    const [lon, lat] = flats[0];
    expect(lon).toBeCloseTo(126.98, 1);
    expect(lat).toBeCloseTo(37.57, 1);
  });

  it("drops rings that cannot form a polygon", () => {
    expect(ringsToLonLatFlat([[[1, 2]]], "Polygon")).toEqual([]);
    expect(ringsToLonLatFlat(null, "Polygon")).toEqual([]);
  });
});
