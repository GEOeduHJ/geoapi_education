import { describe, expect, it } from "vitest";
import {
  buildDataPortalUrl,
  buildEsriCanvasTileUrl,
  buildKmaHubUrl,
  buildSgisAuthUrl,
  buildVWorldLoaderUrl,
  decodeServiceKey,
} from "./requests";

describe("API request builders", () => {
  it("decodes an already URL-encoded data portal key once", () => {
    expect(decodeServiceKey("abc%2Bdef%3D%3D")).toBe("abc+def==");
  });

  it("does not double-encode the data portal service key", () => {
    const url = buildDataPortalUrl(
      "https://example.test/forecast",
      "abc%2Bdef%3D%3D",
      { dataType: "JSON", numOfRows: 1 },
    );
    expect(url).toContain("serviceKey=abc%2Bdef%3D%3D");
    expect(url).not.toContain("%252B");
  });

  it("builds provider-specific auth parameters", () => {
    expect(buildKmaHubUrl("https://example.test/kma", "kma-key", { stn: 108 })).toContain(
      "authKey=kma-key",
    );
    expect(buildVWorldLoaderUrl("v-key", "localhost")).toContain("domain=localhost");
    expect(buildSgisAuthUrl("https://example.test/auth", "consumer", "secret")).toContain("consumer_key=consumer");
  });

  it("builds keyless Esri canvas tile URLs with ArcGIS z/y/x order", () => {
    expect(buildEsriCanvasTileUrl("base")).toBe(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    );
    expect(buildEsriCanvasTileUrl("reference")).toContain("World_Light_Gray_Reference");
  });
});
