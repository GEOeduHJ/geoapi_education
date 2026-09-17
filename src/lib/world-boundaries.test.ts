import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { convertWorldTopoJson, WORLD_BOUNDARY_SOURCE } from "./world-boundaries";

describe("world boundary conversion", () => {
  it("decodes the vendored TopoJSON into joinable country features", async () => {
    const topology = JSON.parse(await readFile("public/data/world-countries-50m.json", "utf8"));
    const response = convertWorldTopoJson(topology);
    expect(response?.sourceCrs).toBe("EPSG:4326");
    expect(response?.data.features.length).toBeGreaterThan(230);
    const byCode = new Map(response?.data.features.map((feature) => [feature.properties.adm_cd, feature.properties.adm_nm]));
    expect(byCode.get("410")).toBe("South Korea");
    expect(WORLD_BOUNDARY_SOURCE).toContain("Natural Earth");
  });

  it("rejects malformed topologies without inventing features", () => {
    expect(convertWorldTopoJson(null)).toBeNull();
    expect(convertWorldTopoJson({})).toBeNull();
    expect(convertWorldTopoJson({ objects: {} })).toBeNull();
  });
});
