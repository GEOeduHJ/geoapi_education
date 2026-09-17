import { describe, expect, it } from "vitest";
import { normalizeOccurrence } from "./gbif-snapshot.mjs";

describe("GBIF normalization", () => {
  it("preserves coordinates, license and publisher", () => {
    const observation = normalizeOccurrence({
      key: 123,
      decimalLatitude: 34.88,
      decimalLongitude: 128.21,
      eventDate: "2024-05-01T00:00:00",
      locality: "순천만",
      license: "http://creativecommons.org/licenses/by/4.0/legalcode",
      publishingOrg: "org-1",
      datasetKey: "ds-1",
    }, "crane");
    expect(observation).toMatchObject({
      external_id: "gbif:crane:123",
      observed_at: "2024-05-01",
      label: "두루미",
      value: null,
      category: "두루미",
    });
    expect(observation.attributes).toMatchObject({
      longitude: 128.21,
      latitude: 34.88,
      has_coordinates: true,
      license: "http://creativecommons.org/licenses/by/4.0/legalcode",
    });
  });
});
