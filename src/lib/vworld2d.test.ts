import { describe, expect, it } from "vitest";
import { epsg5179ToWebMercator, extractVWorldScriptUrls, getChoroplethColor, transformNestedCoordinates } from "./vworld2d";

describe("VWorld 2D loader helpers", () => {
  it("extracts document.write script URLs without interpreting the markup", () => {
    expect(extractVWorldScriptUrls(
      "<script src='https://example.test/jquery.js'></script>" +
      "<script type=\"text/javascript\" src=\"https://example.test/ol.js\"></script>",
    )).toEqual([
      "https://example.test/jquery.js",
      "https://example.test/ol.js",
    ]);
  });

  it("transforms nested Polygon coordinates without flattening rings", () => {
    const transformed = transformNestedCoordinates(
      [[[126, 36], [127, 36], [127, 37], [126, 36]]],
      ([x, y]) => [x + 1000, y + 2000],
    );
    expect(transformed).toEqual([[[1126, 2036], [1127, 2036], [1127, 2037], [1126, 2036]]]);
  });

  it("does not invent geometry for malformed coordinates", () => {
    expect(transformNestedCoordinates([["126", 36]], ([x, y]) => [x + 1, y + 1])).toEqual([[null, null]]);
  });

  it("converts the SGIS Seoul reference coordinate to a plausible Web Mercator point", () => {
    const [x, y] = epsg5179ToWebMercator([953932, 1952053]);
    expect(x).toBeCloseTo(14135165, 0);
    expect(y).toBeCloseTo(4518393, 0);
  });

  it("uses a bounded five-step sequential palette for thematic values", () => {
    expect(getChoroplethColor(0, 0, 100)).not.toBe(getChoroplethColor(100, 0, 100));
    expect(getChoroplethColor(0, 0, 100)).toBe(getChoroplethColor(-20, 0, 100));
    expect(getChoroplethColor(100, 0, 100)).toBe(getChoroplethColor(120, 0, 100));
    expect(getChoroplethColor(50, 50, 50)).toContain("rgba");
  });
});
