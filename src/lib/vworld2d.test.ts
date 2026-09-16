import { describe, expect, it } from "vitest";
import { extractVWorldScriptUrls, transformNestedCoordinates } from "./vworld2d";

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
});
