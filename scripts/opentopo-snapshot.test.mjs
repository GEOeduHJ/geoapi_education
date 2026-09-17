import { describe, expect, it } from "vitest";
import { normalizeElevations, transectPoints } from "./opentopo-snapshot.mjs";

describe("OpenTopoData transect", () => {
  it("builds a fixed Seoul-Busan waypoint list", () => {
    const points = transectPoints();
    expect(points).toHaveLength(25);
    expect(points[0]).toMatchObject({ sequence: 1, lat: 37.56, lon: 126.97 });
    expect(points[24]).toMatchObject({ sequence: 25, lat: 35.18, lon: 129.08 });
  });

  it("keeps missing elevations as null rows", () => {
    const observations = normalizeElevations(
      [{ sequence: 1, lat: 37.5, lon: 127 }, { sequence: 2, lat: 37.4, lon: 127.1 }],
      [{ elevation: 100.5 }, {}],
    );
    expect(observations[0]).toMatchObject({ value: 100.5, unit: "m" });
    expect(observations[1].value).toBeNull();
  });
});
