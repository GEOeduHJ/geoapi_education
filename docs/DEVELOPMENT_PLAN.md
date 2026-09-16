# GeoAPI Education 개발 계획

> 지리교육용 자료 탐구·자료 제작 학습 사이트
>
> 상태: 초기 구현·API 승인 반영 단계
> 기준일: 2026-09-16
> 권장 스택: React + TypeScript + Vite + Supabase + Vercel + GitHub Actions

## 1. 개발 목표

두 GitHub 저장소는 실행할 백엔드가 아니라 API 후보를 찾는 카탈로그로 활용한다.

- [yybmion/public-apis-4Kr](https://github.com/yybmion/public-apis-4Kr): 국내 공공데이터·지도·기상·통계 후보 탐색
- [public-apis/public-apis](https://github.com/public-apis/public-apis): 글로벌 API 후보 탐색
- 실제 사용 여부, 인증, 호출량, 라이선스는 각 제공기관의 공식 문서를 최종 기준으로 검증한다.
- 학생이 화면을 조작할 때마다 원천 API를 호출하지 않는다. 누적·과거·반복 사용 데이터는 먼저 수집하여 DB와 Storage에 저장한다.
- 실시간성이 학습 목표인 데이터만 서버 프록시와 짧은 캐시를 거쳐 제한적으로 호출한다.
- 2D 지도와 3D 지도는 같은 화면의 장식적 전환이 아니라 서로 다른 학습 목표와 렌더링 계약을 갖는 별도 기능으로 설계한다.

### 두 학습 세션

| 세션 | 핵심 질문 | 주요 산출물 |
|---|---|---|
| 자료 제작 스튜디오 | 어떤 자료를 어떤 공간·시간 단위와 표현 방법으로 만들 것인가? | 지도, 차트, 표, 2D/3D 자료, 출처·변환 기록 |
| 자료 활용 탐구 | 자료에서 어떤 공간적 패턴·차이·변화를 읽고 어떤 주장을 만들 수 있는가? | 탐구 질문, 증거 선택, 해석, 일반화, 전이·성찰 |

### Supabase의 역할 결정

현재 Supabase는 로그인·회원가입 provider가 아니라 **공개 교육자료의 저장·버전·조회 계층**이다. 로그인 없는 방문자는 Publishable Key와 RLS로 게시 자료와 검증된 기후 데이터만 읽는다. 기상청·KOSIS·SGIS 수집기와 GitHub Actions는 서버 Secret으로 스냅샷·정규화 값·파생지표를 적재한다. 학습자 답안은 현재 브라우저에서 직접 저장하지 않으며, 향후 필요할 때 검증·속도제한된 서버 제출 함수를 별도로 추가한다. 상세 경계는 [Supabase 역할과 공개 이용 정책](SUPABASE_ROLE.md)에 기록한다.

## 2. API 선정 원칙

### 원천 API와 애플리케이션의 역할 분리

```text
공식 API / 공개 데이터
        ↓  수집·검증·버전 고정
Supabase Storage(raw) + Postgres/PostGIS(normalized)
        ↓  레시피·파생 지표·학습 자료
React 학습 화면
```

### 데이터 생애주기

| 데이터 성격 | 예시 | 기본 처리 |
|---|---|---|
| 역사·누적형 | 최근 10년 기후, KOSIS 지표, 세계은행 지표, 지진 이력, 행정경계 | GitHub Actions 또는 수동 백필로 DB화하고 학생 화면은 DB만 조회 |
| 준실시간형 | 관광지·행사, 충전기 위치, 주소 검색 결과 | 서버 프록시, TTL 캐시, 필요할 때만 스냅샷 |
| 실시간형 | 단기예보, 현재 대기질, 최근 지진 피드 | 서버 프록시 + 응답 캐시 + 장애 시 마지막 정상 스냅샷 |
| 지도 서비스형 | VWorld 2D/3D 배경·지도 서비스 | 지도 렌더러에서 사용하되, 학습용 분석 레이어와 정적 경계는 별도 DB화 |

`공식 제한 미공개`는 제한이 없다는 뜻이 아니다. 제공기관에 표시된 수치가 없을 때에는 레지스트리에 `unknown`으로 저장하고, 애플리케이션에는 보수적인 내부 속도 제한·캐시·호출 예산을 둔다.

## 3. 최종 권장 API 레지스트리

### 등급

- **P0**: MVP에서 연동할 최종 핵심 API. 키 발급·스모크 테스트를 개발 초기에 진행한다.
- **P1**: 구조에는 반영하되 P0 안정화 뒤 연동할 확장 API.
- **조건부**: 후보로 보관하지만 현재 상태·약관·운영 안정성이 확인되기 전에는 핵심 기능에 의존하지 않는다.

### 3.1 P0 국내 API

| API | 지리교육 활용 | 별도 키 | 공식 공개 호출 제한 | 이용 조건·주의 | 저장·호출 방식 |
|---|---|---|---|---|---|
| [KOSIS 공유서비스](https://kosis.kr/openapi/introduce/introduce_01List.do) | 인구·가구·산업·지역경제·사회지표의 시계열·지역 비교 | 필요 | 일반 서비스 분당 200회 이내, 1회 40,000셀. 대용량은 SDMX 40,000셀 또는 XLS 200,000셀 | 출처 표시와 이용지침 준수. 키 양도·무단 공유, 과도한 트래픽, 원자료를 특정 서비스 없이 유료 제공하는 행위 등 제한 | **DB 우선**. 통계표 ID·분류·항목·단위·기준시점을 함께 스냅샷하고, 학생 요청은 Supabase 조회 |
| [SGIS Data API](https://sgis.mods.go.kr/developer/html/openApi/api/data.html) | 인구주택총조사, 사업체, 소지역·행정경계·통계지리 | 필요. consumer key/secret과 access token | 고정된 일·시간 수치가 공개 문서에 명시되지 않음. 발급 키로 트래픽 관리 | 회원가입·키 발급 필요. 테스트키는 즉시 발급, 상용키는 신청·승인. 자료별 통계 기준연도와 경계 수준을 보존 | **DB 우선**. SGIS는 통계·경계 데이터 제공자로 사용하고 지도 렌더링은 VWorld 2D/3D로 분리 |
| [VWorld 2D 지도 API](https://www.vworld.kr/dev/v4dv_opn2dmap2guide_s001.do) | 국가 공간정보 기반 배경지도, 2D 레이어·검색·GeoJSON·주제도 | 필요. API key와 등록 domain | 지오코더 API 1.0/2.0은 일 40,000건. 그 외 API는 별도 일일 제한량이 없다고 안내되지만 과다·부하·악용 호출 시 차단 가능 | 개발키는 연구·개인 목적, 운영키는 실제 운영 서비스에 사용. 브라우저 사용 시 등록 domain을 요청에 포함. CORS는 서버 처리 또는 공식 방법 확인 | 배경지도는 허용된 방식으로 렌더링. 분석 레이어·정적 경계·파생 결과는 DB/Storage에 저장. 타일을 임의로 미러링하지 않음 |
| [VWorld WebGL 3D 지도 API](https://www.vworld.kr/dev/v4dv_opnws3dmap3guide_s001.do) | 지형·고도·경사·입체 행정구역·3D 도시·가시성 등 입체적 공간 추론 | 필요. VWorld 발급키와 domain 정책 확인 | 지오코더 제한은 위와 같음. 3D 전용 고정 일·시간 제한은 현재 공개 안내에서 확인하지 못함. 과다 호출·악용 시 차단 가능 | VWorld 포털의 웹지엘 3D지도 API 3.0 예제와 사용약관을 기준으로 별도 검증. 상세 가이드 페이지는 2026-09-16 검토 시 일시적으로 502가 반환되어 실제 초기화·도메인·라이선스 스모크 테스트가 필요 | `/create/3d`, `/inquiry/3d`에서 지연 로드. 지형·객체는 LOD와 범위 제한을 적용하고, 동일 자료의 2D 대체 표현을 제공 |
| [도로명주소 주소 검색 API](https://business.juso.go.kr/) | 주소 입력, 위치 찾기, 한국 지명·주소와 좌표 연결 | 필요. 승인키 | 좌표 제공 API는 5초당 최대 10회. 도로명주소 검색은 고정 제한을 공개하지 않지만 과도하거나 공격성인 호출은 차단될 수 있음 | React에서 CORS가 발생하면 서버 호출 권장. 좌표 제공 결과는 UTM-K/GRS80일 수 있으므로 WGS84 변환을 명시한다. 주소 DB를 대량으로 반복 조회하지 말고 제공되는 주소 DB·공간정보·로컬 캐시를 검토 | **사용자 검색만 실시간**. 동일 검색어 TTL 캐시. 대량·반복 주소는 내려받은 DB 또는 별도 적재 작업 사용 |
| [기상청 API허브](https://apihub.kma.go.kr/apiInfo.do) | ASOS/AWS 관측, 기후통계, 월·연 요약, 지점별 기온·강수·바람 | 필요. 회원가입·authKey. 연락처 인증 필요 | 일반회원 일 20,000건·5GB, 기관회원 일 30,000건·50GB. 시스템 상황에 따라 변경 가능. 일부 기간 조회는 최대 31일 | 학술·연구기관은 기관회원 신청 가능. 키 양도·대여 금지. 공공누리 유형별 조건과 최신 출처표시 공지 확인 | **최근 10년 기후의 1순위 공식 관측 원천**. 일자료·월자료를 월 단위로 백필하고 `관측지점`, 결측일수, 산출식, 기준기간을 DB화 |
| [기상청 단기예보 조회서비스](https://www.data.go.kr/data/15084084/openapi.do) | 현재·초단기·단기예보, 날씨와 생활·재난 맥락 결합 | 필요. 공공데이터포털 ServiceKey | 개발계정 신청 가능 트래픽 10,000/일. 일일·초당 초과 오류가 있으며 운영계정은 활용사례 등록으로 증설 가능 | 무료, 공공저작물 출처표시 제1유형. 공간은 5km 격자·읍면동 중심, 예보는 현재성 데이터이므로 기후 평균 자료와 혼합하지 않음 | 서버 프록시 + 짧은 TTL. 학습 화면의 반복 호출을 막고 마지막 정상 결과를 fallback으로 사용 |
| [에어코리아 대기오염정보](https://www.data.go.kr/data/15073861/openapi.do) | PM10·PM2.5·오존, 지역별 대기질 비교·환경 문제 탐구 | 필요. 공공데이터포털 ServiceKey | 개발계정 신청 가능 트래픽 500. 포털 페이지가 일·시간 단위를 명시하지 않으므로 `500/일`로 하드코딩하지 않고 신청 후 확인. 운영계정은 활용사례 등록으로 증설 가능 | 무료, 공공저작물 출처표시·변경금지 제3유형. 원자료 변형·재가공 표시를 명확히 하고 최신 기술문서 확인 | 현재값은 서버 캐시. 일·월 학습자료는 수집 시각을 포함한 스냅샷과 파생 집계값을 분리 저장 |
| [한국관광공사 TourAPI](https://www.data.go.kr/data/15101578/openapi.do) | 관광지·축제·숙박·지역문화·관광 이동과 장소성 | 필요. 공공데이터포털 ServiceKey | 개발계정 신청 가능 트래픽 1,000. 단위는 활용신청 화면에서 확인하고 운영 증설을 별도 신청 | API 데이터는 이용허락범위 제한 없음으로 표시되지만 이미지에는 공공누리 유형과 피사체·인격권·CI/BI 관련 제한이 별도 적용 | POI 메타데이터·좌표는 DB화. 사진은 URL·저작권·라이선스·출처를 함께 보관하고 허용 범위 밖의 이미지 미러링 금지 |

### 3.2 P0 글로벌 API

| API | 지리교육 활용 | 별도 키 | 공식 공개 호출 제한 | 이용 조건·주의 | 저장·호출 방식 |
|---|---|---|---|---|---|
| [Open-Meteo](https://open-meteo.com/en/pricing) / [Terms](https://open-meteo.com/en/terms) | 세계 주요 도시 기후·날씨 비교, 과거·기후 자료, 고도·대기질 연계 | 무료 공개 API는 불필요. 상용·전용 용량은 API key와 유료 플랜 필요 | 무료 계층 분당 600회, 시간당 5,000회, 일 10,000회, 월 300,000회 | 무료 API는 비상업적 사용만. 교육 콘텐츠와 공공 연구는 비상업 예시에 포함. CC BY 4.0 출처·변경 표시. Historical/Climate API는 가격표상 Professional 이상 필요 | **역사·기후는 DB화**. 관측소 공식값과 모델·재분석값을 구분해 표기. 예보는 짧은 캐시. 광고·유료 서비스로 전환하면 라이선스 플랜 재검토 |
| [World Bank Indicators API](https://datahelpdesk.worldbank.org/knowledgebase/articles/898581) | 국가·지역별 인구·도시·교육·경제·환경·개발지표의 장기 비교 | 불필요. V2 API는 API key가 필요하지 않음 | 요청 속도의 고정 일·시간 수치는 공식 문서에서 확인하지 못함. SDMX 데이터 호출은 1회 15,000 data points 제한 | 기본 데이터셋은 CC BY 4.0이지만 일부 제3자 데이터는 별도 조건. `The World Bank: Dataset name: Data source` 형식의 출처와 비후원·비제휴 원칙 준수 | **DB 우선**. 공식 권고대로 캐시·기간 쿼리 사용. 지표 코드·메타데이터·최종 갱신일을 함께 저장 |
| [USGS Earthquake Catalog](https://earthquake.usgs.gov/fdsnws/event/1/) / [Real-time feeds](https://earthquake.usgs.gov/earthquakes/feed/) | 지진 분포·규모·깊이·시간 변화·재난 위험 탐구 | 불필요 | 고정 수치 대신 동적 rate limiting. 초과 시 HTTP 429. 피드와 응답은 60초 캐시되며 그보다 자주 호출해도 새 자료가 빨리 나오지 않음 | 자동화 애플리케이션은 성능·가용성이 좋은 실시간 GeoJSON 피드 우선 사용. 이벤트·제품별 메타데이터와 출처를 보존하고 정확성·지연 가능성을 설명 | 과거 기간은 백필 후 DB화. 실시간 피드는 서버에서 최소 60초 캐시하고 최근 이벤트만 갱신 |
| [Open Topo Data](https://www.opentopodata.org/) / [API docs](https://www.opentopodata.org/api/) | 고도·지형 단면·등고선·지형과 사회현상 결합, 3D 보조 데이터 | 불필요 | 요청당 최대 100 locations, 초당 1회, 일 1,000회 | 공개 API의 제한을 준수. dataset별 해상도·범위·원자료 출처 확인. WGS84 입력, NODATA/null을 학습 화면에서 표시 | 동일 지점·경로는 DB 또는 Storage에 저장. 3D 장면을 열 때마다 고도를 재조회하지 않고 사전 샘플링 |

### 3.3 P1 확장 API

| API | 사용 목적 | 키·제한 | 적용 조건 |
|---|---|---|---|
| [GBIF Occurrence API](https://techdocs.gbif.org/en/openapi/) | 생물지리·종 분포·서식지와 환경 요인의 공간 비교 | 검색 API는 일반적으로 키 없이 사용. 페이지 최대 300건, offset+limit 100,000 제한. 부하에 따라 429가 발생하며 고정 속도는 보장되지 않음. 대량 다운로드는 등록 계정·인증 필요 | 레코드별 CC0·CC BY·CC BY-NC를 확인하고 publisher identifier와 DOI를 보존. 검색 결과가 크면 API 반복 호출 대신 다운로드 API 사용 |
| [Nominatim](https://nominatim.org/release-docs/latest/api/overview/) | 세계 지명·장소 검색의 보조 기능 | 키 불필요. 공개 서버 최대 초당 1회 | 유효한 User-Agent/Referer, 눈에 보이는 OSM attribution 필요. 자동완성·체계적 대량 조회 금지. ODbL 조건과 개인정보·정책 변경 가능성 반영 | 주소 검색의 핵심은 Juso, 세계 검색의 단건 보조는 Nominatim. 서버 프록시와 캐시 사용 |
| [전기자동차 충전소 정보](https://www.data.go.kr/data/15076352/openapi.do) | 도시 지속가능성·접근성·시설 분포·입지 의사결정 | ServiceKey 필요. 개발계정 신청 가능 트래픽 1,000, 운영 증설 가능. 포털 표기의 단위는 신청 후 확인 | 현재 상태는 실시간이므로 역사 분석에는 시각별 스냅샷을 별도로 수집. 공공저작물 출처표시 제1유형 |

### 3.4 조건부·핵심에서 제외하는 후보

| 후보 | 제외·보류 이유 | 대체 또는 향후 조건 |
|---|---|---|
| SGIS 지도 API 렌더러 | 현재 개발지원센터 페이지에 `2025-12-31 서비스 종료 예정` 문구가 남아 있음. 2026년 현재 실제 운영 상태를 재확인하기 전 핵심 렌더러로 의존하면 위험 | SGIS Data API로 통계·경계를 수집하고 VWorld 2D/3D 또는 독립 렌더러 사용 |
| REST Countries | 저장소 목록은 무인증으로 기록하지만 현재 공식 홈페이지는 `/countries/v5`와 key 중심 정책을 안내하여 버전·인증 정보가 불일치 | ISO 국가명·코드는 버전 고정 정적 자산으로 관리하고, 실제 endpoint·상업 조건을 스모크 테스트한 뒤 보조 API로 결정 |
| OpenStreetMap public tiles | 무료·무보장(best-effort) 공용 타일 서버에 대량 요청·사전 내려받기·오프라인 이용을 의존할 수 없음. attribution·User-Agent·캐시 정책 필요 | 한국은 VWorld, 글로벌 배경은 사용 조건이 명확한 별도 provider를 추상화하여 교체 가능하게 설계 |
| Kakao/Naver 지도, ODsay 등 | 국내 경로·상용 지도·대중교통에 유용하지만 각각의 키·도메인·상업·재배포 조건이 추가됨 | 교통·접근성 학습이 확정될 때 별도 P2로 계약·한도·표시 조건 검토 |
| NASA·OpenAQ·뉴스·Wikipedia/Wikidata | 주제 확장에는 유용하지만 API key·자료 라이선스·품질·변경 주기를 별도 검증해야 함 | 특정 탐구 활동의 학습 목표와 데이터 계약이 확정된 후 P2로 추가 |

## 4. 최근 10년 기후·KOSIS 데이터의 DB화 설계

### 4.1 기후 데이터의 권장 정의

“주요 도시 최근 10년 평균 기후”는 API 하나의 즉시 응답으로 만들지 않는다. 다음을 먼저 고정한다.

1. **자료 원천**: 한국은 기상청 API허브 ASOS 일자료를 우선 사용하고, 국제 비교는 Open-Meteo Historical/Climate 자료를 보조로 사용한다.
2. **공간 단위**: 도시 행정구역 평균인지, 대표 관측지점 값인지, 도시 중심 좌표의 격자값인지 구분한다.
3. **시간 창**: 예를 들어 최근 10개 완결 연도와 현재 진행 연도를 섞지 않는다. 진행 연도는 별도 상태로 표시한다.
4. **변수·단위**: 평균기온, 최고·최저기온, 강수량, 강수일수, 일조시간 등을 단위와 산출식과 함께 저장한다.
5. **결측·관측점 변경**: 유효 관측일수, 결측률, 지점 이전·폐쇄 여부를 저장하고 도시 간 단순 순위를 과도하게 해석하지 않는다.
6. **자료 유형 표시**: 관측값, 재분석값, 모델값, 예보값은 서로 다른 배지와 설명으로 표시한다.

### 4.2 수집 주기

| 데이터셋 | 최초 백필 | 이후 갱신 | 학생 화면 |
|---|---|---|---|
| KMA ASOS 일자료·기후통계 | 선택한 관측지점·기간을 월 단위로 분할 수집 | 월 1회 또는 새 월자료 공개 후 | `climate_city_summary` 조회 |
| KOSIS 통계표 | 선택한 통계표와 항목 전체를 초기 수집 | 주기·변경 공지에 따라 월 1회 또는 분기 1회 | 정규화 지표·메타데이터 조회 |
| SGIS 통계·경계 | 기준연도별 초기 수집 | 새 총조사·경계 버전 공개 시 | 버전 고정 경계와 통계 조인 |
| Open-Meteo Historical | 도시 좌표·기간·변수 묶음으로 초기 수집 | 자료 업데이트 정책 확인 후 월 1회 | 모델·재분석 자료로 표시된 요약값 |
| World Bank WDI | 선택 지표·국가·연도 범위 초기 수집 | 월 1회 또는 metadata 변경 감지 | 국가·지역 시계열 조회 |
| USGS 지진 이력 | 교육에 필요한 기간·규모 조건으로 초기 백필 | 최근 피드 1~5분, 이력 정합성 백필은 일 1회 | DB의 지진 feature 조회 |

### 4.3 Supabase 논리 스키마

원자료를 덮어쓰지 않고 `raw → normalized → derived → material`의 층을 분리한다.

| 테이블 | 핵심 필드 | 역할 |
|---|---|---|
| `sources` | `id`, `provider`, `name`, `docs_url`, `license_url`, `attribution_text`, `last_verified_at` | API·데이터셋·약관의 출처 카탈로그 |
| `source_endpoints` | `source_id`, `endpoint`, `auth_kind`, `secret_required`, `quota_json`, `storage_policy` | endpoint별 인증·호출량·저장 정책 |
| `source_snapshots` | `id`, `source_id`, `requested_at`, `period_start`, `period_end`, `params_json`, `checksum`, `raw_uri`, `status` | 불변 원자료 스냅샷과 재현성 |
| `geo_units` | `id`, `level`, `code`, `name`, `geometry`, `valid_from`, `valid_to`, `geometry_version` | 국가·시도·시군구·관측지점·도시 경계 |
| `observations` | `snapshot_id`, `geo_unit_id`, `period_start`, `period_end`, `metric`, `value`, `unit`, `denominator`, `quality_flag` | 시계열 관측·통계 정규화 |
| `geo_features` | `snapshot_id`, `feature_type`, `geometry`, `properties_json` | 지진·관광지·충전소·생물종 등 점·선·면 자료 |
| `derived_metrics` | `input_snapshot_ids`, `formula`, `value`, `unit`, `missing_rule`, `created_at` | 평균·증감률·비율·표준화·분류 결과 |
| `climate_stations` | `station_id`, `name_ko`, `longitude`, `latitude`, `altitude_m`, `law_code` | KMA ASOS 관측소 카탈로그. 개인정보 없이 공개 읽기 |
| `climate_daily_observations` | `station_id`, `snapshot_id`, `observation_date`, `ta_avg`, `ta_max`, `ta_min`, `rn_day`, `ws_avg`, `hm_avg`, `ss_day`, `si_day`, `quality_flags` | KMA 일자료 정규화 행. 원자료 값은 `raw_values`, 원천 재현정보는 snapshot에 보존 |
| `materials` | `id`, `session_type`, `mode`, `title`, `recipe_json`, `status` | 제작된 지도·차트·표·3D 장면 |
| `activities` | `material_id`, `inquiry_type`, `stages_json`, `prompt_json`, `rubric_json` | 탐구 활동과 평가 기준 |
| `attempts` | `activity_id`, `anonymous_learner_id`, `responses_json`, `evidence_json`, `started_at` | 선택적 학습 과정 기록. 개인정보 최소화 |
| `data_lineage` | `material_id`, `snapshot_id`, `transform_log`, `source_url` | 자료에서 주장까지의 계보 |

모든 표시 자료에는 최소한 다음을 연결한다.

```text
source → endpoint → snapshot → transform/formula → material → inquiry prompt
```

## 5. 2D·3D 지도 기능 분리

### 5.1 정보구조와 라우팅

```text
/create
├── /create/2d       2D 자료 제작
├── /create/3d       3D 자료 제작
└── /create/chart    차트·표·복합 자료

/inquiry
├── /inquiry/2d/:activityId
├── /inquiry/3d/:activityId
└── /inquiry/chart/:activityId
```

### 5.2 공통 데이터 계약과 분리 렌더링 계약

공통 자료 메타데이터는 공유하되, 지도 설정과 상호작용은 분리한다.

```ts
type MapMaterial = {
  id: string;
  sourceSnapshotIds: string[];
  geometryVersion: string;
  learningGoal: string;
  provenance: Provenance;
};

type Map2DConfig = {
  basemap: "vworld" | "fallback";
  layers: Array<"polygon" | "point" | "line" | "flow" | "raster">;
  classification?: "quantile" | "equal-interval" | "natural-breaks" | "categorical";
  legend: boolean;
  timeSlider?: { start: string; end: string; step: string };
  annotations?: boolean;
};

type Map3DConfig = {
  terrainSource: string;
  elevationExaggeration: number;
  camera: { longitude: number; latitude: number; height: number };
  extrusions?: Array<{ layerId: string; heightField: string }>;
  verticalProfile?: boolean;
  lighting?: boolean;
};
```

### 5.3 2D 지도에서 우선 제공할 학습 패턴

- 지역별 분포: 단계구분도, 등치선, 점 분포
- 규모와 비율의 구분: 총량 지도와 비율 지도 비교
- 시계열 변화: 연도 슬라이더, 전후 비교, 소배수 지도
- 이동·연결: 흐름선, 기점·종점, 접근성
- 자료 비판: 경계 단위·분모·분류 방법이 해석에 미치는 영향

단순한 범주형 지도는 우선 2D로 제공한다. 3D 효과를 추가해도 새로운 지리적 추론이 생기지 않는다면 3D 자료로 만들지 않는다.

### 5.4 3D 지도에서 우선 제공할 학습 패턴

- 고도·지형: 지형 단면, 능선·분지, 고도와 정주 분포
- 경사·위험: 경사와 토지 이용, 침수·조망·재해 맥락
- 입체 도시: 건물 높이·밀도·수직적 도시 구조
- 입체 행정구역: 인구·시설량을 높이로 표현할 때 규모·단위·왜곡 설명
- 시점 탐구: 카메라 위치 변경이 보이는 것과 보이지 않는 것에 미치는 영향

3D에는 다음 안전장치를 둔다.

- 장면 시작 시 데이터 범위·고도·과장 배율·출처를 표시한다.
- 국가 전체의 복잡한 geometry를 한 번에 로드하지 않고 범위·LOD·단순화·지연 로딩을 적용한다.
- WebGL 미지원, 모바일 성능 저하, `prefers-reduced-motion` 환경에서는 같은 자료의 2D·표 대체를 제공한다.
- 회전·확대만으로 끝나지 않도록 단면 보기, 고도 읽기, 레이어 비교, 증거 선택 과제를 둔다.
- VWorld 3D 예제 코드는 학습하되 그대로 복사하지 않고 `VWorld3DAdapter` 안에 격리한다.

## 6. 사용자 흐름

### 6.1 자료 제작 스튜디오

1. 학습 목표·핵심 개념 선택
2. 지역·시간 범위와 자료 유형 선택
3. DB에 저장된 자료셋·스냅샷 선택
4. 변수·단위·분모·경계 수준 확인
5. 분류·집계·비교·변환 규칙 설정
6. 2D, 3D, 차트·표 중 표현 방식 선택
7. 범례·축·주석·시간 슬라이더 구성
8. 자료 해석 질문과 제한점 입력
9. 출처·라이선스·변환 과정 자동 첨부
10. 미리보기·검증·저장·내보내기

자료 제작 유형:

- 2D 주제도
- 2D 점·선·면 분포도
- 변화·비교 지도
- 흐름·접근성 지도
- 시계열 차트·표
- 3D 지형·고도 자료
- 3D 입체 통계·도시 자료
- 지도 + 차트 + 설명이 결합된 복합 자료

### 6.2 자료 활용 탐구

기본 단계는 활동별로 수정할 수 있게 하되, 다음 흐름을 기본 템플릿으로 둔다.

`관계맺기 → 질문 초점화 → 조사하기 → 조직화 → 일반화하기 → 전이하기`

탐구 유형:

- 분포·패턴: 어디에 집중·분산되어 있는가?
- 비교: 두 지역·두 시기·두 지표는 어떻게 다른가?
- 변화: 무엇이 얼마나, 어느 방향으로 변했는가?
- 관계: 두 현상이 함께 나타나는가? 상관과 인과를 구분했는가?
- 규모·경계: 공간 단위나 분류 방법을 바꾸면 해석이 달라지는가?
- 위험·환경: 어떤 지역이 취약하며 근거는 무엇인가?
- 접근성·입지: 누구에게 어떤 시설·서비스가 가까운가?
- 자료 비판: 출처·시점·단위·결측·표현 방식의 한계는 무엇인가?

학생 활동은 `관찰 → 조작 → 증거 선택 → 주장 → 근거 연결 → 제한점 → 전이`를 기록한다. AI 기능을 추가하더라도 정답 데이터나 출처를 AI가 대신 결정하지 않고 질문·힌트·반례 제시에 한정한다.

## 7. 기술 아키텍처

### 7.1 애플리케이션

- React + TypeScript + Vite
- React Router: 제작·탐구·2D·3D route 분리
- TanStack Query: Supabase 조회·캐시·상태
- Zod: 외부 API 응답과 자료 레시피 검증
- Supabase JS: 제한된 읽기와 인증. service-role key는 서버·Actions에서만 사용
- VWorld 2D/3D adapter: 지도 공급자 의존성 격리
- Turf.js: 공간 집계·거리·포함 관계 등 클라이언트 보조 연산
- 차트 라이브러리: 시계열·비교·분포용. 지도와 동일한 `sourceSnapshotId`를 표시

### 7.2 서버와 수집 작업

```text
React browser
   ↓
Vercel API routes / server functions
   ├─ allowlisted provider adapters
   ├─ rate limiter + cache
   └─ Supabase read/write

GitHub Actions schedule/manual dispatch
   ├─ historical backfill
   ├─ daily/monthly incremental ingest
   ├─ schema/quality checks
   └─ health report
```

- Vercel serverless 함수는 짧은 조회·프록시·캐시에 사용한다.
- 대량 백필·월별 기후 수집·KOSIS 대용량 수집은 GitHub Actions 또는 별도 작업 환경에서 실행한다.
- API key와 Supabase service-role key는 Vercel/GitHub Secrets에만 둔다.
- VWorld 브라우저 지도 key처럼 provider가 domain 제한을 전제로 공개 로더에 넣도록 설계한 값은 secret으로 오인하지 않되, 반드시 등록 domain과 사용 범위를 제한한다.
- 임의 URL을 받아 호출하는 범용 proxy는 만들지 않는다. provider allowlist와 요청 파라미터 검증을 둔다.
- 원천 API 장애 시 마지막 정상 스냅샷, fixture, 안내 문구 순으로 fallback한다.

### 7.3 VWorld domain 전환 규칙

VWorld 2D·3D 브라우저 로더는 API key와 함께 현재 페이지의 `domain`을 확인한다. 개발 중에는 포트가 바뀌어도 hostname을 매번 수동으로 고치지 않도록 브라우저의 `window.location.hostname`을 우선 사용한다.

```text
http://localhost:5175       → domain=localhost
http://127.0.0.1:5175       → domain=127.0.0.1
https://<vercel-hostname>   → VWorld에 등록한 운영 hostname과 일치
```

- `localhost`와 `127.0.0.1`은 서로 다른 hostname이므로 VWorld 관리 화면에서 실제 사용할 값을 등록한다.
- 포트가 달라져도 코드에는 hostname만 전달한다. VWorld 관리 화면이 포트 포함을 요구하면 그 입력 규칙을 우선한다.
- Vercel 배포 후에는 고정된 운영 hostname을 VWorld 허용목록에 등록하고 Vercel 환경변수 `VITE_VWORLD_DOMAIN`에 같은 값을 넣는다.
- 동적으로 바뀌는 Vercel Preview URL을 운영 domain으로 간주하지 않는다. Preview를 검사할 때는 해당 hostname이 등록되어 있는지 먼저 확인한다.
- 공식 2D 가이드의 브라우저 사용 예시는 `apiKey`와 `domain`을 함께 요청하도록 되어 있다: [VWorld 2D 지도 API](https://www.vworld.kr/dev/v4dv_opn2dmap2guide_s001.do)

### 7.4 환경변수 예시

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
KOSIS_API_KEY=
SGIS_CONSUMER_KEY=
SGIS_CONSUMER_SECRET=
VITE_VWORLD_API_KEY=
VITE_VWORLD_DOMAIN=
JUSO_CONFIRM_KEY=
KMA_AUTH_KEY=
DATA_GO_KR_SERVICE_KEY=
```

실제 키는 `.env.example`에 넣지 않는다. 개발·운영·Actions용 키를 분리하고 만료일·발급 계정·등록 domain을 `docs/API_KEY_MANIFEST.md` 또는 비밀관리 시스템에서 관리한다. VWorld는 등록 domain을 전제로 브라우저 로더에 들어갈 수 있으므로 `VITE_` 변수로 분리하고, 나머지 인증키는 서버·Actions 전용으로 둔다.

공공데이터포털은 승인된 API별 활용신청이 필요하지만 일반적으로 동일 계정의 `DATA_GO_KR_SERVICE_KEY`를 승인된 서비스에 공통으로 사용한다. 현재 단기예보·에어코리아·TourAPI·전기차 충전소는 이 공통 키와 각 서비스의 승인 상태를 함께 확인한다.

Supabase는 현재 MVP의 기본 저장소로 유지한다. PostgreSQL·PostGIS·RLS·Storage·선택적 Auth가 필요한 이유와 Neon·Firebase·Cloudflare D1+R2 비교는 [백엔드·저장소 선택 결정서](BACKEND_STORAGE_DECISION.md)에 기록한다.

## 8. API 레지스트리의 구현 형태

향후 코드에서는 API별 어댑터가 다음 정보를 공통 형식으로 제공하도록 한다.

```ts
type ApiRegistryEntry = {
  provider: string;
  endpoint: string;
  auth: "none" | "api-key" | "oauth" | "domain-key";
  secretRequired: boolean;
  officialLimits: {
    perMinute?: number;
    perHour?: number;
    perDay?: number;
    perRequest?: string;
    status: "published" | "unknown" | "dynamic";
    verifiedAt: string;
  };
  storagePolicy: "materialized" | "cache" | "live-proxy" | "source-link-only";
  ttlSeconds?: number;
  licenseUrl: string;
  attribution: string;
  schemaVersion: string;
};
```

필수 운영 기능:

- `last_verified_at`: 공식 문서와 실제 endpoint를 마지막으로 확인한 날
- `quota_confidence`: `published`, `provider-dashboard`, `observed`, `unknown`
- `raw_storage_allowed`: 원자료를 Storage에 보관할 수 있는지
- `redistribution_allowed`: 학생·교사가 만든 자료를 공유할 수 있는지
- `transform_required`: 변경금지·출처표시·원자료/파생자료 구분 여부
- `fallback_snapshot_id`: 실시간 API 장애 시 사용할 자료

## 9. GitHub Actions와 배포

### Pull Request 검사

- ESLint
- TypeScript typecheck
- Zod contract tests
- adapter fixture tests
- 2D/3D route smoke test
- build
- secret 문자열·실제 API key가 커밋에 포함되지 않았는지 검사

### 예약 작업

```yaml
jobs:
  ingest-kma-climate:
    schedule: monthly
  ingest-kosis:
    schedule: monthly-or-on-change
  ingest-worldbank:
    schedule: monthly
  ingest-usgs:
    schedule: every-5-minutes-or-conservative
  verify-provider-health:
    schedule: daily
```

GitHub Actions의 예약 실행은 지연될 수 있으므로 지진·대기질을 안전 알림 시스템처럼 표현하지 않는다. Vercel은 GitHub 연동 자동 배포 또는 명시적 workflow 중 하나를 선택해 중복 배포를 피한다.

## 10. 다중 Codex 에이전트 운영 계획

에이전트를 병렬로 돌리기 전에 **데이터 계약·route 이름·DB 스키마를 먼저 고정**한다. 그 전에는 같은 파일을 여러 에이전트가 수정하지 않는다.

| 작업 레인 | 담당 범위 | 소유 디렉터리 예시 | 완료 조건 |
|---|---|---|---|
| A. 데이터 플랫폼 | API 레지스트리, adapter, ingest, Supabase migration | `src/data`, `src/server/providers`, `supabase` | fixture 검증, raw/normalized/derived 분리, 키가 브라우저에 노출되지 않음 |
| B. 2D 제작 | VWorld 2D adapter, 레이어·범례·시간 슬라이더, 제작 UI | `src/features/map2d`, `src/features/material-builder` | P0 DB 자료로 2D 주제도·점자료·변화자료 제작 가능 |
| C. 3D 제작 | VWorld WebGL 3D, terrain·extrusion·camera·fallback | `src/features/map3d` | 3D 스모크 테스트, 2D fallback, LOD·모바일 대응 |
| D. 탐구 실행 | 질문·증거·주장·루브릭·학습 기록 | `src/features/inquiry` | 2D/3D 자료에서 동일한 탐구 계약 실행 가능 |
| E. 품질·배포 | E2E, 접근성, source panel, Actions, Vercel | `tests`, `.github/workflows`, `docs` | API 장애·키 누락·자료 출처·빌드·배포 검증 |

권장 병합 순서:

`A 데이터 계약·마이그레이션 → A adapter/fixture → B 2D → D 탐구 → C 3D → E 배포·QA`

각 에이전트 작업에는 다음을 포함한다.

- 변경할 파일 범위
- 의존하는 계약 버전
- fixture 또는 mock 데이터
- 실행할 검사 명령
- 완료 시 남길 source/terms 검증 기록
- 다른 레인과 충돌할 수 있는 결정 사항

에이전트가 직접 원천 API를 호출해 얻은 임시 JSON을 화면 코드에 하드코딩하지 않는다. 반드시 `source_snapshot` 또는 fixture로 등록한다.

## 11. 단계별 개발 로드맵

### Phase 0. 범위·약관·키 확인

- 대상 학년·교육과정·핵심 개념 3~5개 확정
- 첫 활동 2개를 선정: KOSIS 2D 통계지도 1개, KMA/고도 기반 3D 자료 1개
- KOSIS, SGIS Data, VWorld 2D/3D, Juso, KMA, AirKorea, TourAPI 활용신청·승인 완료
- API별 endpoint·응답·quota·license 스모크 테스트
- SGIS Map API 종료 문구와 VWorld 3D 실제 운영 상태 재확인

### Phase 1. 데이터 기반

- Supabase project·PostGIS·RLS·Storage bucket 구성
- 대안 비교 결과에 따라 Supabase를 기본 provider로 유지하고 repository 경계를 보존
- `sources`부터 `data_lineage`까지 migration 작성
- KOSIS·KMA 기후·World Bank·USGS fixture와 adapter 구현
- raw snapshot checksum, schema validation, failed ingest 재시도 구현

### Phase 2. 자료 제작과 2D

- 자료 레시피·변수·단위·분류·범례 계약 구현
- VWorld 2D route와 Supabase GeoJSON/통계 연동
- KOSIS 지역 통계 자료 제작
- 출처·단위·기준시점·분모·변환 기록 패널 구현

### Phase 3. 자료 활용 탐구

- 탐구 단계 템플릿과 질문 유형 구현
- 증거 선택, 주장-근거 연결, 제한점, 루브릭
- 자료 제작 결과를 탐구 활동으로 전환
- 학생 기록은 익명화·최소 수집하고 연구 목적 사용 시 별도 동의·보관 정책 검토

### Phase 4. 3D

- VWorld WebGL 3D 초기화·도메인·라이선스 확인
- 고도/지형, 입체 통계, 단면·레이어 비교 중 2개만 우선 구현
- 2D와 동일한 데이터셋을 3D로 표현할 때 생기는 왜곡·배율·시점 과제 추가
- WebGL 실패·모바일·접근성 fallback 검증

### Phase 5. 운영·검증

- 월별·일별 Actions ingestion과 실패 알림
- API quota dashboard 및 마지막 확인일 표시
- Vercel preview/production 환경 분리
- Playwright E2E, 접근성, 모바일 성능, 네트워크에서 학생 조작 시 원천 API가 반복 호출되지 않는지 검증

## 12. MVP 완료 기준

- KOSIS와 KMA 기후 자료를 API가 아닌 Supabase 스냅샷에서 읽어 2D 학습자료를 표시한다.
- 최근 10년 기후 요약에는 자료 원천, 관측지점·좌표, 기간, 변수·단위, 유효일수, 결측 처리, 산출식을 표시한다.
- VWorld 2D와 VWorld 3D가 서로 다른 route·컴포넌트·설정 계약으로 동작한다.
- 3D 자료에는 2D·표 fallback이 있다.
- Open-Meteo 또는 World Bank의 국제 비교 자료를 DB화하여 세계지리 탐구 1개를 제공한다.
- USGS 지진 자료를 이용한 시간·규모·깊이 탐구 1개를 제공한다.
- API가 일시 중단되어도 마지막 정상 스냅샷으로 학습을 계속할 수 있다.
- 모든 자료에서 출처·라이선스·기준시점·단위·변환 기록을 열람할 수 있다.
- 브라우저 네트워크와 저장소에 서버 전용 API key가 노출되지 않는다.
- 키보드 탐색, 색상 외 범례 정보, 표 대체, reduced-motion, 모바일 viewport를 확인한다.

## 13. 주요 위험과 대응

| 위험 | 대응 |
|---|---|
| API 제한·약관 변경 | `last_verified_at`, 공식 문서 URL, 내부 quota, fixture, fallback을 API별로 보관 |
| KOSIS 통계표 구조 변경 | 표 ID뿐 아니라 분류·항목 코드와 metadata snapshot을 저장하고 schema diff 실행 |
| 행정경계 변경 | `geometry_version`, 유효기간, 경계 코드와 자료 기준연도를 함께 표시 |
| 기후 자료의 공간·방법 차이 | 관측지점·격자·도시평균을 구분하고 하나의 평균으로 무리하게 통합하지 않음 |
| 3D가 장식으로 소비됨 | 지형·고도·경사·입체 분포 등 3D에서만 유의미한 질문을 활동에 포함 |
| CORS·서버리스 timeout | 외부 호출은 adapter/API route, 대량 수집은 Actions, 브라우저 직접 호출은 provider가 허용한 지도 로더에 한정 |
| 이미지·원자료 재배포 문제 | 원자료와 파생자료의 라이선스를 분리 기록하고 `redistribution_allowed`에 따라 공개 범위를 제어 |
| 다중 에이전트 충돌 | 계약·migration 선행, 레인별 디렉터리 소유, fixture 기반 PR, 순차 병합 |

## 14. 초기 의사결정 목록

개발 시작 전에 다음 항목만 결정하면 된다.

1. 대상 학년과 교육과정 단원
2. 첫 번째 KOSIS 통계표와 첫 번째 KMA 기후 자료의 변수
3. “최근 10년”의 정확한 기간과 대표 도시·관측지점 목록
4. Supabase 프로젝트·리전·인증 범위
5. VWorld 2D/3D 운영키의 등록 domain과 실제 사용 가능 API
6. SGIS Data API의 사용할 기준연도·경계 레벨과 지도 API의 현재 서비스 상태
7. 학생 결과물의 공개·공유 범위와 원자료 재배포 정책

## 15. 공식 문서 및 검증 기준

### 후보 목록

- [public-apis-4Kr README](https://github.com/yybmion/public-apis-4Kr)
- [public-apis README](https://github.com/public-apis/public-apis)

### 국내 공식 문서

- [KOSIS 서비스·호출 제한](https://kosis.kr/openapi/introduce/introduce_01List.do)
- [KOSIS 통계정보 활용약관](https://kosis.kr/openapi/introduce/introduce_02List.do)
- [SGIS 개발지원센터](https://sgis.mods.go.kr/developer/html/home.html)
- [SGIS Data API 인증·기능](https://sgis.mods.go.kr/developer/html/openApi/api/data.html)
- [SGIS 지도 API 준비 페이지](https://sgis.mods.go.kr/developer/html/newOpenApi/api/mapApi/ready.html)
- [VWorld OpenAPI 소개](https://www.vworld.kr/v4po_openapi_s001.do)
- [VWorld 2D 지도 API 2.0](https://www.vworld.kr/dev/v4dv_opn2dmap2guide_s001.do)
- [VWorld WebGL 3D 지도 API 3.0 가이드](https://www.vworld.kr/dev/v4dv_opnws3dmap3guide_s001.do)
- [VWorld OpenAPI FAQ: 호출량·개발키·운영키](https://www.vworld.kr/v4po_brdfaq_s001.do?bodIde=52)
- [도로명주소 개발자센터](https://business.juso.go.kr/)
- [도로명주소 Q&A: 좌표 제공·검색 API 호출량](https://business.juso.go.kr/addrlink/qna/qnaDetail.do?bulletinRefSn=126550&currentPage=49&keyword=&noticeMgtSn=126550&noticeType=QNA&noticeTypeTmp=QNA&page=&searchType=)
- [기상청 API허브 이용안내·호출량](https://apihub.kma.go.kr/apiInfo.do)
- [기상청 API허브 지상관측·기후통계 API](https://apihub.kma.go.kr/apiList.do)
- [기상청 단기예보 조회서비스](https://www.data.go.kr/data/15084084/openapi.do)
- [에어코리아 대기오염정보](https://www.data.go.kr/data/15073861/openapi.do)
- [한국관광공사 TourAPI](https://www.data.go.kr/data/15101578/openapi.do)
- [전기자동차 충전소 정보](https://www.data.go.kr/data/15076352/openapi.do)

### 글로벌 공식 문서

- [Open-Meteo pricing and limits](https://open-meteo.com/en/pricing)
- [Open-Meteo terms](https://open-meteo.com/en/terms)
- [World Bank API basic call structures](https://datahelpdesk.worldbank.org/knowledgebase/articles/898581)
- [World Bank SDMX request limit](https://datahelpdesk.worldbank.org/knowledgebase/articles/1886701-sdmx-api-queries)
- [World Bank dataset licensing](https://datacatalog.worldbank.org/public-licenses)
- [USGS Earthquake Catalog API](https://earthquake.usgs.gov/fdsnws/event/1/)
- [USGS real-time feeds](https://earthquake.usgs.gov/earthquakes/feed/)
- [Open Topo Data public API limits](https://www.opentopodata.org/)
- [Open Topo Data API reference](https://www.opentopodata.org/api/)
- [GBIF API reference and rate limiting](https://techdocs.gbif.org/en/openapi/)
- [GBIF data user agreement](https://www.gbif.org/terms/data-user)
- [Nominatim API overview](https://nominatim.org/release-docs/latest/api/Overview/)
- [Nominatim public usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)

이 문서에서 수치가 `공식 공개 제한 미확인`으로 표시된 API는 개발 전 실제 발급 계정의 dashboard·활용신청 화면·최신 약관을 다시 확인한다. 확인되지 않은 수치를 추정하여 코드에 넣지 않는다.
