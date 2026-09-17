import { describe, expect, it } from "vitest";
import { KOSIS_SGG_TO_SGIS_ADM_CD, mapKosisRegionCodeToSgisAdmCd } from "./kosis-crosswalk";

describe("KOSIS SGG to SGIS crosswalk", () => {
  it("maps the integrated-region child codes to the legacy SGIS boundaries", () => {
    expect(KOSIS_SGG_TO_SGIS_ADM_CD["1224"]).toBe("24");
    expect(KOSIS_SGG_TO_SGIS_ADM_CD["1236"]).toBe("36");
    expect(mapKosisRegionCodeToSgisAdmCd("1224")).toBe("24");
    expect(mapKosisRegionCodeToSgisAdmCd("1236")).toBe("36");
  });

  it("maps vehicle registration sido codes to SGIS boundaries", () => {
    expect(mapKosisRegionCodeToSgisAdmCd("13102873443A.0001")).toBe("11");
    expect(mapKosisRegionCodeToSgisAdmCd("13102873443A.0015")).toBe("36");
    expect(mapKosisRegionCodeToSgisAdmCd("13102873443A.0018")).toBe("39");
  });

  it("passes through codes outside the crosswalk and rejects blanks", () => {
    expect(mapKosisRegionCodeToSgisAdmCd("11")).toBe("11");
    expect(mapKosisRegionCodeToSgisAdmCd(" 29 ")).toBe("29");
    expect(mapKosisRegionCodeToSgisAdmCd(null)).toBeNull();
    expect(mapKosisRegionCodeToSgisAdmCd("  ")).toBeNull();
  });
});
