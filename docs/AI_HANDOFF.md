# GeoLab Classroom AI 작업 인계 문서

이 문서는 Codex·Claude·OpenCode가 같은 저장소를 번갈아 작업하기 위한 현재 상태 문서다. 다음 작업자는 이 문서의 상태를 사실상 작업 큐로 사용한다. 작업을 시작하거나 끝낼 때 이 문서를 갱신한다.

## 1. 현재 기준선

| 항목 | 현재 값 |
|---|---|
| 프로젝트 | GeoLab Classroom (`geoapi-education`) |
| Git 원격 | `https://github.com/GEOeduHJ/geoapi_education.git` |
| 기준 브랜치 | `main` |
| 기준 코드 커밋 | `cd60ed5` |
| Production | `https://geoapieducation.vercel.app/` |
| 마지막 상태 확인 | 2026-09-17 |
| 사용자 방식 | 로그인 없이 공개 자료를 활용하는 교육용 MVP |
| 현재 우선순위 | 국내·세계 2D 실제 데이터 시각화 완성 |
| 3D 상태 | 2D 완료 gate 전까지 동결 |

기준 코드 커밋 이후 문서 커밋이 추가될 수 있다. 다음 작업자는 먼저 `git status --short --branch`와 `git log --oneline -5`를 실행해 현재 checkout을 확인한다.

현재 사용자 방침은 개발 완료 전 중간 커밋과 GitHub push를 보류하는 것이다. 따라서 아래 작업 기록의 커밋란은 기존 커밋을 인용하거나 `미커밋 로컬 변경`으로 기록한다. 최종 2D/전체 개발 완료 시 사용자의 확인을 받고 한 번에 정리·검증·커밋·push한다.

## 2. 이 프로젝트가 만드는 것

지리교육 수업에서 교사 또는 학습자가 공공·공개 지리자료를 선택하고, 같은 조회 조건으로 지도·그래프·표를 만들며, 결과물을 이미지/PDF로 내려받고, 이후 관찰·비교·설명·일반화 중심의 탐구 활동에 연결하는 사이트다.

사용자 흐름은 두 세션으로 나뉜다.

1. **자료 제작 세션:** 국내/세계 범위 선택 → 승인된 데이터셋 선택 → 지표·기간·공간 필터 선택 → 지도·그래프·표 확인 → PNG/PDF/CSV 내보내기 → 출처 확인
2. **자료 활용 탐구 세션:** 제작 자료를 관찰하고, 증거를 선택하고, 주장·근거·제한점을 작성해 탐구 활동으로 사용

현재 실제로 동작하는 핵심 수직 슬라이스는 국내 KMA ASOS 기후자료다. KOSIS와 세계 자료는 카탈로그와 준비 상태를 제공하지만, 실제 snapshot과 검증이 끝나기 전에는 값을 임의로 렌더링하지 않는다.

## 3. 기술 스택과 실행 환경

| 층 | 기술 | 사용 범위 |
|---|---|---|
| frontend | React 19, TypeScript, Vite 7 | SPA와 제작/탐구 화면 |
| routing | React Router 7 | `/create`, `/create/2d`, `/create/3d`, `/inquiry`, `/status` |
| data client | `@supabase/supabase-js`, Zod | 공개 snapshot 읽기와 입력/응답 검증 |
| map | VWorld 2D loader + OpenLayers runtime | 배경지도, KMA 지점, SGIS 경계·주제도 |
| export | `html2canvas`, `jspdf` | 지도·차트 결과 PNG/PDF; 내보내기 시 지연 로드 |
| server | Vercel Functions (`api/*.ts`) | API key 보호, SGIS/KOSIS/KMA 프록시 |
| persistence | Supabase Postgres/PostGIS 계열 스키마 | snapshot, 정규화 관측값, 기후자료, 공개 catalog |
| test | Vitest, jsdom, TypeScript compiler | 단위·계약 테스트와 typecheck |
| deploy | GitHub `main` → Vercel | Preview/Production 배포 |

TanStack Query는 의존성으로 준비되어 있으나 모든 데이터 흐름이 그 위에 통일된 상태는 아니다. 새 adapter를 추가할 때 기존 화면에 임의로 provider 호출을 직접 넣지 말고 repository/공통 query 경계를 먼저 확인한다.

## 4. 실제 저장소 구조

```text
geoapi_education/
├── api/                         # Vercel server functions; 비밀키가 필요한 upstream proxy
├── public/                      # 정적 자산
├── scripts/                     # KMA/KOSIS controlled ingest, smoke test
├── src/
│   ├── app/App.tsx              # 라우팅
│   ├── components/              # 지도·선택기·패널·내보내기 UI
│   ├── lib/                     # API adapter, 정규화, 공간 조인, Supabase client
│   ├── pages/                   # Home/Create/Inquiry/Status 화면
│   └── app/styles.css           # 전역 스타일
├── supabase/migrations/         # 순서가 있는 DB schema/RLS migration
├── docs/                        # 개발 계획, API, Supabase, 인계 문서
├── .env.example                 # 값 없는 환경변수 템플릿
├── AGENTS.md                    # 모든 에이전트 공통 규칙
├── CLAUDE.md                    # Claude 진입점
└── OPENCODE.md                  # OpenCode 진입점
```

주요 파일의 책임은 루트 [`AGENTS.md`](../AGENTS.md)의 영역별 표와 실제 import를 함께 확인한다. 문서에 적힌 경로가 변경되면 이 인계 문서도 같은 작업에서 갱신한다.

## 5. 라우트와 현재 사용자 기능

