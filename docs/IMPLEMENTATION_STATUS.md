# 구현 진행 현황

최종 갱신: 2026-09-17

## 2026-09-17 2D 구현 착수 기록

- `docs/2D_IMPLEMENTATION_PLAN.md`를 2D 개발의 실행 기준 문서로 추가함. 국내/세계 분리, 공통 조회 계약, 실제 시각화 조건, 3D gate, 검증·배포 체크리스트를 포함함.
- learner UI의 데이터 선택을 provider 검색 중심에서 curated dataset 드롭다운 중심으로 전환함. 현재 검증된 ready dataset은 KMA ASOS 10년 snapshot 하나이며, KOSIS·세계 자료는 준비 상태를 드롭다운에 표시함.
- `/create/2d/domestic`와 `/create/2d/world` 경로를 분리하고 `/create/2d`는 국내 경로로 이동시킴.
- KMA 2D 첫 수직 슬라이스를 구현함: Supabase 기후자료 조회 조건을 기준으로 지점값 색상/크기, 비교 그래프, 표, PNG/PDF export를 연결함.
- SGIS 2025 시도 경계 필터를 추가함. 선택 지역은 지도·경계 조인·KMA 지점·그래프/표 범위에 같은 상태로 전달함.
- `supabase/migrations/0006_dataset_catalog.sql`을 추가함. 공개 카탈로그는 `status='published'`만 anon/authenticated에게 읽히고, 브라우저 쓰기는 허용하지 않음. 현재 정적 catalog는 migration 적용 전에도 화면을 검증할 수 있는 fallback임.

## 이번 단계에서 완료한 것

