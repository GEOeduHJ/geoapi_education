import { describe, expect, it } from "vitest";
import {
  buildDataPortalUrl,
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
});
