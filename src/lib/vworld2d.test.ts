import { describe, expect, it } from "vitest";
import { extractVWorldScriptUrls } from "./vworld2d";

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
});