- React 19 + Vite + TypeScript 실행 골격
- `/create`, `/create/2d`, `/create/3d`, `/create/chart` 자료 제작 경로
- `/inquiry`, `/inquiry/2d/:activityId`, `/inquiry/3d/:activityId`, `/inquiry/chart/:activityId` 탐구 경로
- `/status` API 매니페스트·브라우저 설정 상태 화면
- `.env.example` 템플릿과 로컬 `.env.local` 반영
- API별 인증·호출 제한·약관·저장 전략을 코드 레지스트리로 고정
- VWorld 로컬 hostname 자동 감지와 Vercel 운영 domain 전환 규칙
- Supabase 유지 결정과 무료 플랜·대안 비교 문서
- 인코딩된 공공데이터포털 키를 이중 인코딩하지 않는 URL builder와 테스트
- 서버 보안 경계를 위한 Vercel 함수 초안: `/api/health`, `/api/sgis-years`, `/api/short-forecast`, `/api/kma-asos`
- SGIS 인증 토큰을 함수 메모리 캐시에만 보관하고 응답에는 토큰을 포함하지 않도록 구현
- Supabase/PostGIS 초기 스키마: `data_sources` → `source_snapshots` → `geo_observations` → `learning_materials` → `inquiry_activities` → `learner_attempts`
- 로그인 없는 공개형 MVP RLS migration: Publishable Key는 게시 자료 읽기만 허용하고, `learner_attempts`는 브라우저 직접 접근을 차단
- 로그인 없이 사용할 수 있는 공개 이용 정책 확정: 학습 기록 저장은 서버 제출 경로를 구현할 때까지 선택 사항으로 둠
- KMA ASOS 수집기 구현: 관측소 목록·31일 이하 일자료 기간 조회·EUC-KR 파싱·결측 플래그·dry-run/`--write` 분리
- KMA 기후 정규화 migration 구현: `climate_stations`, `climate_daily_observations`, 공개 SELECT RLS, 명시적 public snapshot
- KMA 장기 조회용 월별 요약 view 구현·적용: `climate_period_summaries`, 유효 관측일수 기반 가중 평균 계약
- `/create/chart`에 Supabase 기반 KMA 기후 비교 화면 구현: 지표·기간 선택, 관측소별 평균, 유효 관측일수, 빈 자료·오류 상태
- `/create/chart` 기후 비교 자료에 현재 차트를 PNG 이미지·A4 PDF로 내보내는 기능 구현: 캡처 시 조작 패널 제외, 내보내기 라이브러리 지연 로드
- `/create/2d`에 VWorld 2D 로더와 KMA ASOS 관측소 레이어 구현: 지도 클릭 시 지점번호·좌표·고도 확인, 지도 실패 시 안내 fallback
- KOSIS 서버 adapter 구현: 통계표 검색·분류/항목 메타데이터·제한된 통계값 조회, KOSIS 키 서버 전용 유지, 통계부호·결측 원문 보존
- KOSIS controlled snapshot 수집기 구현: DRY-RUN/`--write`/`--public` 분리, 원자료·metadata·요청정보·checksum 보존, `geo_observations` 중복 적재 방지 migration
- KOSIS 공개 snapshot 읽기 repository·패널 구현: `raw_payload`를 제외한 제한 조회, 최대 2,000행, 공개·미적재·오류 상태와 geometry 연결 대기 안내
- SGIS 행정구역경계 서버 adapter·클라이언트 상태 패널 구현: 서버 전용 토큰, 2025 시도 경계 조회, EPSG:5179 원본 좌표계와 코드 확인
- SGIS 2025 시도 경계를 VWorld 2D의 EPSG:900913 면 레이어로 변환·표시: KOSIS 선택 시 상태 패널과 지도에 동일 응답을 공유하며, 값 결합 없는 기준경계로만 렌더링
- VWorld 2D 지도 배경 선택 구현: 레이어 가독성을 위한 백지도 기본값과 기본도(도로)·야간지도·항공사진·항공사진+표시를 지도 재초기화 없이 전환하고, 범례의 배경명을 현재 선택과 동기화
- KOSIS 자료 선택 UI 개선: 검색 결과·분류·항목을 실제 옵션이 있는 드롭다운으로 선택하고, 선택한 통계표 수록기간의 최소·최대 시점만 시작·종료 드롭다운에 제공
- 2D 지도자료에 현재 화면을 PNG 이미지·A4 PDF로 내보내는 기능 구현: VWorld 배경·분석 레이어·범례는 포함하고 배경 선택 컨트롤은 제외
- KOSIS 공개 관측값과 SGIS 경계의 정확한 코드 조인 진단 구현: `region_code === adm_cd`만 허용하고, 중복 지역값·복수 시점·복수 단위를 `ambiguous-values`로 차단
- 조인 상태가 `ready`인 경우에만 SGIS 면을 5단계 순차 색상으로 표시하고, 지도 범례에 공개값 수·최솟값·최댓값·단위를 표시하도록 연결
- KOSIS 단일 분류 표 호환성 보강: `objL2=ALL`을 무조건 추가하지 않고 실제 추가 분류가 있을 때만 전달하며, 검색 미리보기는 최상위 분류값부터 사용
- KOSIS GitHub Actions 적재 안전장치: `write=false` 기본 DRY-RUN, `publish=true` 단독 실행 차단, 단일 분류 표의 `obj_l2` 생략 지원
- Vercel SPA rewrite 설정

## 실행 명령

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

API 키가 실제로 작동하는지 확인하려면 로컬에서 다음을 실행한다. 응답 본문이나 토큰은 출력하지 않는다.

```bash
node scripts/smoke-api.mjs
```

현재 VWorld 브라우저 domain은 로컬 hostname을 자동 감지한다. 운영 hostname은 `geoapieducation.vercel.app`으로 확인되었으므로 VWorld 허용목록과 Vercel Production `VITE_VWORLD_DOMAIN`에 동일하게 등록한 뒤 실제 지도 로더를 검증한다. KOSIS는 `DT_1YL21281`의 15개 시도 DRY-RUN까지 확인했지만 `12` 통합지역과 SGIS 2025의 `24/36` 코드가 달라 전국 완전 결합은 보류 중이다. 첫 수업용 통계표와 코드 대응 기준을 최종 확정해야 한다.

2026-09-16 현재 실제 스모크 결과는 SGIS 인증 `HTTP 200 / Success`, 기상청 ASOS `HTTP 200`, 공공데이터포털 단기예보 `HTTP 200 / NORMAL_SERVICE`, VWorld 2D 로더 `HTTP 200`이다. Supabase `data_sources`·게시 자료 조회는 `HTTP 200`, `learner_attempts` 공개 조회는 `HTTP 401`로 확인했다. KOSIS는 `101 / DT_1YL12001E` 후보의 검색·메타데이터·8개 소규모 값 조회까지 운영 검증했다.

## 다음 구현 순서

