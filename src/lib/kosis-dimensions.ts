/**
 * Phase C 하위분류 선택지 레지스트리. 지표(snapshot) 안의 분류 레벨로 필터한다.
 * 코드는 KOSIS metadata(getMeta)의 분류 코드 그대로 쓰며 이름 추정을 하지 않는다.
 */

export interface KosisDimensionOption {
  code: string;
  label: string;
}

export interface KosisDimension {
  key: string;
  label: string;
  /** attributes.classifications의 level (objL 순서와 일치). */
  level: number;
  /** 이 dimension이 의미를 가지는 indicator key. 비어 있으면 전 지표에 표시. */
  indicatorKeys: string[];
  options: KosisDimensionOption[];
}

/** DT_1K52F01 산업별 대분류 19종 (UP이 0인 행). */
const BUSINESS_INDUSTRIES: KosisDimensionOption[] = [
  { code: "A", label: "농업·임업·어업" },
  { code: "B", label: "광업" },
  { code: "C", label: "제조업" },
  { code: "D", label: "전기·가스·증기" },
  { code: "E", label: "수도·하수·폐기물" },
  { code: "F", label: "건설업" },
  { code: "G", label: "도매·소매업" },
  { code: "H", label: "운수·창고업" },
  { code: "I", label: "숙박·음식점업" },
  { code: "J", label: "정보통신업" },
  { code: "K", label: "금융·보험업" },
  { code: "L", label: "부동산업" },
  { code: "M", label: "전문·과학·기술" },
  { code: "N", label: "사업시설관리·임대" },
  { code: "O", label: "공공행정·국방" },
  { code: "P", label: "교육 서비스업" },
  { code: "Q", label: "보건·사회복지" },
  { code: "R", label: "예술·스포츠·여가" },
  { code: "S", label: "협회·수리·개인서비스" },
];

const BUSINESS_INDUSTRY_DIMENSION: KosisDimension = {
  key: "industry",
  label: "산업",
  level: 2,
  indicatorKeys: ["ind-T1", "ind-T2"],
  options: BUSINESS_INDUSTRIES,
};

const DIMENSIONS_BY_DATASET: Record<string, KosisDimension[]> = {
  "kosis-sido-business-count": [BUSINESS_INDUSTRY_DIMENSION],
};

/** dataset·indicator에 적용 가능한 하위분류 선택지를 반환한다. */
export function getKosisDimensions(datasetKey: string, indicatorKey: string): KosisDimension[] {
  return (DIMENSIONS_BY_DATASET[datasetKey] ?? []).filter(
    (dimension) => dimension.indicatorKeys.length === 0 || dimension.indicatorKeys.includes(indicatorKey),
  );
}
