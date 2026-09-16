# KOSIS adapter 계약

> 기준일: 2026-09-16

이번 단계에서는 KOSIS 키를 브라우저에 노출하지 않고, 통계표를 검색한 뒤 메타데이터와 제한된 통계값을 조회하는 서버 adapter를 추가했다. 실제 표를 임의로 선택하지 않았으므로 아직 특정 KOSIS 값은 사이트에 하드코딩하지 않는다.

## 왜 3단계인가

KOSIS 통계자료 API의 `statisticsParameterData.do`는 통계표 ID만으로 조회하지 않는다. `orgId`, `tblId`, `objL1`(첫 번째 분류), `itmId`(항목), `prdSe`(주기)가 필요하다. 따라서 다음 순서를 고정한다.

```text
통합검색
  ↓  orgId / tblId 후보
분류·항목 메타데이터(type=ITM)
  ↓  objL1~objL8 / itmId / 단위
통계자료 조회
  ↓
정규화 레코드 → Supabase snapshot·관측값 → 2D 주제 레이어
```

공식 가이드는 통합검색의 검색어·정렬·페이지 파라미터와 통계자료의 분류·항목·주기 파라미터를 각각 정의한다. 통계자료 응답에는 `ORG_ID`, `TBL_ID`, `TBL_NM`, `C1~C8`, `ITM_ID`, `UNIT_NM`, `PRD_SE`, `PRD_DE`, `DT`, `LST_CHN_DE`가 포함된다. [KOSIS 통합검색 개발가이드](https://kosis.kr/openapi/devGuide/devGuide_0701List.do), [KOSIS 통계자료 개발가이드](https://kosis.kr/openapi/devGuide/devGuide_0201List.do)

2026-09-16 실제 검색 응답에서는 HTTP 200이지만 속성명이 따옴표로 감싸지지 않은 JSON 유사 배열이 반환되었다. adapter는 표준 JSON을 먼저 시도한 뒤 객체 키만 안전하게 인용하여 다시 파싱한다. 원문을 실행하지 않으므로 `eval`이나 동적 코드 실행은 사용하지 않는다.

## 구현된 서버 경로

모든 경로는 `KOSIS_API_KEY`를 서버 환경변수에서만 읽는다. 클라이언트 요청에는 키가 들어가지 않는다.

### 1. 통계표 검색

```text
GET /api/kosis-search?searchNm=지역별%20인구&sort=RANK&resultCount=20
```

지원 값:

- `searchNm`: 1~80자의 검색어
- `orgId`: 선택적 기관 코드
- `sort`: `RANK` 또는 `DATE`
- `startCount`: 1~1000, 기본 1
- `resultCount`: 1~50, 기본 20

응답에는 통계표명·기관·`orgId`·`tblId`·수록기간·KOSIS 링크가 포함된다. 검색 결과 원자료는 서버 응답의 `raw`에 보존하지만 인증정보는 포함하지 않는다.

### 2. 분류·항목 메타데이터

```text
GET /api/kosis-meta?orgId=101&tblId=DT_...
```

선택적으로 `objId`, `itmId`를 추가할 수 있다. 응답은 분류 ID·분류명·자료코드·자료명·상위 자료코드·단위·순번을 반환한다. 이 결과로 지도에 쓸 지역 코드와 지표 항목을 선택한다.

### 3. 통계값

```text
GET /api/kosis-table?orgId=101&tblId=DT_...&objL1=11+26&objL2=ALL&itmId=ITM_...&prdSe=Y&startPrdDe=2016&endPrdDe=2025&smblChk=Y
```

KOSIS URL 생성기는 같은 분류·항목 목록을 `+`로 이어 붙이는 형식을 사용한다. 애플리케이션은 입력에서 쉼표 또는 공백을 허용하지만, 원천 요청을 만들 때는 공백 구분으로 정규화한다. `objL2`가 없는 요청은 `ALL`로 보완해 한 단계 분류만 있는 표도 원천 API의 URL 생성 규칙과 맞춘다. 두 번째 분류 이상을 특정하려면 메타데이터에서 확인한 코드를 `objL2`~`objL8`에 명시한다.

지원하는 KOSIS 주기 코드는 다음과 같다.

| `prdSe` | 의미 | 시점 예시 |
| --- | --- | --- |
| `D` | 일 | `20140101` |
| `M` | 월 | `201401` |
| `Q` | 분기 | `201401`~`201404` |
| `S` | 반기 | `201401`~`201402` |
| `Y` | 년 | `2014` |
| `F` | 2·3·4·5·10년 등 다년 | `2014`, `2024` |
| `IR` | 부정기 | `YYYY`, `YYYYMM`, `YYYYMMDD` |

애플리케이션 내부 제한:

- 기간 조회는 최신 자료 개수 `newEstPrdCnt`를 포함해 최대 120개 시점이다. 일자료만 최대 366일이다.
- 분류·항목 조합의 보수적 예상 셀 수가 40,000을 넘으면 원천 API를 호출하지 않고 `400`으로 거절한다.
- 시작·종료 시점이 없는 요청은 허용하지 않는다. 최신 자료가 필요하면 `newEstPrdCnt`를 명시한다.
- 통계부호를 보존하려면 `smblChk=Y`를 사용한다. 숫자만 확실한 `DT`만 `value`로 변환하고, `-`, `..`, 주석이 붙은 값은 `valueText`와 `valueSymbol`을 보존하면서 `value=null`로 둔다.

## DB 적재 시 계약

통계값을 학습자 브라우저에서 매번 KOSIS로 재호출하지 않는다.

1. 서버 수집기가 검색 결과와 메타데이터를 확인한다.
2. 요청 파라미터·수집 시각·원본 응답 checksum을 `source_snapshots`에 저장한다.
3. `C1~C8`는 지역으로 단정하지 않고 분류 배열로 저장한다. 실제 주제도에서 지역으로 쓸 분류 레벨을 레시피에 기록한다.
4. `DT` 원문, 숫자 변환값, 단위, 결측·통계부호를 함께 저장한다.
5. 2D 지도에는 지역코드·값·분류 방식·단위·기준연도·출처를 포함한 material recipe만 공개한다.

따라서 KOSIS는 로그인 기능이 아니라 반복 사용되는 통계 원자료와 파생지표를 재현 가능하게 보관하기 위한 데이터 원천이다. 공개 읽기 화면은 향후 Supabase의 게시된 스냅샷을 읽고, KOSIS 키는 수집 작업 또는 서버 함수에서만 사용한다.

## Snapshot 적재 계약

브라우저의 KOSIS 화면은 검색·metadata·제한 미리보기만 수행한다. 공개형 no-login 사이트에서
브라우저가 Supabase service key로 직접 쓰거나 공개 POST를 허용하면 누구나 원자료 적재를
반복할 수 있으므로, 원자료 적재는 [kosis-snapshot.mjs](../scripts/kosis-snapshot.mjs)의
로컬/관리 작업으로 분리한다.

수집기는 기본적으로 DRY-RUN이며 다음을 보장한다.

- `--write`를 명시해야 `data_sources`·`source_snapshots`·`geo_observations`에 적재한다.
- `--public`을 함께 지정한 승인 자료만 공개 브라우저가 읽을 수 있다.
- 한 snapshot은 최대 2,000행으로 제한하고, 작은 지역·짧은 기간부터 검증한다.
- 원자료 응답과 metadata, 요청 파라미터, checksum을 `source_snapshots.raw_payload`에 저장한다.
- 각 값은 KOSIS 분류·항목·시점 조합으로 deterministic `external_id`를 만들어 반복 적재를
  upsert한다. 이를 위해 `0005_kosis_observation_access.sql`의 unique index가 필요하다.
- KOSIS 자체 응답에는 geometry가 없으므로 `geo_observations.region_code`를 보존하고,
  다음 2D 단계에서 SGIS/VWorld 행정구역 geometry와 별도로 조인한다.
- `0005_kosis_observation_access.sql`은 Supabase SQL Editor에서 한 번 실행해야 한다. 이 migration은
  snapshot 내부 관측값의 중복 방지 unique index와 `is_public=true` 관측값의 공개 SELECT 정책을 추가한다.

예시(현재 운영에서 확인한 소규모 후보; 교육용 표 확정 전에는 DRY-RUN만 실행):

```bash
node scripts/kosis-snapshot.mjs \
  --org-id=101 --tbl-id=DT_1YL12001E \
  --obj-l1=21010,21020 --obj-l2=ALL --itm-id=T001 \
  --prd-se=M --start-prd-de=202401 --end-prd-de=202404
```

교수자가 표·범위·출처를 확인한 뒤에만 다음처럼 적재한다.

```bash
node scripts/kosis-snapshot.mjs \
  --org-id=101 --tbl-id=DT_1YL12001E \
  --obj-l1=21010,21020 --obj-l2=ALL --itm-id=T001 \
  --prd-se=M --start-prd-de=202401 --end-prd-de=202404 \
  --write --public
```

## 다음에 필요한 사용자 입력

KOSIS 검색 결과에서 첫 번째 교육용 표를 하나 고른 뒤 다음 값을 전달하면 된다.

- `orgId`
- `tblId`
- 지도에 사용할 분류 코드(`objL1` 등)
- 지도에 사용할 항목 코드(`itmId`)
- 주기와 시작·종료 시점
- 총량인지 비율인지, 비율이면 분모의 의미

표 ID가 확정되면 metadata와 작은 값 범위를 DRY-RUN으로 확인하고, `0005` migration 적용 후
controlled snapshot을 Supabase에 적재한다. 그 snapshot의 `region_code`를 SGIS/VWorld 경계와
조인해 2D 단계구분도·범례·출처 패널로 연결한다.

반복 수집이 필요하면 GitHub Actions의 `KOSIS snapshot ingest` workflow를 수동 실행할 수 있다.
GitHub repository secrets에 `KOSIS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를
등록하고, workflow 입력에는 표 코드·분류·항목·기간만 넣는다. service key는 workflow 로그나
브라우저에 출력하지 않는다.

2026-09-16 운영 검증에서는 `101 / DT_1YL12001E` 표에 `objL1=21010+21020`, `objL2=ALL`, `itmId=T001`을 적용해 8개 정규화 레코드를 확인했다. 2026-09-17에는 같은 요청을 새 snapshot 수집기 dry-run으로 재검증했다. 이 표의 원천 응답 주기는 요청값과 별개로 `M`으로 반환되었으므로, 저장 전에는 응답의 `PRD_SE`와 단위를 다시 확인한다.