### 1. 데이터 계약과 수집기

현재 연결된 서버 함수의 역할은 다음과 같다.

| 경로 | 목적 | 현재 상태 |
| --- | --- | --- |
| `GET /api/health` | 키 값이 아니라 provider별 설정 유무만 확인 | 구현 |
| `GET /api/sgis-years` | SGIS 토큰 발급 후 기준년도 조회 | 구현·실제 토큰 비노출 |
| `GET /api/short-forecast?baseDate=YYYYMMDD&baseTime=HHMM&nx=60&ny=127` | 단기예보를 서버에서 호출하고 항목만 정규화 | 구현·승인 확인 |
| `GET /api/kma-asos?tm=YYYYMMDDHHMM&stn=108` | ASOS 단일 시각 조회의 서버 프록시 | 구현·HTTP 200 확인 |
| `GET /api/kosis-search?searchNm=인구` | KOSIS 통계표 후보 검색 | 구현·키 서버 전용 |
| `GET /api/kosis-meta?orgId=101&tblId=...` | 선택 표의 분류·항목·단위 코드 조회 | 구현·메타데이터 UI·운영 검증 완료 |
| `GET /api/kosis-table?...` | 선택 표의 제한된 기간 통계값 조회 | 구현·소규모 운영 검증 완료 |
| `GET /api/sgis-boundary?year=2025&admCd=non&lowSearch=1` | 시도·시군구·읍면동 행정구역 GeoJSON 조회 | 구현·토큰 비노출·좌표계 명시·VWorld 면 레이어 연결. 전국 `non`은 upstream 호환상 `0`으로 변환 |

이 함수들은 임의 URL을 전달받지 않고 provider별 고정 endpoint와 허용 파라미터만 사용한다.

KMA 기후자료 수집기는 [kma-climate.mjs](../scripts/kma-climate.mjs)와 [0003_kma_climate.sql](../supabase/migrations/0003_kma_climate.sql)에 있다. 3일 샘플 검증 후 2016~2025년 10개 관측소·36,530행의 원격 백필까지 완료했다. 장기 범위용 요약 view [0004_climate_period_summaries.sql](../supabase/migrations/0004_climate_period_summaries.sql)도 운영 프로젝트에 적용되어 월 경계 범위에서 활성화되었다.

- KOSIS에서 첫 번째 통계표 2~3개를 선정하고 메타데이터·단위·시점·지역코드 확정. 검색·메타·값 adapter, 단일 분류 요청, 요청 제한, 선택 후 미리보기는 구현했으며 `101 / DT_1YL21281`의 SGIS 일치 15개 시도·2025·T10 DRY-RUN까지 운영 검증함. `DT_1YL20651E`는 KOSIS 지역코드 체계가 SGIS와 달라 제외했고, 최종 수업용 표 snapshot 적재는 코드 대응 기준 확정 후 진행
- 기상청 ASOS의 관측소·변수·최근 10년 기간을 확정하고 31일 단위 배치 수집기 작성 **(구현 완료, 샘플 파싱 확인)**
- SGIS 데이터 API의 경계·통계 응답을 공통 `GeoObservation` 모델로 정규화
- Supabase `0001`~`0004` migration과 공개 RLS를 운영 프로젝트에 적용함. 원자료는 공개 SELECT, 월별 요약 view는 `security_invoker`로 공개 SELECT
- 대안 비교 결과에 따라 Supabase를 기본 provider로 유지하고 repository 경계를 보존

### 2. 지도 어댑터

- 2D: VWorld OpenLayers 초기화, 도메인 검증, 백지도·기본도·야간·항공사진 배경 선택, KMA 관측소 레이어·SGIS 기준경계 면 레이어·조건부 단계구분도·범례·클릭 피처·출처 패널 **(실제 색상 표시는 검증된 단일 공개 snapshot 대기)**
- 3D: VWorld WebGL/Cesium 초기화 가능 여부를 먼저 확인하고, 고도·카메라·피처 선택 계약을 별도로 구현
- 지도 데이터는 `material_type`으로 분리하고 2D 번들과 3D 번들 간 의존성 전파를 막음

### 3. 학습 기능

- 제작자가 자료에 `purpose`, `representation`, `source_snapshot_ids`, `provenance`를 저장
- 탐구 활동은 6단계 흐름과 자료 유형·질문 유형의 조합으로 구성
- 답안은 관찰 근거 위치, 사용한 레이어/지표, 설명, 전이 문장을 함께 저장

