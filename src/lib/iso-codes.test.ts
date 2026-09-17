import { describe, expect, it } from "vitest";
import { ISO_ALPHA3_TO_M49, isoAlpha3ToM49 } from "./iso-codes";

describe("ISO alpha-3 to M49 crosswalk", () => {
  it("resolves major countries including Korea", () => {
    expect(isoAlpha3ToM49("KOR")).toBe("410");
    expect(isoAlpha3ToM49("PRK")).toBe("408");
    expect(isoAlpha3ToM49("USA")).toBe("840");
    expect(isoAlpha3ToM49("HKG")).toBe("344");
    expect(isoAlpha3ToM49(" kor ")).toBe("410");
  });

  it("rejects aggregates, user-assigned codes and blanks", () => {
    expect(isoAlpha3ToM49("WLD")).toBeNull();
    expect(isoAlpha3ToM49("SSA")).toBeNull();
    expect(isoAlpha3ToM49("XKX")).toBeNull();
    expect(isoAlpha3ToM49(null)).toBeNull();
    expect(isoAlpha3ToM49("  ")).toBeNull();
  });

  it("covers every vendored world boundary id", async () => {
    const { readFile } = await import("node:fs/promises");
    const topo = JSON.parse(await readFile("public/data/world-countries-50m.json", "utf8"));    const ids: Set<string> = new Set(
      topo.objects.countries.geometries.map((geometry: { id: unknown }) => String(geometry.id)),
    );
    const values = new Set(Object.values(ISO_ALPHA3_TO_M49));
    // id 없는 5개 도형(소말릴란드·코소보·북키프로스·인도양·시아첸)은 결합 불가로 문서화됨.
    expect([...ids].filter((id) => id !== "undefined" && !values.has(id))).toEqual([]);
    expect(ids.has("410")).toBe(true);
  });
});