| 경로 | 현재 역할 | 상태 |
|---|---|---|
| `/` | 프로젝트 홈 | 운영 확인 |
| `/create` | 자료 제작 허브 | 운영 확인 |
| `/create/2d` | 국내 2D로 이동하는 기본 진입점 | 운영 확인 |
| `/create/2d/domestic` | 국내 curated dataset, KMA 지점, SGIS 경계, VWorld 2D | KMA 실제값 동작 |
| `/create/2d/world` | 세계 dataset 확장 작업공간 | planned dataset만 표시 |
| `/create/3d` | 3D 계약/placeholder | 2D gate 전 동결 |
| `/create/chart` | KMA 기후 비교 차트·표 | 실제 snapshot 동작 |
| `/inquiry` | 탐구 허브 | 기본 흐름 동작 |
| `/inquiry/2d/:activityId` | 2D 자료 탐구 활동 | 활동 골격 |
| `/inquiry/3d/:activityId` | 3D 탐구 활동 | placeholder/골격 |
| `/inquiry/chart/:activityId` | 차트 탐구 활동 | 활동 골격 |
| `/status` | API 레지스트리·환경 설정 상태 | 운영 확인 |

## 6. 데이터 흐름과 책임 경계

```text
curated catalog
    ↓
DatasetQuery
    ↓
Supabase public snapshot repository
    또는 서버 고정 endpoint + 캐시
    ↓
normalized records + provenance
    ├── MapLayerSpec
    ├── ChartSpec
    └── TableModel
    ↓
지도·그래프·표·PNG/PDF/CSV
    ↓
탐구 자료와 출처 기록
```

현재 구현은 이 목표 흐름의 일부를 화면별로 연결한 단계다.

- `src/pages/CreatePage.tsx`가 국내/세계 scope, dataset 선택, 경계 선택, 자료 패널을 조합한다.
- `src/lib/dataset-catalog.ts`가 learner UI에 보여줄 curated dataset의 정적 fallback을 제공한다.
- `src/components/Climate2DWorkspace.tsx`가 KMA query를 읽어 관측소 값·비교 그래프·상세 표·PNG/PDF를 만든다.
- `src/components/VWorld2DMap.tsx`와 `src/lib/vworld2d.ts`가 배경지도, 관측소, SGIS 경계와 조건부 주제도를 관리한다.
- `src/lib/climate.ts`와 `src/lib/geo-observations.ts`가 Supabase 공개 읽기를 담당한다.
- `api/*.ts`는 브라우저에 원천 인증키를 노출하지 않는 서버 경계다.
- `scripts/*.mjs`는 학습자 요청마다 API를 호출하지 않고, 검증한 기간 자료를 controlled ingest하는 운영 도구다.

새 데이터셋은 최소한 `query → repository/adapter → normalized records + provenance → map/chart/table`의 순서로 추가한다. 컴포넌트에서 KOSIS·KMA·World Bank URL을 직접 조립하지 않는다.

## 7. 데이터셋 상태

| 데이터셋 | 현재 상태 | 공간 표현 | 저장/호출 원칙 | 다음 조건 |
|---|---|---|---|---|
| KMA ASOS 10년 기후 | **ready** | 관측소 지점, 비교 그래프, 표 | Supabase 일자료 + 월 요약 view | provenance·공통 계약·CSV 보강 |
| SGIS 행정경계 | **운영 경계** | 기준 면, 선택 지역 면 | 서버 프록시 또는 이후 geometry snapshot | 기준연도·수준·선택코드 공통화 |
| KOSIS 승인 통계 | **adapter/diagnostic** | SGIS와 코드 결합 후 단계구분도 | controlled snapshot만 공개 | 호환 표 또는 code crosswalk 확정 |
| World Bank | **planned** | 국가 단계구분도, 순위·시계열·산점도 | 지표별 DB snapshot | ISO/geometry/지표 버전 고정 |
| Open-Meteo | **planned** | 도시/격자 지점 | 역사자료 snapshot | 변수·도시 목록·범위 확정 |
| USGS 지진 | **planned** | 이벤트 지점/시간축 | 이력 DB, 최근 피드 캐시 | 범위·캐시·중복 기준 확정 |
| OpenTopoData | **planned** | 고도점/경로 단면 | 요청 결과 재사용 | 고도 자료 보조 계약 |
| GBIF·TourAPI·충전소·에어코리아 | **planned** | 관측/POI 점·밀도 | 라이선스 포함 snapshot | 수업 주제와 이용 조건 확인 |

실제 운영에서 확인된 기준선:

- SGIS 2025 시도 경계 17개
- KMA ASOS 10개 관측소
- KMA 2016-01-01~2025-12-31 일자료 36,530행
- `climate_period_summaries` 월 요약 1,200행
- `/create/2d/domestic`에서 `서울특별시` 선택 시 경계 1개·관측소 1개·요약 행 1개로 함께 필터됨
- `/create/2d/world`는 World Bank·Open-Meteo·USGS를 planned로 표시하며 실제값 없는 지도/차트를 그리지 않음

## 8. Supabase의 역할과 migration 상태

Supabase의 결정된 역할은 **로그인보다 데이터 저장과 공개 읽기**다.

1. KMA·KOSIS·세계지표처럼 과거·누적 자료를 snapshot으로 저장한다.
2. 정규화 관측값, 월별 요약, 출처 URL, 기준기간, 단위, checksum을 저장한다.
3. RLS로 `published`/공개 snapshot만 브라우저에서 읽게 한다.
4. 브라우저가 학습자 답안을 직접 읽거나 쓰는 구조는 현재 제공하지 않는다.

