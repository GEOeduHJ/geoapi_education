# 구현 진행 현황

최종 갱신: 2026-09-16

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
- `/create/2d`에 VWorld 2D 로더와 KMA ASOS 관측소 레이어 구현: 지도 클릭 시 지점번호·좌표·고도 확인, 지도 실패 시 안내 fallback
- KOSIS 서버 adapter 구현: 통계표 검색·분류/항목 메타데이터·제한된 통계값 조회, KOSIS 키 서버 전용 유지, 통계부호·결측 원문 보존
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

현재 VWorld 브라우저 domain은 로컬 hostname을 자동 감지한다. 운영 hostname은 `geoapieducation.vercel.app`으로 확인되었으므로 VWorld 허용목록과 Vercel Production `VITE_VWORLD_DOMAIN`에 동일하게 등록한 뒤 실제 지도 로더를 검증한다. KOSIS는 사용할 통계표의 `orgId`와 `tblId`를 먼저 확정해야 한다.

2026-09-16 현재 실제 스모크 결과는 SGIS 인증 `HTTP 200 / Success`, 기상청 ASOS `HTTP 200`, 공공데이터포털 단기예보 `HTTP 200 / NORMAL_SERVICE`, VWorld 2D 로더 `HTTP 200`이다. Supabase `data_sources`·게시 자료 조회는 `HTTP 200`, `learner_attempts` 공개 조회는 `HTTP 401`로 확인했다. KOSIS는 첫 통계표 확정 전이라 보류한다.

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
| `GET /api/kosis-meta?orgId=101&tblId=...` | 선택 표의 분류·항목·단위 코드 조회 | 구현·표 ID 입력 대기 |
| `GET /api/kosis-table?...` | 선택 표의 제한된 기간 통계값 조회 | 구현·표 ID/코드 입력 대기 |

이 함수들은 임의 URL을 전달받지 않고 provider별 고정 endpoint와 허용 파라미터만 사용한다.

KMA 기후자료 수집기는 [kma-climate.mjs](../scripts/kma-climate.mjs)와 [0003_kma_climate.sql](../supabase/migrations/0003_kma_climate.sql)에 있다. 3일 샘플 검증 후 2016~2025년 10개 관측소·36,530행의 원격 백필까지 완료했다. 장기 범위용 요약 view [0004_climate_period_summaries.sql](../supabase/migrations/0004_climate_period_summaries.sql)도 운영 프로젝트에 적용되어 월 경계 범위에서 활성화되었다.

- KOSIS에서 첫 번째 통계표 2~3개를 선정하고 메타데이터·단위·시점·지역코드 확정. 검색·메타·값 adapter와 요청 제한은 구현했으며 실제 표 값 호출은 표 ID 확정 후 진행
- 기상청 ASOS의 관측소·변수·최근 10년 기간을 확정하고 31일 단위 배치 수집기 작성 **(구현 완료, 샘플 파싱 확인)**
- SGIS 데이터 API의 경계·통계 응답을 공통 `GeoObservation` 모델로 정규화
- Supabase `0001`~`0004` migration과 공개 RLS를 운영 프로젝트에 적용함. 원자료는 공개 SELECT, 월별 요약 view는 `security_invoker`로 공개 SELECT
- 대안 비교 결과에 따라 Supabase를 기본 provider로 유지하고 repository 경계를 보존

### 2. 지도 어댑터

- 2D: VWorld OpenLayers 초기화, 도메인 검증, KMA 관측소 레이어·범례·클릭 피처·출처 패널 **(KMA 위치 레이어 slice 구현 완료)**
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
- KOSIS는 학습 주제별 통계표를 먼저 선택해야 호출 파라미터를 고정할 수 있음. 현재 `/api/kosis-search`와 `/api/kosis-meta`로 선택 절차를 제공하고, 실제 `orgId/tblId/objL1/itmId`는 아직 확정하지 않음

## 검증 기록

- `npm run typecheck`: 통과
- `npm test`: 6개 테스트 파일·13개 테스트 통과
- `npm run build`: Vite production build 통과
- `node scripts/smoke-api.mjs`: KOSIS 통합검색을 포함한 provider 스모크, KOSIS 통계표 값 요청은 표 ID 확정 전 보류. Supabase 공개 읽기와 `learner_attempts` 접근 차단 포함
- 기후자료 적재 검증: Supabase 공개 읽기 `HTTP 200`, 관측소 3개·일자료 9행 확인
- KMA 장기 백필 검증: 118개 구간·36,530행 저장 완료, 공개 일자료 조회 `HTTP 206`, 월별 view 조회 `HTTP 206`·1,200행 확인
- 브라우저 확인: 홈, 자료 제작 허브, 2D 제작, 3D 제작, 탐구 허브, 3D 탐구 활동, API 상태 라우트 확인
- 브라우저 확인: `/create/2d`에서 VWorld 로고·줌 컨트롤·KMA ASOS 10개 관측소 레이어를 로드하고 콘솔 오류·경고가 없음을 확인
- 운영 배포 확인: `https://geoapieducation.vercel.app/`의 홈·`/status`·`/create`·`/inquiry`·`/create/2d` 로드 확인. 로컬 키 스모크에서는 VWorld 운영 hostname 로더가 성공했으며, Vercel Production 환경변수와 VWorld 허용목록은 대시보드에서 별도 확인 필요
- 비밀값 검색: `.env.local`을 제외한 소스·문서·빌드 대상에서 발급키 패턴 미검출
