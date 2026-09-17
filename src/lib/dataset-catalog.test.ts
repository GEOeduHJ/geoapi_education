import { describe, expect, it } from "vitest";
import { DATASET_CATALOG, getDatasets, getDataset } from "./dataset-catalog";

describe("curated dataset catalog", () => {
  it("keeps domestic and world learner choices separate", () => {
    expect(getDatasets("domestic").every((dataset) => dataset.scope === "domestic")).toBe(true);
    expect(getDatasets("world").every((dataset) => dataset.scope === "world")).toBe(true);
    expect(getDataset("kma-asos-climate-10y")?.capabilities).toEqual(["map", "chart", "table"]);
  });

  it("marks only datasets with verified stored data as ready", () => {
    const ready = DATASET_CATALOG.filter((dataset) => dataset.status === "ready");
    expect(ready.map((dataset) => dataset.key)).toEqual(["kma-asos-climate-10y"]);
    expect(getDataset("kosis-sido-city-park-per-capita")?.status).toBe("planned");
  });
});