| migration | 역할 | 운영 적용 상태 |
|---|---|---|
| `0001_initial_schema.sql` | source/snapshot/observation/material/activity/attempt 기본 구조 | 적용 확인 기록 있음 |
| `0002_rls_public_read.sql` | 로그인 없는 공개 읽기, 학습기록 직접 접근 차단 | 적용 확인 기록 있음 |
| `0003_kma_climate.sql` | KMA station/daily/public read | 적용 확인 기록 있음 |
| `0004_climate_period_summaries.sql` | 장기 범위 월 요약 view | 적용·운영 조회 확인 |
| `0005_kosis_observation_access.sql` | KOSIS 관측값 공개 읽기/적재 선행 조건 | 대상 테이블(`geo_observations`) anon 조회 가능 확인(2026-09-17, REST 200/0행). unique index·정책 이름 자체는 SQL 레벨로 재확인 필요 |
| `0006_dataset_catalog.sql` | curated catalog와 `status='published'` 공개 RLS | **미적용 확정**(2026-09-17, anon key REST 조회 결과 `404 PGRST205: Could not find the table 'public.dataset_catalog'`) |

중요: 저장소의 SQL 파일이 존재한다고 운영 DB에 적용된 것은 아니다. `0006`은 위 read-only 조회로 미적용이 확정됐으므로, 다음 작업자(또는 사용자)가 Supabase SQL Editor에서 `0005`, `0006`을 실제로 실행해야 한다. 이 세션은 service-role/DB 실행 권한이 없어 migration 적용 자체는 수행하지 못했다. migration 적용을 수행할 때도 service-role key를 채팅·로그에 출력하지 않는다.

## 9. 환경변수와 비밀값 정책

문서와 커밋에는 실제 값 대신 아래 **이름**만 기록한다. 값은 로컬 `.env.local`, Vercel Environment Variables, GitHub Actions Secrets에서 관리한다.

### 브라우저에 주입되는 client 설정

| 이름 | 용도 | 주의 |
|---|---|---|
| `VITE_API_MODE` | mock/실제 client 동작 모드 | 배포 환경 값 확인 |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL | 공개 endpoint |
| `VITE_SUPABASE_ANON_KEY` | publishable/anon read key | RLS가 보안 경계 |
| `VITE_VWORLD_API_KEY` | VWorld 2D loader | domain allowlist와 함께 검증 |
| `VITE_VWORLD_DOMAIN` | VWorld 허용 hostname | 로컬 자동 감지, 운영 `geoapieducation.vercel.app` |

### 서버·수집기·CI 전용 설정

| 이름 | 용도 |
|---|---|
| `SUPABASE_URL` | 수집기/서버용 Supabase endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | controlled ingest와 관리자 쓰기 |
| `KOSIS_API_KEY` | KOSIS 검색·메타·값 요청 |
| `SGIS_CONSUMER_KEY` | SGIS server authentication |
| `SGIS_CONSUMER_SECRET` | SGIS server authentication |
| `KMA_AUTH_KEY` | 기상청 API Hub |
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터포털 서비스키 |
| `JUSO_CONFIRM_KEY`, `JUSO_COORDINATE_KEY`, `JUSO_DETAIL_KEY`, `JUSO_MAP_KEY` | 도로명주소 모듈별 선택 키 |

VWorld 공개키를 제외한 upstream 인증키는 브라우저 번들에서 절대 사용하지 않는다. `api/health`도 값이 아니라 provider별 설정 유무만 반환해야 한다.

## 10. 현재 구현 진척도

| 단계 | 상태 | 완료된 범위 | 남은 범위 |
|---|---|---|---|
| 기반/라우팅 | 완료 | React/Vite/TS, 제작·탐구 라우트, API 상태 화면 | 공통 data contract 정리 |
| API 보안 경계 | 완료 | Vercel 함수, 고정 endpoint/허용 파라미터, 키 비노출 | provider별 rate/cache 운영 보강 |
| Supabase/KMA | 완료된 1차 수직 슬라이스 | 10년 ASOS 적재, 월 요약, 공개 read, KMA chart | 2D 공통 provenance·table contract |
| 국내 2D | 진행 중 | VWorld 배경 5종, SGIS 경계, KMA point thematic, 선택 지역 필터, map/chart PNG/PDF | KOSIS 실제값, 공통 map/chart/table/export 계약, CSV |
| KOSIS | 진행 중/차단 | 검색·메타·제한 값 adapter, controlled ingest, 조인 진단·조건부 색상 | 공개 snapshot과 SGIS 호환 코드 기준 |
| 세계 2D | 대기 | domestic/world workspace 분리, planned 상태 | World Bank 실제 vertical slice |
| 탐구 | 골격 | 자료 유형별 route와 6단계 허브 | 제작 결과물과 활동의 재생성 연결 |
| 3D | 차단 | placeholder/초기 계약 | 2D 완료 gate 후 terrain·height·camera |

## 11. 알려진 문제와 판단

### 11.1 KOSIS 공개 snapshot이 없는 이유

KOSIS 후보 `101 / DT_1YL21281 / T10 / 2025`의 DRY-RUN은 응답을 확인했지만, KOSIS 지역값의 통합지역 코드 체계와 SGIS 2025 경계의 17개 시도/24·36 계층 코드가 그대로 일치하지 않는다. 따라서 전국 단계구분도를 공개 적재하지 않았다.

다음 작업자는 다음 중 하나를 증거와 함께 선택해야 한다.

- SGIS와 동일한 기준연도·수준·코드를 제공하는 다른 KOSIS 표를 찾는다.
- 공식 지역코드 crosswalk를 별도 버전 데이터로 등록하고, 적용 범위·누락·중복을 검증한다.
- 완전 결합이 가능한 부분 범위만 명시적으로 공개한다.

지역명 문자열만으로 추정 조인하거나, 조인 실패를 0으로 대체하면 안 된다.

### 11.2 dataset catalog의 현재 이중화 (2026-09-17 부분 해결)

