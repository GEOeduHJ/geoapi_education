import { describe, expect, it } from "vitest";
import { DATASET_CATALOG, getDatasets, getDataset, mapDatasetCatalogRow, mergeDatasetCatalog } from "./dataset-catalog";
import { DEFAULT_CLIMATE_FROM, DEFAULT_CLIMATE_TO } from "../components/Climate2DWorkspace";

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

  it("keeps the ready KMA dataset's declared period in sync with the chart's actual DB coverage bounds", () => {
    const dataset = getDataset("kma-asos-climate-10y");
    expect(dataset?.period.min).toBe(DEFAULT_CLIMATE_FROM);
    expect(dataset?.period.max).toBe(DEFAULT_CLIMATE_TO);
  });
});

describe("mapDatasetCatalogRow", () => {
  const baseRow = {
    dataset_key: "world-bank-population-density",
    scope: "world",
    title: "국가별 인구밀도",
    provider: "World Bank",
    topic: "인구·도시화",
    space_label: "국가",
    coverage_label: "전 세계",
    period_min: "1990",
    period_max: "2024",
    period_label: "1990~2024",
    capabilities: ["map", "chart", "table"],
    status: "published",
    storage_mode: "supabase",
    description: "국가별 인구밀도 변화",
    source_url: "https://data.worldbank.org/",
  };

  it("maps a published row backed by real storage to ready", () => {
    const mapped = mapDatasetCatalogRow(baseRow);
    expect(mapped?.status).toBe("ready");
    expect(mapped).toMatchObject({
      key: "world-bank-population-density",
      scope: "world",
      space: "국가",
      coverage: "전 세계",
      period: { min: "1990", max: "2024", label: "1990~2024" },
      sourceUrl: "https://data.worldbank.org/",
      storage: "supabase",
    });
  });

  it("keeps a published row planned when storage_mode has no real data yet", () => {
    const mapped = mapDatasetCatalogRow({ ...baseRow, storage_mode: "planned" });
    expect(mapped?.status).toBe("planned");
  });

  it("keeps a non-published row planned regardless of storage_mode", () => {
    const mapped = mapDatasetCatalogRow({ ...baseRow, status: "draft", storage_mode: "supabase" });
    expect(mapped?.status).toBe("planned");
  });

  it("drops unrecognized capabilities instead of rejecting the row", () => {
    const mapped = mapDatasetCatalogRow({ ...baseRow, capabilities: ["map", "unknown", "chart"] });
    expect(mapped?.capabilities).toEqual(["map", "chart"]);
  });

  it("rejects rows missing a dataset_key or with an invalid scope", () => {
    expect(mapDatasetCatalogRow({ ...baseRow, dataset_key: "" })).toBeNull();
    expect(mapDatasetCatalogRow({ ...baseRow, scope: "national" })).toBeNull();
    expect(mapDatasetCatalogRow(null)).toBeNull();
  });
});

describe("mergeDatasetCatalog", () => {
  it("returns the static catalog unchanged when there are no published rows", () => {
    expect(mergeDatasetCatalog([])).toBe(DATASET_CATALOG);
  });

  it("overrides a matching static entry with the published row", () => {
    const override = { ...DATASET_CATALOG[0], title: "갱신된 제목", status: "ready" as const };
    const merged = mergeDatasetCatalog([override]);
    expect(merged).toHaveLength(DATASET_CATALOG.length);
    expect(merged.find((entry) => entry.key === override.key)?.title).toBe("갱신된 제목");
  });

  it("appends a published row whose key is not in the static catalog", () => {
    const extra = { ...DATASET_CATALOG[0], key: "brand-new-dataset" };
    const merged = mergeDatasetCatalog([extra]);
    expect(merged).toHaveLength(DATASET_CATALOG.length + 1);
    expect(merged.find((entry) => entry.key === "brand-new-dataset")).toEqual(extra);
  });
});

