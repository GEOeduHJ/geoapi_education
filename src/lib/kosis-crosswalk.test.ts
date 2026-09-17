import { describe, expect, it } from "vitest";
import { KOSIS_SGG_TO_SGIS_ADM_CD, mapKosisRegionCodeToSgisAdmCd } from "./kosis-crosswalk";

describe("KOSIS SGG to SGIS crosswalk", () => {
  it("maps the integrated-region child codes to the legacy SGIS boundaries", () => {
    expect(KOSIS_SGG_TO_SGIS_ADM_CD).toEqual({ "1224": "24", "1236": "36" });
    expect(mapKosisRegionCodeToSgisAdmCd("1224")).toBe("24");
    expect(mapKosisRegionCodeToSgisAdmCd("1236")).toBe("36");
  });

  it("passes through codes outside the crosswalk and rejects blanks", () => {
    expect(mapKosisRegionCodeToSgisAdmCd("11")).toBe("11");
    expect(mapKosisRegionCodeToSgisAdmCd(" 29 ")).toBe("29");
    expect(mapKosisRegionCodeToSgisAdmCd(null)).toBeNull();
    expect(mapKosisRegionCodeToSgisAdmCd("  ")).toBeNull();
  });
});