`src/lib/dataset-catalog.ts`에 `fetchPublishedDatasetCatalog`/`mapDatasetCatalogRow`/`mergeDatasetCatalog`/`useDatasetCatalog`를 추가해 published DB 행을 키 단위로 정적 catalog에 override하도록 구현했다(`DatasetSelector.tsx`, `CreatePage.tsx`가 이 훅을 사용). DB가 비어 있거나 조회에 실패하면(현재 `0006` 미적용으로 항상 이 경로) `DATASET_CATALOG` 정적 목록을 그대로 반환한다. 다만 `0006`이 아직 운영에 적용되지 않아 **DB 값을 실제로 우선 적용하는 경로는 아직 실행된 적이 없다** — 코드는 준비됐지만 migration 적용 후 published row로 재검증이 필요하다.

### 11.3 내보내기와 provenance

현재 지도·차트는 PNG/PDF가 동작하고, 표는 화면 표시가 동작한다. 2D 완료 조건에는 표 CSV와 자료 유형·실제 범위·결측률·공식 출처·snapshot 식별자를 함께 내보내거나 확인할 수 있는 공통 provenance panel이 필요하다. 조작 패널은 결과물에 포함하지 않는다.

### 11.4 로컬과 Production의 차이

로컬 Vite는 SPA와 브라우저용 VWorld/Supabase 확인에는 적합하지만 `api/*.ts` Vercel 함수를 자동 실행하지 않는다. SGIS 경계 등 서버 프록시까지 확인할 때는 Production 또는 `vercel dev`를 사용한다. 결과에 “로컬 Vite”와 “Production”을 구분해 기록한다.

## 12. 다음 작업 큐

아래 순서가 현재의 기본 작업 큐다. `2D-01`은 2026-09-17 완료됨(결과·검증은 §14와 `docs/AGENT_WORK_LOG.md` 참고). 사용자가 우선순위를 바꾸지 않는 한 다음 에이전트는 `2D-02`부터 시작한다.

### 2D-01 — DB catalog repository와 migration 검증 (완료, 2026-09-17)

**완료 내용:** `src/lib/dataset-catalog.ts`에 published-row fetch/매핑/병합 함수와 `useDatasetCatalog` 훅을 추가하고 `DatasetSelector.tsx`/`CreatePage.tsx`를 이 훅으로 전환했다. `0006_dataset_catalog.sql`은 anon key read-only 조회로 **운영 미적용**이 확정됐다(`404 PGRST205`). 코드는 DB가 비어 있거나 실패할 때 기존 정적 catalog로 조용히 폴백하도록 만들어졌고, 로컬 브라우저 확인에서 폴백 시 화면이 기존과 동일함을 확인했다. **남은 일:** 사용자가 Supabase SQL Editor에서 `0005`(선행)·`0006`을 적용한 뒤, published row 1개 이상으로 실제 override 경로를 재검증해야 한다(이 세션은 DB 실행 권한 없음).

**목적:** 정적 catalog를 유지하면서 Supabase `dataset_catalog`의 published read를 연결한다.

**작업 범위:**

- Supabase에서 `0005`, `0006` 적용 여부를 read-only로 확인하고 필요 시 SQL Editor 적용 절차를 사용자에게 명확히 남긴다.
- `src/lib/dataset-catalog.ts`에 DB catalog repository 또는 별도 adapter를 추가한다.
- `status='published'`만 반환하고, DB 오류/빈 결과에서는 안전하게 정적 fallback을 사용한다.
- ready KMA dataset의 metadata와 실제 coverage가 화면의 최소·최대 기간과 일치하는지 확인한다.
- 새 repository 단위 테스트를 추가한다.

**완료 기준:**

- 운영/로컬에서 published catalog read 또는 명시된 fallback이 재현된다.
- planned dataset에 실제값이 나타나지 않는다.
- `npm run typecheck`, `npm test`, `npm run build` 통과
- handoff에 migration 적용 여부와 fallback 동작을 기록

### 2D-02 — 공통 시각화 계약·provenance·표 CSV (완료)

**상태:** 2026-09-17 완료. 공통 타입·adapter·CSV export·choropleth 렌더링·Provenance panel·CSV 버튼까지 전부 연결됨.

**목적:** KMA 화면에만 흩어진 상태를 KOSIS/세계 adapter가 재사용할 수 있는 계약으로 정리한다.

