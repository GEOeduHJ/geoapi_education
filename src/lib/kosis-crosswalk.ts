/**
 * KOSIS SGG(행정구역별) 분류코드 → SGIS `adm_cd` 공식 대응표.
 *
 * 근거: KOSIS metadata (`orgId=101`, `tblId=DT_1YL21281`, `getMeta type=ITM`)에서
 * `1224=광주광역시`·`1236=전라남도`는 상위 분류 `12=전남광주통합특별시`의 하위 코드로
 * 등록되어 있다. 이름 유사도 추정이 아니라 제공기관의 분류 계층에 기반한다.
 * 그 외 2자리 시도 코드는 SGIS `adm_cd`와 동일 체계를 쓰므로 그대로 둔다.
 * 원자료(`geo_observations.region_code`)는 손대지 않고 조인 시점에만 변환한다.
 */
export const KOSIS_SGG_TO_SGIS_ADM_CD: Record<string, string> = {
  "1224": "24", // 광주광역시 (KOSIS 하위 코드) → SGIS 2025 광주 adm_cd
  "1236": "36", // 전라남도 (KOSIS 하위 코드) → SGIS 2025 전남 adm_cd
};

/** KOSIS `region_code`를 SGIS 조인용 코드로 변환한다. 대응표에 없으면 원본 유지. */
export function mapKosisRegionCodeToSgisAdmCd(regionCode: string | null): string | null {
  if (typeof regionCode !== "string") return null;
  const code = regionCode.trim();
  if (!code) return null;
  return KOSIS_SGG_TO_SGIS_ADM_CD[code] ?? code;
}
