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
  // DT_MLTM_5498 (자동차등록, org 116) 시도명 분류. 0002 전남광주는 집계 코드라
  // 요청에서 제외하고, 하위 17개만 SGIS 2025 adm_cd에 연결한다.
  "13102873443A.0001": "11", // 서울
  "13102873443A.0003": "21", // 부산
  "13102873443A.0004": "22", // 대구
  "13102873443A.0005": "23", // 인천
  "13102873443A.0006": "24", // 광주
  "13102873443A.0007": "25", // 대전
  "13102873443A.0008": "26", // 울산
  "13102873443A.0009": "29", // 세종
  "13102873443A.0010": "31", // 경기
  "13102873443A.0011": "32", // 강원
  "13102873443A.0012": "33", // 충북
  "13102873443A.0013": "34", // 충남
  "13102873443A.0014": "35", // 전북
  "13102873443A.0015": "36", // 전남
  "13102873443A.0016": "37", // 경북
  "13102873443A.0017": "38", // 경남
  "13102873443A.0018": "39", // 제주
};

/** KOSIS `region_code`를 SGIS 조인용 코드로 변환한다. 대응표에 없으면 원본 유지. */
export function mapKosisRegionCodeToSgisAdmCd(regionCode: string | null): string | null {
  if (typeof regionCode !== "string") return null;
  const code = regionCode.trim();
  if (!code) return null;
  return KOSIS_SGG_TO_SGIS_ADM_CD[code] ?? code;
}
