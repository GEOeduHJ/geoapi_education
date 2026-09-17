import { describe, expect, it } from "vitest";
import { normalizeTourPoi } from "./tourapi-snapshot.mjs";

describe("TourAPI snapshot normalization", () => {
  it("keeps coordinates, license and raw area codes", () => {
    const observation = normalizeTourPoi({
      contentid: "127480",
      title: "가거도",
      addr1: "전남 신안군",
      mapx: "125.123456",
      mapy: "34.456789",
      firstimage: "http://example.test/a.jpg",
      cpyrhtDivCd: "Type3",
      sigungucode: "22",
      tel: "061-000-0000",
    }, "38", "12");

    expect(observation).toMatchObject({
      external_id: "tourapi:12:127480",
      region_code: "38",
      label: "가거도",
      value: null,
      category: "관광지",
    });
    expect(observation.attributes).toMatchObject({
      longitude: 125.123456,
      latitude: 34.456789,
      has_coordinates: true,
      image_url: "http://example.test/a.jpg",
      image_license: "Type3",
    });
  });

  it("flags rows without usable coordinates", () => {
    const observation = normalizeTourPoi({ contentid: "1", title: "x", mapx: "", mapy: "" }, "1", "12");
    expect(observation.attributes.has_coordinates).toBe(false);
  });
});