### 4. 운영·검증

- Vercel Preview에 도메인별 키를 연결하고 GitHub Actions에서 typecheck/test/build 실행
- API별 호출량·응답 오류·스냅샷 checksum·출처 표시를 검증
- 실제 수업 전에는 작은 지역·짧은 기간으로 엔드투엔드 테스트 후 수집 범위를 늘림

## 현재 보류 사유

- Supabase 프로젝트 URL·키와 기존 공개 읽기·학습기록 직접 접근 차단을 확인함. `climate_stations`·`climate_daily_observations`에 10개 관측소·36,530행 백필을 완료했으며, 공개 REST 행 수 `0-0/36530`을 확인함. `climate_period_summaries` 공개 REST 조회는 `HTTP 206`, 1,200행(10개 관측소 × 120개월)으로 확인함
- VWorld 운영 hostname은 `geoapieducation.vercel.app`; VWorld 허용목록 등록과 Vercel 환경변수 반영 후 브라우저 지도 초기화를 검증
- 도로명주소는 검색·좌표·상세주소·지도 중 필요한 모듈이 확정되지 않아 키를 비워둠
- KOSIS는 학습 주제별 통계표를 먼저 선택해야 호출 파라미터를 고정할 수 있음. 현재 `/api/kosis-search`와 `/api/kosis-meta`로 선택 절차를 제공하고, 단일 분류 표에서 `objL2`를 생략하는 요청을 지원함. `101 / DT_1YL21281` 후보의 15개 지역·2025·T10 DRY-RUN까지 운영 검증했으나, 현재 KOSIS의 `12` 통합지역과 SGIS 2025의 `24/36`이 달라 완전 전국 지도는 보류함. controlled snapshot CLI·안전한 GitHub Actions workflow·`0005` migration·공개 snapshot 읽기 패널·SGIS 경계 상태 패널을 추가했으며, 첫 수업용 표와 실제 Supabase snapshot은 코드 대응 기준 확정 대기

## 검증 기록

- `npm run typecheck`: 통과
- `npm test`: 14개 테스트 파일·48개 테스트 통과
- `npm run build`: Vite production build 통과. `html2canvas`·`jspdf`는 내보내기 시 지연 로드되어 초기 번들 경고 없이 분리됨
- `node scripts/smoke-api.mjs`: KOSIS 통합검색을 포함한 provider 스모크, Supabase 공개 읽기와 `learner_attempts` 접근 차단 포함. KOSIS 통계값은 별도 운영 요청으로 후보 표의 8개 소규모 레코드를 확인함
- 기후자료 적재 검증: Supabase 공개 읽기 `HTTP 200`, 관측소 3개·일자료 9행 확인
- KMA 장기 백필 검증: 118개 구간·36,530행 저장 완료, 공개 일자료 조회 `HTTP 206`, 월별 view 조회 `HTTP 206`·1,200행 확인
- 브라우저 확인: 홈, 자료 제작 허브, 2D 제작, 3D 제작, 탐구 허브, 3D 탐구 활동, API 상태 라우트 확인
- 브라우저 확인: `/create/2d`에서 VWorld 로고·줌 컨트롤·KMA ASOS 10개 관측소 레이어를 로드하고 콘솔 오류·경고가 없음을 확인
- 운영 브라우저 확인: `/create/2d`의 KOSIS 검색 결과·통계표/분류/항목 드롭다운과 선택 표의 `2008~2025` 수록기간 기반 시작·종료 드롭다운을 확인
- 운영 브라우저 확인: `/create/2d`에서 PNG·PDF, `/create/chart`에서 PNG·PDF 다운로드 성공 상태와 콘솔 오류 없음 확인
- 운영 배포 확인: `https://geoapieducation.vercel.app/`의 홈·`/status`·`/create`·`/inquiry`·`/create/2d` 로드 확인. 로컬 키 스모크에서는 VWorld 운영 hostname 로더가 성공했으며, Vercel Production 환경변수와 VWorld 허용목록은 대시보드에서 별도 확인 필요
- 비밀값 검색: `.env.local`을 제외한 소스·문서·빌드 대상에서 발급키 패턴 미검출