**주요 변경(2026-09-17):**
1. 사용자 피드백으로 지도 시각화 방식을 관측지점(점) 색상 표현에서 **행정경계 기반 choropleth**로 전면 재설계. KMA 관측소 값을 `lawCodeToSgisAdmCds()`로 SGIS 경계코드(들)에 매핑하고 행정경계별로 집계(평균)해 지도에 표시.
2. **전남광주통합특별시(2026-07-01 출범) 대응**: 광주 관측소(station_id `156`)의 `law_code`("1230010900")는 지난 세션에서 "잘못된 시드 데이터"로 오판해 조용히 제외했었는데, 실제로는 이미 새 행정코드로 올바르게 갱신된 데이터였음(실제 행정통합, [위키백과](https://ko.wikipedia.org/wiki/전남광주통합특별시)). SGIS는 아직 통합 후 경계 polygon을 발행하지 않아(`/api/sgis-years`의 `tboudary_yr`가 2025까지만 있음) `lawCodeToSgisAdmCds()`가 이 코드를 옛 SGIS 경계 두 개(광주 `24`, 전남 `36`) 배열로 반환하도록 해 두 도형 모두 같은 값으로 칠한다(`src/lib/climate.ts`, `src/lib/kma-adapter.ts`의 `aggregateByBoundary` fan-out). **후속 확인 필요**: `/api/sgis-years`의 `tboudary_yr`에 `2026`이 추가되면 SGIS가 통합 경계를 발행한 것이므로 `api/sgis-boundary.ts`의 `MAX_YEAR`를 올리고 이 fan-out 매핑을 재검토해야 함(그때는 광주·전남이 SGIS에서도 폴리곤 하나로 합쳐질 가능성이 큼).
3. **국내 2D 데이터 완성도 점검**: Supabase 직접 조회로 확인 — `climate_stations` 10행(기본 관측소와 정확히 일치, 숨은 미사용 데이터 없음), `geo_observations`(KOSIS) 0행. 국내 2D에서 실 데이터가 있는 소스는 KMA뿐이며 KOSIS/AirKorea는 `planned` 상태가 정확함. 다만 KMA 내부에서 `toChartSpec`/`toTableModel`/`toProvenance`/`exportTableAsCsv`가 정의만 되고 UI에 연결되지 않았던 것을 확인해 이번에 연결함(아래 체크리스트).

**작업 범위**

- [x] `DatasetQuery`, `NormalizedRecord`, `MapLayerSpec`, `ChartSpec`, `TableModel`, `Provenance` 공통 타입 정의 → `src/lib/data-contract.ts`(`admCds` fan-out 필드 포함)
- [x] KMA adapter 함수 구현 (toNormalizedRecords, toMapLayerSpec, toChartSpec, toTableModel, toProvenance) → `src/lib/kma-adapter.ts`
- [x] 표 CSV export 함수 추가 (UTF-8 BOM 포함) → `src/lib/material-export.ts`
- [x] 지도가 관측지점이 아닌 행정경계 단위 주제도(choropleth)로 렌더링 → `CreatePage.tsx`의 `kmaAggregatedBoundaryValues` + `toMapLayerSpec`(경계별 집계, 전남광주통합특별시 fan-out 포함). mock SGIS 응답 + 실제 Supabase 데이터로 렌더링 검증 완료(로컬 Vite는 `/api/*.ts`를 실행하지 않아 실제 SGIS 응답으로는 미검증 — Production에서 최종 1회 확인 권장)
- [x] 기준기간·단위·결측·snapshot/source URL·관측치 수를 Provenance panel에 표시 → 신규 `src/components/ProvenancePanel.tsx`, `Climate2DWorkspace.tsx`에 연결(기존 `climate-footnote` 대체)
- [x] 표에 CSV export 버튼 연결 → `MaterialExportActions`에 선택적 `onExportCsv` prop 추가, `Climate2DWorkspace.tsx`에서 `toNormalizedRecords`→`toTableModel`→`exportTableAsCsv` 연결
- [x] CSV export 파일명은 기존 지도/PDF export와 동일한 `geolab-2d-kma-climate` 규칙 재사용(별도 헬퍼는 만들지 않음 — 호출부 1곳뿐이라 과한 추상화로 판단)
- [ ] (범위 제외, 의도적) `Climate2DWorkspace`의 bar chart/표 자체 JSX를 `toChartSpec`/`toTableModel` 소비 구조로 리팩토링하는 것은 하지 않음 — 이미 정상 동작 중이고 사용자에게 보이는 변화가 없는 순수 내부 리팩토링이라 범위 제외로 결정

**완료 기준:**

- [x] KMA의 한 query가 지도·그래프·표·CSV export에서 동일 지역·기간·값을 만든다.
- [x] 실제 자료 범위 밖의 날짜를 선택할 수 없다(기존 `Climate2DWorkspace` date input의 min/max로 이미 보장).
- [x] Provenance panel에 결측률·snapshot ID·출처가 표시된다(임의 값 없음).

### SIDO-LOCK — 시도 단위 고정 계약 (완료, 2026-09-17)

**배경:** 사용자가 시도/시군구/행정동 3단 분류를 요구했으나, 전수 조사 결과 값 원천이 시도 단위까지만 뒷받침됨을 확인하고 시도 고정을 결정했다. 시군구는 crosswalk·시군구급 snapshot이 없고, 행정동(행정동/법정동 불일치)은 구현 제외.

**완료 내용:** `src/lib/data-contract.ts`에 `BoundaryLevel` + `SUPPORTED_DOMESTIC_BOUNDARY_LEVELS=["sido"]` 추가, `DatasetQuery.boundaryLevel` 추가. `src/lib/dataset-catalog.ts`에 `supportedLevels` 선언(domestic `["sido"]`, world `[]`) + `supportsBoundaryLevel` 헬퍼. `src/lib/sgis.ts`에 `DOMESTIC_SIDO_BOUNDARY_QUERY`/`buildDomesticSidoBoundaryQuery` 추가하고 `CreatePage.tsx`가 사용. `DatasetSelector`에 "시도 단위/국가 단위" 칩, 지리 필터 문구·`SgisBoundaryStatusPanel` 라벨을 시도 고정으로 변경. `dataset_catalog` DB에는 level 컬럼이 없어 scope 기준 기본값을 매핑한다.

**검증:** `npm run typecheck` 통과, `npm test` 통과(17개 파일·75개 테스트, 신규 5개), `npm run build` 통과, 로컬 Vite dev 서버에서 `/create/2d/domestic` 200 확인(렌더 검증은 브라우저 도구 부재로 미실시, Production 확인 권장).

### 2D-03 — KOSIS controlled snapshot과 국내 주제도

**선행:** `2D-01`, `2D-02`, 수업용 표와 코드 기준 확정

- 후보 표 metadata·단위·기간·지역코드·분모를 기록한다.
- DRY-RUN에서 예상 행 수, 중복, 복수 시점/단위, SGIS 조인 성공률을 계산한다.
- `--write` 후 checksum과 snapshot ID를 기록하고, 검증 후에만 `published`로 전환한다.
- 조건부 단계구분도, 지역 순위/시계열, 표, provenance, 선택 경계 필터를 실제 KOSIS 값으로 확인한다.

**상태 (2026-09-17, 완료):** 후보(`101/DT_1YL21281/T10/2025`) 확정, DRY-RUN 17행·단일 시점·단일 단위·결측 0 확인, 공식 대응표(`1224→24`, `1236→36`)로 17/17 조인 설계 완료. `codeMap` crosswalk를 `geo-join`·`CreatePage`·조인 패널에 연결. 사용자가 `0005`(적용済 확인 — policy 중복 에러로 기존 적용 판명)/`0006`(적용 성공)을 SQL Editor에서 실행한 뒤, `--write`→검증→`--write --public` 순서로 적재·공개 완료. snapshot ID `b0f7f9c9-a796-46fc-b275-66a0a1ea55e0`, 17행, anon 공개 읽기·실측 SGIS 17경계 조인(`ready` 17/17) 검증済. 실측 중 `PRD_SE="A"` 연간 처리와 checksum 통일(`buildSnapshotChecksum`)을 수정. 정적 카탈로그의 KOSIS 항목은 `ready`이며, 그래프·표·provenance는 KOSIS-VIZ에서 연결했다. 상세는 `docs/KOSIS_ADAPTER.md` 참조.

**완료 기준:** 승인 dataset에서 “공개 snapshot이 아직 없습니다”가 사라지고, 조인 실패가 있으면 원인과 미일치 코드가 화면에 나온다.

### KOSIS-VIZ — KOSIS 그래프·표·provenance 연결 (완료, 2026-09-17)

**목적:** 국내 완성의 잔여였던 KOSIS 그래프·표·provenance를 지도와 동일한 조회 조건으로 연결한다.

**완료 내용:** `src/lib/kosis-adapter.ts`(join값→순위 정렬 NormalizedRecord·ChartSpec·TableModel·Provenance) + `src/components/Kosis2DWorkspace.tsx`(그래프/표 토글·PNG/PDF/CSV·ProvenancePanel·조인 실패 사유 표시) 신규, `CreatePage.tsx`에서 KOSIS 선택 시 연결(경계 필터가 좁혀지면 그래프·표도 같은 집합으로 축소). 정적 카탈로그 KOSIS `capabilities`를 `["map","chart","table"]`로 복원.

**검증:** `npm run typecheck` 통과, `npm test` 통과(19개 파일·85개 테스트, 신규 4개), `npm run build` 통과, 로컬 dev 서버 `/create/2d/domestic` 200. 렌더 수준 확인은 브라우저 도구 부재로 미실시 — 배포 후 KOSIS 선택 시 17개 순위 그래프·표·CSV·provenance 1회 확인 필요.

### BREADTH — 다중 API 자동 시각화 확장 (계획, 2026-09-17)

**방향 (사용자 결정):** 최초 플랜대로 최대한 많은 API로 수집하고, 연도·데이터 선택 시 자동 시각화되는 사이트로 확장한다. SGIS와의 차별점은 수업용 계약(출처·결측·분모·탐구 연결·export)이다. 국내 2개 dataset 상태가 최종이 아니라 출발점이다.

**실측 후보 (KOSIS 시도급, search 확인):** `DT_1C96` 1인당 GRDP (1985~2024), `DT_1PE105` 사교육비 (2009~2025), `DT_106N_03_0200076/0176` PM10/PM2.5 시도별 (2010~/2015~2025), `DT_MLTM_5498` 자동차등록 (2011~2026), `DT_1B81A19` 출산성비 (1990~2025), `DT_1K52F01` 사업체 (2020~2024). 표마다 지역코드 체계가 다르므로(구 24/36 분리형 존재) 표별 crosswalk가 필수다.

**구조 병목 (해결해야 다중화가 됨):** (1) `fetchLatestPublicKosisDataset`이 최신 1개 snapshot만 읽음 → catalog→snapshot 연결 필요 (`dataset_catalog.snapshot_id` 컬럼은 이미 있음). (2) DB catalog 비어 있어 정적 6개 고정. (3) KOSIS 연도 고정 → snapshot 내 연도 필터 + 조인 전 단일시점 확정 필요. (4) `CreatePage`의 `isKosis` 단일 분기 → dataset-keyed 일반화 필요.

### PHASE-A — 구조 일반화 (완료, 2026-09-17)

**목적:** 표가 늘어도 코드 복제 없이 적재만으로 dataset이 되게 한다.

**완료 내용:** `geo-observations.ts`에 snapshot 지정 읽기(`fetchPublicKosisSnapshotById`/`fetchPublicKosisDataset`), 공개 목록(`fetchAllPublicKosisSnapshots`), 연도 헬퍼(`listObservationYears`/`filterObservationsByYear`) 추가. `dataset-catalog.ts`에 `snapshotId` 연결(DB `snapshot_id` 컬럼→매핑, 정적 null). `CreatePage`가 카탈로그 snapshotId가 있으면 지정 snapshot, 없으면 최신 snapshot을 읽고, 연도 선택→조인 전 필터→지도·그래프·표·provenance에 동일 집합 전달. `Kosis2DWorkspace`에 연도 셀렉터 추가. 공유 SGG 대응표(`1224/1236`만 변환)는 구체계 표에 무해한 no-op이라 레지스트리 없이 유지.

**검증:** `npm run typecheck` 통과, `npm test` 통과(19개 파일·89개 테스트, 신규 4개), `npm run build` 통과. 현 공개 snapshot이 단일 연도라 실데이터 동작은 기존과 동일, 다중 연도는 단위 테스트로 검증.

### PHASE-B1 — GRDP 적재·dataset-keyed 일반화 (완료, 2026-09-17)

**완료 내용:** `DT_1C96/T1` 1인당 GRDP metadata 확인(구체계 17코드, SGIS와 exact 일치) → DRY-RUN 633행·결측 0·1985~2024 → `--write`→검증→`--write --public` (snapshot `b2e3a59f-6fa9-40ae-9730-abb27527da3f`, checksum `cf09d78239257539…`). `CreatePage`의 `isKosis` 단일 분기를 `provider === "KOSIS"` dataset-keyed 판별로 일반화하고 CSV 파일명을 datasetKey 기반으로 변경. `dataset_catalog`에 park·GRDP published 행 2건 등록(snapshot 연결) — DB override 경로가 처음으로 실제 동작함(2D-01 잔여 해소). 정적 GRDP 항목도 추가.

**검증:** typecheck/test(89)/build 통과. anon 경로 실측: 카탈로그 2행·올바른 snapshot 연결(park 17행/2025, GRDP 633행/1985~2024). 실측 조인 3건 통과: park 2025 17/17, GRDP 2024 17/17, GRDP 1990 15+2부분결합(세종·울산 이전 시점, 정직 표시). 지역별 연도 커버리지 상이(세종 2013~·울산 1998~·대전 1989~·광주 1987~)는 승격 연도와 일치하는 정상 결측.

**다음:** 사교육비·PM10/PM2.5·자동차·출산성비·사업체 순차 적재 (동일 절차 반복, 코드 불필요).

### PHASE-B2 — 배치 4종 적재·연평균 집계 (완료, 2026-09-17)

**완료 내용:** 사교육비(284행)·자동차(1,749행 월별)·출생성비(612행, 승격 전 29결측)·사업체수(85행)를 `--write`→검증→`--public`으로 적재하고 `dataset_catalog` published 4행 + 정적 항목 4건을 등록. 국내 ready가 KMA 포함 7개가 됐다. 월별 표를 위해 `aggregateObservationsByRegion`(연평균, 연간 표는 identity)을 추가하고 `CreatePage` 조인 전에 적용. PM10/PM2.5(106번대)는 파라미터를 바꿔도 빈 응답이라 제외하고 에어코리아 직접 수집으로 이관.

**검증:** typecheck/test(92)/build 통과. 실측 조인: 사교육비·사업체·출생성비 2025 17/17, 자동차 2024 연평균 17/17, 출생성비 2000 16+1부분(세종만 결측). 상세 적재 기록은 `docs/KOSIS_ADAPTER.md` 참조.

**다음:** 배포 후 7개 dataset 전환·연도 슬라이더 렌더 확인.

### 2D-04 — World Bank 세계 2D 수직 슬라이스 (보류: 국내 완성 후)

**보류 (2026-09-17, 사용자 결정):** 세계 지도 제작은 국내 지도가 완성된 뒤에 착수한다. 국내 완성의 정의는 KMA·KOSIS가 시도 단위에서 지도·그래프·표·출처·export를 모두 제공하는 상태이며, 현재 KOSIS 그래프·표·provenance가 잔여다.

**선행:** `2D-02`

- 국가 ISO 코드·이름·geometry 버전을 고정한다.
- 교육적으로 의미 있는 지표 1개를 선정하고 연도 범위·단위·출처·snapshot을 저장한다.
- 국가 단계구분도, 순위/시계열/산점도, 표, 동일 export/provenance를 구현한다.
- 국가 코드 누락·NODATA·기간 오류를 별도 상태로 표시한다.

**완료 기준:** 실제 World Bank snapshot 1개가 국내 KMA와 같은 map/chart/table/export 흐름으로 작동한다.

### 2D-05 — 확장 provider와 탐구 연결

World Bank 이후 Open-Meteo 도시 기후, USGS 지진, OpenTopoData 고도, GBIF/POI 자료를 수업 주제별로 하나씩 추가한다. 각 provider는 실제 license·호출 조건·snapshot 주기를 문서화하고, 데이터가 없는 상태에서는 planned UI만 제공한다.

### 3D-01 — 2D 완료 gate 검토 후 착수

다음 조건을 모두 검토하고 인계 문서에서 체크한 뒤에만 시작한다.

- KMA·KOSIS·World Bank가 실제 자료로 지도·그래프·표·출처·export를 제공
- 국내 선택 경계와 세계 국가 필터가 모든 표현에 일관되게 적용
- snapshot/코드 조인 검증 자동화
- 고도·지형 해상도, 용량, 성능 예산 확정

## 13. 에이전트 간 작업 인계 절차

### 시작할 때

```bash
git status --short --branch
git log --oneline -5
```

그 다음 현재 작업 큐의 task ID를 확인한다. worktree에 다른 변경이 있으면 해당 변경을 보존하고, 작업 범위가 겹치는지 판단하기 전까지 파일을 덮어쓰지 않는다.

### 끝낼 때

다음 템플릿을 이 문서의 최근 기록에 채운다.

```markdown
### YYYY-MM-DD — [Codex|Claude|OpenCode] — [TASK-ID]

- 결과: [완료|부분 완료|차단]
- 변경: `path/to/file`, `path/to/file`
- 결정/데이터: [schema, snapshot, code crosswalk, UI decision]
- 검증: `npm run typecheck` [통과/실패], `npm test` [통과/실패], `npm run build` [통과/실패]
- 브라우저/API: [환경, 경로, 핵심 결과]
- 차단/주의: [없음 또는 구체적 사유]
- 다음 작업: [다음 담당자가 실행할 한 문장]
- 커밋: `[hash] [message]` 또는 `미커밋 로컬 변경`
```

세션 중간에 멈추더라도 “무엇을 바꾸었고 무엇을 검증하지 못했는지”를 먼저 기록한다. 다음 작업자가 같은 조사나 실패를 반복하지 않게 하는 것이 이 문서의 목적이다.

## 14. 최근 작업 기록

상세·append-only 기록은 [`docs/AGENT_WORK_LOG.md`](AGENT_WORK_LOG.md)에 남긴다. 이 표는 다음 담당자가 빠르게 읽기 위한 요약이다.

| 날짜 | 에이전트 | 작업 | 커밋 | 결과 |
|---|---|---|---|---|
| 2026-09-17 | Codex | curated 2D 작업공간, 국내/세계 분리, KMA 2D 지도·그래프·표, 선택 경계 필터, catalog migration 추가 | `183ed28` | KMA 수직 슬라이스 구현 |
| 2026-09-17 | Claude | 2D-02 Phase 1-3 (공통 타입·adapter·CSV) 구현 후 사용자 피드백으로 재설계 | 미커밋 로컬 변경 | 경계별 집계 로직 구현 중 |
| 2026-09-17 | Claude | 2D-02 choropleth 렌더링 버그 수정: SGIS adm_cd ≠ 법정동코드 체계 오류 발견·수정, 기존 boundaryCode 필터 버그 동반 수정 | 미커밋 로컬 변경 | KMA 경계별 주제도 렌더링 검증 완료 |
| 2026-09-17 | Claude | 2D-02b: 전남광주통합특별시 fan-out 매핑(1:N) + Provenance panel·CSV 버튼 UI 연결 | 미커밋 로컬 변경 | typecheck/test(70)/build 통과, 브라우저 검증 완료, 2D-02 완료 처리 |
| 2026-09-17 | Codex | Production 2D 검증과 진행 문서 정리 | `cd60ed5` | 운영 17 경계·10 관측소·36,530 일자료 확인 |
| 2026-09-17 | Codex | Claude/OpenCode 교대 작업 규칙·현재 인계 문서·작업 로그 추가 | 미커밋 로컬 변경 | typecheck/test/build 통과 |
| 2026-09-17 | Claude | `2D-01`: DB catalog repository(`useDatasetCatalog`) 추가, `0006` 운영 미적용을 read-only로 확정 | 미커밋 로컬 변경 | typecheck/test(60)/build 통과, 로컬 폴백 브라우저 확인 |
| 2026-09-17 | Claude | `2D-02` 1단계-3단계: 공통 data-contract, KMA adapter, CSV export 구현 | 미커밋 로컬 변경 | typecheck/test/build 통과, UI 통합(4단계) 남음 |
| 2026-09-17 | OpenCode | SIDO-LOCK: 시도 단위 고정 계약·카탈로그 지원수준·UI 문구 반영 | `12402f4` | typecheck/test(75)/build 통과, dev 서버 200 확인 |
| 2026-09-17 | OpenCode | 2D-03: DT_1YL21281 대응표 확정·DRY-RUN·crosswalk 연결 (적재 전) | `12402f4` | typecheck/test(79)/build 통과, 0005 적용 확인 후 --write 대기 |
| 2026-09-17 | OpenCode | 2D-03 완료: 0005/0006 확인·snapshot 적재·공개·실측 조인 17/17 검증 | `12402f4` | typecheck/test(81)/build 통과, anon 공개 읽기 확인 |
| 2026-09-17 | OpenCode | KOSIS ready 전환(map only)·국내 Audit·세계 연기·통합 커밋 | `12402f4` | typecheck/test(81)/build 통과 |
| 2026-09-17 | OpenCode | KOSIS-VIZ: 그래프·표·provenance 연결, capabilities 복원 | `c695e54` | typecheck/test(85)/build 통과, dev 서버 200 확인 |
| 2026-09-17 | OpenCode | PHASE-A: 다중 snapshot·연도 필터·catalog 연결 | `88c9f20` | typecheck/test(89)/build 통과 |
| 2026-09-17 | OpenCode | PHASE-B1: GRDP 적재·dataset-keyed·카탈로그 2행 등록 | `88c9f20` | typecheck/test(89)/build 통과, 실측 조인 3건 통과 |
### QUERY-UX — 조건 선택·시각화 섹션 분리 (완료, 2026-09-17)

**배경 (사용자 지적):** 연도 선택이 그래프 섹션 안에 갇혀 지도가 연도 설정과 무관해 보였고, 조건과 시각화가 뒤섞여 있었다.

**완료 내용:** 사이드바를 `01·QUERY(자료·지표/연도·시도경계)` + `02·REPRESENTATION` + `03·INQUIRY`로 재편. KMA 지표·기간과 KOSIS 연도 셀렉터를 QUERY 섹션으로 올리고(지도는 원래 같은 필터를 쓰고 있었으므로 동작 불변), 두 workspace의 중복 조건 컨트롤을 제거하고 그래프/표 토글만 남김. KOSIS 연도를 바꾸면 지도·그래프·표·CSV·provenance가 함께 갱신됨이 구조상 보장된다.

**검증:** typecheck/test(92)/build 통과, dev 서버 200. 렌더 확인은 배포 후.

| 2026-09-17 | OpenCode | PHASE-B2: 4종 적재·연평균 집계·ready 7개 | `88c9f20` | typecheck/test(92)/build 통과, 실측 조인 4건 통과 |
| 2026-09-17 | OpenCode | QUERY-UX: 조건·시각화 섹션 분리, 연도 선택 상단화 | `bb362be` | typecheck/test(92)/build 통과, dev 서버 200 확인 |
| 2026-09-17 | OpenCode | ESRI-BASEMAP: NGII 원복 후 밝은 회색지도 옵션 (브라우저 확인 대기) | `fb3314a` | typecheck/test(94)/build 통과, dev 서버 200 확인 |
| 2026-09-17 | OpenCode | NGII-BASEMAP: 교육용 백지도 WMTS 옵션 (키 미활성, 브라우저 확인 대기) | 미커밋 로컬 변경 | typecheck/test(94)/build 통과, dev 서버 200 확인 |

## 15. 문서 기준 우선순위

충돌이 있을 때는 다음 순서로 판단한다.

1. 사용자의 최신 명시 요구
2. `AGENTS.md`의 보안·보존·2D gate 원칙
3. 이 문서의 현재 상태와 다음 작업
4. `docs/2D_IMPLEMENTATION_PLAN.md`의 설계·완료 조건
5. `README.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/NEXT_TASKS.md`의 요약

요약 문서가 이 인계 문서와 다르면 작업 중 실제 소스·DB·Production을 확인하고, 결과를 이 문서에 반영한다. 문서 간 불일치를 숨기지 않는다.
